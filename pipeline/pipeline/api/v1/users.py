from __future__ import annotations

import json
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from pipeline.api.deps import get_auth_service, get_current_user, get_db
from pipeline.db.repositories.user_repo import UserRepository
from pipeline.exceptions import NotFoundError, ValidationError
from pipeline.models.user import User
from pipeline.services.auth_service import AuthService

router = APIRouter(prefix="/profile", tags=["profile"])

# ── Request / Response schemas ────────────────────────────────────────


class ProfileResponse(BaseModel):
    id: str
    name: str
    email: str
    has_api_key: bool
    profile_json: Optional[str] = None
    connections_json: Optional[str] = None
    settings: Optional[Dict[str, Any]] = None
    created_at: str

    model_config = {"from_attributes": True}


class ProfileUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    profile_json: Optional[str] = None  # Career vault
    connections_json: Optional[str] = None  # Company connections

    model_config = {"strict": True}


class APIKeyUpdate(BaseModel):
    gemini_api_key: str = Field(..., min_length=1)

    model_config = {"strict": True}


class SettingsUpdate(BaseModel):
    blacklist: Optional[List[str]] = None
    target_roles: Optional[List[str]] = None
    min_score: Optional[int] = Field(None, ge=0, le=100)
    preferred_locations: Optional[List[str]] = None

    model_config = {"strict": True}


class MessageResponse(BaseModel):
    message: str


# ── Helpers ───────────────────────────────────────────────────────────


def _profile_response(user: User) -> ProfileResponse:
    """Build a :class:`ProfileResponse` from an ORM :class:`User`."""
    created_at = ""
    if user.created_at is not None:
        if isinstance(user.created_at, str):
            created_at = user.created_at
        else:
            created_at = user.created_at.isoformat()

    settings_dict: Optional[Dict[str, Any]] = None
    if user.settings_json:
        try:
            settings_dict = json.loads(str(user.settings_json))
        except (json.JSONDecodeError, TypeError):
            settings_dict = None

    return ProfileResponse(
        id=str(user.id),
        name=str(user.name),
        email=str(user.email),
        has_api_key=user.gemini_api_key_encrypted is not None,
        profile_json=str(user.profile_json) if user.profile_json else None,
        connections_json=str(user.connections_json) if user.connections_json else None,
        settings=settings_dict,
        created_at=created_at,
    )


# ── Routes ────────────────────────────────────────────────────────────


@router.get("/", response_model=ProfileResponse)
async def get_profile(
    user: User = Depends(get_current_user),
) -> ProfileResponse:
    """Return the full profile of the authenticated user."""
    return _profile_response(user)


@router.put("/", response_model=ProfileResponse)
async def update_profile(
    body: ProfileUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ProfileResponse:
    """Update the user's name, career profile, and/or connections map.

    Only fields that are explicitly provided (non-``None``) are updated.
    """
    repo = UserRepository(db)

    if body.name is not None:
        user.name = body.name  # type: ignore[assignment]

    if body.profile_json is not None:
        user.profile_json = body.profile_json  # type: ignore[assignment]
        await repo.update_profile(
            user_id=str(user.id),
            profile_json=body.profile_json,
            connections_json=body.connections_json,
        )
    elif body.connections_json is not None:
        user.connections_json = body.connections_json  # type: ignore[assignment]
        await repo.update_profile(
            user_id=str(user.id),
            profile_json=str(user.profile_json) if user.profile_json else "",
            connections_json=body.connections_json,
        )

    if body.name is not None and body.profile_json is None and body.connections_json is None:
        # Only name changed -- commit directly
        await db.commit()
        await db.refresh(user)

    # Re-fetch for fresh data
    refreshed = await repo.get_by_id(str(user.id))
    if refreshed is None:
        raise NotFoundError(detail="User not found after update.")
    return _profile_response(refreshed)


@router.put("/api-key", response_model=MessageResponse)
async def set_api_key(
    body: APIKeyUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    auth: AuthService = Depends(get_auth_service),
) -> MessageResponse:
    """Store a Gemini API key (encrypted with Fernet).

    The raw key is never persisted; only the encrypted ciphertext is
    stored in the database.
    """
    repo = UserRepository(db)
    encrypted = auth.encrypt_api_key(body.gemini_api_key)
    await repo.update_api_key(user_id=str(user.id), encrypted_key=encrypted)
    return MessageResponse(message="API key saved successfully.")


@router.delete("/api-key", response_model=MessageResponse)
async def delete_api_key(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> MessageResponse:
    """Remove the stored Gemini API key."""
    repo = UserRepository(db)
    await repo.update_api_key(user_id=str(user.id), encrypted_key=None)
    return MessageResponse(message="API key removed successfully.")


@router.put("/settings", response_model=ProfileResponse)
async def update_settings(
    body: SettingsUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ProfileResponse:
    """Update user preferences (blacklist, target roles, min score, locations).

    Merges the provided fields into the existing settings JSON.
    """
    repo = UserRepository(db)

    # Load existing settings or start fresh
    existing: Dict[str, Any] = {}
    if user.settings_json:
        try:
            existing = json.loads(str(user.settings_json))
        except (json.JSONDecodeError, TypeError):
            existing = {}

    # Merge provided fields
    if body.blacklist is not None:
        existing["blacklist"] = body.blacklist
    if body.target_roles is not None:
        existing["target_roles"] = body.target_roles
    if body.min_score is not None:
        existing["min_score"] = body.min_score
    if body.preferred_locations is not None:
        existing["preferred_locations"] = body.preferred_locations

    settings_json = json.dumps(existing, ensure_ascii=False)
    await repo.update_settings(user_id=str(user.id), settings_json=settings_json)

    # Re-fetch for fresh data
    refreshed = await repo.get_by_id(str(user.id))
    if refreshed is None:
        raise NotFoundError(detail="User not found after update.")
    return _profile_response(refreshed)
