from __future__ import annotations

import asyncio
import json
import logging
import re
from typing import Any, Dict, Optional

import aiohttp

from pipeline.exceptions import GeminiBlockedError, GeminiError, GeminiRateLimitError

logger = logging.getLogger(__name__)

GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models"

# Retry configuration
MAX_RETRIES = 3
BACKOFF_BASE_SECONDS = 5  # 5s, 10s, 20s


class GeminiClient:
    """Async Gemini API client with per-user API keys, retry, and rate limiting."""

    def __init__(self, max_concurrent: int = 5) -> None:
        self._semaphore = asyncio.Semaphore(max_concurrent)
        self._session: Optional[aiohttp.ClientSession] = None

    async def _ensure_session(self) -> None:
        if self._session is None or self._session.closed:
            timeout = aiohttp.ClientTimeout(total=120)
            self._session = aiohttp.ClientSession(timeout=timeout)

    async def call(
        self,
        api_key: str,
        prompt: str,
        model: str = "gemini-2.5-pro",
        temperature: float = 0.7,
        max_tokens: int = 8192,
        expect_json: bool = False,
        use_search: bool = False,
    ) -> str:
        """Call Gemini API with retry and rate limiting.

        Args:
            api_key: User's Gemini API key.
            prompt: The prompt text.
            model: Gemini model name.
            temperature: Sampling temperature.
            max_tokens: Max output tokens.
            expect_json: If True, request JSON response format.
            use_search: If True, enable Google Search grounding.

        Returns:
            Generated text response.

        Raises:
            GeminiError: On non-retryable API errors.
            GeminiRateLimitError: When rate-limited after all retries.
            GeminiBlockedError: When content is blocked by safety filters.
        """
        await self._ensure_session()

        url = f"{GEMINI_BASE}/{model}:generateContent?key={api_key}"

        # Build request body
        body: Dict[str, Any] = {
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {
                "temperature": temperature,
                "maxOutputTokens": max_tokens,
            },
        }

        if expect_json:
            body["generationConfig"]["responseMimeType"] = "application/json"

        if use_search:
            body["tools"] = [{"googleSearch": {}}]

        last_error: Optional[Exception] = None

        for attempt in range(MAX_RETRIES):
            async with self._semaphore:
                try:
                    assert self._session is not None
                    async with self._session.post(
                        url,
                        json=body,
                        headers={"Content-Type": "application/json"},
                    ) as resp:
                        resp_text = await resp.text()

                        if resp.status == 429:
                            backoff = BACKOFF_BASE_SECONDS * (2 ** attempt)
                            logger.warning(
                                "Gemini rate limit (attempt %d/%d), backing off %ds",
                                attempt + 1,
                                MAX_RETRIES,
                                backoff,
                            )
                            last_error = GeminiRateLimitError(
                                f"Rate limited on attempt {attempt + 1}"
                            )
                            await asyncio.sleep(backoff)
                            continue

                        if resp.status != 200:
                            try:
                                err_data = json.loads(resp_text)
                                err_msg = (
                                    err_data.get("error", {}).get("message", resp_text)
                                )
                            except (json.JSONDecodeError, AttributeError):
                                err_msg = resp_text[:500]

                            if resp.status >= 500:
                                backoff = BACKOFF_BASE_SECONDS * (2 ** attempt)
                                logger.warning(
                                    "Gemini server error %d (attempt %d/%d), "
                                    "backing off %ds: %s",
                                    resp.status,
                                    attempt + 1,
                                    MAX_RETRIES,
                                    backoff,
                                    err_msg[:200],
                                )
                                last_error = GeminiError(
                                    f"Server error {resp.status}: {err_msg[:200]}"
                                )
                                await asyncio.sleep(backoff)
                                continue

                            raise GeminiError(
                                f"Gemini API error {resp.status}: {err_msg[:500]}"
                            )

                        data = json.loads(resp_text)

                        # Check for safety blocks
                        candidates = data.get("candidates", [])
                        if not candidates:
                            block_reason = (
                                data.get("promptFeedback", {})
                                .get("blockReason", "UNKNOWN")
                            )
                            raise GeminiBlockedError(
                                f"Request blocked by safety filters: {block_reason}"
                            )

                        candidate = candidates[0]
                        finish_reason = candidate.get("finishReason", "")

                        if finish_reason == "SAFETY":
                            safety_ratings = candidate.get("safetyRatings", [])
                            raise GeminiBlockedError(
                                f"Response blocked by safety filters: {safety_ratings}"
                            )

                        parts = candidate.get("content", {}).get("parts", [])
                        if not parts:
                            raise GeminiError("Gemini returned empty response parts")

                        return parts[0].get("text", "")

                except (GeminiBlockedError, GeminiError) as exc:
                    if isinstance(exc, GeminiBlockedError):
                        raise
                    if isinstance(exc, GeminiRateLimitError):
                        last_error = exc
                        continue
                    # Non-retryable GeminiError (4xx)
                    raise

                except aiohttp.ClientError as exc:
                    backoff = BACKOFF_BASE_SECONDS * (2 ** attempt)
                    logger.warning(
                        "Network error (attempt %d/%d), backing off %ds: %s",
                        attempt + 1,
                        MAX_RETRIES,
                        backoff,
                        exc,
                    )
                    last_error = GeminiError(f"Network error: {exc}")
                    await asyncio.sleep(backoff)
                    continue

        # All retries exhausted
        if isinstance(last_error, GeminiRateLimitError):
            raise last_error
        raise last_error or GeminiError("All retry attempts exhausted")

    async def generate_json(
        self, api_key: str, prompt: str, **kwargs: Any
    ) -> Dict[str, Any]:
        """Call Gemini and parse JSON response.

        Args:
            api_key: User's Gemini API key.
            prompt: The prompt text.
            **kwargs: Additional arguments passed to ``call()``.

        Returns:
            Parsed JSON dictionary.
        """
        text = await self.call(api_key, prompt, expect_json=True, **kwargs)
        return parse_json_response(text)

    async def close(self) -> None:
        """Close the underlying HTTP session."""
        if self._session and not self._session.closed:
            await self._session.close()
            self._session = None


def parse_json_response(text: str) -> Dict[str, Any]:
    """Parse JSON from Gemini response, handling markdown code blocks.

    Tries multiple extraction strategies:
    1. Direct ``json.loads`` on the full text.
    2. Extract from `````json ... ````` fenced blocks.
    3. Find the first ``{...}`` or ``[...]`` substring.
    4. Return empty dict on failure.
    """
    text = text.strip()

    # Strategy 1: direct parse
    try:
        result = json.loads(text)
        if isinstance(result, dict):
            return result
        if isinstance(result, list):
            return {"items": result}
        return {"value": result}
    except json.JSONDecodeError:
        pass

    # Strategy 2: fenced code block
    fenced = re.search(r"```(?:json)?\s*\n?(.*?)```", text, re.DOTALL)
    if fenced:
        try:
            result = json.loads(fenced.group(1).strip())
            if isinstance(result, dict):
                return result
            if isinstance(result, list):
                return {"items": result}
            return {"value": result}
        except json.JSONDecodeError:
            pass

    # Strategy 3: find first { ... } or [ ... ]
    for open_ch, close_ch in [("{", "}"), ("[", "]")]:
        start = text.find(open_ch)
        if start == -1:
            continue
        depth = 0
        in_string = False
        escape_next = False
        for i in range(start, len(text)):
            ch = text[i]
            if escape_next:
                escape_next = False
                continue
            if ch == "\\":
                escape_next = True
                continue
            if ch == '"':
                in_string = not in_string
                continue
            if in_string:
                continue
            if ch == open_ch:
                depth += 1
            elif ch == close_ch:
                depth -= 1
                if depth == 0:
                    try:
                        result = json.loads(text[start : i + 1])
                        if isinstance(result, dict):
                            return result
                        if isinstance(result, list):
                            return {"items": result}
                        return {"value": result}
                    except json.JSONDecodeError:
                        break

    # Strategy 4: give up
    logger.warning("Failed to parse JSON from Gemini response: %.200s...", text)
    return {}
