-- Active: 1680044720249@@127.0.0.1@5432@bcs_registration
drop table if exists bcs_members cascade;
create table bcs_members(
personId    serial PRIMARY KEY,
firstName   varchar(50),
lastName    varchar(50),
middleName     varchar(50) null,
spouse      varchar(50) null,
children    varchar(100) null,
address1    varchar(50) null,
address2    varchar(50) null,
city        varchar(30) null,
state       varchar(2)  null,
zip         varchar(5)  null,
homePhone   varchar(15) null,
cellPhone   varchar(15) null,
cellPhone2  varchar(15) null,
pledged     money null,
paid        money null,
email       varchar(100)    null,
status      varchar(10)     null,
lifeMember  boolean);

drop table if exists bcs_events cascade;
create table bcs_events(
eventId  serial PRIMARY KEY,
eventName   varchar(30),
eventDate   date);

drop table if exists bcs_contributions cascade;
CREATE TABLE bcs_contributions (
  contributionId   SERIAL PRIMARY KEY,
  personId         INT REFERENCES bcs_members(personId),
  eventId          INT REFERENCES bcs_events(eventId),
  dateEntered      DATE NOT NULL,
  contributionAmount MONEY,
  notes            VARCHAR(200),
  receiptNumber    VARCHAR(10)
);
