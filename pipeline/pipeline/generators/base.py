from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any, Dict


class BaseGenerator(ABC):
    """Abstract base for all document generators.

    Subclasses must set a ``name`` class attribute and implement
    :meth:`generate`.
    """

    name: str = "base"

    @abstractmethod
    async def generate(
        self,
        api_key: str,
        job: Dict[str, Any],
        user_vault: str,
        **kwargs: Any,
    ) -> Dict[str, Any]:
        """Generate a document for the given job.

        Args:
            api_key: User's Gemini API key.
            job: Job dict with ``title``, ``company``, ``location``,
                ``description``.
            user_vault: User's full career vault text.
            **kwargs: Generator-specific options (``role_category``,
                ``company_research``, ``connections``, ``existing_resume``,
                ``gemini_client``, ``model``).

        Returns:
            Dict containing the generated document content.  The exact
            keys depend on the generator type.
        """
