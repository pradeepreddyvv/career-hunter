from __future__ import annotations

import logging
from typing import Any, Dict

from pipeline.generators.base import BaseGenerator
from pipeline.generators.prompts import build_generation_prompt
from pipeline.scoring.gemini_client import GeminiClient

logger = logging.getLogger(__name__)


class ResumeTextGenerator(BaseGenerator):
    """Generates an ATS-optimized plain-text resume."""

    name: str = "resume_text"

    async def generate(
        self,
        api_key: str,
        job: Dict[str, Any],
        user_vault: str,
        **kwargs: Any,
    ) -> Dict[str, Any]:
        """Generate a tailored plain-text resume.

        Args:
            api_key: Gemini API key.
            job: Job dict.
            user_vault: User vault text.
            **kwargs: Expects ``gemini_client`` (:class:`GeminiClient`).
                Optional: ``role_category``, ``company_research``, ``model``.

        Returns:
            Dict with ``resume_text``, ``selected_bullets``,
            ``selected_projects``, and ``keyword_coverage``.
        """
        client: GeminiClient = kwargs["gemini_client"]
        model: str = kwargs.get("model", "gemini-2.5-pro")
        role_category: str = kwargs.get("role_category", "SDE")
        company_research: str = kwargs.get("company_research", "")

        prompt = build_generation_prompt(
            "resume",
            job,
            user_vault,
            role_category=role_category,
            company_research=company_research,
        )

        result = await client.generate_json(
            api_key,
            prompt,
            model=model,
            temperature=0.4,
        )

        # Ensure expected keys exist
        return {
            "resume_text": result.get("resume_text", ""),
            "selected_bullets": result.get("selected_bullets", []),
            "selected_projects": result.get("selected_projects", []),
            "keyword_coverage": result.get("keyword_coverage", []),
        }
