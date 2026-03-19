-- BCS Registration Database Initialization
-- Column names are lowercase — PostgreSQL folds all unquoted identifiers to lowercase.

DROP TABLE IF EXISTS bcs_contributions CASCADE;
DROP TABLE IF EXISTS bcs_receipt_counter CASCADE;
DROP TABLE IF EXISTS bcs_members CASCADE;
DROP TABLE IF EXISTS bcs_events CASCADE;

CREATE TABLE bcs_members (
    personid    SERIAL PRIMARY KEY,
    firstname   VARCHAR(50)   NOT NULL,
    lastname    VARCHAR(50)   NOT NULL,
    middlename  VARCHAR(50)   NULL,
    spouse      VARCHAR(50)   NULL,
    children    VARCHAR(100)  NULL,
    address1    VARCHAR(50)   NULL,
    address2    VARCHAR(50)   NULL,
    city        VARCHAR(30)   NULL,
    state       VARCHAR(2)    NULL,
    zip         VARCHAR(5)    NULL,
    homephone   VARCHAR(15)   NULL,
    cellphone   VARCHAR(15)   NULL,
    cellphone2  VARCHAR(15)   NULL,
    pledged     NUMERIC(12,2) NULL,
    paid        NUMERIC(12,2) NULL,
    email       VARCHAR(500)  NULL,
    status      VARCHAR(10)   NULL,
    lifemember  BOOLEAN       DEFAULT FALSE
);

CREATE TABLE bcs_events (
    eventid   SERIAL PRIMARY KEY,
    eventname VARCHAR(30) NOT NULL,
    eventdate DATE        NOT NULL
);

CREATE TABLE bcs_receipt_counter (
    year        INT PRIMARY KEY,
    lastnumber  INT NOT NULL DEFAULT 0
);

CREATE TABLE bcs_contributions (
    contributionid     SERIAL PRIMARY KEY,
    personid           INT REFERENCES bcs_members(personid) ON DELETE CASCADE,
    eventid            INT REFERENCES bcs_events(eventid)   ON DELETE CASCADE,
    dateentered        DATE          NOT NULL,
    contributionamount NUMERIC(12,2),
    notes              VARCHAR(200),
    receiptnumber      VARCHAR(15)
);

CREATE INDEX idx_members_name         ON bcs_members      (lastname, firstname);
CREATE INDEX idx_contributions_person ON bcs_contributions (personid);
CREATE INDEX idx_contributions_event  ON bcs_contributions (eventid);

-- Sample data
INSERT INTO bcs_members (firstname, lastname, email, cellphone, city, state, status, lifemember)
VALUES
  ('Rajiv', 'Chatterjee', 'rajiv@example.com', '617-555-0101', 'Boston',     'MA', 'Active', true),
  ('Priya', 'Banerjee',   'priya@example.com', '617-555-0202', 'Cambridge',  'MA', 'Active', false),
  ('Amit',  'Dasgupta',   'amit@example.com',  '617-555-0303', 'Somerville', 'MA', 'Active', false);

INSERT INTO bcs_events (eventname, eventdate)
VALUES
  ('Durga Puja 2024',       '2024-10-12'),
  ('Saraswati Puja 2025',   '2025-02-03'),
  ('Bengali New Year 2025', '2025-04-14');

INSERT INTO bcs_receipt_counter (year, lastnumber) VALUES (2024, 2), (2025, 1);

INSERT INTO bcs_contributions (personid, eventid, dateentered, contributionamount, receiptnumber)
VALUES
  (1, 1, '2024-10-01', 250.00, '2024/1'),
  (2, 1, '2024-10-05', 150.00, '2024/2'),
  (3, 2, '2025-01-20', 100.00, '2025/1');
