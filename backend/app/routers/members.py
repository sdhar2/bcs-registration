from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from .. import models, schemas
from ..database import get_db
from ..auth import get_current_user

router = APIRouter(prefix="/api/members", tags=["members"])


@router.get("/", response_model=List[schemas.MemberOut])
def get_members(
    skip: int = 0,
    limit: int = 200,
    db: Session = Depends(get_db),
    current_user: str = Depends(get_current_user),
):
    return db.query(models.Member).order_by(models.Member.lastName, models.Member.firstName).offset(skip).limit(limit).all()


@router.get("/search", response_model=List[schemas.MemberSearch])
def search_members(
    q: str = Query(..., min_length=1),
    db: Session = Depends(get_db),
    current_user: str = Depends(get_current_user),
):
    """Search members by first or last name (partial match)."""
    pattern = f"%{q}%"
    return (
        db.query(models.Member)
        .filter(
            (models.Member.firstName.ilike(pattern)) |
            (models.Member.lastName.ilike(pattern))
        )
        .order_by(models.Member.lastName, models.Member.firstName)
        .limit(50)
        .all()
    )


@router.get("/check-duplicate", tags=["members"])
def check_duplicate(
    first_name: str = Query(...),
    last_name: str = Query(...),
    db: Session = Depends(get_db),
    current_user: str = Depends(get_current_user),
):
    """Return any existing members whose first+last name match (case-insensitive)."""
    matches = (
        db.query(models.Member)
        .filter(
            models.Member.firstName.ilike(first_name),
            models.Member.lastName.ilike(last_name),
        )
        .all()
    )
    return {
        "duplicates": [
            {
                "personId": m.personId,
                "firstName": m.firstName,
                "lastName": m.lastName,
                "city": m.city,
                "state": m.state,
            }
            for m in matches
        ]
    }


@router.get("/{person_id}", response_model=schemas.MemberOut)
def get_member(
    person_id: int,
    db: Session = Depends(get_db),
    current_user: str = Depends(get_current_user),
):
    member = db.query(models.Member).filter(models.Member.personId == person_id).first()
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")
    return member


@router.post("/", response_model=schemas.MemberOut, status_code=201)
def create_member(
    member_in: schemas.MemberCreate,
    db: Session = Depends(get_db),
    current_user: str = Depends(get_current_user),
):
    member = models.Member(**member_in.model_dump())
    db.add(member)
    db.commit()
    db.refresh(member)
    return member


@router.put("/{person_id}", response_model=schemas.MemberOut)
def update_member(
    person_id: int,
    member_in: schemas.MemberUpdate,
    db: Session = Depends(get_db),
    current_user: str = Depends(get_current_user),
):
    member = db.query(models.Member).filter(models.Member.personId == person_id).first()
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")
    update_data = member_in.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(member, key, value)
    db.commit()
    db.refresh(member)
    return member


@router.delete("/{person_id}", status_code=204)
def delete_member(
    person_id: int,
    db: Session = Depends(get_db),
    current_user: str = Depends(get_current_user),
):
    member = db.query(models.Member).filter(models.Member.personId == person_id).first()
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")
    db.delete(member)
    db.commit()
