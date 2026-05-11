from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import List

log = logging.getLogger(__name__)

REGISTRY_PATH = Path(__file__).parent / "companies.json"


def load_companies() -> List[dict]:
    """Load company registry. Returns list of {name, slug, ats} dicts."""
    try:
        with open(REGISTRY_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
        return data.get("companies", [])
    except FileNotFoundError:
        log.warning("Company registry not found at %s", REGISTRY_PATH)
        return []
    except json.JSONDecodeError as exc:
        log.error("Failed to parse company registry: %s", exc)
        return []


def get_companies_by_ats(ats: str) -> List[dict]:
    """Filter companies by ATS type (greenhouse, lever, ashby)."""
    companies = load_companies()
    return [c for c in companies if c.get("ats", "").lower() == ats.lower()]
