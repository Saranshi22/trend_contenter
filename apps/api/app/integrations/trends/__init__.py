from typing import Optional
from .base import (
    TrendProvider,
    TrendProviderError,
    TrendProviderTimeoutError,
    TrendProviderRateLimitError,
    TrendProviderAuthError,
    TrendProviderResponseError
)
from .serpapi_provider import SerpApiTrendsProvider
from .mock_provider import MockTrendsProvider
from ...config import settings

def get_trend_provider(provider_type: Optional[str] = None) -> TrendProvider:
    """
    Factory function returning the configured TrendProvider.
    Uses TRENDS_PROVIDER setting ('serpapi' or 'mock').
    """
    provider = (provider_type or settings.TRENDS_PROVIDER or "mock").lower()
    if provider == "serpapi":
        return SerpApiTrendsProvider(
            api_key=settings.SERPAPI_API_KEY,
            base_url=settings.SERPAPI_BASE_URL
        )
    return MockTrendsProvider()

__all__ = [
    "TrendProvider",
    "SerpApiTrendsProvider",
    "MockTrendsProvider",
    "get_trend_provider",
    "TrendProviderError",
    "TrendProviderTimeoutError",
    "TrendProviderRateLimitError",
    "TrendProviderAuthError",
    "TrendProviderResponseError"
]
