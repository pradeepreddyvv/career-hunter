from __future__ import annotations

import re
from typing import Dict, List, Set

ROLE_PATTERNS: Dict[str, List[str]] = {
    "SDE": [
        "software engineer",
        "software developer",
        "backend",
        "systems engineer",
        "platform engineer",
        "server engineer",
        "api engineer",
        "distributed systems",
    ],
    "ML/AI": [
        "machine learning",
        "ml engineer",
        "ai engineer",
        "data scientist",
        "deep learning",
        "nlp",
        "natural language",
        "computer vision",
        "applied scientist",
        "research scientist",
        "llm",
        "generative ai",
    ],
    "Fullstack": [
        "full stack",
        "fullstack",
        "full-stack",
    ],
    "Frontend": [
        "frontend",
        "front-end",
        "front end",
        "ui engineer",
        "ui developer",
        "react engineer",
        "angular",
        "web developer",
    ],
    "Data": [
        "data engineer",
        "data analyst",
        "analytics engineer",
        "etl",
        "data pipeline",
        "business intelligence",
        "bi engineer",
    ],
    "DevOps": [
        "devops",
        "sre",
        "site reliability",
        "infrastructure engineer",
        "cloud engineer",
        "platform engineer",
        "devsecops",
        "release engineer",
    ],
    "Security": [
        "security engineer",
        "cybersecurity",
        "infosec",
        "appsec",
        "application security",
        "information security",
        "security analyst",
    ],
    "Mobile": [
        "ios engineer",
        "ios developer",
        "android engineer",
        "android developer",
        "mobile engineer",
        "mobile developer",
        "flutter",
        "react native",
        "swift developer",
        "kotlin developer",
    ],
}

INTERN_KEYWORDS: Set[str] = {
    "intern",
    "internship",
    "co-op",
    "coop",
    "new grad",
    "entry level",
    "entry-level",
    "junior",
    "associate",
    "early career",
    "university",
    "student",
    "graduate",
    "apprentice",
    "apprenticeship",
}


def classify_role(title: str, description: str = "") -> str:
    """Classify a job into a role category based on title and description.

    The function checks both the title and description against known patterns.
    Title matches are weighted more heavily. Returns the best-matching role
    category or ``"SDE"`` as the default.

    Args:
        title: Job title string.
        description: Optional job description for additional signal.

    Returns:
        One of the keys from ``ROLE_PATTERNS`` (e.g. ``"SDE"``, ``"ML/AI"``).
    """
    title_lower = title.lower().strip()
    desc_lower = description.lower().strip() if description else ""

    scores: Dict[str, float] = {role: 0.0 for role in ROLE_PATTERNS}

    for role, patterns in ROLE_PATTERNS.items():
        for pattern in patterns:
            # Title matches are worth 3 points, description matches 1 point
            if pattern in title_lower:
                scores[role] += 3.0
            if desc_lower and pattern in desc_lower:
                scores[role] += 1.0

    # Fullstack should beat generic SDE if explicitly mentioned
    # (since "software engineer" is a substring of many fullstack titles)
    best_role = max(scores, key=lambda r: scores[r])
    best_score = scores[best_role]

    if best_score == 0:
        return "SDE"

    # If there's a tie between SDE and a more specific category, prefer specific
    if best_score == scores["SDE"] and best_role == "SDE":
        for role in ["Fullstack", "Frontend", "ML/AI", "Data", "DevOps", "Security", "Mobile"]:
            if scores[role] == best_score:
                return role

    return best_role


def is_intern_role(title: str) -> bool:
    """Check if a title indicates an intern or entry-level role.

    Args:
        title: Job title string.

    Returns:
        ``True`` if the title contains any intern/entry-level keyword.
    """
    title_lower = title.lower()
    # Use word boundary matching for short keywords to avoid false positives
    for keyword in INTERN_KEYWORDS:
        # Build a regex with word boundaries
        pattern = r"\b" + re.escape(keyword) + r"\b"
        if re.search(pattern, title_lower):
            return True
    return False


def classify_and_check(title: str, description: str = "") -> Dict[str, object]:
    """Convenience function returning both role and intern status.

    Args:
        title: Job title.
        description: Optional job description.

    Returns:
        Dict with ``role_category`` and ``is_intern`` keys.
    """
    return {
        "role_category": classify_role(title, description),
        "is_intern": is_intern_role(title),
    }
