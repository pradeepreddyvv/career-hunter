from __future__ import annotations

import asyncio
import logging
from typing import List, Optional

import aiohttp

from .base import BaseFetcher, JobResult, strip_html
from .registry import get_companies_by_ats

log = logging.getLogger(__name__)


class GreenhouseFetcher(BaseFetcher):
    """Fetcher for Greenhouse ATS boards API."""

    name = "greenhouse"
    BASE_URL = "https://boards-api.greenhouse.io/v1/boards/{slug}/jobs?content=true"

    async def fetch(
        self,
        session: aiohttp.ClientSession,
        slug: str = "",
        company: str = "",
        **kwargs: object,
    ) -> List[JobResult]:
        """Fetch jobs from a single Greenhouse board.

        Args:
            session: aiohttp client session.
            slug: Company slug on Greenhouse (e.g. "stripe").
            company: Human-readable company name for display.

        Returns:
            List of JobResult objects.
        """
        if not slug:
            log.warning("GreenhouseFetcher.fetch called without slug")
            return []

        company_name = company or slug.title()
        url = self.BASE_URL.format(slug=slug)

        try:
            async with session.get(url, timeout=aiohttp.ClientTimeout(total=30)) as resp:
                if resp.status == 404:
                    log.debug("Greenhouse board not found for slug=%s", slug)
                    return []
                if resp.status != 200:
                    log.warning(
                        "Greenhouse %s returned status %d", slug, resp.status
                    )
                    return []
                data = await resp.json(content_type=None)
        except asyncio.TimeoutError:
            log.warning("Greenhouse %s request timed out", slug)
            return []
        except aiohttp.ClientError as exc:
            log.warning("Greenhouse %s request failed: %s", slug, exc)
            return []
        except Exception as exc:
            log.warning("Greenhouse %s unexpected error: %s", slug, exc)
            return []

        jobs_data = data.get("jobs", [])
        results: List[JobResult] = []

        for job in jobs_data:
            try:
                title = job.get("title", "")
                location_obj = job.get("location", {}) or {}
                location = location_obj.get("name", "")
                absolute_url = job.get("absolute_url", "")
                content_html = job.get("content", "")
                updated_at = job.get("updated_at", "")
                job_id = str(job.get("id", ""))

                description = strip_html(content_html) if content_html else ""

                results.append(
                    JobResult(
                        title=title,
                        company=company_name,
                        url=absolute_url,
                        location=location,
                        description=description,
                        source="greenhouse",
                        posted_at=updated_at,
                        job_key=f"gh|{slug}|{job_id}" if job_id else "",
                    )
                )
            except Exception as exc:
                log.debug(
                    "Greenhouse %s: failed to parse job entry: %s", slug, exc
                )
                continue

        log.info("Greenhouse %s: fetched %d jobs", slug, len(results))
        return results

    async def fetch_all(
        self,
        session: aiohttp.ClientSession,
        companies: Optional[List[dict]] = None,
    ) -> List[JobResult]:
        """Fetch jobs from all Greenhouse companies in the registry.

        Args:
            session: aiohttp client session.
            companies: Optional list of company dicts. Defaults to registry.

        Returns:
            Combined list of JobResult objects.
        """
        if companies is None:
            companies = get_companies_by_ats("greenhouse")

        all_results: List[JobResult] = []

        for i, company in enumerate(companies):
            slug = company.get("slug", "")
            name = company.get("name", slug)
            if not slug:
                continue

            try:
                jobs = await self.fetch(session, slug=slug, company=name)
                all_results.extend(jobs)
            except Exception as exc:
                log.warning("Greenhouse fetch_all failed for %s: %s", slug, exc)

            # Rate limit: 0.2s between requests
            if i < len(companies) - 1:
                await asyncio.sleep(0.2)

        log.info(
            "Greenhouse fetch_all: %d jobs from %d companies",
            len(all_results),
            len(companies),
        )
        return all_results
