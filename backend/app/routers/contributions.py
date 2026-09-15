from datetime import date
from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import select
from typing import List, Optional
from .. import models, schemas
from ..database import get_db
from ..auth import get_current_user

router = APIRouter(prefix="/api/contributions", tags=["contributions"])


def _next_receipt_number(db: Session) -> str:
    """Atomically increment the per-year receipt counter and return YYYY/N."""
    year = date.today().year
    counter = (
        db.query(models.ReceiptCounter)
        .filter(models.ReceiptCounter.year == year)
        .with_for_update()
        .first()
    )
    if not counter:
        counter = models.ReceiptCounter(year=year, lastNumber=0)
        db.add(counter)
    counter.lastNumber += 1
    db.flush()   # write before returning so concurrent calls get distinct values
    return f"{year}/{counter.lastNumber}"


def _enrich(contribution: models.Contribution) -> schemas.ContributionOut:
    out = schemas.ContributionOut.model_validate(contribution)
    if contribution.member:
        out.memberName = f"{contribution.member.firstName} {contribution.member.lastName}"
    if contribution.event:
        out.eventName = contribution.event.eventName
    return out


PAGE_SIZE = 100   # rows per page when browsing all contributions

@router.get("/", response_model=List[schemas.ContributionOut])
def get_contributions(
    response: Response,
    page: int = Query(1, ge=1),
    person_id: Optional[int] = Query(None),
    event_id: Optional[int] = Query(
        None, description="Single event filter (legacy; prefer repeated event_ids)."
    ),
    event_ids: Optional[List[int]] = Query(
        None, description="Repeat to filter across several events, e.g. ?event_ids=3&event_ids=7"
    ),
    db: Session = Depends(get_db),
    current_user: str = Depends(get_current_user),
):
    query = (
        db.query(models.Contribution)
        .options(joinedload(models.Contribution.member), joinedload(models.Contribution.event))
    )
    if person_id:
        query = query.filter(models.Contribution.personId == person_id)

    # event_id is kept so older callers keep working; both may be supplied,
    # in which case they are unioned.
    wanted_events = list(dict.fromkeys((event_ids or []) + ([event_id] if event_id else [])))
    if wanted_events:
        query = query.filter(models.Contribution.eventId.in_(wanted_events))

    total = query.count()
    response.headers["X-Total-Count"] = str(total)

    # When filtering by specific events or a member, return all matching rows.
    # Otherwise paginate so we never send all 8000+ rows at once.
    if wanted_events or person_id:
        contributions = query.order_by(models.Contribution.dateEntered.desc()).all()
    else:
        offset = (page - 1) * PAGE_SIZE
        contributions = query.order_by(models.Contribution.dateEntered.desc()).offset(offset).limit(PAGE_SIZE).all()

    return [_enrich(c) for c in contributions]


@router.get("/{contribution_id}", response_model=schemas.ContributionOut)
def get_contribution(
    contribution_id: int,
    db: Session = Depends(get_db),
    current_user: str = Depends(get_current_user),
):
    contribution = (
        db.query(models.Contribution)
        .options(joinedload(models.Contribution.member), joinedload(models.Contribution.event))
        .filter(models.Contribution.contributionId == contribution_id)
        .first()
    )
    if not contribution:
        raise HTTPException(status_code=404, detail="Contribution not found")
    return _enrich(contribution)


@router.post("/", response_model=schemas.ContributionOut, status_code=201)
def create_contribution(
    contrib_in: schemas.ContributionCreate,
    db: Session = Depends(get_db),
    current_user: str = Depends(get_current_user),
):
    # Validate foreign keys
    member = db.query(models.Member).filter(models.Member.personId == contrib_in.personId).first()
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")
    event = db.query(models.Event).filter(models.Event.eventId == contrib_in.eventId).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    data = contrib_in.model_dump()

    # Auto-assign receipt number if not provided
    if not data.get('receiptNumber'):
        data['receiptNumber'] = _next_receipt_number(db)

    contribution = models.Contribution(**data)
    db.add(contribution)
    db.commit()
    db.refresh(contribution)
    return get_contribution(contribution.contributionId, db, current_user)


@router.put("/{contribution_id}", response_model=schemas.ContributionOut)
def update_contribution(
    contribution_id: int,
    contrib_in: schemas.ContributionUpdate,
    db: Session = Depends(get_db),
    current_user: str = Depends(get_current_user),
):
    contribution = db.query(models.Contribution).filter(models.Contribution.contributionId == contribution_id).first()
    if not contribution:
        raise HTTPException(status_code=404, detail="Contribution not found")
    update_data = contrib_in.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(contribution, key, value)
    db.commit()
    db.refresh(contribution)
    return get_contribution(contribution_id, db, current_user)


@router.delete("/{contribution_id}", status_code=204)
def delete_contribution(
    contribution_id: int,
    db: Session = Depends(get_db),
    current_user: str = Depends(get_current_user),
):
    contribution = db.query(models.Contribution).filter(models.Contribution.contributionId == contribution_id).first()
    if not contribution:
        raise HTTPException(status_code=404, detail="Contribution not found")
    db.delete(contribution)
    db.commit()
