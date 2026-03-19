from pydantic import BaseModel, EmailStr
from typing import Optional
from datetime import date
from decimal import Decimal


# ── Auth ────────────────────────────────────────────────────────────────────

class LoginRequest(BaseModel):
    username: str
    password: str

class Token(BaseModel):
    access_token: str
    token_type: str


# ── Members ─────────────────────────────────────────────────────────────────

class MemberBase(BaseModel):
    firstName: str
    lastName: str
    middleName: Optional[str] = None
    spouse: Optional[str] = None
    children: Optional[str] = None
    address1: Optional[str] = None
    address2: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    zip: Optional[str] = None
    homePhone: Optional[str] = None
    cellPhone: Optional[str] = None
    cellPhone2: Optional[str] = None
    pledged: Optional[Decimal] = None
    paid: Optional[Decimal] = None
    email: Optional[str] = None
    status: Optional[str] = None
    lifeMember: Optional[bool] = False

class MemberCreate(MemberBase):
    pass

class MemberUpdate(MemberBase):
    firstName: Optional[str] = None
    lastName: Optional[str] = None

class MemberOut(MemberBase):
    personId: int

    class Config:
        from_attributes = True

class MemberSearch(BaseModel):
    personId: int
    firstName: str
    lastName: str
    middleName: Optional[str] = None
    email: Optional[str] = None
    cellPhone: Optional[str] = None

    class Config:
        from_attributes = True


# ── Events ───────────────────────────────────────────────────────────────────

class EventBase(BaseModel):
    eventName: str
    eventDate: date

class EventCreate(EventBase):
    pass

class EventUpdate(BaseModel):
    eventName: Optional[str] = None
    eventDate: Optional[date] = None

class EventOut(EventBase):
    eventId: int

    class Config:
        from_attributes = True


# ── Contributions ─────────────────────────────────────────────────────────────

class ContributionBase(BaseModel):
    personId: int
    eventId: int
    dateEntered: date
    contributionAmount: Optional[Decimal] = None
    notes: Optional[str] = None
    receiptNumber: Optional[str] = None

class ContributionCreate(ContributionBase):
    pass

class ContributionUpdate(BaseModel):
    personId: Optional[int] = None
    eventId: Optional[int] = None
    dateEntered: Optional[date] = None
    contributionAmount: Optional[Decimal] = None
    notes: Optional[str] = None
    receiptNumber: Optional[str] = None

class ContributionOut(ContributionBase):
    contributionId: int
    memberName: Optional[str] = None
    eventName: Optional[str] = None

    class Config:
        from_attributes = True
