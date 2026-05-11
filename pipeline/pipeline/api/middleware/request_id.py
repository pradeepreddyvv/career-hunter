from __future__ import annotations

import uuid

from starlette.requests import Request
from starlette.responses import Response
from starlette.types import ASGIApp, Receive, Scope, Send


class RequestIDMiddleware:
    """ASGI middleware that attaches an ``X-Request-ID`` header to every
    HTTP request and response for distributed tracing.

    If the incoming request already carries the header the existing value
    is preserved; otherwise a new UUID-4 is generated.  The ID is stored
    in ``request.state.request_id`` so that downstream handlers and
    logging can reference it without re-parsing headers.
    """

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        # Look for an existing X-Request-ID header
        headers = dict(scope.get("headers", []))
        existing = headers.get(b"x-request-id", b"").decode("latin-1").strip()
        request_id = existing if existing else str(uuid.uuid4())

        # Inject the request_id into scope state so FastAPI handlers can
        # access it via ``request.state.request_id``.
        if "state" not in scope:
            scope["state"] = {}
        scope["state"]["request_id"] = request_id

        async def send_with_request_id(message: dict) -> None:  # type: ignore[type-arg]
            if message["type"] == "http.response.start":
                raw_headers = list(message.get("headers", []))
                raw_headers.append(
                    (b"x-request-id", request_id.encode("latin-1"))
                )
                message["headers"] = raw_headers
            await send(message)

        await self.app(scope, receive, send_with_request_id)
