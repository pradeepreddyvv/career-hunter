from __future__ import annotations

import asyncio
import logging
from typing import List, Optional

import aiohttp

from .base import BaseFetcher, JobResult, strip_html
from .registry import get_companies_by_ats

log = logging.getLogger(__name__)


class AshbyFetcher(BaseFetcher):
    """Fetcher for Ashby ATS GraphQL API (updated schema)."""

    name = "ashby"
    GRAPHQL_URL = "https://jobs.ashbyhq.com/api/non-user-graphql"

    # Step 1: List all postings (briefs only, no descriptions)
    LIST_QUERY = """
    query ApiJobBoardWithTeams($organizationHostedJobsPageName: String!) {
      jobBoard: jobBoardWithTeams(
        organizationHostedJobsPageName: $organizationHostedJobsPageName
      ) {
        jobPostings {
          id
          title
          teamId
          locationName
          employmentType
        }
      }
    }
    """

    # Step 2: Fetch individual posting details (for description)
    DETAIL_QUERY = """
    query ApiJobPosting(
      $jobPostingId: String!
      $organizationHostedJobsPageName: String!
    ) {
      jobPosting(
        jobPostingId: $jobPostingId
        organizationHostedJobsPageName: $organizationHostedJobsPageName
      ) {
        id
        title
        locationName
        employmentType
        descriptionHtml
        publishedDate
        isListed
      }
    }
    """

    async def _list_postings(
        self, session: aiohttp.ClientSession, slug: str
    ) -> List[dict]:
        """Step 1: List all job postings for a company (briefs only)."""
        payload = {
            "operationName": "ApiJobBoardWithTeams",
            "variables": {"organizationHostedJobsPageName": slug},
            "query": self.LIST_QUERY,
        }

        try:
            async with session.post(
                self.GRAPHQL_URL,
                json=payload,
                timeout=aiohttp.ClientTimeout(total=30),
            ) as resp:
                if resp.status != 200:
                    log.warning("Ashby %s list returned status %d", slug, resp.status)
                    return []
                data = await resp.json(content_type=None)
        except asyncio.TimeoutError:
            log.warning("Ashby %s list request timed out", slug)
            return []
        except aiohttp.ClientError as exc:
            log.warning("Ashby %s list request failed: %s", slug, exc)
            return []
        except Exception as exc:
            log.warning("Ashby %s list unexpected error: %s", slug, exc)
            return []

        errors = data.get("errors")
        if errors:
            log.warning("Ashby %s GraphQL errors: %s", slug, errors)
            return []

        job_board = (data.get("data") or {}).get("jobBoard") or {}
        postings = job_board.get("jobPostings") or []
        return postings

    async def _fetch_posting_detail(
        self, session: aiohttp.ClientSession, slug: str, posting_id: str
    ) -> Optional[dict]:
        """Step 2: Fetch full details for a single posting."""
        payload = {
            "operationName": "ApiJobPosting",
            "variables": {
                "jobPostingId": posting_id,
                "organizationHostedJobsPageName": slug,
            },
            "query": self.DETAIL_QUERY,
        }

        try:
            async with session.post(
                self.GRAPHQL_URL,
                json=payload,
                timeout=aiohttp.ClientTimeout(total=30),
            ) as resp:
                if resp.status != 200:
                    log.debug(
                        "Ashby %s detail %s returned status %d",
                        slug,
                        posting_id,
                        resp.status,
                    )
                    return None
                data = await resp.json(content_type=None)
        except asyncio.TimeoutError:
            log.debug("Ashby %s detail %s timed out", slug, posting_id)
            return None
        except aiohttp.ClientError as exc:
            log.debug("Ashby %s detail %s failed: %s", slug, posting_id, exc)
            return None
        except Exception as exc:
            log.debug(
                "Ashby %s detail %s unexpected error: %s", slug, posting_id, exc
            )
            return None

        return (data.get("data") or {}).get("jobPosting")

    async def fetch(
        self,
        session: aiohttp.ClientSession,
        slug: str = "",
        company: str = "",
        fetch_descriptions: bool = True,
        **kwargs: object,
    ) -> List[JobResult]:
        """Fetch jobs from a single Ashby company board.

        Args:
            session: aiohttp client session.
            slug: Company slug on Ashby (e.g. "vercel").
            company: Human-readable company name for display.
            fetch_descriptions: Whether to fetch full posting details (slower).

        Returns:
            List of JobResult objects.
        """
        if not slug:
            log.warning("AshbyFetcher.fetch called without slug")
            return []

        company_name = company or slug.title()

        # Step 1: List all postings
        postings = await self._list_postings(session, slug)
        if not postings:
            log.debug("Ashby %s: no postings found", slug)
            return []

        results: List[JobResult] = []

        if fetch_descriptions:
            # Step 2: Fetch details for each posting with rate limiting
            for i, posting in enumerate(postings):
                posting_id = posting.get("id", "")
                if not posting_id:
                    continue

                detail = await self._fetch_posting_detail(session, slug, posting_id)

                if detail:
                    title = detail.get("title", posting.get("title", ""))
                    location = detail.get(
                        "locationName", posting.get("locationName", "")
                    )
                    employment_type = detail.get(
                        "employmentType", posting.get("employmentType", "")
                    )
                    desc_html = detail.get("descriptionHtml", "")
                    published_date = detail.get("publishedDate", "")
                    description = strip_html(desc_html) if desc_html else ""
                else:
                    # Fall back to brief data
                    title = posting.get("title", "")
                    location = posting.get("locationName", "")
                    employment_type = posting.get("employmentType", "")
                    description = ""
                    published_date = ""

                job_url = f"https://jobs.ashbyhq.com/{slug}/{posting_id}"

                results.append(
                    JobResult(
                        title=title,
                        company=company_name,
                        url=job_url,
                        location=location or "",
                        description=description,
                        source="ashby",
                        posted_at=published_date or "",
                        employment_type=employment_type or "",
                        job_key=f"ashby|{slug}|{posting_id}",
                    )
                )

                # Rate limit between detail fetches
                if i < len(postings) - 1:
                    await asyncio.sleep(0.15)
        else:
            # Brief mode: no descriptions
            for posting in postings:
                posting_id = posting.get("id", "")
                title = posting.get("title", "")
                location = posting.get("locationName", "")
                employment_type = posting.get("employmentType", "")
                job_url = f"https://jobs.ashbyhq.com/{slug}/{posting_id}"

                results.append(
                    JobResult(
                        title=title,
                        company=company_name,
                        url=job_url,
                        location=location or "",
                        description="",
                        source="ashby",
                        posted_at="",
                        employment_type=employment_type or "",
                        job_key=f"ashby|{slug}|{posting_id}" if posting_id else "",
                    )
                )

        log.info("Ashby %s: fetched %d jobs", slug, len(results))
        return results

    async def fetch_all(
        self,
        session: aiohttp.ClientSession,
        companies: Optional[List[dict]] = None,
    ) -> List[JobResult]:
        """Fetch jobs from all Ashby companies in the registry.

        Args:
            session: aiohttp client session.
            companies: Optional list of company dicts. Defaults to registry.

        Returns:
            Combined list of JobResult objects.
        """
        if companies is None:
            companies = get_companies_by_ats("ashby")

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
                log.warning("Ashby fetch_all failed for %s: %s", slug, exc)

            # Rate limit: 0.3s between companies
            if i < len(companies) - 1:
                await asyncio.sleep(0.3)

        log.info(
            "Ashby fetch_all: %d jobs from %d companies",
            len(all_results),
            len(companies),
        )
        return all_results
