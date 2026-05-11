from __future__ import annotations

import html as html_mod
import logging
import re
from abc import ABC, abstractmethod
from typing import Optional

import aiohttp

log = logging.getLogger(__name__)


def strip_html(html: str) -> str:
    """Convert HTML to plain text."""
    text = re.sub(r"<br\s*/?>", "\n", html or "")
    text = re.sub(r"</?p[^>]*>", "\n", text)
    text = re.sub(r"</?div[^>]*>", "\n", text)
    text = re.sub(r"</?h[1-6][^>]*>", "\n", text)
    text = re.sub(r"<li[^>]*>", "\n- ", text)
    text = re.sub(r"<[^>]+>", "", text)
    text = html_mod.unescape(text)
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


class JobResult:
    """Standardized job result from any source."""

    def __init__(
        self,
        title: str,
        company: str,
        url: str,
        location: str = "",
        description: str = "",
        source: str = "",
        posted_at: str = "",
        employment_type: str = "",
        job_key: str = "",
    ) -> None:
        self.title = title
        self.company = company
        self.url = url
        self.location = location
        self.description = description
        self.source = source
        self.posted_at = posted_at
        self.employment_type = employment_type
        self.job_key = job_key or f"{company.lower().strip()}|{title.lower().strip()}"

    def to_dict(self) -> dict:
        return {
            "title": self.title,
            "company": self.company,
            "url": self.url,
            "location": self.location,
            "description": self.description,
            "source": self.source,
            "posted_at": self.posted_at,
            "employment_type": self.employment_type,
            "job_key": self.job_key,
        }

    def __repr__(self) -> str:
        return f"JobResult(title={self.title!r}, company={self.company!r}, source={self.source!r})"


class BaseFetcher(ABC):
    """Abstract base class for all job source fetchers."""

    name: str = "base"

    @abstractmethod
    async def fetch(
        self, session: aiohttp.ClientSession, **kwargs: object
    ) -> list[JobResult]:
        ...
