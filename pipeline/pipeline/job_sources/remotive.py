from __future__ import annotations

import asyncio
import logging
from typing import List

import aiohttp

from .base import BaseFetcher, JobResult, strip_html

log = logging.getLogger(__name__)


class RemotiveFetcher(BaseFetcher):
    """Fetcher for Remotive remote jobs API."""

    name = "remotive"
    BASE_URL = "https://remotive.com/api/remote-jobs"

    # Available categories on Remotive
    CATEGORIES = [
        "software-dev",
        "data",
        "devops",
        "qa",
        "design",
        "product",
        "customer-support",
    ]

    async def fetch(
        self,
        session: aiohttp.ClientSession,
        category: str = "software-dev",
        **kwargs: object,
    ) -> List[JobResult]:
        """Fetch remote jobs from Remotive.

        Args:
            session: aiohttp client session.
            category: Remotive job category (e.g. "software-dev", "data").

        Returns:
            List of JobResult objects.
        """
        params = {"category": category}

        try:
            async with session.get(
                self.BASE_URL,
                params=params,
                timeout=aiohttp.ClientTimeout(total=30),
            ) as resp:
                if resp.status != 200:
                    log.warning(
                        "Remotive %s returned status %d", category, resp.status
                    )
                    return []
                data = await resp.json(content_type=None)
        except asyncio.TimeoutError:
            log.warning("Remotive %s request timed out", category)
            return []
        except aiohttp.ClientError as exc:
            log.warning("Remotive %s request failed: %s", category, exc)
            return []
        except Exception as exc:
            log.warning("Remotive %s unexpected error: %s", category, exc)
            return []

        jobs_data = data.get("jobs", [])
        results: List[JobResult] = []

        for job in jobs_data:
            try:
                title = job.get("title", "")
                company_name = job.get("company_name", "")
                url = job.get("url", "")
                location = job.get("candidate_required_location", "")
                description_html = job.get("description", "")
                publication_date = job.get("publication_date", "")
                job_type = job.get("job_type", "")
                job_id = str(job.get("id", ""))
                category_name = job.get("category", "")

                description = strip_html(description_html) if description_html else ""

                results.append(
                    JobResult(
                        title=title,
                        company=company_name,
                        url=url,
                        location=location or "Remote",
                        description=description,
                        source="remotive",
                        posted_at=publication_date,
                        employment_type=job_type,
                        job_key=f"remotive|{job_id}" if job_id else "",
                    )
                )
            except Exception as exc:
                log.debug("Remotive: failed to parse job entry: %s", exc)
                continue

        log.info("Remotive %s: fetched %d jobs", category, len(results))
        return results

    async def fetch_all(
        self,
        session: aiohttp.ClientSession,
        categories: List[str] = None,
        **kwargs: object,
    ) -> List[JobResult]:
        """Fetch jobs across multiple Remotive categories.

        Args:
            session: aiohttp client session.
            categories: List of category slugs. Defaults to software-dev and data.

        Returns:
            Combined list of JobResult objects.
        """
        if categories is None:
            categories = ["software-dev", "data"]

        all_results: List[JobResult] = []
        seen_keys: set = set()

        for i, category in enumerate(categories):
            try:
                jobs = await self.fetch(session, category=category)
                for job in jobs:
                    if job.job_key not in seen_keys:
                        seen_keys.add(job.job_key)
                        all_results.append(job)
            except Exception as exc:
                log.warning("Remotive fetch_all failed for %s: %s", category, exc)

            # Rate limit between categories
            if i < len(categories) - 1:
                await asyncio.sleep(0.3)

        log.info(
            "Remotive fetch_all: %d unique jobs from %d categories",
            len(all_results),
            len(categories),
        )
        return all_results
