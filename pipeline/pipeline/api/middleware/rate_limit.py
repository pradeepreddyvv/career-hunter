from __future__ import annotations

import time
from collections import defaultdict, deque
from typing import Any, Deque, Dict, Optional

from jose import jwt
from starlette.requests import Request
from starlette.responses import JSONResponse, Response
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from pipeline.config import settings


class RateLimitMiddleware:
    """Per-user sliding window rate limiter (ASGI middleware).

    Identifies users by their JWT ``sub`` claim when an ``Authorization``
    header is present.  Unauthenticated requests are bucketed by IP.

    The sliding window evicts timestamps older than 60 seconds on each
    request and rejects with HTTP 429 when the window is full.
    """

    def __init__(
        self,
        app: ASGIApp,
        requests_per_minute: int = 60,
    ) -> None:
        self.app = app
        self.rpm = requests_per_minute
        # Mapping from identity key -> deque of Unix timestamps
        self._windows: Dict[str, Deque[float]] = defaultdict(deque)

    # ── Helpers ───────────────────────────────────────────────────────

    def _extract_identity(self, scope: Scope) -> str:
        """Return a string key that identifies the caller.

        Tries the JWT ``sub`` claim first.  Falls back to the client IP.
        """
        headers: Dict[bytes, bytes] = dict(scope.get("headers", []))

        # Try JWT
        auth_value = headers.get(b"authorization", b"").decode("latin-1")
        if auth_value.lower().startswith("bearer "):
            token = auth_value[7:]
            try:
                payload = jwt.decode(
                    token,
                    settings.secret_key,
                    algorithms=["HS256"],
                    options={"verify_exp": False},
                )
                user_id: Optional[str] = payload.get("sub")
                if user_id:
                    return f"user:{user_id}"
            except Exception:
                pass  # Fall through to IP-based limiting

        # Fallback: client IP (from ASGI client tuple)
        client = scope.get("client")
        ip = client[0] if client else "unknown"
        return f"ip:{ip}"

    def _is_rate_limited(self, identity: str) -> bool:
        """Return ``True`` if *identity* has exceeded the sliding window."""
        now = time.monotonic()
        window = self._windows[identity]

        # Evict entries older than 60 seconds
        cutoff = now - 60.0
        while window and window[0] < cutoff:
            window.popleft()

        if len(window) >= self.rpm:
            return True

        window.append(now)
        return False

    # ── ASGI interface ────────────────────────────────────────────────

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        identity = self._extract_identity(scope)

        if self._is_rate_limited(identity):
            response = JSONResponse(
                status_code=429,
                content={
                    "error": "Rate limit exceeded. Please try again later.",
                    "type": "RateLimitError",
                },
            )
            await response(scope, receive, send)
            return

        await self.app(scope, receive, send)
