from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload
from pydantic import BaseModel

from .. import models
from ..database import get_db
from ..auth import get_current_user
from ..receipt_generator import generate_receipt_pdf, member_display_name
from ..email_service import send_receipt_email

router = APIRouter(prefix="/api/receipt", tags=["receipt"])


class SendReceiptResponse(BaseModel):
    message: str
    sentTo: list[str]


@router.get("/preview/{contribution_id}")
def get_receipt_info(
    contribution_id: int,
    db: Session = Depends(get_db),
    current_user: str = Depends(get_current_user),
):
    """Return recipient emails for a contribution (for the confirmation dialog)."""
    contribution = (
        db.query(models.Contribution)
        .options(joinedload(models.Contribution.member))
        .filter(models.Contribution.contributionId == contribution_id)
        .first()
    )
    if not contribution:
        raise HTTPException(status_code=404, detail="Contribution not found")

    member = contribution.member
    if not member or not member.email:
        raise HTTPException(status_code=400, detail="No email address on file for this member")

    emails = [e.strip() for e in member.email.split(',') if e.strip()]
    if not emails:
        raise HTTPException(status_code=400, detail="No valid email addresses found")

    return {
        "emails": emails,
        "receiptNumber": contribution.receiptNumber or "N/A",
        "memberName": member_display_name(member.firstName, member.spouse, member.lastName),
    }


@router.post("/send/{contribution_id}", response_model=SendReceiptResponse)
def send_receipt(
    contribution_id: int,
    db: Session = Depends(get_db),
    current_user: str = Depends(get_current_user),
):
    """Generate the receipt PDF and send it by email to the member."""
    contribution = (
        db.query(models.Contribution)
        .options(
            joinedload(models.Contribution.member),
            joinedload(models.Contribution.event),
        )
        .filter(models.Contribution.contributionId == contribution_id)
        .first()
    )
    if not contribution:
        raise HTTPException(status_code=404, detail="Contribution not found")

    member = contribution.member
    event  = contribution.event

    if not member or not member.email:
        raise HTTPException(status_code=400, detail="No email address on file for this member")

    emails = [e.strip() for e in member.email.split(',') if e.strip()]
    if not emails:
        raise HTTPException(status_code=400, detail="No valid email addresses found")

    if not contribution.receiptNumber:
        raise HTTPException(status_code=400, detail="Contribution has no receipt number assigned")

    disp_name  = member_display_name(member.firstName, member.spouse, member.lastName)
    amount     = contribution.contributionAmount or 0
    event_name = event.eventName if event else "General Contribution"

    # Generate PDF
    try:
        pdf_bytes = generate_receipt_pdf(
            member_name    = disp_name,
            receipt_number = contribution.receiptNumber,
            receipt_date   = contribution.dateEntered,
            amount         = amount,
            event_name     = event_name,
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"PDF generation failed: {exc}")

    # Send email
    try:
        send_receipt_email(
            to_emails      = emails,
            member_name    = disp_name,
            receipt_number = contribution.receiptNumber,
            event_name     = event_name,
            amount         = float(amount),
            receipt_pdf    = pdf_bytes,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Email delivery failed: {exc}")

    return SendReceiptResponse(
        message=f"Receipt emailed successfully",
        sentTo=emails,
    )
