from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, HTTPException, Request, status
from sqlalchemy import select

from ..core.security import create_jwt, hash_password, hash_token, random_token, verify_password
from ..dependencies import AppSettings, CurrentUser, Db
from ..models import RefreshToken, User
from ..schemas import LoginRequest, RefreshRequest, RegisterRequest, TokenPair, UserView
from ..services.audit import record_audit

router = APIRouter(prefix="/auth", tags=["auth"])


def issue_tokens(user: User, settings: AppSettings, db: Db) -> TokenPair:
    access = create_jwt(
        user.id, "access", settings, timedelta(minutes=settings.access_token_minutes)
    )
    refresh = random_token()
    db.add(
        RefreshToken(
            user_id=user.id,
            token_hash=hash_token(refresh),
            expires_at=datetime.now(timezone.utc) + timedelta(days=settings.refresh_token_days),
        )
    )
    return TokenPair(access_token=access, refresh_token=refresh)


@router.post("/register", response_model=TokenPair, status_code=201)
async def register(
    body: RegisterRequest, request: Request, db: Db, settings: AppSettings
) -> TokenPair:
    email = body.email.lower()
    if await db.scalar(select(User).where(User.email == email)):
        raise HTTPException(status_code=409, detail="Account already exists")
    user = User(email=email, password_hash=hash_password(body.password))
    db.add(user)
    await db.flush()
    tokens = issue_tokens(user, settings, db)
    record_audit(
        db,
        "user.registered",
        user_id=user.id,
        ip_address=request.client.host if request.client else None,
    )
    await db.commit()
    return tokens


@router.post("/login", response_model=TokenPair)
async def login(body: LoginRequest, request: Request, db: Db, settings: AppSettings) -> TokenPair:
    user = await db.scalar(select(User).where(User.email == body.email.lower()))
    if user is None or not verify_password(user.password_hash, body.password) or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    tokens = issue_tokens(user, settings, db)
    record_audit(
        db,
        "user.login",
        user_id=user.id,
        ip_address=request.client.host if request.client else None,
    )
    await db.commit()
    return tokens


@router.post("/refresh", response_model=TokenPair)
async def refresh(body: RefreshRequest, db: Db, settings: AppSettings) -> TokenPair:
    stored = await db.scalar(
        select(RefreshToken).where(RefreshToken.token_hash == hash_token(body.refresh_token))
    )
    now = datetime.now(timezone.utc)
    expires_at = stored.expires_at if stored is not None else None
    if expires_at is not None and expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if stored is None or stored.revoked or expires_at is None or expires_at < now:
        raise HTTPException(status_code=401, detail="Invalid refresh token")
    user = await db.get(User, stored.user_id)
    if user is None or not user.is_active:
        raise HTTPException(status_code=401, detail="Invalid user")
    stored.revoked = True
    tokens = issue_tokens(user, settings, db)
    await db.commit()
    return tokens


@router.post("/logout", status_code=204)
async def logout(body: RefreshRequest, user: CurrentUser, db: Db) -> None:
    stored = await db.scalar(
        select(RefreshToken).where(
            RefreshToken.token_hash == hash_token(body.refresh_token),
            RefreshToken.user_id == user.id,
        )
    )
    if stored:
        stored.revoked = True
        await db.commit()


@router.get("/me", response_model=UserView)
async def me(user: CurrentUser) -> User:
    return user
