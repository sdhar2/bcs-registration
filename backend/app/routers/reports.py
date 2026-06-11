import re
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from .. import models
from ..database import get_db
from ..auth import get_current_user

router = APIRouter(prefix="/api/reports", tags=["reports"])

YEAR_RE = re.compile(r"\b(19|20)\d{2}\b")


def _membership_events(db: Session, year: int):
    """All events whose name contains 'membership' and the given year,
    e.g. '2026 Membership' or 'Membership 2026'."""
    return (
        db.query(models.Event)
        .filter(
            models.Event.eventName.ilike("%membership%"),
            models.Event.eventName.ilike(f"%{year}%"),
        )
        .all()
    )


@router.get("/membership-years")
def membership_years(
    db: Session = Depends(get_db),
    current_user: str = Depends(get_current_user),
):
    """Distinct years for which a '<year> Membership' event exists (newest first)."""
    events = (
        db.query(models.Event)
        .filter(models.Event.eventName.ilike("%membership%"))
        .all()
    )
    years = set()
    for e in events:
        m = YEAR_RE.search(e.eventName or "")
        if m:
            years.add(int(m.group(0)))
    return {"years": sorted(years, reverse=True)}


@router.get("/unpaid-membership")
def unpaid_membership(
    year: int = Query(..., ge=1900, le=2100),
    db: Session = Depends(get_db),
    current_user: str = Depends(get_current_user),
):
    """Active, non-life members with no contribution to the given year's
    Membership event. Read-only — does not modify any data."""
    events = _membership_events(db, year)
    if not events:
        raise HTTPException(
            status_code=404,
            detail=f"No membership event found for {year} "
                   f"(expected an event like '{year} Membership').",
        )
    event_ids = [e.eventId for e in events]

    paid_subq = (
        db.query(models.Contribution.personId)
        .filter(models.Contribution.eventId.in_(event_ids))
        .distinct()
    )

    members = (
        db.query(models.Member)
        .filter(
            models.Member.status == "Active",
            (models.Member.lifeMember.is_(False)) | (models.Member.lifeMember.is_(None)),
            ~models.Member.personId.in_(paid_subq),
        )
        .order_by(models.Member.lastName, models.Member.firstName)
        .all()
    )

    return {
        "year": year,
        "events": [{"eventId": e.eventId, "eventName": e.eventName} for e in events],
        "count": len(members),
        "members": [
            {
                "personId": m.personId,
                "firstName": m.firstName,
                "lastName": m.lastName,
                "spouse": m.spouse,
                "email": m.email,
                "cellPhone": m.cellPhone,
                "homePhone": m.homePhone,
                "address1": m.address1,
                "address2": m.address2,
                "city": m.city,
                "state": m.state,
                "zip": m.zip,
            }
            for m in members
        ],
    }
