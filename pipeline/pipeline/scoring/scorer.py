from __future__ import annotations

import logging
from typing import Any, Awaitable, Callable, Dict, List, Optional

from pipeline.scoring.gemini_client import GeminiClient

logger = logging.getLogger(__name__)

# Type alias for the progress callback:
#   on_progress(completed: int, total: int, job_title: str) -> Awaitable[None]
ProgressCallback = Callable[[int, int, str], Awaitable[None]]

SCORING_RUBRIC = """\
Scoring Rubric (0-100):
  85-100: Perfect match -- apply immediately
  70-84:  Strong match -- apply within 24 hours
  55-69:  Decent match -- apply within a week
  40-54:  Weak match -- apply only if time permits
  0-39:   Poor match -- skip

Visa interpretation:
  - "CPT/OPT authorized" or "no sponsorship needed" = AUTHORIZED, no penalty
  - "US citizen only" or "security clearance required" = HARD FAIL, score 0
  - No mention of visa = assume neutral, no penalty
"""


class JobScorer:
    """Scores jobs against a user's profile using Gemini."""

    def __init__(self, gemini_client: GeminiClient) -> None:
        self.client = gemini_client

    async def score_job(
        self,
        api_key: str,
        job: Dict[str, Any],
        user_profile: str,
        model: str = "gemini-2.5-pro",
    ) -> Dict[str, Any]:
        """Score a single job against the user profile.

        Args:
            api_key: User's Gemini API key.
            job: Job dict with ``title``, ``company``, ``location``, ``description``.
            user_profile: The user's full career vault / profile text.
            model: Gemini model to use.

        Returns:
            Dict with keys: ``score`` (0-100), ``summary``, ``recommendation``
            (``STRONG_APPLY`` / ``APPLY`` / ``MAYBE`` / ``SKIP``),
            and ``apply_rationale``.
        """
        prompt = self._build_scoring_prompt(job, user_profile)
        result = await self.client.generate_json(
            api_key, prompt, model=model, temperature=0.3
        )

        # Normalize and validate the score
        score = result.get("score", 0)
        if isinstance(score, str):
            try:
                score = int(score)
            except (ValueError, TypeError):
                score = 0
        score = max(0, min(100, int(score)))
        result["score"] = score

        # Ensure recommendation is valid
        valid_recommendations = {"STRONG_APPLY", "APPLY", "MAYBE", "SKIP"}
        rec = result.get("recommendation", "").upper().replace(" ", "_")
        if rec not in valid_recommendations:
            if score >= 85:
                rec = "STRONG_APPLY"
            elif score >= 70:
                rec = "APPLY"
            elif score >= 55:
                rec = "MAYBE"
            else:
                rec = "SKIP"
        result["recommendation"] = rec

        return result

    async def score_batch(
        self,
        api_key: str,
        jobs: List[Dict[str, Any]],
        user_profile: str,
        model: str = "gemini-2.5-pro",
        on_progress: Optional[ProgressCallback] = None,
    ) -> List[Dict[str, Any]]:
        """Score multiple jobs sequentially with an optional progress callback.

        Each job dict is augmented in-place with ``_score``, ``_summary``, and
        ``_recommendation`` keys.

        Args:
            api_key: User's Gemini API key.
            jobs: List of job dicts.
            user_profile: User's career vault text.
            model: Gemini model.
            on_progress: Async callback ``(completed, total, title) -> None``.

        Returns:
            The same list of job dicts, each enriched with scoring fields.
        """
        results: List[Dict[str, Any]] = []
        total = len(jobs)

        for i, job in enumerate(jobs):
            title = job.get("title", "Unknown")
            try:
                result = await self.score_job(api_key, job, user_profile, model)
                job["_score"] = result.get("score", 0)
                job["_summary"] = result.get("summary", "")
                job["_recommendation"] = result.get("recommendation", "")
                job["_apply_rationale"] = result.get("apply_rationale", "")
            except Exception as exc:
                logger.error("Scoring failed for '%s': %s", title, exc)
                job["_score"] = 0
                job["_summary"] = f"Scoring failed: {exc}"
                job["_recommendation"] = "SKIP"
                job["_apply_rationale"] = ""
            results.append(job)

            if on_progress is not None:
                await on_progress(i + 1, total, title)

        return results

    def _build_scoring_prompt(
        self, job: Dict[str, Any], user_profile: str
    ) -> str:
        """Build the scoring prompt.

        Args:
            job: Job dict with title, company, location, description.
            user_profile: Full user profile / vault text.

        Returns:
            Complete prompt string requesting a JSON response.
        """
        title = job.get("title", "N/A")
        company = job.get("company", "N/A")
        location = job.get("location", "N/A")
        description = job.get("description", "No description available.")

        return f"""\
You are an expert job-match analyst. Score how well this candidate matches the \
job below. Return ONLY valid JSON.

{'='*60}
JOB DETAILS
{'='*60}
Title: {title}
Company: {company}
Location: {location}

Description:
{description}

{'='*60}
CANDIDATE PROFILE
{'='*60}
{user_profile}

{'='*60}
SCORING INSTRUCTIONS
{'='*60}
{SCORING_RUBRIC}

Consider these dimensions:
1. Technical skill overlap (languages, frameworks, tools)
2. Experience relevance (years, domain, project similarity)
3. Education fit (degree level, coursework)
4. Visa / work-authorization compatibility
5. LinkedIn connections at the company (if mentioned)

Return JSON with exactly these keys:
{{
  "score": <integer 0-100>,
  "summary": "<2-3 sentence match summary>",
  "recommendation": "<STRONG_APPLY | APPLY | MAYBE | SKIP>",
  "apply_rationale": "<1-2 sentences on why to apply or skip>"
}}
"""
