from __future__ import annotations

import asyncio
import logging
import random
import re
from typing import List, Optional

import aiohttp

from .base import BaseFetcher, JobResult

log = logging.getLogger(__name__)


class LinkedInGuestFetcher(BaseFetcher):
    """Fetcher for LinkedIn guest job search API (no auth required).

    Uses the public guest API endpoints that return HTML job cards.
    Requires BeautifulSoup for HTML parsing.
    """

    name = "linkedin"
    SEARCH_URL = (
        "https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search"
    )
    DETAIL_URL = (
        "https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/{job_id}"
    )

    USER_AGENTS = [
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    ]

    DEFAULT_QUERIES = [
        "software engineer intern",
        "sde intern",
        "software developer intern",
    ]

    def _get_headers(self) -> dict:
        """Return headers with a random user agent."""
        return {
            "User-Agent": random.choice(self.USER_AGENTS),
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.5",
            "Accept-Encoding": "gzip, deflate",
            "Connection": "keep-alive",
        }

    def _parse_job_cards(self, html: str) -> List[dict]:
        """Parse job card HTML into structured data.

        Uses regex-based parsing as a lightweight alternative to BeautifulSoup.
        Falls back gracefully if BS4 is available.
        """
        cards: List[dict] = []

        try:
            from bs4 import BeautifulSoup

            soup = BeautifulSoup(html, "html.parser")
            job_cards = soup.find_all("li")

            for card in job_cards:
                try:
                    # Title and link
                    title_el = card.find("h3", class_=re.compile(r"base-search-card__title"))
                    title = title_el.get_text(strip=True) if title_el else ""

                    link_el = card.find("a", class_=re.compile(r"base-card__full-link"))
                    link = link_el.get("href", "") if link_el else ""

                    # Company
                    company_el = card.find("h4", class_=re.compile(r"base-search-card__subtitle"))
                    company = company_el.get_text(strip=True) if company_el else ""

                    # Location
                    location_el = card.find("span", class_=re.compile(r"job-search-card__location"))
                    location = location_el.get_text(strip=True) if location_el else ""

                    # Date
                    date_el = card.find("time", class_=re.compile(r"job-search-card__listdate"))
                    posted_at = ""
                    if date_el:
                        posted_at = date_el.get("datetime", "") or date_el.get_text(strip=True)

                    # Extract job ID from link
                    job_id = ""
                    if link:
                        id_match = re.search(r"-(\d+)\?", link)
                        if not id_match:
                            id_match = re.search(r"view/([^/?]+)", link)
                        if id_match:
                            job_id = id_match.group(1)

                    if title and (company or link):
                        cards.append(
                            {
                                "title": title,
                                "company": company,
                                "location": location,
                                "url": link.split("?")[0] if link else "",
                                "posted_at": posted_at,
                                "job_id": job_id,
                            }
                        )
                except Exception:
                    continue

        except ImportError:
            # Fallback: regex-based parsing (less reliable)
            log.debug("BeautifulSoup not available, using regex parsing")

            # Find job card blocks
            title_matches = re.findall(
                r'class="base-search-card__title[^"]*"[^>]*>([^<]+)<', html
            )
            company_matches = re.findall(
                r'class="base-search-card__subtitle[^"]*"[^>]*>\s*<a[^>]*>([^<]+)<',
                html,
            )
            location_matches = re.findall(
                r'class="job-search-card__location[^"]*"[^>]*>([^<]+)<', html
            )
            link_matches = re.findall(
                r'class="base-card__full-link[^"]*"\s+href="([^"]+)"', html
            )

            count = min(
                len(title_matches),
                len(link_matches),
            )
            for i in range(count):
                title = title_matches[i].strip() if i < len(title_matches) else ""
                company = (
                    company_matches[i].strip() if i < len(company_matches) else ""
                )
                location = (
                    location_matches[i].strip() if i < len(location_matches) else ""
                )
                link = link_matches[i].strip() if i < len(link_matches) else ""

                job_id = ""
                if link:
                    id_match = re.search(r"-(\d+)\?", link)
                    if not id_match:
                        id_match = re.search(r"-(\d+)$", link)
                    if id_match:
                        job_id = id_match.group(1)

                if title:
                    cards.append(
                        {
                            "title": title,
                            "company": company,
                            "location": location,
                            "url": link.split("?")[0] if link else "",
                            "posted_at": "",
                            "job_id": job_id,
                        }
                    )

        return cards

    async def fetch(
        self,
        session: aiohttp.ClientSession,
        queries: Optional[List[str]] = None,
        location: str = "United States",
        days: int = 7,
        max_results: int = 100,
        **kwargs: object,
    ) -> List[JobResult]:
        """Fetch jobs from LinkedIn guest search API.

        Args:
            session: aiohttp client session.
            queries: Search query strings. Defaults to intern-focused queries.
            location: Location filter string.
            days: Number of days to look back.
            max_results: Maximum total results across all queries.

        Returns:
            List of JobResult objects.
        """
        if queries is None:
            queries = self.DEFAULT_QUERIES

        time_filter = f"r{days * 86400}"  # LinkedIn time filter in seconds
        seen_ids: set = set()
        results: List[JobResult] = []

        for query in queries:
            if len(results) >= max_results:
                break

            start = 0
            consecutive_empty = 0

            while start < max_results and len(results) < max_results:
                params = {
                    "keywords": query,
                    "location": location,
                    "f_TPR": time_filter,
                    "f_E": "1,2,3",  # Entry level, Associate, Internship
                    "start": str(start),
                }

                try:
                    async with session.get(
                        self.SEARCH_URL,
                        params=params,
                        headers=self._get_headers(),
                        timeout=aiohttp.ClientTimeout(total=30),
                    ) as resp:
                        if resp.status == 429:
                            log.warning(
                                "LinkedIn rate limited, pausing for query=%s", query
                            )
                            await asyncio.sleep(10)
                            break
                        if resp.status != 200:
                            log.warning(
                                "LinkedIn search returned status %d for query=%s start=%d",
                                resp.status,
                                query,
                                start,
                            )
                            break
                        html = await resp.text()
                except asyncio.TimeoutError:
                    log.warning("LinkedIn search timed out for query=%s", query)
                    break
                except aiohttp.ClientError as exc:
                    log.warning(
                        "LinkedIn search failed for query=%s: %s", query, exc
                    )
                    break
                except Exception as exc:
                    log.warning(
                        "LinkedIn search unexpected error for query=%s: %s",
                        query,
                        exc,
                    )
                    break

                cards = self._parse_job_cards(html)
                if not cards:
                    consecutive_empty += 1
                    if consecutive_empty >= 2:
                        break
                    start += 25
                    await asyncio.sleep(2)
                    continue

                consecutive_empty = 0
                new_count = 0

                for card in cards:
                    job_id = card.get("job_id", "")
                    dedup_key = job_id or card.get("url", "")
                    if dedup_key and dedup_key in seen_ids:
                        continue
                    if dedup_key:
                        seen_ids.add(dedup_key)

                    new_count += 1
                    results.append(
                        JobResult(
                            title=card.get("title", ""),
                            company=card.get("company", ""),
                            url=card.get("url", ""),
                            location=card.get("location", ""),
                            description="",  # Guest API doesn't return descriptions in search
                            source="linkedin",
                            posted_at=card.get("posted_at", ""),
                            job_key=f"li|{job_id}" if job_id else "",
                        )
                    )

                    if len(results) >= max_results:
                        break

                if new_count == 0:
                    break

                start += 25

                # Rate limit: 2s between pagination requests
                await asyncio.sleep(2)

            # Rate limit between different queries
            await asyncio.sleep(3)

        log.info(
            "LinkedIn guest: fetched %d jobs from %d queries",
            len(results),
            len(queries),
        )
        return results

    async def fetch_detail(
        self,
        session: aiohttp.ClientSession,
        job_id: str,
    ) -> Optional[str]:
        """Fetch the description for a single LinkedIn job.

        Args:
            session: aiohttp client session.
            job_id: LinkedIn job ID.

        Returns:
            Job description text, or None on failure.
        """
        url = self.DETAIL_URL.format(job_id=job_id)

        try:
            async with session.get(
                url,
                headers=self._get_headers(),
                timeout=aiohttp.ClientTimeout(total=30),
            ) as resp:
                if resp.status != 200:
                    return None
                html = await resp.text()
        except Exception:
            return None

        # Extract description from detail page
        try:
            from bs4 import BeautifulSoup

            soup = BeautifulSoup(html, "html.parser")
            desc_el = soup.find(
                "div", class_=re.compile(r"description__text|show-more-less-html")
            )
            if desc_el:
                return desc_el.get_text(separator="\n", strip=True)
        except ImportError:
            # Regex fallback
            match = re.search(
                r'class="(?:description__text|show-more-less-html__markup)[^"]*"[^>]*>(.*?)</(?:div|section)',
                html,
                re.DOTALL,
            )
            if match:
                from .base import strip_html

                return strip_html(match.group(1))

        return None
