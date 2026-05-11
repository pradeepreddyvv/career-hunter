from __future__ import annotations

import logging
from typing import Any, Dict

from pipeline.generators.base import BaseGenerator
from pipeline.generators.prompts import build_generation_prompt
from pipeline.scoring.gemini_client import GeminiClient

logger = logging.getLogger(__name__)


class OutreachGenerator(BaseGenerator):
    """Generates LinkedIn DM, cold email, and referral-ask messages."""

    name: str = "outreach"

    async def generate(
        self,
        api_key: str,
        job: Dict[str, Any],
        user_vault: str,
        **kwargs: Any,
    ) -> Dict[str, Any]:
        """Generate three outreach message variants.

        Args:
            api_key: Gemini API key.
            job: Job dict.
            user_vault: User vault text.
            **kwargs: Expects ``gemini_client`` (:class:`GeminiClient`).
                Optional: ``connections``, ``model``.

        Returns:
            Dict with ``linkedin_message``, ``cold_email``
            (``{subject, body}``), and ``referral_ask``.
        """
        client: GeminiClient = kwargs["gemini_client"]
        model: str = kwargs.get("model", "gemini-2.5-pro")
        connections: str = kwargs.get("connections", "")

        prompt = build_generation_prompt(
            "outreach",
            job,
            user_vault,
            connections=connections,
        )

        result = await client.generate_json(
            api_key,
            prompt,
            model=model,
            temperature=0.7,
        )

        # Normalize cold_email structure
        cold_email = result.get("cold_email", {})
        if isinstance(cold_email, str):
            cold_email = {"subject": "", "body": cold_email}

        return {
            "linkedin_message": result.get("linkedin_message", ""),
            "cold_email": {
                "subject": cold_email.get("subject", ""),
                "body": cold_email.get("body", ""),
            },
            "referral_ask": result.get("referral_ask", ""),
        }
