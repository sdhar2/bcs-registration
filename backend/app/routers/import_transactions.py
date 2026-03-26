"""
Import transactions from PayPal and Stripe CSV exports.

Flow:
  1. POST /api/import/parse/paypal  – upload CSV → list of ImportPreviewRow
  2. POST /api/import/parse/stripe  – upload CSV → list of ImportPreviewRow
  3. POST /api/import/save          – confirm rows → saved contributions
"""

import csv
import io
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from pydantic import BaseModel
from sqlalchemy.orm import Session

from .. import models
from ..database import get_db
from ..auth import get_current_user
from .contributions import _next_receipt_number

router = APIRouter(prefix="/api/import", tags=["import"])


# ── Pydantic schemas ─────────────────────────────────────────────────────────

class ImportPreviewRow(BaseModel):
    rowIndex: int
    transactionId: str
    txDate: str           # ISO date string YYYY-MM-DD
    name: str
    email: str
    amount: float
    description: str
    source: str           # "paypal" | "stripe"
    # Match result
    matchedPersonId: Optional[int] = None
    matchedMemberName: Optional[str] = None
    matchConfidence: str = "none"   # "email" | "name" | "address" | "none"
    # Address info (populated for unmatched PayPal records)
    address1: Optional[str] = None
    address2: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    zip: Optional[str] = None


class ImportSaveRow(BaseModel):
    personId: int
    eventId: int
    txDate: str           # ISO date string YYYY-MM-DD
    amount: float
    notes: str


class ImportSaveRequest(BaseModel):
    rows: List[ImportSaveRow]


class ImportSaveResult(BaseModel):
    saved: int
    receiptNumbers: List[str]


# ── Matching helpers ─────────────────────────────────────────────────────────

def _match_by_email(db: Session, email: str) -> Optional[models.Member]:
    """Find a member whose email list contains the given address (case-insensitive)."""
    if not email:
        return None
    email_lower = email.strip().lower()
    # Fetch candidates whose email column contains the address somewhere
    candidates = (
        db.query(models.Member)
        .filter(models.Member.email.ilike(f"%{email_lower}%"))
        .all()
    )
    for m in candidates:
        if m.email:
            stored = [e.strip().lower() for e in m.email.split(",")]
            if email_lower in stored:
                return m
    return None


def _match_by_name(db: Session, full_name: str) -> Optional[models.Member]:
    """Split 'First Last' and do case-insensitive match on firstName + lastName."""
    if not full_name:
        return None
    parts = full_name.strip().split()
    if len(parts) < 2:
        return None
    first = parts[0]
    last = parts[-1]
    return (
        db.query(models.Member)
        .filter(
            models.Member.firstName.ilike(first),
            models.Member.lastName.ilike(last),
        )
        .first()
    )


def _match_by_address(
    db: Session, address1: str, state: str, zip_code: str
) -> Optional[models.Member]:
    """Match on street address + state + zip (all must be non-empty to avoid false positives)."""
    if not all([address1, state, zip_code]):
        return None
    zip5 = zip_code.strip()[:5]
    return (
        db.query(models.Member)
        .filter(
            models.Member.address1.ilike(f"%{address1.strip()}%"),
            models.Member.state.ilike(state.strip()),
            models.Member.zip.ilike(f"%{zip5}%"),
        )
        .first()
    )


def _try_match(
    db: Session,
    email: str,
    name: str,
    address1: str = "",
    state: str = "",
    zip_code: str = "",
) -> tuple[Optional[models.Member], str]:
    """Return (member, confidence) using email → name → address cascade."""
    m = _match_by_email(db, email)
    if m:
        return m, "email"
    m = _match_by_name(db, name)
    if m:
        return m, "name"
    m = _match_by_address(db, address1, state, zip_code)
    if m:
        return m, "address"
    return None, "none"


def _parse_amount(raw: str) -> float:
    """Strip commas/dollar signs and parse to float."""
    cleaned = raw.replace(",", "").replace("$", "").strip()
    try:
        return float(cleaned)
    except (ValueError, TypeError):
        return 0.0


def _parse_date_paypal(raw: str) -> str:
    """PayPal date: MM/DD/YYYY → YYYY-MM-DD."""
    try:
        return datetime.strptime(raw.strip(), "%m/%d/%Y").strftime("%Y-%m-%d")
    except ValueError:
        return date.today().isoformat()


def _parse_date_stripe(raw: str) -> str:
    """Stripe date: 'YYYY-MM-DD HH:MM:SS' → 'YYYY-MM-DD'."""
    try:
        return raw.strip()[:10]
    except Exception:
        return date.today().isoformat()


# ── Parse endpoints ──────────────────────────────────────────────────────────

@router.post("/parse/paypal", response_model=List[ImportPreviewRow])
async def parse_paypal(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: str = Depends(get_current_user),
):
    """
    Parse a PayPal transaction CSV export.
    Skips 'User Initiated Withdrawal'.
    Includes 'Express Checkout Payment' and 'POS Payment'.
    Net column → contribution amount.
    """
    content = await file.read()
    try:
        text = content.decode("utf-8-sig")   # strip BOM if present
    except UnicodeDecodeError:
        text = content.decode("latin-1")

    reader = csv.DictReader(io.StringIO(text))
    results: List[ImportPreviewRow] = []
    row_idx = 0

    SKIP_TYPES = {"user initiated withdrawal"}
    INCLUDE_TYPES = {"express checkout payment", "pos payment"}

    for row in reader:
        tx_type = row.get("Type", "").strip().lower()
        if tx_type in SKIP_TYPES:
            continue
        if tx_type not in INCLUDE_TYPES:
            continue

        name       = row.get("Name", "").strip()
        email      = row.get("From Email Address", "").strip()
        amount     = _parse_amount(row.get("Net", "0"))
        tx_date    = _parse_date_paypal(row.get("Date", ""))
        tx_id      = row.get("Transaction ID", "").strip()
        description = row.get("Subject", "").strip() or row.get("Item Title", "").strip()
        address1   = row.get("Address Line 1", "").strip()
        address2   = row.get("Address Line 2/District/Neighborhood", "").strip()
        city       = row.get("Town/City", "").strip()
        state      = row.get("State/Province/Region/County/Territory/Prefecture/Republic", "").strip()
        zip_code   = row.get("Zip/Postal Code", "").strip()

        member, confidence = _try_match(db, email, name, address1, state, zip_code)

        results.append(ImportPreviewRow(
            rowIndex=row_idx,
            transactionId=tx_id,
            txDate=tx_date,
            name=name,
            email=email,
            amount=amount,
            description=description,
            source="paypal",
            matchedPersonId=member.personId if member else None,
            matchedMemberName=f"{member.firstName} {member.lastName}" if member else None,
            matchConfidence=confidence,
            address1=address1 or None,
            address2=address2 or None,
            city=city or None,
            state=state or None,
            zip=zip_code or None,
        ))
        row_idx += 1

    return results


@router.post("/parse/stripe", response_model=List[ImportPreviewRow])
async def parse_stripe(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: str = Depends(get_current_user),
):
    """
    Parse a Stripe payments CSV export.
    Only includes rows with Status == 'Paid'.
    Amount = Converted Amount - Fee.
    """
    content = await file.read()
    try:
        text = content.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = content.decode("latin-1")

    reader = csv.DictReader(io.StringIO(text))
    results: List[ImportPreviewRow] = []
    row_idx = 0

    for row in reader:
        status = row.get("Status", "").strip()
        if status.lower() != "paid":
            continue

        email       = row.get("Customer Email", "").strip()
        tx_date     = _parse_date_stripe(row.get("Created date (UTC)", ""))
        tx_id       = row.get("id", "").strip()
        description = row.get("Description", "").strip()
        converted   = _parse_amount(row.get("Converted Amount", "0"))
        fee         = _parse_amount(row.get("Fee", "0"))
        amount      = round(converted - fee, 2)

        member, confidence = _try_match(db, email, "")

        results.append(ImportPreviewRow(
            rowIndex=row_idx,
            transactionId=tx_id,
            txDate=tx_date,
            name="",
            email=email,
            amount=amount,
            description=description,
            source="stripe",
            matchedPersonId=member.personId if member else None,
            matchedMemberName=f"{member.firstName} {member.lastName}" if member else None,
            matchConfidence=confidence,
        ))
        row_idx += 1

    return results


# ── Save endpoint ────────────────────────────────────────────────────────────

@router.post("/save", response_model=ImportSaveResult)
def save_import(
    payload: ImportSaveRequest,
    db: Session = Depends(get_db),
    current_user: str = Depends(get_current_user),
):
    """Save confirmed import rows as Contribution records."""
    if not payload.rows:
        raise HTTPException(status_code=400, detail="No rows to save.")

    receipt_numbers: List[str] = []

    for row in payload.rows:
        # Validate member and event exist
        member = db.query(models.Member).filter(models.Member.personId == row.personId).first()
        if not member:
            raise HTTPException(status_code=404, detail=f"Member {row.personId} not found.")
        event = db.query(models.Event).filter(models.Event.eventId == row.eventId).first()
        if not event:
            raise HTTPException(status_code=404, detail=f"Event {row.eventId} not found.")

        try:
            tx_date = date.fromisoformat(row.txDate)
        except ValueError:
            tx_date = date.today()

        receipt_no = _next_receipt_number(db)
        receipt_numbers.append(receipt_no)

        contribution = models.Contribution(
            personId=row.personId,
            eventId=row.eventId,
            dateEntered=tx_date,
            contributionAmount=Decimal(str(round(row.amount, 2))),
            notes=row.notes[:200] if row.notes else None,
            receiptNumber=receipt_no,
        )
        db.add(contribution)

    db.commit()
    return ImportSaveResult(saved=len(payload.rows), receiptNumbers=receipt_numbers)
