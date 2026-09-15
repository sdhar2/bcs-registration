from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload
from pydantic import BaseModel, Field

from .. import models
from ..database import get_db
from ..auth import get_current_user
from ..receipt_generator import generate_receipt_pdf, member_display_name
from ..email_service import send_receipt_email

router = APIRouter(prefix="/api/receipt", tags=["receipt"])

# Gmail SMTP takes roughly 1-2s per message. Cap a single bulk request so it
# completes well inside the proxy/browser timeout window.
MAX_BULK = 50


# ── Schemas ───────────────────────────────────────────────────────────────────

class SendReceiptResponse(BaseModel):
    message: str
    sentTo: list[str]


class BulkRequest(BaseModel):
    contributionIds: list[int] = Field(..., min_length=1)


class BulkPreviewItem(BaseModel):
    contributionId: int
    memberName: str | None = None
    receiptNumber: str | None = None
    eventName: str | None = None
    amount: float | None = None
    emails: list[str] = []
    sendable: bool
    reason: str | None = None       # why it is not sendable


class BulkPreviewResponse(BaseModel):
    items: list[BulkPreviewItem]
    sendableCount: int
    skippedCount: int
    maxBulk: int = MAX_BULK


class BulkSendItem(BaseModel):
    contributionId: int
    memberName: str | None = None
    receiptNumber: str | None = None
    status: str                      # "sent" | "skipped" | "failed"
    emails: list[str] = []
    detail: str | None = None


class BulkSendResponse(BaseModel):
    items: list[BulkSendItem]
    sentCount: int
    skippedCount: int
    failedCount: int


# ── Shared helpers ────────────────────────────────────────────────────────────

class ReceiptError(Exception):
    """A contribution cannot have a receipt sent; message is user-facing."""


def _load_contribution(db: Session, contribution_id: int) -> models.Contribution | None:
    return (
        db.query(models.Contribution)
        .options(
            joinedload(models.Contribution.member),
            joinedload(models.Contribution.event),
        )
        .filter(models.Contribution.contributionId == contribution_id)
        .first()
    )


def _resolve(contribution: models.Contribution) -> dict:
    """
    Pull everything needed to render and send a receipt off a contribution.

    Raises ReceiptError with a user-facing message when the contribution is not
    in a sendable state (no member, no email, no receipt number).
    """
    member = contribution.member
    event = contribution.event

    if not member:
        raise ReceiptError("No member linked to this contribution")

    raw_email = member.email or ""
    emails = [e.strip() for e in raw_email.split(",") if e.strip()]
    if not emails:
        raise ReceiptError("No email address on file for this member")

    if not contribution.receiptNumber:
        raise ReceiptError("Contribution has no receipt number assigned")

    return {
        "emails": emails,
        "memberName": member_display_name(member.firstName, member.spouse, member.lastName),
        "receiptNumber": contribution.receiptNumber,
        "eventName": event.eventName if event else "General Contribution",
        "amount": float(contribution.contributionAmount or 0),
        "receiptDate": contribution.dateEntered,
    }


def _describe(contribution: models.Contribution) -> tuple[str | None, str | None]:
    """Best-effort member name and receipt number, even when not sendable."""
    member = contribution.member
    name = (
        member_display_name(member.firstName, member.spouse, member.lastName)
        if member
        else None
    )
    return name, contribution.receiptNumber


def _build_and_send(info: dict) -> None:
    """Generate the PDF and hand it to the email service. Raises on failure."""
    pdf_bytes = generate_receipt_pdf(
        member_name    = info["memberName"],
        receipt_number = info["receiptNumber"],
        receipt_date   = info["receiptDate"],
        amount         = info["amount"],
        event_name     = info["eventName"],
    )
    send_receipt_email(
        to_emails      = info["emails"],
        member_name    = info["memberName"],
        receipt_number = info["receiptNumber"],
        event_name     = info["eventName"],
        amount         = info["amount"],
        receipt_pdf    = pdf_bytes,
    )


# ── Single receipt ────────────────────────────────────────────────────────────

@router.get("/preview/{contribution_id}")
def get_receipt_info(
    contribution_id: int,
    db: Session = Depends(get_db),
    current_user: str = Depends(get_current_user),
):
    """Return recipient emails for a contribution (for the confirmation screen)."""
    contribution = _load_contribution(db, contribution_id)
    if not contribution:
        raise HTTPException(status_code=404, detail="Contribution not found")

    try:
        info = _resolve(contribution)
    except ReceiptError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    return {
        "emails": info["emails"],
        "receiptNumber": info["receiptNumber"],
        "memberName": info["memberName"],
        "eventName": info["eventName"],
        "amount": info["amount"],
    }


@router.post("/send/{contribution_id}", response_model=SendReceiptResponse)
def send_receipt(
    contribution_id: int,
    db: Session = Depends(get_db),
    current_user: str = Depends(get_current_user),
):
    """Generate the receipt PDF and send it by email to the member."""
    contribution = _load_contribution(db, contribution_id)
    if not contribution:
        raise HTTPException(status_code=404, detail="Contribution not found")

    try:
        info = _resolve(contribution)
    except ReceiptError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    try:
        _build_and_send(info)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Receipt delivery failed: {exc}")

    return SendReceiptResponse(
        message="Receipt emailed successfully",
        sentTo=info["emails"],
    )


# ── Bulk receipts ─────────────────────────────────────────────────────────────

@router.post("/bulk-preview", response_model=BulkPreviewResponse)
def bulk_preview(
    req: BulkRequest,
    db: Session = Depends(get_db),
    current_user: str = Depends(get_current_user),
):
    """
    Report, for each selected contribution, who the receipt would go to and
    whether it can be sent at all. Nothing is emailed here.
    """
    ids = list(dict.fromkeys(req.contributionIds))   # de-dupe, keep order
    if len(ids) > MAX_BULK:
        raise HTTPException(
            status_code=400,
            detail=f"Select at most {MAX_BULK} contributions per batch (got {len(ids)}).",
        )

    items: list[BulkPreviewItem] = []
    for cid in ids:
        contribution = _load_contribution(db, cid)
        if not contribution:
            items.append(BulkPreviewItem(
                contributionId=cid, sendable=False, reason="Contribution not found"
            ))
            continue

        name, receipt_no = _describe(contribution)
        try:
            info = _resolve(contribution)
        except ReceiptError as exc:
            items.append(BulkPreviewItem(
                contributionId=cid,
                memberName=name,
                receiptNumber=receipt_no,
                eventName=contribution.event.eventName if contribution.event else None,
                amount=float(contribution.contributionAmount or 0),
                sendable=False,
                reason=str(exc),
            ))
            continue

        items.append(BulkPreviewItem(
            contributionId=cid,
            memberName=info["memberName"],
            receiptNumber=info["receiptNumber"],
            eventName=info["eventName"],
            amount=info["amount"],
            emails=info["emails"],
            sendable=True,
        ))

    sendable = sum(1 for i in items if i.sendable)
    return BulkPreviewResponse(
        items=items,
        sendableCount=sendable,
        skippedCount=len(items) - sendable,
    )


@router.post("/bulk-send", response_model=BulkSendResponse)
def bulk_send(
    req: BulkRequest,
    db: Session = Depends(get_db),
    current_user: str = Depends(get_current_user),
):
    """
    Send receipts for each selected contribution. Rows that cannot be sent are
    skipped rather than aborting the batch; every row's outcome is reported.
    """
    ids = list(dict.fromkeys(req.contributionIds))
    if len(ids) > MAX_BULK:
        raise HTTPException(
            status_code=400,
            detail=f"Select at most {MAX_BULK} contributions per batch (got {len(ids)}).",
        )

    items: list[BulkSendItem] = []
    for cid in ids:
        contribution = _load_contribution(db, cid)
        if not contribution:
            items.append(BulkSendItem(
                contributionId=cid, status="skipped", detail="Contribution not found"
            ))
            continue

        name, receipt_no = _describe(contribution)

        try:
            info = _resolve(contribution)
        except ReceiptError as exc:
            items.append(BulkSendItem(
                contributionId=cid,
                memberName=name,
                receiptNumber=receipt_no,
                status="skipped",
                detail=str(exc),
            ))
            continue

        try:
            _build_and_send(info)
        except Exception as exc:
            items.append(BulkSendItem(
                contributionId=cid,
                memberName=info["memberName"],
                receiptNumber=info["receiptNumber"],
                emails=info["emails"],
                status="failed",
                detail=str(exc),
            ))
            continue

        items.append(BulkSendItem(
            contributionId=cid,
            memberName=info["memberName"],
            receiptNumber=info["receiptNumber"],
            emails=info["emails"],
            status="sent",
        ))

    return BulkSendResponse(
        items=items,
        sentCount=sum(1 for i in items if i.status == "sent"),
        skippedCount=sum(1 for i in items if i.status == "skipped"),
        failedCount=sum(1 for i in items if i.status == "failed"),
    )
