"""Shared helpers for reasoning about annual membership dues.

A member's yearly membership is recorded like any other contribution: it is a
contribution against an event whose name carries both the word "membership"
and the year, e.g. "2026 Membership" or "Membership 2026".  Both the unpaid
membership report and the Add Contribution screen need to answer the same
question -- "has this member paid for year N?" -- so the logic lives here.
"""

import re
from datetime import date

from sqlalchemy.orm import Session

from . import models

YEAR_RE = re.compile(r"\b(19|20)\d{2}\b")


def membership_events(db: Session, year: int):
    """All events whose name contains 'membership' and the given year."""
    return (
        db.query(models.Event)
        .filter(
            models.Event.eventName.ilike("%membership%"),
            models.Event.eventName.ilike(f"%{year}%"),
        )
        .all()
    )


def has_paid_membership(db: Session, person_id: int, event_ids: list[int]) -> bool:
    """True when the member has any contribution against one of these events."""
    if not event_ids:
        return False
    return (
        db.query(models.Contribution.contributionId)
        .filter(
            models.Contribution.personId == person_id,
            models.Contribution.eventId.in_(event_ids),
        )
        .first()
        is not None
    )


def membership_status(db: Session, member: models.Member, year: int | None = None) -> dict:
    """Whether this member owes membership dues for the given year.

    Life members never owe dues.  If no membership event exists for the year
    yet, nothing can be due, so `dues` is False and `membershipEventExists`
    tells the caller why -- the screen stays quiet rather than warning about
    an event that has not been set up.
    """
    year = year or date.today().year
    is_life = bool(member.lifeMember)

    if is_life:
        return {
            "personId": member.personId,
            "memberName": f"{member.firstName} {member.lastName}",
            "year": year,
            "lifeMember": True,
            "membershipEventExists": True,
            "paid": True,
            "dues": False,
            "events": [],
        }

    events = membership_events(db, year)
    event_ids = [e.eventId for e in events]
    paid = has_paid_membership(db, member.personId, event_ids)

    return {
        "personId": member.personId,
        "memberName": f"{member.firstName} {member.lastName}",
        "year": year,
        "lifeMember": False,
        "membershipEventExists": bool(events),
        "paid": paid,
        # Only flag dues when we actually have an event to measure against.
        "dues": bool(events) and not paid,
        "events": [{"eventId": e.eventId, "eventName": e.eventName} for e in events],
    }
