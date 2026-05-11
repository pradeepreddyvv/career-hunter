from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI
from starlette.middleware.base import BaseHTTPMiddleware

from pipeline.api.middleware.cors import setup_cors
from pipeline.api.middleware.error_handler import error_handler
from pipeline.api.middleware.rate_limit import RateLimitMiddleware
from pipeline.api.middleware.request_id import RequestIDMiddleware
from pipeline.api.v1.router import api_router
from pipeline.config import settings
from pipeline.db.engine import close_db, init_db
from pipeline.workers.task_queue import TaskQueue

logger = logging.getLogger("pipeline")

task_queue = TaskQueue(max_workers=settings.max_concurrent_pipelines)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    logger.info("Starting Career Pipeline API ...")
    await init_db()
    logger.info("Database initialised.")
    await task_queue.start()
    logger.info(f"Task queue started ({settings.max_concurrent_pipelines} workers).")

    yield

    logger.info("Shutting down Career Pipeline API ...")
    await task_queue.stop()
    await close_db()
    logger.info("Shutdown complete.")


def create_app() -> FastAPI:
    """Application factory.

    Assembles middleware, exception handlers, and routers into a single
    :class:`FastAPI` instance ready to be served by Uvicorn.
    """
    app = FastAPI(
        title="Career Pipeline",
        description="AI-powered job discovery, scoring, and document generation",
        version="1.0.0",
        lifespan=lifespan,
        docs_url="/docs",
        redoc_url="/redoc",
    )

    # ── Middleware (applied bottom-to-top; last added runs first) ─────

    # 1. CORS -- must be outermost so preflight OPTIONS are handled early
    setup_cors(app, settings.allowed_origins)

    # 2. Error handler -- converts PipelineError subclasses to JSON
    app.add_middleware(BaseHTTPMiddleware, dispatch=error_handler)

    # 3. Rate limiter -- per-user sliding window
    app.add_middleware(
        RateLimitMiddleware,
        requests_per_minute=settings.rate_limit_per_minute,
    )

    # 4. Request ID -- tracing header on every request/response
    app.add_middleware(RequestIDMiddleware)

    # ── Routers ───────────────────────────────────────────────────────
    app.include_router(api_router)

    # ── Frontend dashboard ────────────────────────────────────────────
    import pathlib
    from starlette.responses import HTMLResponse

    dashboard_dir = pathlib.Path(__file__).resolve().parent.parent / "dashboards"
    dashboard_file = dashboard_dir / "index.html"
    _html_cache: dict[str, str] = {}

    if dashboard_file.exists():

        @app.get("/", response_class=HTMLResponse, include_in_schema=False)
        async def serve_dashboard():
            if "index" not in _html_cache:
                _html_cache["index"] = dashboard_file.read_text()
            return _html_cache["index"]

    # ── Additional dashboard pages ────────────────────────────────────
    DASHBOARD_PAGES: dict[str, str] = {
        "/interview-coach": "interview_coach.html",
        "/interview-prep": "interview_command_center.html",
        "/interview-recorder": "interview_recorder.html",
        "/interview-scorecard": "interview_scorecard.html",
        "/interview-standalone": "interview_prep_standalone.html",
        "/company-prep": "amazon_sde_prep.html",
        "/career-dashboard": "career_dashboard.html",
        "/task-hub": "task_hub.html",
    }

    for _path, _filename in DASHBOARD_PAGES.items():
        _filepath = dashboard_dir / _filename
        if _filepath.exists():

            def _make_handler(fp: pathlib.Path, cache_key: str):
                async def _handler():
                    if cache_key not in _html_cache:
                        _html_cache[cache_key] = fp.read_text()
                    return _html_cache[cache_key]

                return _handler

            app.get(_path, response_class=HTMLResponse, include_in_schema=False)(
                _make_handler(_filepath, _filename)
            )

    return app


# Module-level app instance for ``uvicorn pipeline.api.app:app``
app = create_app()
