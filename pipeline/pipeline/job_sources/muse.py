from __future__ import annotations

import asyncio
import logging
from typing import List, Optional

import aiohttp

from .base import BaseFetcher, JobResult, strip_html

log = logging.getLogger(__name__)


class MuseFetcher(BaseFetcher):
    """Fetcher for The Muse public API."""

    name = "muse"
    BASE_URL = "https://www.themuse.com/api/public/jobs"
    CATEGORIES = [
        "Software Engineering",
        "Data Science",
        "IT",
        "Data Analytics",
        "Design and UX",
        "Project Management",
        "Information Technology",
    ]

    async def fetch(
        self,
        session: aiohttp.ClientSession,
        category: str = "Software Engineering",
        level: str = "Internship",
        max_pages: int = 3,
        **kwargs: object,
    ) -> List[JobResult]:
        """Fetch jobs from The Muse for a given category and level.

        Args:
            session: aiohttp client session.
            category: Job category (e.g. "Software Engineering").
            level: Experience level (e.g. "Internship", "Entry Level").
            max_pages: Maximum number of pages to fetch (20 results per page).

        Returns:
            List of JobResult objects.
        """
        results: List[JobResult] = []

        for page in range(max_pages):
            params = {
                "category": category,
                "level": level,
                "page": page,
            }

            try:
                async with session.get(
                    self.BASE_URL,
                    params=params,
                    timeout=aiohttp.ClientTimeout(total=30),
                ) as resp:
                    if resp.status != 200:
                        log.warning(
                            "Muse %s page %d returned status %d",
                            category,
                            page,
                            resp.status,
                        )
                        break
                    data = await resp.json(content_type=None)
            except asyncio.TimeoutError:
                log.warning("Muse %s page %d timed out", category, page)
                break
            except aiohttp.ClientError as exc:
                log.warning("Muse %s page %d failed: %s", category, page, exc)
                break
            except Exception as exc:
                log.warning(
                    "Muse %s page %d unexpected error: %s", category, page, exc
                )
                break

            jobs_data = data.get("results", [])
            if not jobs_data:
                break

            for job in jobs_data:
                try:
                    title = job.get("name", "")
                    company_obj = job.get("company", {}) or {}
                    company_name = company_obj.get("name", "")
                    locations = job.get("locations", [])
                    location = locations[0].get("name", "") if locations else ""
                    refs = job.get("refs", {}) or {}
                    url = refs.get("landing_page", "")
                    contents_html = job.get("contents", "")
                    publication_date = job.get("publication_date", "")
                    job_id = str(job.get("id", ""))
                    levels = job.get("levels", [])
                    level_name = levels[0].get("name", "") if levels else ""

                    description = strip_html(contents_html) if contents_html else ""

                    results.append(
                        JobResult(
                            title=title,
                            company=company_name,
                            url=url,
                            location=location,
                            description=description,
                            source="muse",
                            posted_at=publication_date,
                            employment_type=level_name,
                            job_key=f"muse|{job_id}" if job_id else "",
                        )
                    )
                except Exception as exc:
                    log.debug("Muse: failed to parse job entry: %s", exc)
                    continue

            # Check if we've reached the last page
            total_pages = data.get("page_count", 0)
            if page >= total_pages - 1:
                break

            # Rate limit between pages
            await asyncio.sleep(0.3)

        log.info("Muse %s: fetched %d jobs", category, len(results))
        return results

    async def fetch_all(
        self,
        session: aiohttp.ClientSession,
        **kwargs: object,
    ) -> List[JobResult]:
        """Fetch jobs across all Muse categories.

        Args:
            session: aiohttp client session.

        Returns:
            Combined list of JobResult objects from all categories.
        """
        all_results: List[JobResult] = []
        seen_keys: set = set()

        for i, category in enumerate(self.CATEGORIES):
            try:
                jobs = await self.fetch(session, category=category)
                for job in jobs:
                    if job.job_key not in seen_keys:
                        seen_keys.add(job.job_key)
                        all_results.append(job)
            except Exception as exc:
                log.warning("Muse fetch_all failed for %s: %s", category, exc)

            # Rate limit between categories
            if i < len(self.CATEGORIES) - 1:
                await asyncio.sleep(0.5)

        log.info("Muse fetch_all: %d unique jobs from %d categories",
                 len(all_results), len(self.CATEGORIES))
        return all_results
