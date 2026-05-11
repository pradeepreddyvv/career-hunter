from __future__ import annotations

from sqlalchemy import Column, DateTime, String, Text, func

from pipeline.models import Base


class User(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True)  # UUID
    email = Column(String, unique=True, nullable=False, index=True)
    name = Column(String, nullable=False)
    password_hash = Column(String, nullable=False)
    gemini_api_key_encrypted = Column(String, nullable=True)  # Fernet encrypted
    profile_json = Column(Text, nullable=True)  # Career profile / vault
    connections_json = Column(Text, nullable=True)  # Company connections
    settings_json = Column(Text, nullable=True)  # Preferences, blacklist
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())

    def __repr__(self) -> str:
        return f"<User id={self.id!r} email={self.email!r}>"
