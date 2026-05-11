from __future__ import annotations


class PipelineError(Exception):
    """Base exception for the pipeline application."""

    status_code: int = 500
    detail: str = "An internal error occurred."

    def __init__(self, detail: str | None = None, status_code: int | None = None) -> None:
        if detail is not None:
            self.detail = detail
        if status_code is not None:
            self.status_code = status_code
        super().__init__(self.detail)


# ── Auth ───────────────────────────────────────────────────────────────────


class AuthenticationError(PipelineError):
    status_code = 401
    detail = "Invalid or missing authentication credentials."


class AuthorizationError(PipelineError):
    status_code = 403
    detail = "You do not have permission to perform this action."


# ── Resource ───────────────────────────────────────────────────────────────


class NotFoundError(PipelineError):
    status_code = 404
    detail = "The requested resource was not found."


class ConflictError(PipelineError):
    status_code = 409
    detail = "A resource with the same identifier already exists."


# ── Rate Limiting ──────────────────────────────────────────────────────────


class RateLimitError(PipelineError):
    status_code = 429
    detail = "Rate limit exceeded. Please try again later."


# ── Gemini / AI ────────────────────────────────────────────────────────────


class GeminiError(PipelineError):
    status_code = 502
    detail = "Gemini API returned an error."


class GeminiRateLimitError(GeminiError):
    status_code = 429
    detail = "Gemini API rate limit exceeded. Back off and retry."


class GeminiBlockedError(GeminiError):
    status_code = 422
    detail = "Gemini blocked the request due to safety filters."


# ── Fetching ───────────────────────────────────────────────────────────────


class FetchError(PipelineError):
    status_code = 502
    detail = "Failed to fetch the external resource."


# ── Validation ─────────────────────────────────────────────────────────────


class ValidationError(PipelineError):
    status_code = 422
    detail = "Request validation failed."
