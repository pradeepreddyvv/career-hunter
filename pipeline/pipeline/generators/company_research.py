from __future__ import annotations

import logging
import re
from typing import Any, Dict, List

from pipeline.generators.base import BaseGenerator
from pipeline.generators.prompts import build_generation_prompt
from pipeline.scoring.gemini_client import GeminiClient

logger = logging.getLogger(__name__)


class CompanyResearchGenerator(BaseGenerator):
    """Generates company research using Gemini with Google Search grounding.

    This is the *gate* step in the document generation DAG -- all other
    generators depend on its output.
    """

    name: str = "company_research"

    async def generate(
        self,
        api_key: str,
        job: Dict[str, Any],
        user_vault: str,
        **kwargs: Any,
    ) -> Dict[str, Any]:
        """Research a company for hidden keywords and context.

        Args:
            api_key: Gemini API key.
            job: Job dict.
            user_vault: User vault text.
            **kwargs: Expects ``gemini_client`` (:class:`GeminiClient`),
                optionally ``model``.

        Returns:
            Dict with ``research`` (full text) and ``hidden_keywords`` list.
        """
        client: GeminiClient = kwargs["gemini_client"]
        model: str = kwargs.get("model", "gemini-2.5-pro")

        prompt = build_generation_prompt(
            "company_research",
            job,
            user_vault,
        )

        # Use Google Search grounding for real-time company info
        text = await client.call(
            api_key,
            prompt,
            model=model,
            temperature=0.5,
            use_search=True,
        )

        hidden_keywords = _extract_hidden_keywords(text)

        return {
            "research": text,
            "hidden_keywords": hidden_keywords,
        }


def _extract_hidden_keywords(text: str) -> List[str]:
    """Extract the HIDDEN_KEYWORDS list from research text.

    Looks for a line starting with ``HIDDEN_KEYWORDS:`` and parses the
    bracketed list after it.
    """
    match = re.search(
        r"HIDDEN_KEYWORDS:\s*\[([^\]]*)\]", text, re.IGNORECASE
    )
    if not match:
        return []

    raw = match.group(1)
    keywords = [
        kw.strip().strip("\"'")
        for kw in raw.split(",")
        if kw.strip()
    ]
    return keywords
