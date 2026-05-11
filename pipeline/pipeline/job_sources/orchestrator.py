from __future__ import annotations

import asyncio
import logging
from typing import List, Optional, Set

import aiohttp

from .ashby import AshbyFetcher
from .base import JobResult
from .github_repos import GitHubRepoFetcher
from .greenhouse import GreenhouseFetcher
from .lever import LeverFetcher
from .linkedin_guest import LinkedInGuestFetcher
from .muse import MuseFetcher
from .remotive import RemotiveFetcher

log = logging.getLogger(__name__)

INTERN_KEYWORDS: Set[str] = {
    "intern",
    "internship",
    "co-op",
    "coop",
    "new grad",
    "entry level",
    "junior",
    "associate",
    "early career",
    "university",
    "student",
}

# All available source names
ALL_SOURCES = [
    "greenhouse",
    "lever",
    "ashby",
    "muse",
    "remotive",
    "linkedin",
    "github",
]


class FetchOrchestrator:
    """Parallel job fetcher orchestrator.

    Runs multiple job source fetchers concurrently, deduplicates results,
    and optionally filters to intern/new-grad roles only.
    """

    def __init__(self, sources: Optional[List[str]] = None) -> None:
        """Initialize the orchestrator.

        Args:
            sources: List of source names to enable. Defaults to ATS sources
                     plus Muse and Remotive (excludes LinkedIn and GitHub by
                     default since they are slower / rate-limited).
        """
        self.sources = sources or [
            "greenhouse",
            "lever",
            "ashby",
            "muse",
            "remotive",
        ]
        self.greenhouse = GreenhouseFetcher()
        self.lever = LeverFetcher()
        self.ashby = AshbyFetcher()
        self.muse = MuseFetcher()
        self.remotive = RemotiveFetcher()
        self.linkedin = LinkedInGuestFetcher()
        self.github = GitHubRepoFetcher()

    async def _fetch_greenhouse(
        self,
        session: aiohttp.ClientSession,
        custom_companies: Optional[List[dict]],
    ) -> List[JobResult]:
        """Fetch from Greenhouse with error handling."""
        gh_companies = None
        if custom_companies:
            gh_companies = [
                c for c in custom_companies if c.get("ats") == "greenhouse"
            ]
        return await self.greenhouse.fetch_all(session, companies=gh_companies)

    async def _fetch_lever(
        self,
        session: aiohttp.ClientSession,
        custom_companies: Optional[List[dict]],
    ) -> List[JobResult]:
        """Fetch from Lever with error handling."""
        lv_companies = None
        if custom_companies:
            lv_companies = [
                c for c in custom_companies if c.get("ats") == "lever"
            ]
        return await self.lever.fetch_all(session, companies=lv_companies)

    async def _fetch_ashby(
        self,
        session: aiohttp.ClientSession,
        custom_companies: Optional[List[dict]],
    ) -> List[JobResult]:
        """Fetch from Ashby with error handling."""
        ab_companies = None
        if custom_companies:
            ab_companies = [
                c for c in custom_companies if c.get("ats") == "ashby"
            ]
        return await self.ashby.fetch_all(session, companies=ab_companies)

    async def _fetch_muse(
        self, session: aiohttp.ClientSession
    ) -> List[JobResult]:
        """Fetch from The Muse with error handling."""
        return await self.muse.fetch_all(session)

    async def _fetch_remotive(
        self, session: aiohttp.ClientSession
    ) -> List[JobResult]:
        """Fetch from Remotive with error handling."""
        return await self.remotive.fetch_all(session)

    async def _fetch_linkedin(
        self, session: aiohttp.ClientSession, **kwargs: object
    ) -> List[JobResult]:
        """Fetch from LinkedIn guest API with error handling."""
        queries = kwargs.get("linkedin_queries")
        days = kwargs.get("linkedin_days", 7)
        max_results = kwargs.get("linkedin_max_results", 100)
        return await self.linkedin.fetch(
            session,
            queries=queries,  # type: ignore[arg-type]
            days=days,  # type: ignore[arg-type]
            max_results=max_results,  # type: ignore[arg-type]
        )

    async def _fetch_github(
        self, session: aiohttp.ClientSession, **kwargs: object
    ) -> List[JobResult]:
        """Fetch from GitHub repos with error handling."""
        days = kwargs.get("github_days", 30)
        return await self.github.fetch_all(session, days=days)  # type: ignore[arg-type]

    async def fetch_all(
        self,
        intern_only: bool = False,
        custom_companies: Optional[List[dict]] = None,
        **kwargs: object,
    ) -> List[dict]:
        """Fetch from all enabled sources in parallel, dedup, return job dicts.

        Args:
            intern_only: If True, filter results to only intern/entry-level roles.
            custom_companies: Optional list of company dicts to override registry.
                Each dict should have: name, slug, ats.
            **kwargs: Additional options passed to individual fetchers:
                - linkedin_queries: List[str] for LinkedIn search queries.
                - linkedin_days: int for LinkedIn lookback days.
                - linkedin_max_results: int for LinkedIn max results.
                - github_days: int for GitHub repos lookback days.

        Returns:
            Deduplicated list of job dicts.
        """
        connector = aiohttp.TCPConnector(limit=20, limit_per_host=5)
        timeout = aiohttp.ClientTimeout(total=300)

        async with aiohttp.ClientSession(
            connector=connector, timeout=timeout
        ) as session:
            tasks = []
            task_labels = []

            if "greenhouse" in self.sources:
                tasks.append(self._fetch_greenhouse(session, custom_companies))
                task_labels.append("greenhouse")

            if "lever" in self.sources:
                tasks.append(self._fetch_lever(session, custom_companies))
                task_labels.append("lever")

            if "ashby" in self.sources:
                tasks.append(self._fetch_ashby(session, custom_companies))
                task_labels.append("ashby")

            if "muse" in self.sources:
                tasks.append(self._fetch_muse(session))
                task_labels.append("muse")

            if "remotive" in self.sources:
                tasks.append(self._fetch_remotive(session))
                task_labels.append("remotive")

            if "linkedin" in self.sources:
                tasks.append(self._fetch_linkedin(session, **kwargs))
                task_labels.append("linkedin")

            if "github" in self.sources:
                tasks.append(self._fetch_github(session, **kwargs))
                task_labels.append("github")

            if not tasks:
                log.warning("No sources enabled")
                return []

            log.info(
                "Fetching from %d sources: %s",
                len(tasks),
                ", ".join(task_labels),
            )

            results = await asyncio.gather(*tasks, return_exceptions=True)

            all_jobs: List[JobResult] = []
            for i, result in enumerate(results):
                label = task_labels[i] if i < len(task_labels) else f"source-{i}"
                if isinstance(result, Exception):
                    log.warning("Source %s failed: %s", label, result)
                    continue
                if isinstance(result, list):
                    log.info("Source %s returned %d jobs", label, len(result))
                    all_jobs.extend(result)
                else:
                    log.warning(
                        "Source %s returned unexpected type: %s",
                        label,
                        type(result),
                    )

        # Dedup by job_key
        seen: set = set()
        deduped: List[dict] = []
        for job in all_jobs:
            if isinstance(job, JobResult):
                key = job.job_key
                job_dict = job.to_dict()
            elif isinstance(job, dict):
                key = job.get("job_key", "")
                job_dict = job
            else:
                continue

            if key and key in seen:
                continue
            if key:
                seen.add(key)
            deduped.append(job_dict)

        log.info(
            "Total: %d jobs, %d after dedup", len(all_jobs), len(deduped)
        )

        # Optional intern filter
        if intern_only:
            before = len(deduped)
            deduped = [
                j
                for j in deduped
                if any(
                    kw in j.get("title", "").lower() for kw in INTERN_KEYWORDS
                )
            ]
            log.info(
                "Intern filter: %d -> %d jobs", before, len(deduped)
            )

        return deduped

    async def fetch_source(
        self,
        source: str,
        **kwargs: object,
    ) -> List[dict]:
        """Fetch from a single source.

        Args:
            source: Source name (e.g. "greenhouse", "lever").
            **kwargs: Passed to the fetcher.

        Returns:
            List of job dicts.
        """
        connector = aiohttp.TCPConnector(limit=10, limit_per_host=5)
        timeout = aiohttp.ClientTimeout(total=120)

        async with aiohttp.ClientSession(
            connector=connector, timeout=timeout
        ) as session:
            fetcher_map = {
                "greenhouse": lambda: self.greenhouse.fetch_all(session),
                "lever": lambda: self.lever.fetch_all(session),
                "ashby": lambda: self.ashby.fetch_all(session),
                "muse": lambda: self.muse.fetch_all(session),
                "remotive": lambda: self.remotive.fetch_all(session),
                "linkedin": lambda: self.linkedin.fetch(session, **kwargs),
                "github": lambda: self.github.fetch_all(session, **kwargs),
            }

            fetcher_fn = fetcher_map.get(source)
            if not fetcher_fn:
                log.error("Unknown source: %s", source)
                return []

            try:
                results = await fetcher_fn()
                return [
                    j.to_dict() if isinstance(j, JobResult) else j
                    for j in results
                ]
            except Exception as exc:
                log.error("Failed to fetch from %s: %s", source, exc)
                return []
