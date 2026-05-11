from __future__ import annotations

import asyncio
import logging
import re
from datetime import datetime, timedelta, timezone
from typing import List, Optional

import aiohttp

from .base import BaseFetcher, JobResult

log = logging.getLogger(__name__)

REPOS = [
    {"repo": "SimplifyJobs/Summer2026-Internships", "branch": "dev"},
    {"repo": "pittcsc/Summer2026-Internships", "branch": "dev"},
    {"repo": "SimplifyJobs/New-Grad-Positions", "branch": "dev"},
    {"repo": "ReaVNaiL/New-Grad-2025", "branch": "main"},
    {"repo": "coderQuad/New-Grad-Positions-2024", "branch": "main"},
    {"repo": "Ouckah/Summer2025-Internships", "branch": "main"},
    {"repo": "bsovs/Fall2025-Internships", "branch": "main"},
]

# Month name to number mapping
MONTH_MAP = {
    "jan": 1, "january": 1,
    "feb": 2, "february": 2,
    "mar": 3, "march": 3,
    "apr": 4, "april": 4,
    "may": 5,
    "jun": 6, "june": 6,
    "jul": 7, "july": 7,
    "aug": 8, "august": 8,
    "sep": 9, "september": 9, "sept": 9,
    "oct": 10, "october": 10,
    "nov": 11, "november": 11,
    "dec": 12, "december": 12,
}


def _parse_date_str(date_str: str) -> Optional[datetime]:
    """Try to parse various date formats found in GitHub intern repos.

    Common formats:
    - "May 10" / "May 10, 2026"
    - "2026-05-10"
    - "05/10" / "05/10/2026"
    """
    date_str = date_str.strip()
    if not date_str:
        return None

    now = datetime.now(timezone.utc)
    current_year = now.year

    # ISO format: 2026-05-10
    iso_match = re.match(r"(\d{4})-(\d{1,2})-(\d{1,2})", date_str)
    if iso_match:
        try:
            return datetime(
                int(iso_match.group(1)),
                int(iso_match.group(2)),
                int(iso_match.group(3)),
                tzinfo=timezone.utc,
            )
        except ValueError:
            pass

    # "May 10" or "May 10, 2026"
    month_day_match = re.match(
        r"(\w+)\s+(\d{1,2})(?:,?\s+(\d{4}))?", date_str, re.IGNORECASE
    )
    if month_day_match:
        month_name = month_day_match.group(1).lower()
        day = int(month_day_match.group(2))
        year = int(month_day_match.group(3)) if month_day_match.group(3) else current_year
        month = MONTH_MAP.get(month_name)
        if month:
            try:
                return datetime(year, month, day, tzinfo=timezone.utc)
            except ValueError:
                pass

    # "05/10" or "05/10/2026"
    slash_match = re.match(r"(\d{1,2})/(\d{1,2})(?:/(\d{2,4}))?", date_str)
    if slash_match:
        month = int(slash_match.group(1))
        day = int(slash_match.group(2))
        year_str = slash_match.group(3)
        if year_str:
            year = int(year_str)
            if year < 100:
                year += 2000
        else:
            year = current_year
        try:
            return datetime(year, month, day, tzinfo=timezone.utc)
        except ValueError:
            pass

    return None


def _parse_markdown_table(readme: str) -> List[dict]:
    """Parse a markdown table from the README.

    Expected columns (order may vary):
    Company | Role | Location | Link | Date
    """
    lines = readme.split("\n")
    results: List[dict] = []

    # Find table header
    header_idx = -1
    headers: List[str] = []
    for i, line in enumerate(lines):
        stripped = line.strip()
        if "|" in stripped and any(
            kw in stripped.lower()
            for kw in ["company", "role", "name"]
        ):
            parts = [p.strip() for p in stripped.split("|")]
            parts = [p for p in parts if p]
            if len(parts) >= 3:
                headers = [h.lower() for h in parts]
                header_idx = i
                break

    if header_idx < 0:
        return results

    # Map column indices
    col_map: dict = {}
    for j, h in enumerate(headers):
        if "company" in h or "name" in h:
            col_map["company"] = j
        elif "role" in h or "title" in h or "position" in h:
            col_map["role"] = j
        elif "location" in h:
            col_map["location"] = j
        elif "link" in h or "application" in h or "apply" in h or "url" in h:
            col_map["link"] = j
        elif "date" in h or "added" in h or "posted" in h:
            col_map["date"] = j

    if "company" not in col_map:
        return results

    # Skip separator line (e.g. |---|---|---|)
    start = header_idx + 1
    if start < len(lines) and re.match(r"\s*\|[\s\-:|]+\|", lines[start]):
        start += 1

    # Parse data rows
    for line in lines[start:]:
        stripped = line.strip()
        if not stripped or not "|" in stripped:
            continue
        if stripped.startswith("#") or stripped.startswith("<!--"):
            continue

        parts = [p.strip() for p in stripped.split("|")]
        parts = [p for p in parts if p != ""]

        if len(parts) < len(headers):
            continue

        try:
            company_raw = parts[col_map["company"]] if "company" in col_map else ""
            role_raw = parts[col_map.get("role", -1)] if "role" in col_map and col_map["role"] < len(parts) else ""
            location = parts[col_map.get("location", -1)] if "location" in col_map and col_map["location"] < len(parts) else ""
            link_raw = parts[col_map.get("link", -1)] if "link" in col_map and col_map["link"] < len(parts) else ""
            date_raw = parts[col_map.get("date", -1)] if "date" in col_map and col_map["date"] < len(parts) else ""

            # Extract text from markdown links: [text](url) or **text**
            company_link_match = re.search(r"\[([^\]]+)\]\(([^)]+)\)", company_raw)
            if company_link_match:
                company = company_link_match.group(1).strip()
            else:
                company = re.sub(r"\*+", "", company_raw).strip()

            # Extract role text
            role = re.sub(r"\*+", "", role_raw).strip()
            role_link_match = re.search(r"\[([^\]]+)\]", role_raw)
            if role_link_match:
                role = role_link_match.group(1).strip()

            # Extract URL from link column or company column
            url = ""
            link_match = re.search(r"\[([^\]]*)\]\(([^)]+)\)", link_raw)
            if link_match:
                url = link_match.group(2).strip()
            elif company_link_match:
                url = company_link_match.group(2).strip()

            # Also check role column for links
            if not url:
                role_url_match = re.search(r"\[([^\]]*)\]\(([^)]+)\)", role_raw)
                if role_url_match:
                    url = role_url_match.group(2).strip()

            # Clean location
            location = re.sub(r"\*+", "", location).strip()

            # Skip closed/unavailable entries
            if any(
                x in (company + role + link_raw).lower()
                for x in ["closed", "🔒", "n/a", "no longer"]
            ):
                continue

            if company and (role or url):
                results.append(
                    {
                        "company": company,
                        "title": role or "Software Engineering Intern",
                        "location": location,
                        "url": url,
                        "date": date_raw.strip(),
                    }
                )
        except (IndexError, KeyError):
            continue

    return results


class GitHubRepoFetcher(BaseFetcher):
    """Fetcher for GitHub-hosted internship/new-grad job repositories."""

    name = "github"
    RAW_URL = "https://raw.githubusercontent.com/{repo}/{branch}/README.md"

    async def fetch(
        self,
        session: aiohttp.ClientSession,
        repo: str = "",
        branch: str = "dev",
        days: int = 30,
        **kwargs: object,
    ) -> List[JobResult]:
        """Fetch jobs from a single GitHub repository.

        Args:
            session: aiohttp client session.
            repo: Repository in "owner/repo" format.
            branch: Branch name (e.g. "dev", "main").
            days: Only include jobs posted within this many days.

        Returns:
            List of JobResult objects.
        """
        if not repo:
            log.warning("GitHubRepoFetcher.fetch called without repo")
            return []

        url = self.RAW_URL.format(repo=repo, branch=branch)

        try:
            async with session.get(
                url, timeout=aiohttp.ClientTimeout(total=30)
            ) as resp:
                if resp.status == 404:
                    log.debug("GitHub repo not found: %s (branch: %s)", repo, branch)
                    return []
                if resp.status != 200:
                    log.warning(
                        "GitHub %s returned status %d", repo, resp.status
                    )
                    return []
                readme = await resp.text()
        except asyncio.TimeoutError:
            log.warning("GitHub %s request timed out", repo)
            return []
        except aiohttp.ClientError as exc:
            log.warning("GitHub %s request failed: %s", repo, exc)
            return []
        except Exception as exc:
            log.warning("GitHub %s unexpected error: %s", repo, exc)
            return []

        entries = _parse_markdown_table(readme)
        cutoff = datetime.now(timezone.utc) - timedelta(days=days)
        results: List[JobResult] = []
        repo_short = repo.split("/")[-1] if "/" in repo else repo

        for entry in entries:
            date_str = entry.get("date", "")
            parsed_date = _parse_date_str(date_str)

            # If we have a date, check if it's recent enough
            if parsed_date and parsed_date < cutoff:
                continue

            title = entry.get("title", "")
            company = entry.get("company", "")
            entry_url = entry.get("url", "")
            location = entry.get("location", "")

            posted_at = ""
            if parsed_date:
                posted_at = parsed_date.isoformat()

            results.append(
                JobResult(
                    title=title,
                    company=company,
                    url=entry_url,
                    location=location,
                    description="",
                    source=f"github:{repo_short}",
                    posted_at=posted_at,
                    job_key=f"gh-repo|{company.lower().strip()}|{title.lower().strip()}",
                )
            )

        log.info("GitHub %s: parsed %d recent jobs (from %d total entries)",
                 repo, len(results), len(entries))
        return results

    async def fetch_all(
        self,
        session: aiohttp.ClientSession,
        repos: Optional[List[dict]] = None,
        days: int = 30,
        **kwargs: object,
    ) -> List[JobResult]:
        """Fetch jobs from all configured GitHub repositories.

        Args:
            session: aiohttp client session.
            repos: Optional list of repo dicts with "repo" and "branch" keys.
            days: Only include jobs posted within this many days.

        Returns:
            Combined list of JobResult objects.
        """
        if repos is None:
            repos = REPOS

        all_results: List[JobResult] = []
        seen_keys: set = set()

        for i, repo_cfg in enumerate(repos):
            repo = repo_cfg.get("repo", "")
            branch = repo_cfg.get("branch", "dev")
            if not repo:
                continue

            try:
                jobs = await self.fetch(
                    session, repo=repo, branch=branch, days=days
                )
                for job in jobs:
                    if job.job_key not in seen_keys:
                        seen_keys.add(job.job_key)
                        all_results.append(job)
            except Exception as exc:
                log.warning("GitHub fetch_all failed for %s: %s", repo, exc)

            # Small delay between repos
            if i < len(repos) - 1:
                await asyncio.sleep(0.3)

        log.info(
            "GitHub fetch_all: %d unique jobs from %d repos",
            len(all_results),
            len(repos),
        )
        return all_results
