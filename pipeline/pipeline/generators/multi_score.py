from __future__ import annotations

import logging
from typing import Any, Dict

from pipeline.generators.base import BaseGenerator
from pipeline.generators.prompts import build_generation_prompt
from pipeline.scoring.gemini_client import GeminiClient

logger = logging.getLogger(__name__)


class MultiScoreGenerator(BaseGenerator):
    """Generates a multi-dimensional job-match score breakdown."""

    name: str = "multi_score"

    async def generate(
        self,
        api_key: str,
        job: Dict[str, Any],
        user_vault: str,
        **kwargs: Any,
    ) -> Dict[str, Any]:
        """Score the job match across technical, experience, education,
        and culture dimensions.

        Args:
            api_key: Gemini API key.
            job: Job dict.
            user_vault: User vault text.
            **kwargs: Expects ``gemini_client`` (:class:`GeminiClient`).
                Optional: ``model``.

        Returns:
            Dict with ``technical_match``, ``experience_relevance``,
            ``education_fit``, ``culture_alignment``, ``gap_analysis``,
            ``overall_score``, ``recommendation``, and
            ``cover_letter_emphasis``.
        """
        client: GeminiClient = kwargs["gemini_client"]
        model: str = kwargs.get("model", "gemini-2.5-pro")

        prompt = build_generation_prompt(
            "multi_score",
            job,
            user_vault,
        )

        result = await client.generate_json(
            api_key,
            prompt,
            model=model,
            temperature=0.3,
        )

        def _normalize_dimension(data: Any, default_keys: tuple = ("score", "reasoning")) -> Dict[str, Any]:
            """Ensure a dimension dict has at least ``score``."""
            if not isinstance(data, dict):
                return {"score": 0, "reasoning": ""}
            score = data.get("score", 0)
            if isinstance(score, str):
                try:
                    score = int(score)
                except (ValueError, TypeError):
                    score = 0
            data["score"] = max(0, min(100, int(score)))
            return data

        # Normalize overall_score
        overall = result.get("overall_score", 0)
        if isinstance(overall, str):
            try:
                overall = int(overall)
            except (ValueError, TypeError):
                overall = 0
        overall = max(0, min(100, int(overall)))

        # Validate recommendation
        valid_recs = {"STRONG_APPLY", "APPLY", "MAYBE", "SKIP"}
        rec = str(result.get("recommendation", "")).upper().replace(" ", "_")
        if rec not in valid_recs:
            if overall >= 85:
                rec = "STRONG_APPLY"
            elif overall >= 70:
                rec = "APPLY"
            elif overall >= 55:
                rec = "MAYBE"
            else:
                rec = "SKIP"

        return {
            "technical_match": _normalize_dimension(
                result.get("technical_match", {})
            ),
            "experience_relevance": _normalize_dimension(
                result.get("experience_relevance", {})
            ),
            "education_fit": _normalize_dimension(
                result.get("education_fit", {})
            ),
            "culture_alignment": _normalize_dimension(
                result.get("culture_alignment", {})
            ),
            "gap_analysis": result.get("gap_analysis", []),
            "overall_score": overall,
            "recommendation": rec,
            "cover_letter_emphasis": result.get("cover_letter_emphasis", []),
        }
