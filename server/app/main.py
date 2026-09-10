from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select, text

from .api import auth, devices, tasks, websockets
from .core.config import get_settings
from .core.database import SessionLocal, engine
from .core.security import hash_password
from .models import Base, User

settings = get_settings()


@asynccontextmanager
async def lifespan(_: FastAPI):
    if settings.environment in {"development", "test"}:
        async with engine.begin() as connection:
            await connection.run_sync(Base.metadata.create_all)
    if settings.bootstrap_email and settings.bootstrap_password:
        async with SessionLocal() as db:
            if not await db.scalar(
                select(User).where(User.email == settings.bootstrap_email.lower())
            ):
                db.add(
                    User(
                        email=settings.bootstrap_email.lower(),
                        password_hash=hash_password(settings.bootstrap_password),
                    )
                )
                await db.commit()
    yield
    await engine.dispose()


app = FastAPI(title="AgentDeck Relay", version="0.1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "Idempotency-Key"],
)
app.include_router(auth.router, prefix="/api/v1")
app.include_router(devices.router, prefix="/api/v1")
app.include_router(tasks.router, prefix="/api/v1")
app.include_router(websockets.router)


@app.middleware("http")
async def security_headers(request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["Cache-Control"] = "no-store"
    if settings.environment == "production":
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return response


@app.get("/health/live", tags=["health"])
async def live() -> dict:
    return {"status": "ok"}


@app.get("/health/ready", tags=["health"])
async def ready() -> dict:
    async with engine.connect() as connection:
        await connection.execute(text("SELECT 1"))
    return {"status": "ready"}
