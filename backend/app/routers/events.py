from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from .. import models, schemas
from ..database import get_db
from ..auth import get_current_user

router = APIRouter(prefix="/api/events", tags=["events"])


@router.get("/", response_model=List[schemas.EventOut])
def get_events(
    db: Session = Depends(get_db),
    current_user: str = Depends(get_current_user),
):
    return db.query(models.Event).order_by(models.Event.eventDate.desc()).all()


@router.get("/{event_id}", response_model=schemas.EventOut)
def get_event(
    event_id: int,
    db: Session = Depends(get_db),
    current_user: str = Depends(get_current_user),
):
    event = db.query(models.Event).filter(models.Event.eventId == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    return event


@router.post("/", response_model=schemas.EventOut, status_code=201)
def create_event(
    event_in: schemas.EventCreate,
    db: Session = Depends(get_db),
    current_user: str = Depends(get_current_user),
):
    event = models.Event(**event_in.model_dump())
    db.add(event)
    db.commit()
    db.refresh(event)
    return event


@router.put("/{event_id}", response_model=schemas.EventOut)
def update_event(
    event_id: int,
    event_in: schemas.EventUpdate,
    db: Session = Depends(get_db),
    current_user: str = Depends(get_current_user),
):
    event = db.query(models.Event).filter(models.Event.eventId == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    update_data = event_in.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(event, key, value)
    db.commit()
    db.refresh(event)
    return event


@router.delete("/{event_id}", status_code=204)
def delete_event(
    event_id: int,
    db: Session = Depends(get_db),
    current_user: str = Depends(get_current_user),
):
    event = db.query(models.Event).filter(models.Event.eventId == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    db.delete(event)
    db.commit()
