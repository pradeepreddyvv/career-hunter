from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Response
from pydantic import BaseModel, EmailStr, Field, model_validator
from sqlalchemy.ext.asyncio import AsyncSession

from pipeline.api.deps import get_auth_service, get_current_user, get_db
from pipeline.db.repositories.user_repo import UserRepository
from pipeline.exceptions import AuthenticationError, ConflictError, ValidationError
from pipeline.models.user import User
from pipeline.services.auth_service import AuthService

router = APIRouter(prefix="/auth", tags=["auth"])

# ── Request / Response schemas ────────────────────────────────────────


class RegisterRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    email: EmailStr
    password: str = Field(..., min_length=8, max_length=128)

    model_config = {"strict": True}


class LoginRequest(BaseModel):
    email: EmailStr
    password: str

    model_config = {"strict": True}


class UserResponse(BaseModel):
    id: str
    name: str
    email: str
    has_api_key: bool
    created_at: str

    model_config = {"from_attributes": True}


class TokenResponse(BaseModel):
    token: str
    user: UserResponse


# ── Helpers ───────────────────────────────────────────────────────────


def _user_response(user: User) -> UserResponse:
    """Build a :class:`UserResponse` from an ORM :class:`User`."""
    created_at = ""
    if user.created_at is not None:
        if isinstance(user.created_at, str):
            created_at = user.created_at
        else:
            created_at = user.created_at.isoformat()
    return UserResponse(
        id=str(user.id),
        name=str(user.name),
        email=str(user.email),
        has_api_key=user.gemini_api_key_encrypted is not None,
        created_at=created_at,
    )


def _set_token_cookie(response: Response, token: str) -> None:
    """Set an httpOnly cookie containing the JWT."""
    response.set_cookie(
        key="token",
        value=token,
        httponly=True,
        secure=False,  # Set to True in production behind HTTPS
        samesite="lax",
        max_age=7 * 24 * 60 * 60,  # 7 days
        path="/",
    )


# ── Routes ────────────────────────────────────────────────────────────


@router.post("/register", response_model=TokenResponse, status_code=201)
async def register(
    body: RegisterRequest,
    response: Response,
    db: AsyncSession = Depends(get_db),
    auth: AuthService = Depends(get_auth_service),
) -> TokenResponse:
    """Create a new user account.

    Returns a JWT token and the user profile.  Also sets an httpOnly
    cookie for browser-based clients.
    """
    repo = UserRepository(db)

    # Check email uniqueness
    existing = await repo.get_by_email(body.email)
    if existing is not None:
        raise ConflictError(detail="An account with this email already exists.")

    # Hash password and persist
    password_hash = auth.hash_password(body.password)
    user_id = str(uuid.uuid4())

    user = await repo.create(
        id=user_id,
        email=body.email,
        name=body.name,
        password_hash=password_hash,
    )

    # Issue token
    token = auth.create_token(user_id=user_id, email=body.email)
    _set_token_cookie(response, token)

    return TokenResponse(
        token=token,
        user=_user_response(user),
    )


@router.post("/login", response_model=TokenResponse)
async def login(
    body: LoginRequest,
    response: Response,
    db: AsyncSession = Depends(get_db),
    auth: AuthService = Depends(get_auth_service),
) -> TokenResponse:
    """Authenticate with email and password.

    Returns a JWT token and the user profile on success.
    """
    repo = UserRepository(db)

    user = await repo.get_by_email(body.email)
    if user is None:
        raise AuthenticationError(detail="Invalid email or password.")

    if not auth.verify_password(body.password, str(user.password_hash)):
        raise AuthenticationError(detail="Invalid email or password.")

    token = auth.create_token(user_id=str(user.id), email=str(user.email))
    _set_token_cookie(response, token)

    return TokenResponse(
        token=token,
        user=_user_response(user),
    )


@router.get("/me", response_model=UserResponse)
async def me(
    user: User = Depends(get_current_user),
) -> UserResponse:
    """Return the profile of the currently authenticated user."""
    return _user_response(user)


@router.post("/logout", status_code=204)
async def logout(response: Response) -> None:
    """Clear the authentication cookie.

    The JWT itself is stateless so it remains valid until expiry, but
    removing the cookie is sufficient for browser-based logout.
    """
    response.delete_cookie(
        key="token",
        httponly=True,
        secure=False,
        samesite="lax",
        path="/",
    )
