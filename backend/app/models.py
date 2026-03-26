from sqlalchemy import Column, Integer, String, Date, Boolean, Numeric, ForeignKey
from sqlalchemy.orm import relationship
from .database import Base

# PostgreSQL lowercases all unquoted identifiers.
# Python attribute (camelCase) → explicit DB column name (lowercase).


class Member(Base):
    __tablename__ = "bcs_members"

    personId      = Column("personid",    Integer,       primary_key=True, index=True, autoincrement=True)
    firstName     = Column("firstname",   String(50),    nullable=False)
    lastName      = Column("lastname",    String(50),    nullable=False)
    middleName    = Column("middlename",  String(50),    nullable=True)
    spouse        = Column("spouse",      String(50),    nullable=True)
    children      = Column("children",    String(100),   nullable=True)
    address1      = Column("address1",    String(50),    nullable=True)
    address2      = Column("address2",    String(50),    nullable=True)
    city          = Column("city",        String(30),    nullable=True)
    state         = Column("state",       String(2),     nullable=True)
    zip           = Column("zip",         String(5),     nullable=True)
    homePhone     = Column("homephone",   String(15),    nullable=True)
    cellPhone     = Column("cellphone",   String(15),    nullable=True)
    cellPhone2    = Column("cellphone2",  String(15),    nullable=True)
    pledged       = Column("pledged",     Numeric(12,2), nullable=True)
    paid          = Column("paid",        Numeric(12,2), nullable=True)
    email         = Column("email",       String(500),   nullable=True)
    status        = Column("status",      String(10),    nullable=True)
    lifeMember    = Column("lifemember",  Boolean,       nullable=True, default=False)

    contributions = relationship("Contribution", back_populates="member", cascade="all, delete-orphan")


class Event(Base):
    __tablename__ = "bcs_events"

    eventId   = Column("eventid",   Integer,    primary_key=True, index=True, autoincrement=True)
    eventName = Column("eventname", String(100), nullable=False)
    eventDate = Column("eventdate", Date,       nullable=False)

    contributions = relationship("Contribution", back_populates="event", cascade="all, delete-orphan")


class ReceiptCounter(Base):
    __tablename__ = "bcs_receipt_counter"

    year       = Column("year",       Integer, primary_key=True)
    lastNumber = Column("lastnumber", Integer, nullable=False, default=0)


class Contribution(Base):
    __tablename__ = "bcs_contributions"

    contributionId     = Column("contributionid",     Integer,       primary_key=True, index=True, autoincrement=True)
    personId           = Column("personid",           Integer,       ForeignKey("bcs_members.personid"),  nullable=False)
    eventId            = Column("eventid",            Integer,       ForeignKey("bcs_events.eventid"),    nullable=False)
    dateEntered        = Column("dateentered",        Date,          nullable=False)
    contributionAmount = Column("contributionamount", Numeric(12,2), nullable=True)
    notes              = Column("notes",              String(200),   nullable=True)
    receiptNumber      = Column("receiptnumber",      String(15),    nullable=True)

    member = relationship("Member", back_populates="contributions")
    event  = relationship("Event",  back_populates="contributions")
