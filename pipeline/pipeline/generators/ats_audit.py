from __future__ import annotations

import logging
from typing import Any, Dict

from pipeline.generators.base import BaseGenerator
from pipeline.generators.prompts import build_generation_prompt
from pipeline.scoring.gemini_client import GeminiClient

logger = logging.getLogger(__name__)


class ATSAuditGenerator(BaseGenerator):
    """Audits a generated resume against the JD for ATS keyword coverage.

    This generator runs *after* :class:`ResumeTextGenerator` and requires
    the generated resume text as the ``existing_resume`` kwarg.
    """

    name: str = "ats_audit"

    async def generate(
        self,
        api_key: str,
        job: Dict[str, Any],
        user_vault: str,
        **kwargs: Any,
    ) -> Dict[str, Any]:
        """Audit a resume for ATS keyword coverage.

        Args:
            api_key: Gemini API key.
            job: Job dict.
            user_vault: User vault text.
            **kwargs: Expects ``gemini_client`` (:class:`GeminiClient`) and
                ``existing_resume`` (str). Optional: ``model``.

        Returns:
            Dict with ``keywords_found``, ``keywords_missing``,
            ``coverage_percent``, ``suggestions``, and
            ``ats_score_prediction``.
        """
        client: GeminiClient = kwargs["gemini_client"]
        model: str = kwargs.get("model", "gemini-2.5-pro")
        existing_resume: str = kwargs.get("existing_resume", "")

        if not existing_resume:
            logger.warning("ATS audit called without existing_resume; skipping")
            return {
                "keywords_found": [],
                "keywords_missing": [],
                "coverage_percent": 0,
                "suggestions": [],
                "ats_score_prediction": 0,
                "error": "No resume text provided for audit.",
            }

        prompt = build_generation_prompt(
            "ats_audit",
            job,
            user_vault,
            existing_resume=existing_resume,
        )

        result = await client.generate_json(
            api_key,
            prompt,
            model=model,
            temperature=0.2,
        )

        # Normalize coverage_percent
        coverage = result.get("coverage_percent", 0)
        if isinstance(coverage, str):
            try:
                coverage = int(coverage.replace("%", ""))
            except (ValueError, TypeError):
                coverage = 0
        coverage = max(0, min(100, int(coverage)))

        # Normalize ats_score_prediction
        ats_score = result.get("ats_score_prediction", 0)
        if isinstance(ats_score, str):
            try:
                ats_score = int(ats_score.replace("%", ""))
            except (ValueError, TypeError):
                ats_score = 0
        ats_score = max(0, min(100, int(ats_score)))

        return {
            "keywords_found": result.get("keywords_found", []),
            "keywords_missing": result.get("keywords_missing", []),
            "coverage_percent": coverage,
            "suggestions": result.get("suggestions", []),
            "ats_score_prediction": ats_score,
        }
