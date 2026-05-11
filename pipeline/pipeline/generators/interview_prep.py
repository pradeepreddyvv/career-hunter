from __future__ import annotations

import logging
from typing import Any, Dict

from pipeline.generators.base import BaseGenerator
from pipeline.generators.prompts import build_generation_prompt
from pipeline.scoring.gemini_client import GeminiClient

logger = logging.getLogger(__name__)


class InterviewPrepGenerator(BaseGenerator):
    """Generates interview preparation materials.

    Only invoked for jobs with score >= 60 (controlled by the pipeline
    orchestrator, not enforced here).
    """

    name: str = "interview_prep"

    async def generate(
        self,
        api_key: str,
        job: Dict[str, Any],
        user_vault: str,
        **kwargs: Any,
    ) -> Dict[str, Any]:
        """Generate behavioral, technical, and strategic interview prep.

        Args:
            api_key: Gemini API key.
            job: Job dict.
            user_vault: User vault text.
            **kwargs: Expects ``gemini_client`` (:class:`GeminiClient`).
                Optional: ``role_category``, ``model``.

        Returns:
            Dict with ``behavioral_questions``, ``technical_questions``,
            ``talking_points``, ``questions_to_ask``, and ``key_themes``.
        """
        client: GeminiClient = kwargs["gemini_client"]
        model: str = kwargs.get("model", "gemini-2.5-pro")
        role_category: str = kwargs.get("role_category", "SDE")

        prompt = build_generation_prompt(
            "interview_prep",
            job,
            user_vault,
            role_category=role_category,
        )

        result = await client.generate_json(
            api_key,
            prompt,
            model=model,
            temperature=0.5,
        )

        return {
            "behavioral_questions": result.get("behavioral_questions", []),
            "technical_questions": result.get("technical_questions", []),
            "talking_points": result.get("talking_points", []),
            "questions_to_ask": result.get("questions_to_ask", []),
            "key_themes": result.get("key_themes", []),
        }
