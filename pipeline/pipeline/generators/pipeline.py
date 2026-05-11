from __future__ import annotations

import asyncio
import logging
from typing import Any, Awaitable, Callable, Dict, Optional

from pipeline.generators.ats_audit import ATSAuditGenerator
from pipeline.generators.company_research import CompanyResearchGenerator
from pipeline.generators.cover_letter import CoverLetterGenerator
from pipeline.generators.follow_up import FollowUpGenerator
from pipeline.generators.interview_prep import InterviewPrepGenerator
from pipeline.generators.multi_score import MultiScoreGenerator
from pipeline.generators.outreach import OutreachGenerator
from pipeline.generators.resume_latex import ResumeLatexGenerator
from pipeline.generators.resume_text import ResumeTextGenerator
from pipeline.scoring.gemini_client import GeminiClient

logger = logging.getLogger(__name__)

# Type alias for the step callback:
#   on_step(step_name: str, status: "running" | "completed" | "failed") -> Awaitable[None]
StepCallback = Callable[[str, str], Awaitable[None]]


class DocumentPipeline:
    """Orchestrates document generation in DAG order.

    Execution graph::

        company_research (gate -- must complete first)
            |
            +-- resume_text --> ats_audit (sequential dependency)
            +-- resume_latex
            +-- cover_letter
            +-- outreach
            +-- follow_up
            +-- interview_prep  (only if score >= 60)
            +-- multi_score

    All branches after the gate run concurrently.  The ATS audit waits
    for resume_text to finish before starting.
    """

    def __init__(self, gemini_client: GeminiClient) -> None:
        self.client = gemini_client
        self.generators = {
            "company_research": CompanyResearchGenerator(),
            "resume_text": ResumeTextGenerator(),
            "resume_latex": ResumeLatexGenerator(),
            "cover_letter": CoverLetterGenerator(),
            "outreach": OutreachGenerator(),
            "interview_prep": InterviewPrepGenerator(),
            "follow_up": FollowUpGenerator(),
            "ats_audit": ATSAuditGenerator(),
            "multi_score": MultiScoreGenerator(),
        }

    async def generate_all(
        self,
        api_key: str,
        job: Dict[str, Any],
        user_vault: str,
        role_category: str = "",
        connections: str = "",
        score: int = 0,
        model: str = "gemini-2.5-pro",
        on_step: Optional[StepCallback] = None,
    ) -> Dict[str, Any]:
        """Run the full document-generation DAG.

        Args:
            api_key: User's Gemini API key.
            job: Job dict with ``title``, ``company``, ``location``,
                ``description``.
            user_vault: User's full career vault text.
            role_category: Classified role (e.g. ``"SDE"``).
            connections: Known connections at the company (text).
            score: Pre-computed job score; interview prep is only
                generated when ``score >= 60``.
            model: Gemini model to use for all calls.
            on_step: Optional async callback invoked with
                ``(step_name, status)`` as each step starts / completes.

        Returns:
            Dict mapping document type names to their generated content
            dicts.  Failed generators produce ``{"error": "..."}``
            instead of raising.
        """
        results: Dict[str, Any] = {}

        # ── Step 1: Company research (gate) ──────────────────────────────
        await self._notify(on_step, "company_research", "running")
        research = await self._safe_generate(
            "company_research", api_key, job, user_vault, model=model
        )
        results["company_research"] = research
        company_research_text = (
            research.get("research", "") if research else ""
        )
        await self._notify(
            on_step,
            "company_research",
            "completed" if "error" not in (research or {}) else "failed",
        )

        # ── Step 2: Parallel generation ──────────────────────────────────
        parallel_specs: Dict[str, Dict[str, Any]] = {
            "resume_text": {
                "role_category": role_category,
                "company_research": company_research_text,
            },
            "resume_latex": {
                "role_category": role_category,
                "company_research": company_research_text,
            },
            "cover_letter": {
                "role_category": role_category,
                "company_research": company_research_text,
                "connections": connections,
            },
            "outreach": {
                "connections": connections,
            },
            "follow_up": {},
            "multi_score": {},
        }

        if score >= 60:
            parallel_specs["interview_prep"] = {
                "role_category": role_category,
            }

        # Fire all parallel tasks
        async_tasks: Dict[str, asyncio.Task[Dict[str, Any]]] = {}
        for name, gen_kwargs in parallel_specs.items():
            await self._notify(on_step, name, "running")
            async_tasks[name] = asyncio.ensure_future(
                self._safe_generate(
                    name, api_key, job, user_vault, model=model, **gen_kwargs
                )
            )

        # Await all parallel tasks
        for name, task in async_tasks.items():
            results[name] = await task
            status = (
                "completed"
                if "error" not in (results[name] or {})
                else "failed"
            )
            await self._notify(on_step, name, status)

        # ── Step 3: ATS audit (depends on resume_text) ───────────────────
        resume_text = ""
        resume_result = results.get("resume_text")
        if resume_result and isinstance(resume_result, dict):
            resume_text = resume_result.get("resume_text", "")

        if resume_text:
            await self._notify(on_step, "ats_audit", "running")
            results["ats_audit"] = await self._safe_generate(
                "ats_audit",
                api_key,
                job,
                user_vault,
                model=model,
                existing_resume=resume_text,
            )
            status = (
                "completed"
                if "error" not in (results.get("ats_audit") or {})
                else "failed"
            )
            await self._notify(on_step, "ats_audit", status)
        else:
            logger.warning(
                "Skipping ATS audit -- no resume text was generated"
            )
            results["ats_audit"] = {
                "error": "Skipped: resume_text generation produced no text."
            }
            await self._notify(on_step, "ats_audit", "failed")

        return results

    async def generate_single(
        self,
        name: str,
        api_key: str,
        job: Dict[str, Any],
        user_vault: str,
        model: str = "gemini-2.5-pro",
        **kwargs: Any,
    ) -> Dict[str, Any]:
        """Run a single generator by name.

        Useful for re-generating individual documents without running the
        full DAG.

        Args:
            name: Generator name (must be a key in ``self.generators``).
            api_key: Gemini API key.
            job: Job dict.
            user_vault: User vault text.
            model: Gemini model.
            **kwargs: Passed through to the generator.

        Returns:
            Generator output dict.

        Raises:
            ValueError: If *name* is not a known generator.
        """
        if name not in self.generators:
            raise ValueError(
                f"Unknown generator: {name}. "
                f"Available: {', '.join(sorted(self.generators))}"
            )
        return await self._safe_generate(
            name, api_key, job, user_vault, model=model, **kwargs
        )

    # ── internals ────────────────────────────────────────────────────────

    async def _safe_generate(
        self,
        name: str,
        api_key: str,
        job: Dict[str, Any],
        user_vault: str,
        **kwargs: Any,
    ) -> Dict[str, Any]:
        """Call a generator, catching and logging any exception."""
        try:
            gen = self.generators[name]
            return await gen.generate(
                api_key, job, user_vault, gemini_client=self.client, **kwargs
            )
        except Exception as exc:
            logger.error("Generator '%s' failed: %s", name, exc, exc_info=True)
            return {"error": str(exc)}

    @staticmethod
    async def _notify(
        callback: Optional[StepCallback],
        step: str,
        status: str,
    ) -> None:
        """Fire the step callback if one was provided."""
        if callback is not None:
            try:
                await callback(step, status)
            except Exception:
                logger.debug(
                    "on_step callback raised for %s/%s", step, status,
                    exc_info=True,
                )
