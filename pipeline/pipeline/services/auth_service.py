from __future__ import annotations

import base64
import hashlib
from datetime import datetime, timedelta, timezone
from typing import Any, Dict

import bcrypt
from cryptography.fernet import Fernet, InvalidToken
from jose import JWTError, jwt

from pipeline.exceptions import AuthenticationError

# JWT configuration
_ALGORITHM = "HS256"
_TOKEN_EXPIRY_DAYS = 7


class AuthService:
    """JWT + bcrypt authentication with Fernet-encrypted API key storage."""

    def __init__(self, secret_key: str) -> None:
        self.secret_key = secret_key
        # Derive a 32-byte URL-safe base64 key from the secret for Fernet
        derived = hashlib.sha256(secret_key.encode()).digest()
        self._fernet = Fernet(base64.urlsafe_b64encode(derived))

    # ── Password hashing ──────────────────────────────────────────────

    def hash_password(self, password: str) -> str:
        """Hash a plaintext password with bcrypt.

        Returns the hash as a UTF-8 string suitable for database storage.
        """
        salt = bcrypt.gensalt()
        hashed = bcrypt.hashpw(password.encode("utf-8"), salt)
        return hashed.decode("utf-8")

    def verify_password(self, password: str, hashed: str) -> bool:
        """Check *password* against a bcrypt *hashed* value.

        Returns ``True`` on match, ``False`` otherwise.  Never raises on
        mismatch.
        """
        try:
            return bcrypt.checkpw(
                password.encode("utf-8"),
                hashed.encode("utf-8"),
            )
        except (ValueError, TypeError):
            return False

    # ── JWT tokens ────────────────────────────────────────────────────

    def create_token(self, user_id: str, email: str) -> str:
        """Create a signed JWT with a 7-day expiry.

        Payload contains ``sub`` (user_id), ``email``, ``exp``, and ``iat``.
        """
        now = datetime.now(timezone.utc)
        payload: Dict[str, Any] = {
            "sub": user_id,
            "email": email,
            "iat": now,
            "exp": now + timedelta(days=_TOKEN_EXPIRY_DAYS),
        }
        return jwt.encode(payload, self.secret_key, algorithm=_ALGORITHM)

    def decode_token(self, token: str) -> Dict[str, str]:
        """Decode and validate a JWT.

        Returns ``{"user_id": ..., "email": ...}`` on success.
        Raises :class:`AuthenticationError` when the token is invalid,
        expired, or structurally broken.
        """
        try:
            payload = jwt.decode(
                token,
                self.secret_key,
                algorithms=[_ALGORITHM],
            )
        except JWTError as exc:
            raise AuthenticationError(
                detail=f"Invalid or expired token: {exc}"
            ) from exc

        user_id = payload.get("sub")
        email = payload.get("email")
        if not user_id or not email:
            raise AuthenticationError(detail="Token payload missing required claims.")

        return {"user_id": str(user_id), "email": str(email)}

    # ── API key encryption ────────────────────────────────────────────

    def encrypt_api_key(self, api_key: str) -> str:
        """Encrypt an API key with Fernet (AES-128-CBC + HMAC).

        Returns the ciphertext as a UTF-8 string for database storage.
        """
        return self._fernet.encrypt(api_key.encode("utf-8")).decode("utf-8")

    def decrypt_api_key(self, encrypted: str) -> str:
        """Decrypt a Fernet-encrypted API key.

        Raises :class:`AuthenticationError` if the ciphertext is corrupt
        or was encrypted with a different key.
        """
        try:
            return self._fernet.decrypt(encrypted.encode("utf-8")).decode("utf-8")
        except InvalidToken as exc:
            raise AuthenticationError(
                detail="Failed to decrypt API key. The encryption key may have changed."
            ) from exc
