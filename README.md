# Bengali Cultural Society — Registration Portal

A full-stack web application for managing members, events, and contributions for BCS.

## Tech Stack

| Layer     | Technology             |
|-----------|------------------------|
| Frontend  | React 18 + Vite + Tailwind CSS |
| Backend   | Python 3.11 + FastAPI  |
| Database  | PostgreSQL 16          |
| Container | Docker + Docker Compose |

---

## Quick Start (Docker — Recommended)

### Prerequisites
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) installed and running

### 1. Start the application

```bash
cd /Users/sdhar/development/bcs-registration
docker-compose up --build
```

This starts three services:
- **PostgreSQL** on port `5432` (data persisted in a named Docker volume)
- **FastAPI backend** on port `8000`
- **React frontend** on port `3000`

### 2. Open the application

Navigate to **http://localhost:3000**

### 3. Log in

| Field    | Value    |
|----------|----------|
| Username | `admin`  |
| Password | `bcs2024` |

> To change the credentials, edit the `.env` file before starting.

---

## Development Setup (Without Docker)

### Backend

```bash
cd backend

# Create virtual environment
python3 -m venv venv
source venv/bin/activate   # Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Start a local PostgreSQL instance and update .env with your DATABASE_URL
# Then run:
uvicorn app.main:app --reload --port 8000
```

API docs available at **http://localhost:8000/docs**

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend available at **http://localhost:3000**

---

## Default Login Credentials

| Username | Password  |
|----------|-----------|
| `admin`  | `bcs2024` |

Change these in the `.env` file:

```env
ADMIN_USERNAME=admin
ADMIN_PASSWORD=your-new-password
```

---

## Project Structure

```
bcs-registration/
├── backend/
│   ├── app/
│   │   ├── main.py           # FastAPI app + CORS + routes
│   │   ├── config.py         # Settings from .env
│   │   ├── database.py       # SQLAlchemy engine + session
│   │   ├── models.py         # ORM models (Members, Events, Contributions)
│   │   ├── schemas.py        # Pydantic request/response schemas
│   │   ├── auth.py           # JWT authentication
│   │   └── routers/
│   │       ├── members.py    # /api/members CRUD + search
│   │       ├── events.py     # /api/events CRUD
│   │       └── contributions.py # /api/contributions CRUD
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── App.jsx           # Routing + protected routes
│   │   ├── api.js            # Axios client with JWT interceptor
│   │   └── components/
│   │       ├── Login.jsx
│   │       ├── Navbar.jsx
│   │       ├── Members.jsx   # Full CRUD + search
│   │       ├── Events.jsx    # Full CRUD
│   │       └── Contributions.jsx  # CRUD + member search + event dropdown
│   ├── package.json
│   ├── tailwind.config.js
│   └── Dockerfile
├── init.sql                  # DB schema + sample data
├── docker-compose.yml
├── .env                      # Environment variables (do not commit)
├── .env.example
└── README.md
```

---

## API Endpoints

| Method | Endpoint                     | Description              |
|--------|------------------------------|--------------------------|
| POST   | `/api/auth/login`            | Get JWT token            |
| GET    | `/api/members/`              | List all members         |
| GET    | `/api/members/search?q=...`  | Search members by name   |
| POST   | `/api/members/`              | Create member            |
| PUT    | `/api/members/{id}`          | Update member            |
| DELETE | `/api/members/{id}`          | Delete member            |
| GET    | `/api/events/`               | List all events          |
| POST   | `/api/events/`               | Create event             |
| PUT    | `/api/events/{id}`           | Update event             |
| DELETE | `/api/events/{id}`           | Delete event             |
| GET    | `/api/contributions/`        | List contributions       |
| POST   | `/api/contributions/`        | Create contribution      |
| PUT    | `/api/contributions/{id}`    | Update contribution      |
| DELETE | `/api/contributions/{id}`    | Delete contribution      |

Full interactive docs: **http://localhost:8000/docs**

---

## Stopping the Application

```bash
docker-compose down          # Stop containers (data preserved)
docker-compose down -v       # Stop + delete all data (fresh start)
```
