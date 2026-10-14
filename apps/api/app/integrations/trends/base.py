from typing import Protocol, List, Optional
from datetime import datetime
from ...domain.models.trend import TrendSnapshot

class TrendProviderError(Exception):
    """Base exception for trend providers."""
    pass

class TrendProviderTimeoutError(TrendProviderError):
    """Raised when request times out."""
    pass

class TrendProviderRateLimitError(TrendProviderError):
    """Raised when rate limit is exceeded."""
    pass

class TrendProviderAuthError(TrendProviderError):
    """Raised when authentication fails."""
    pass

class TrendProviderResponseError(TrendProviderError):
    """Raised when response is malformed or invalid."""
    pass

class TrendProvider(Protocol):
    """
    Protocol defining the Trend Provider interface.
    Preserves section 8 of the Trend Contenter Master Specification.
    """
    async def get_trending_topics(
        self,
        region: str = "IN",
        category: Optional[str] = None,
        hours: int = 4,
        only_active: bool = True,
        hl: str = "en",
        no_cache: bool = False
    ) -> List[TrendSnapshot]:
        """Fetch real-time trending topics for a given region."""
        ...

    async def get_topic_history(
        self,
        topic: str,
        region: str,
        start: datetime,
        end: datetime
    ) -> List[TrendSnapshot]:
        """Fetch historical snapshots for a given topic."""
        ...

    async def get_related_topics(
        self,
        topic: str,
        region: str
    ) -> List[str]:
        """Fetch related topics / breakdown queries for a topic."""
        ...
