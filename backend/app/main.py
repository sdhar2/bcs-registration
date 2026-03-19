from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from datetime import timedelta

from .database import engine, Base
from .routers import members, events, contributions, receipt
from .auth import authenticate_user, create_access_token
from .schemas import LoginRequest, Token
from .config import settings

# Create all tables on startup
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="BCS Registration API",
    description="Bengali Cultural Society – Event Registration & Member Management",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],   # In production, restrict to the frontend origin
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Auth ──────────────────────────────────────────────────────────────────────

@app.post("/api/auth/login", response_model=Token, tags=["auth"])
def login(login_req: LoginRequest):
    if not authenticate_user(login_req.username, login_req.password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    access_token = create_access_token(
        data={"sub": login_req.username},
        expires_delta=timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
    )
    return {"access_token": access_token, "token_type": "bearer"}


# ── Routers ───────────────────────────────────────────────────────────────────

app.include_router(members.router)
app.include_router(events.router)
app.include_router(contributions.router)
app.include_router(receipt.router)


@app.get("/api/health", tags=["health"])
def health():
    return {"status": "ok", "service": "BCS Registration API"}
