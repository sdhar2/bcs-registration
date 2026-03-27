# Bengali Cultural Society — Registration Portal

A membership and contributions management system for the Bengali Cultural Society (BCS).
Built with React + FastAPI + PostgreSQL, fully containerized with Docker Compose.

---

## Tech Stack

| Layer     | Technology                          |
|-----------|-------------------------------------|
| Frontend  | React 18, Vite, Tailwind CSS        |
| Backend   | Python 3.11, FastAPI, SQLAlchemy 2  |
| Database  | PostgreSQL 16                       |
| Container | Docker, Docker Compose              |

---

## Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) installed and running
- Git

No other dependencies required — Python, Node.js, and PostgreSQL all run inside containers.

---

## Quick Start

```bash
git clone https://github.com/YOUR_USERNAME/bcs-registration.git
cd bcs-registration
docker compose up -d --build
```

Open **http://localhost:3000** in your browser.

### Starting and stopping

```bash
docker compose up -d       # Start all containers (background)
docker compose down        # Stop all containers (data is preserved)
docker compose logs -f     # Tail logs from all containers
```

> ⚠️ **Never run `docker compose down -v`** — the `-v` flag deletes the database volume and all your data permanently.

---

## Default Login

| Username | Password  |
|----------|-----------|
| `admin`  | `bcs2024` |

To change credentials, edit `backend/.env` and restart the backend:
```bash
docker compose restart backend
```

---

## Features

### Members
- Add, edit, search, and delete members
- Defaults to **Active members only** — toggle to All or Inactive with the filter buttons
- Duplicate name detection when creating new members
- Supports multiple comma-separated email addresses per member

### Events
- Add, edit, and delete events
- Sorted newest-first (most recent year at the top)

### Contributions
- Track donations per member per event
- Paginated (100 per page) when browsing all contributions
- Select a specific event to see all contributions for that event with no limit
- Auto-assigns receipt numbers in `YYYY/N` format

### Import (PayPal & Stripe)
- Upload CSV exports from PayPal or Stripe
- Auto-matches transactions to members by email → name → address (three-tier cascade)
- Color-coded match confidence badges (email / name / address / unmatched)
- Manually reassign any row to a different member using the member picker
- Create a new member on the spot from an unmatched PayPal row (pre-fills name, email, address)

### Receipts
- Email donation receipts to members directly from the Contributions page

---

## Migrating Data from Microsoft Access

If you have existing data in Access `.accdb` files:

### Step 1 — Copy Access files into the backend folder

```bash
cp /path/to/BCSContacts.accdb backend/
cp /path/to/BCSData.accdb backend/
```

### Step 2 — Run the migration

```bash
docker exec bcs_backend bash -c \
  "apt-get update -qq && apt-get install -y -qq mdbtools && python /app/migrate_access.py"
```

The script will:
1. Clear all existing data and reset auto-increment sequences
2. Migrate members, events, contributions, and receipt counters
3. Print a summary of records inserted and any skipped rows

> The migration clears the database before running, so it is safe to re-run if needed.

---

## Generating Reports

### Unpaid 2026 Membership Dues

Lists all Active, non-Life members who have not paid their 2026 Membership contribution.

```bash
# Install openpyxl (first time only)
docker exec bcs_backend pip install openpyxl --quiet

# Generate the report
docker exec bcs_backend python /app/generate_2026_unpaid_report.py
```

Output: `backend/2026_unpaid_members.xlsx`

The report includes name, email, phone, and full address for each member, with auto-filter
dropdowns on every column so you can sort or filter by city, state, etc.

---

## Moving to a New Machine

### Step 1 — On your current machine, export the database

```bash
docker exec bcs_db pg_dump -U bcs_user bcs_registration > ~/Desktop/bcs_backup.sql
```

> The `.sql` file contains all member data. Store it securely — do **not** commit it to Git.

### Step 2 — On the new machine, clone and start the app

```bash
git clone https://github.com/YOUR_USERNAME/bcs-registration.git
cd bcs-registration
docker compose up -d --build
```

### Step 3 — Restore the database

```bash
# Wait ~10 seconds for PostgreSQL to initialize, then:
docker exec -i bcs_db psql -U bcs_user bcs_registration < ~/Desktop/bcs_backup.sql
```

---

## Regular Backups

Run this periodically and save the file to Google Drive or another safe location:

```bash
docker exec bcs_db pg_dump -U bcs_user bcs_registration > bcs_backup_$(date +%Y%m%d).sql
```

---

## Project Structure

```
bcs-registration/
├── backend/
│   ├── app/
│   │   ├── main.py                  # FastAPI app entry point, CORS, router registration
│   │   ├── config.py                # Settings loaded from .env
│   │   ├── database.py              # SQLAlchemy engine and session
│   │   ├── models.py                # ORM models (Member, Event, Contribution, ReceiptCounter)
│   │   ├── schemas.py               # Pydantic request/response schemas
│   │   ├── auth.py                  # JWT authentication
│   │   └── routers/
│   │       ├── members.py           # /api/members — CRUD, search, duplicate check
│   │       ├── events.py            # /api/events — CRUD
│   │       ├── contributions.py     # /api/contributions — CRUD, pagination
│   │       ├── import_transactions.py  # /api/import — PayPal & Stripe CSV parsing
│   │       └── receipt.py           # /api/receipt — email donation receipts
│   ├── migrate_access.py            # One-time Access → PostgreSQL migration script
│   ├── generate_2026_unpaid_report.py  # Membership dues report generator
│   ├── requirements.txt
│   ├── Dockerfile
│   └── .env                         # Credentials and secrets (not in Git)
├── frontend/
│   ├── src/
│   │   ├── App.jsx                  # Routes and protected route wrapper
│   │   ├── api.js                   # Axios client with JWT interceptor
│   │   └── components/
│   │       ├── Login.jsx
│   │       ├── Navbar.jsx
│   │       ├── Members.jsx          # Members list with status filter and search
│   │       ├── Events.jsx           # Events list
│   │       ├── Contributions.jsx    # Contributions with pagination and event filter
│   │       └── ImportTransactions.jsx  # PayPal/Stripe CSV import workflow
│   ├── package.json
│   ├── tailwind.config.js
│   └── Dockerfile
├── init.sql                         # Initial database schema
├── docker-compose.yml
└── README.md
```

---

## API Reference

| Method | Endpoint                          | Description                        |
|--------|-----------------------------------|------------------------------------|
| POST   | `/api/auth/login`                 | Authenticate and get JWT token     |
| GET    | `/api/members/?status=Active`     | List members (optional status filter) |
| GET    | `/api/members/search?q=...`       | Search members by name             |
| GET    | `/api/members/check-duplicate`    | Check for duplicate name           |
| POST   | `/api/members/`                   | Create member                      |
| PUT    | `/api/members/{id}`               | Update member                      |
| DELETE | `/api/members/{id}`               | Delete member                      |
| GET    | `/api/events/`                    | List all events (newest first)     |
| POST   | `/api/events/`                    | Create event                       |
| PUT    | `/api/events/{id}`                | Update event                       |
| DELETE | `/api/events/{id}`                | Delete event                       |
| GET    | `/api/contributions/?page=1`      | List contributions (paginated)     |
| GET    | `/api/contributions/?event_id=N`  | All contributions for one event    |
| POST   | `/api/contributions/`             | Create contribution                |
| PUT    | `/api/contributions/{id}`         | Update contribution                |
| DELETE | `/api/contributions/{id}`         | Delete contribution                |
| POST   | `/api/import/parse/paypal`        | Parse PayPal CSV upload            |
| POST   | `/api/import/parse/stripe`        | Parse Stripe CSV upload            |
| POST   | `/api/import/save`                | Save matched import rows           |
| GET    | `/api/receipt/preview/{id}`       | Preview receipt for a contribution |
| POST   | `/api/receipt/send/{id}`          | Email receipt to member            |

Full interactive API docs: **http://localhost:8000/docs**

---

## Development Notes

### Backend hot-reload
The backend source is mounted as a Docker volume (`./backend:/app`). Python changes take
effect immediately — no rebuild needed.

### Frontend rebuild required
The frontend is compiled into static files at build time. After any React/JS change:

```bash
docker compose build frontend && docker compose up -d frontend
```

### Data persistence
PostgreSQL data lives in the named Docker volume `bcs_pgdata`. It survives container
restarts and `docker compose down`. Only `docker compose down -v` deletes it.

### Database notes
- `bcs_events.eventname` is `VARCHAR(100)` (expanded from the original 30 to accommodate
  Access event names like "1998 - Durga Puja - Contribution")
- `bcs_members.email` is `VARCHAR(500)` to support multiple comma-separated addresses
- Contributions are paginated at 100 rows/page via the `X-Total-Count` response header
