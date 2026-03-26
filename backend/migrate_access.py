#!/usr/bin/env python3
"""
migrate_access.py
-----------------
Migrates BCS data from Access databases into PostgreSQL.

Run inside the Docker backend container:
  docker exec bcs_backend bash -c \
    "apt-get update -qq && apt-get install -y -qq mdbtools && python /app/migrate_access.py"

Tables migrated:
  BCSData.accdb / BCS_Events        --> bcs_events
  BCSData.accdb / BCS_Address       --> bcs_members
  BCSData.accdb / BCS_Contributions --> bcs_contributions
  BCSData.accdb / tbl_last_receipt  --> bcs_receipt_counter
"""

import csv
import io
import re
import subprocess
import sys
from datetime import date, datetime
from decimal import Decimal, InvalidOperation

import psycopg2

# ── Config ────────────────────────────────────────────────────────────────────
DB_URL     = "postgresql://bcs_user:bcs_password@db:5432/bcs_registration"
ACCDB_DATA = "/app/BCSData.accdb"


# ── Helpers ───────────────────────────────────────────────────────────────────

def mdb_export(table: str) -> list[dict]:
    """Export an Access table to a list of dicts using mdb-export."""
    result = subprocess.run(
        ["mdb-export", ACCDB_DATA, table],
        capture_output=True, text=True, encoding="utf-8", errors="replace"
    )
    if result.returncode != 0:
        raise RuntimeError(f"mdb-export failed for '{table}': {result.stderr.strip()}")
    return list(csv.DictReader(io.StringIO(result.stdout)))


def nv(val) -> str | None:
    """Return None for blank/whitespace values."""
    s = (val or "").strip()
    return s if s else None


def clean_phone(val) -> str | None:
    """Strip non-digits; return 10-digit string or None."""
    digits = re.sub(r"\D", "", val or "")
    if len(digits) == 10:
        return digits
    # Keep partial number rather than discard (backend doesn't validate)
    return digits[:15] if digits else None


def clean_zip(val) -> str | None:
    """Return up to first 5 chars of zip code."""
    z = (val or "").strip()[:5]
    return z if z else None


def map_status(char: str | None) -> str:
    """Map single-character Access status to portal status string."""
    c = (char or "").strip().upper()
    if c == "A" or c == "":
        return "Active"
    return "Inactive"   # 'I', 'X', or anything else


def parse_access_date(val: str) -> date:
    """Parse Access datetime strings like '10/13/08 12:27:26'."""
    for fmt in ("%m/%d/%y %H:%M:%S", "%m/%d/%Y %H:%M:%S", "%m/%d/%y", "%m/%d/%Y"):
        try:
            return datetime.strptime((val or "").strip(), fmt).date()
        except ValueError:
            continue
    return date.today()


def year_from_event_name(name: str) -> date:
    """Extract a 4-digit year from an event name and return Jan 1 of that year."""
    match = re.search(r"\b(19|20)\d{2}\b", name or "")
    if match:
        return date(int(match.group()), 1, 1)
    return date.today()


def parse_currency(val) -> float | None:
    """Parse currency string to float; None on blank."""
    v = (val or "").strip().replace(",", "")
    if not v:
        return None
    try:
        return float(Decimal(v))
    except InvalidOperation:
        return None


# ── Migration ─────────────────────────────────────────────────────────────────

def run_migration():
    print("Connecting to PostgreSQL…")
    try:
        conn = psycopg2.connect(DB_URL)
    except Exception as e:
        print(f"ERROR: Cannot connect to database: {e}", file=sys.stderr)
        sys.exit(1)
    cur = conn.cursor()
    print("✓ Connected.\n")

    # ── Step 0: Schema fixes ──────────────────────────────────────────────────
    print("Step 0/5 — Applying schema fixes…")
    cur.execute("""
        ALTER TABLE bcs_events
            ALTER COLUMN eventname TYPE VARCHAR(100)
    """)
    conn.commit()
    print("  ✓ bcs_events.eventname expanded to VARCHAR(100).\n")

    # ── Step 1: Clear all existing data ──────────────────────────────────────
    print("Step 1/5 — Clearing existing data…")
    cur.execute("""
        TRUNCATE bcs_contributions, bcs_receipt_counter, bcs_events, bcs_members
        RESTART IDENTITY CASCADE
    """)
    conn.commit()
    print("  ✓ All tables cleared and sequences reset.\n")

    # ── Step 2: Migrate Events ────────────────────────────────────────────────
    print("Step 2/5 — Migrating events (BCS_Events)…")
    event_rows = mdb_export("BCS_Events")
    inserted_events = 0
    max_eid = 0

    for row in event_rows:
        eid   = int(row.get("eventid", 0) or 0)
        name  = nv(row.get("event", "")) or f"Event {eid}"
        edate = year_from_event_name(name)
        cur.execute(
            "INSERT INTO bcs_events (eventid, eventname, eventdate) VALUES (%s, %s, %s) ON CONFLICT DO NOTHING",
            (eid, name, edate)
        )
        inserted_events += 1
        max_eid = max(max_eid, eid)

    conn.commit()
    if max_eid > 0:
        cur.execute(
            "SELECT setval(pg_get_serial_sequence('bcs_events','eventid'), %s)",
            (max_eid,)
        )
        conn.commit()
    print(f"  ✓ {inserted_events} events inserted.\n")

    # ── Step 3: Migrate Members ───────────────────────────────────────────────
    print("Step 3/5 — Migrating members (BCS_Address)…")
    member_rows = mdb_export("BCS_Address")
    ok_members = skipped_members = 0
    max_pid = 0

    for row in member_rows:
        pid   = int(row.get("PersonID", 0) or 0)
        first = nv(row.get("FirstName", ""))
        last  = nv(row.get("LastName",  ""))

        if not first or not last:
            skipped_members += 1
            continue

        # Phone fields — deduplicate 'phone' column vs homePhone
        hp = clean_phone(row.get("HomePhone", ""))
        cp = clean_phone(row.get("CellPhone", ""))
        p3 = clean_phone(row.get("phone", ""))
        if p3 and (p3 == hp or p3 == cp):
            p3 = None   # don't store a duplicate

        # Life member: Access stores as 0/1 or Boolean
        lm_val = str(row.get("life_member", "0")).strip()
        life_member = lm_val not in ("0", "False", "false", "")

        cur.execute("""
            INSERT INTO bcs_members
              (personid, firstname, lastname, spouse, children,
               address1, address2, city, state, zip,
               homephone, cellphone, cellphone2,
               email, status, lifemember)
            VALUES (%s,%s,%s,%s,%s, %s,%s,%s,%s,%s, %s,%s,%s, %s,%s,%s)
            ON CONFLICT DO NOTHING
        """, (
            pid, first, last,
            nv(row.get("Spouse",   "")),
            nv(row.get("Children", "")),
            nv(row.get("Address1", "")),
            nv(row.get("Address2", "")),
            nv(row.get("City",     "")),
            nv(row.get("ST",       "")),
            clean_zip(row.get("ZIP", "")),
            hp, cp, p3,
            nv(row.get("Email",   "")),
            map_status(nv(row.get("status", ""))),
            life_member,
        ))
        ok_members += 1
        max_pid = max(max_pid, pid)

    conn.commit()
    if max_pid > 0:
        cur.execute(
            "SELECT setval(pg_get_serial_sequence('bcs_members','personid'), %s)",
            (max_pid,)
        )
        conn.commit()
    print(f"  ✓ {ok_members} members inserted, {skipped_members} skipped (missing name).\n")

    # ── Step 4: Migrate Contributions ────────────────────────────────────────
    print("Step 4/5 — Migrating contributions (BCS_Contributions)…")
    cur.execute("SELECT personid FROM bcs_members")
    valid_pids = {r[0] for r in cur.fetchall()}
    cur.execute("SELECT eventid FROM bcs_events")
    valid_eids = {r[0] for r in cur.fetchall()}

    contrib_rows = mdb_export("BCS_Contributions")
    ok_contribs = skipped_contribs = 0

    for row in contrib_rows:
        pid = int(row.get("PersonID", 0) or 0)
        eid = int(row.get("eventid",  0) or 0)

        if pid not in valid_pids:
            skipped_contribs += 1
            continue
        if eid not in valid_eids:
            skipped_contribs += 1
            continue

        amount  = parse_currency(row.get("contribution", "0")) or 0.0
        dt      = parse_access_date(row.get("dateofentry", ""))
        notes   = nv(row.get("notes", ""))
        receipt = nv(row.get("receipt_number", ""))

        cur.execute("""
            INSERT INTO bcs_contributions
              (personid, eventid, dateentered, contributionamount, notes, receiptnumber)
            VALUES (%s, %s, %s, %s, %s, %s)
        """, (pid, eid, dt, amount, notes, receipt))
        ok_contribs += 1

    conn.commit()
    # Reset the contributions sequence
    cur.execute("""
        SELECT setval(
            pg_get_serial_sequence('bcs_contributions','contributionid'),
            COALESCE((SELECT MAX(contributionid) FROM bcs_contributions), 1)
        )
    """)
    conn.commit()
    print(f"  ✓ {ok_contribs} contributions inserted, {skipped_contribs} skipped (orphaned FK).\n")

    # ── Step 5: Migrate Receipt Counter ──────────────────────────────────────
    print("Step 5/5 — Migrating receipt counter (tbl_last_receipt)…")
    receipt_rows = mdb_export("tbl_last_receipt")

    for row in receipt_rows:
        yr  = int(row.get("receipt_year",        0) or 0)
        num = int(row.get("receipt_last_number", 0) or 0)
        cur.execute("""
            INSERT INTO bcs_receipt_counter (year, lastnumber)
            VALUES (%s, %s)
            ON CONFLICT (year) DO UPDATE SET lastnumber = EXCLUDED.lastnumber
        """, (yr, num))

    conn.commit()
    print(f"  ✓ {len(receipt_rows)} receipt counter rows migrated.\n")

    # ── Summary ───────────────────────────────────────────────────────────────
    cur.execute("SELECT COUNT(*) FROM bcs_members");       mc = cur.fetchone()[0]
    cur.execute("SELECT COUNT(*) FROM bcs_events");        ec = cur.fetchone()[0]
    cur.execute("SELECT COUNT(*) FROM bcs_contributions"); cc = cur.fetchone()[0]

    print("=" * 45)
    print("  ✅  Migration complete!")
    print(f"      Members:       {mc:>6,}")
    print(f"      Events:        {ec:>6,}")
    print(f"      Contributions: {cc:>6,}")
    print("=" * 45)

    cur.close()
    conn.close()


if __name__ == "__main__":
    run_migration()
