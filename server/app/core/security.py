from __future__ import annotations

import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from uuid import UUID

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError

from .config import Settings

password_hasher = PasswordHasher()


def hash_password(password: str) -> str:
    return password_hasher.hash(password)


def verify_password(encoded: str, password: str) -> bool:
    try:
        return password_hasher.verify(encoded, password)
    except VerifyMismatchError:
        return False


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def random_token() -> str:
    return secrets.token_urlsafe(48)


def create_jwt(subject: UUID, token_type: str, settings: Settings, expires: timedelta) -> str:
    now = datetime.now(timezone.utc)
    return jwt.encode(
        {
            "sub": str(subject),
            "type": token_type,
            "iss": settings.jwt_issuer,
            "iat": now,
            "exp": now + expires,
            "jti": secrets.token_urlsafe(16),
        },
        settings.jwt_secret,
        algorithm="HS256",
    )


def decode_jwt(token: str, settings: Settings, expected_type: str) -> UUID:
    payload = jwt.decode(
        token,
        settings.jwt_secret,
        algorithms=["HS256"],
        issuer=settings.jwt_issuer,
    )
    if payload.get("type") != expected_type:
        raise jwt.InvalidTokenError("Wrong token type")
    return UUID(payload["sub"])
