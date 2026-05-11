from __future__ import annotations

from typing import Optional

from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from pipeline.models.user import User


class UserRepository:
    """Data-access layer for the ``users`` table."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    # ── Create ─────────────────────────────────────────────────────────

    async def create(
        self,
        id: str,
        email: str,
        name: str,
        password_hash: str,
    ) -> User:
        """Insert a new user and flush to obtain defaults."""
        user = User(
            id=id,
            email=email,
            name=name,
            password_hash=password_hash,
        )
        self.session.add(user)
        await self.session.flush()
        await self.session.commit()
        return user

    # ── Read ───────────────────────────────────────────────────────────

    async def get_by_id(self, user_id: str) -> Optional[User]:
        """Return a user by primary key, or ``None``."""
        stmt = select(User).where(User.id == user_id)
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def get_by_email(self, email: str) -> Optional[User]:
        """Return a user by email address, or ``None``."""
        stmt = select(User).where(User.email == email)
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    # ── Update ─────────────────────────────────────────────────────────

    async def update_profile(
        self,
        user_id: str,
        profile_json: str,
        connections_json: Optional[str] = None,
    ) -> None:
        """Update the career profile (and optionally connections) for a user."""
        values: dict = {"profile_json": profile_json}
        if connections_json is not None:
            values["connections_json"] = connections_json
        stmt = update(User).where(User.id == user_id).values(**values)
        await self.session.execute(stmt)
        await self.session.commit()

    async def update_api_key(self, user_id: str, encrypted_key: Optional[str]) -> None:
        """Store or clear a Fernet-encrypted Gemini API key."""
        stmt = (
            update(User)
            .where(User.id == user_id)
            .values(gemini_api_key_encrypted=encrypted_key or None)
        )
        await self.session.execute(stmt)
        await self.session.commit()

    async def update_settings(self, user_id: str, settings_json: str) -> None:
        """Replace the user-level settings blob."""
        stmt = (
            update(User)
            .where(User.id == user_id)
            .values(settings_json=settings_json)
        )
        await self.session.execute(stmt)
        await self.session.commit()

    # ── Delete ─────────────────────────────────────────────────────────

    async def delete(self, user_id: str) -> None:
        """Hard-delete a user row."""
        stmt = delete(User).where(User.id == user_id)
        await self.session.execute(stmt)
        await self.session.commit()
