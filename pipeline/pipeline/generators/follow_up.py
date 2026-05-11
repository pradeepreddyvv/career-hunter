from __future__ import annotations

import logging
from typing import Any, Dict

from pipeline.generators.base import BaseGenerator
from pipeline.generators.prompts import build_generation_prompt
from pipeline.scoring.gemini_client import GeminiClient

logger = logging.getLogger(__name__)


class FollowUpGenerator(BaseGenerator):
    """Generates follow-up email templates (post-application and post-interview)."""

    name: str = "follow_up"

    async def generate(
        self,
        api_key: str,
        job: Dict[str, Any],
        user_vault: str,
        **kwargs: Any,
    ) -> Dict[str, Any]:
        """Generate three follow-up email templates.

        Args:
            api_key: Gemini API key.
            job: Job dict.
            user_vault: User vault text.
            **kwargs: Expects ``gemini_client`` (:class:`GeminiClient`).
                Optional: ``model``.

        Returns:
            Dict with ``post_application_1week``,
            ``post_interview_thankyou``, and
            ``post_interview_followup_1week``, each containing
            ``{subject, body}``.
        """
        client: GeminiClient = kwargs["gemini_client"]
        model: str = kwargs.get("model", "gemini-2.5-pro")

        prompt = build_generation_prompt(
            "follow_up",
            job,
            user_vault,
        )

        result = await client.generate_json(
            api_key,
            prompt,
            model=model,
            temperature=0.6,
        )

        def _normalize_email(data: Any) -> Dict[str, str]:
            """Ensure a ``{subject, body}`` structure."""
            if isinstance(data, dict):
                return {
                    "subject": data.get("subject", ""),
                    "body": data.get("body", ""),
                }
            return {"subject": "", "body": str(data) if data else ""}

        return {
            "post_application_1week": _normalize_email(
                result.get("post_application_1week")
            ),
            "post_interview_thankyou": _normalize_email(
                result.get("post_interview_thankyou")
            ),
            "post_interview_followup_1week": _normalize_email(
                result.get("post_interview_followup_1week")
            ),
        }
