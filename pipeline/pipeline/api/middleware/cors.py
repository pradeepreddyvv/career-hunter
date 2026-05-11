from __future__ import annotations

from typing import List

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware


def setup_cors(app: FastAPI, allowed_origins: List[str]) -> None:
    """Add CORS middleware to *app* with the given origin allowlist.

    Enables credentials, all standard methods, and all headers so that
    browser-based clients (Career Hub UI, dashboards) can interact with
    the API without preflight failures.
    """
    app.add_middleware(
        CORSMiddleware,
        allow_origins=allowed_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=["X-Request-ID"],
    )
