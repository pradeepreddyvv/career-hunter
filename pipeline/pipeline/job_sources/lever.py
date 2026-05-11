from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from typing import List, Optional

import aiohttp

from .base import BaseFetcher, JobResult, strip_html
from .registry import get_companies_by_ats

log = logging.getLogger(__name__)


class LeverFetcher(BaseFetcher):
    """Fetcher for Lever ATS postings API."""

    name = "lever"
    BASE_URL = "https://api.lever.co/v0/postings/{slug}?mode=json"

    async def fetch(
        self,
        session: aiohttp.ClientSession,
        slug: str = "",
        company: str = "",
        **kwargs: object,
    ) -> List[JobResult]:
        """Fetch jobs from a single Lever company board.

        Args:
            session: aiohttp client session.
            slug: Company slug on Lever (e.g. "spotify").
            company: Human-readable company name for display.

        Returns:
            List of JobResult objects.
        """
        if not slug:
            log.warning("LeverFetcher.fetch called without slug")
            return []

        company_name = company or slug.title()
        url = self.BASE_URL.format(slug=slug)

        try:
            async with session.get(url, timeout=aiohttp.ClientTimeout(total=30)) as resp:
                if resp.status == 404:
                    log.debug("Lever board not found for slug=%s", slug)
                    return []
                if resp.status != 200:
                    log.warning("Lever %s returned status %d", slug, resp.status)
                    return []
                data = await resp.json(content_type=None)
        except asyncio.TimeoutError:
            log.warning("Lever %s request timed out", slug)
            return []
        except aiohttp.ClientError as exc:
            log.warning("Lever %s request failed: %s", slug, exc)
            return []
        except Exception as exc:
            log.warning("Lever %s unexpected error: %s", slug, exc)
            return []

        if not isinstance(data, list):
            log.warning("Lever %s: unexpected response format (not a list)", slug)
            return []

        results: List[JobResult] = []

        for posting in data:
            try:
                title = posting.get("text", "")
                categories = posting.get("categories", {}) or {}
                location = categories.get("location", "")
                commitment = categories.get("commitment", "")
                hosted_url = posting.get("hostedUrl", "")
                description_plain = posting.get("descriptionPlain", "")
                description_html = posting.get("description", "")
                created_at_ms = posting.get("createdAt")
                posting_id = posting.get("id", "")

                # Use plain description if available, else strip HTML
                description = description_plain
                if not description and description_html:
                    description = strip_html(description_html)

                # Convert millisecond timestamp to ISO string
                posted_at = ""
                if created_at_ms:
                    try:
                        dt = datetime.fromtimestamp(
                            created_at_ms / 1000, tz=timezone.utc
                        )
                        posted_at = dt.isoformat()
                    except (ValueError, OSError, OverflowError):
                        pass

                results.append(
                    JobResult(
                        title=title,
                        company=company_name,
                        url=hosted_url,
                        location=location,
                        description=description,
                        source="lever",
                        posted_at=posted_at,
                        employment_type=commitment,
                        job_key=f"lever|{slug}|{posting_id}" if posting_id else "",
                    )
                )
            except Exception as exc:
                log.debug("Lever %s: failed to parse posting: %s", slug, exc)
                continue

        log.info("Lever %s: fetched %d jobs", slug, len(results))
        return results

    async def fetch_all(
        self,
        session: aiohttp.ClientSession,
        companies: Optional[List[dict]] = None,
    ) -> List[JobResult]:
        """Fetch jobs from all Lever companies in the registry.

        Args:
            session: aiohttp client session.
            companies: Optional list of company dicts. Defaults to registry.

        Returns:
            Combined list of JobResult objects.
        """
        if companies is None:
            companies = get_companies_by_ats("lever")

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
                log.warning("Lever fetch_all failed for %s: %s", slug, exc)

            # Rate limit: 0.2s between requests
            if i < len(companies) - 1:
                await asyncio.sleep(0.2)

        log.info(
            "Lever fetch_all: %d jobs from %d companies",
            len(all_results),
            len(companies),
        )
        return all_results
