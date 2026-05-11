from __future__ import annotations

import logging
from typing import Any, Dict

from pipeline.generators.base import BaseGenerator
from pipeline.generators.prompts import LATEX_PREAMBLE, build_generation_prompt
from pipeline.scoring.gemini_client import GeminiClient

logger = logging.getLogger(__name__)


class ResumeLatexGenerator(BaseGenerator):
    """Generates a LaTeX resume body using Jake Gutierrez's template."""

    name: str = "resume_latex"

    async def generate(
        self,
        api_key: str,
        job: Dict[str, Any],
        user_vault: str,
        **kwargs: Any,
    ) -> Dict[str, Any]:
        """Generate a LaTeX resume body and combine with the preamble.

        Args:
            api_key: Gemini API key.
            job: Job dict.
            user_vault: User vault text.
            **kwargs: Expects ``gemini_client`` (:class:`GeminiClient`).
                Optional: ``role_category``, ``company_research``, ``model``.

        Returns:
            Dict with ``latex_body`` (just the body) and ``full_latex``
            (preamble + body, ready to compile).
        """
        client: GeminiClient = kwargs["gemini_client"]
        model: str = kwargs.get("model", "gemini-2.5-pro")
        role_category: str = kwargs.get("role_category", "SDE")
        company_research: str = kwargs.get("company_research", "")

        prompt = build_generation_prompt(
            "resume_latex",
            job,
            user_vault,
            role_category=role_category,
            company_research=company_research,
        )

        # LaTeX body is plain text, not JSON
        latex_body = await client.call(
            api_key,
            prompt,
            model=model,
            temperature=0.3,
            expect_json=False,
        )

        # Strip any markdown fencing the model may have wrapped around it
        latex_body = _strip_latex_fencing(latex_body)

        full_latex = LATEX_PREAMBLE.rstrip() + "\n\n" + latex_body.strip() + "\n"

        return {
            "latex_body": latex_body.strip(),
            "full_latex": full_latex,
        }


def _strip_latex_fencing(text: str) -> str:
    """Remove markdown code fences (```latex ... ```) if present."""
    text = text.strip()
    if text.startswith("```"):
        # Remove opening fence (```latex or ```)
        first_newline = text.find("\n")
        if first_newline != -1:
            text = text[first_newline + 1 :]
    if text.endswith("```"):
        text = text[:-3]
    return text.strip()
