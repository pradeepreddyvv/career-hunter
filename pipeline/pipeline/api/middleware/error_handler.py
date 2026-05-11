from __future__ import annotations

import logging
import traceback

from fastapi import Request
from fastapi.responses import JSONResponse

from pipeline.exceptions import PipelineError

logger = logging.getLogger("pipeline.middleware.error_handler")


async def error_handler(request: Request, call_next):  # type: ignore[no-untyped-def]
    """Global exception handler middleware.

    Catches :class:`PipelineError` subclasses and maps them to structured
    JSON error responses with the appropriate HTTP status code.  Unexpected
    exceptions are logged with a full traceback and returned as a generic
    500 response so that internal details are never leaked to the client.
    """
    try:
        response = await call_next(request)
        return response
    except PipelineError as exc:
        logger.warning(
            "PipelineError [%s %s]: %s (%s)",
            request.method,
            request.url.path,
            exc.detail,
            type(exc).__name__,
        )
        return JSONResponse(
            status_code=exc.status_code,
            content={
                "error": exc.detail,
                "type": type(exc).__name__,
            },
        )
    except Exception as exc:
        logger.error(
            "Unhandled exception [%s %s]: %s\n%s",
            request.method,
            request.url.path,
            str(exc),
            traceback.format_exc(),
        )
        return JSONResponse(
            status_code=500,
            content={
                "error": "Internal server error",
                "type": "InternalError",
            },
        )
