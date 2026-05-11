from __future__ import annotations

import logging
from typing import Any, Dict

from pipeline.generators.base import BaseGenerator
from pipeline.generators.prompts import build_generation_prompt
from pipeline.scoring.gemini_client import GeminiClient

logger = logging.getLogger(__name__)


class CoverLetterGenerator(BaseGenerator):
    """Generates a tailored cover letter."""

    name: str = "cover_letter"

    async def generate(
        self,
        api_key: str,
        job: Dict[str, Any],
        user_vault: str,
        **kwargs: Any,
    ) -> Dict[str, Any]:
        """Generate a 4-paragraph cover letter.

        Args:
            api_key: Gemini API key.
            job: Job dict.
            user_vault: User vault text.
            **kwargs: Expects ``gemini_client`` (:class:`GeminiClient`).
                Optional: ``role_category``, ``company_research``,
                ``connections``, ``model``.

        Returns:
            Dict with ``cover_letter`` text, ``word_count``, and
            ``hooks_used``.
        """
        client: GeminiClient = kwargs["gemini_client"]
        model: str = kwargs.get("model", "gemini-2.5-pro")
        role_category: str = kwargs.get("role_category", "SDE")
        company_research: str = kwargs.get("company_research", "")
        connections: str = kwargs.get("connections", "")

        prompt = build_generation_prompt(
            "cover_letter",
            job,
            user_vault,
            role_category=role_category,
            company_research=company_research,
            connections=connections,
        )

        result = await client.generate_json(
            api_key,
            prompt,
            model=model,
            temperature=0.7,
        )

        cover_letter_text = result.get("cover_letter", "")

        # Calculate word count if the model didn't provide one
        word_count = result.get("word_count", 0)
        if not word_count and cover_letter_text:
            word_count = len(cover_letter_text.split())

        return {
            "cover_letter": cover_letter_text,
            "word_count": word_count,
            "hooks_used": result.get("hooks_used", []),
        }
