import asyncio
import logging
from datetime import datetime, timezone
from typing import List, Optional, Dict, Any
import httpx
import uuid
import re

from ...domain.models.trend import TrendSnapshot
from ...config import settings
from .base import (
    TrendProvider,
    TrendProviderError,
    TrendProviderTimeoutError,
    TrendProviderRateLimitError,
    TrendProviderAuthError,
    TrendProviderResponseError
)

logger = logging.getLogger(__name__)

class SerpApiTrendsProvider(TrendProvider):
    """
    Implements TrendProvider using SerpApi Google Trends Trending Now API.
    GET https://serpapi.com/search.json?engine=google_trends_trending_now
    """
    def __init__(
        self,
        api_key: Optional[str] = None,
        base_url: Optional[str] = None,
        timeout_seconds: float = 15.0,
        connect_timeout_seconds: float = 5.0,
        max_retries: int = 3,
        backoff_factor: float = 0.5,
        client: Optional[httpx.AsyncClient] = None
    ):
        self.api_key = (api_key or settings.SERPAPI_API_KEY or "").strip()
        self.base_url = (base_url or settings.SERPAPI_BASE_URL or "https://serpapi.com/search.json").strip()
        self.timeout = httpx.Timeout(timeout_seconds, connect=connect_timeout_seconds)
        self.max_retries = max_retries
        self.backoff_factor = backoff_factor
        self._external_client = client

    def _get_client(self) -> httpx.AsyncClient:
        if self._external_client is not None:
            return self._external_client
        return httpx.AsyncClient(timeout=self.timeout)

    @staticmethod
    def _normalize_canonical_topic(query: str) -> str:
        """
        Produce a canonical representation of a topic:
        lowercase, stripped of punctuation and extra whitespace.
        """
        if not query:
            return ""
        cleaned = re.sub(r"[^\w\s]", " ", query.lower())
        return " ".join(cleaned.split())

    @staticmethod
    def _parse_timestamp(ts: Any) -> Optional[datetime]:
        """Safely parse unix timestamp into UTC datetime."""
        if ts is None:
            return None
        try:
            # Check if it's already a datetime
            if isinstance(ts, datetime):
                return ts
            # If numeric unix timestamp (seconds)
            ts_float = float(ts)
            # If timestamp is in milliseconds (> 10^11)
            if ts_float > 1e11:
                ts_float = ts_float / 1000.0
            return datetime.fromtimestamp(ts_float, tz=timezone.utc)
        except (ValueError, TypeError, OverflowError):
            return None

    def normalize_trending_search(
        self,
        entry: Dict[str, Any],
        region: str,
        retrieved_at: datetime
    ) -> TrendSnapshot:
        """
        Map a single SerpApi trending_searches entry into the project's TrendSnapshot model.
        Preserves all provider-reported fields without fabricating missing metrics.
        """
        query = str(entry.get("query") or "").strip()
        canonical_topic = self._normalize_canonical_topic(query)
        
        # Unique deterministic trend ID based on query and region, or random uuid fallback
        safe_query_slug = re.sub(r"\W+", "_", canonical_topic)[:40] or uuid.uuid4().hex[:8]
        trend_id = f"tr_{region.lower()}_{safe_query_slug}"

        # Timestamps
        start_dt = self._parse_timestamp(entry.get("start_timestamp"))
        end_dt = self._parse_timestamp(entry.get("end_timestamp"))
        observed_dt = start_dt or retrieved_at

        # Active status
        active_val = entry.get("active")
        active = bool(active_val) if active_val is not None else True

        # Metrics (do not fabricate missing values)
        search_vol_raw = entry.get("search_volume")
        search_volume: Optional[int] = None
        if search_vol_raw is not None:
            try:
                search_volume = int(search_vol_raw)
            except (ValueError, TypeError):
                search_volume = None

        increase_pct_raw = entry.get("increase_percentage")
        increase_percentage: Optional[float] = None
        if increase_pct_raw is not None:
            try:
                increase_percentage = float(increase_pct_raw)
            except (ValueError, TypeError):
                increase_percentage = None

        # Categories
        categories_raw = entry.get("categories")
        categories: List[Dict[str, Any]] = []
        primary_category: Optional[str] = None

        if isinstance(categories_raw, list):
            for cat in categories_raw:
                if isinstance(cat, dict):
                    categories.append({
                        "id": cat.get("id"),
                        "name": str(cat.get("name") or "")
                    })
                    if not primary_category and cat.get("name"):
                        primary_category = str(cat.get("name"))
                elif isinstance(cat, str):
                    categories.append({"name": cat})
                    if not primary_category:
                        primary_category = cat
        elif isinstance(categories_raw, str):
            primary_category = categories_raw
            categories.append({"name": categories_raw})

        # Related terms in trend_breakdown
        breakdown_raw = entry.get("trend_breakdown")
        trend_breakdown: List[str] = []
        if isinstance(breakdown_raw, list):
            trend_breakdown = [str(term).strip() for term in breakdown_raw if term]

        # Source links
        source_links: Dict[str, str] = {}
        if entry.get("serpapi_google_trends_link"):
            source_links["trends"] = str(entry["serpapi_google_trends_link"])
        if entry.get("serpapi_news_link"):
            source_links["news"] = str(entry["serpapi_news_link"])

        return TrendSnapshot(
            trend_id=trend_id,
            topic=query,
            canonical_topic=canonical_topic,
            region=region.upper(),
            category=primary_category,
            categories=categories,
            observed_at=observed_dt,
            retrieved_at=retrieved_at,
            source="serpapi_google_trends",
            source_provider="serpapi_google_trends",
            active=active,
            start_timestamp=start_dt,
            end_timestamp=end_dt,
            search_volume=search_volume,
            increase_percentage=increase_percentage,
            trend_breakdown=trend_breakdown,
            source_links=source_links,
            interest_value=float(search_volume) if search_volume is not None else None,
            growth_pct=increase_percentage,
            novelty_score=0.0,
            qualification_score=0.0,
            status="candidate",
            raw_data=entry
        )

    async def get_trending_topics(
        self,
        region: str = "IN",
        category: Optional[str] = None,
        hours: int = 4,
        only_active: bool = True,
        hl: str = "en",
        no_cache: bool = False
    ) -> List[TrendSnapshot]:
        """
        Fetches trending searches from SerpApi with bounded retries,
        validates the response, and normalizes into TrendSnapshot models.
        """
        if not self.api_key:
            raise TrendProviderAuthError("SERPAPI_API_KEY is not configured or is empty.")

        params: Dict[str, Any] = {
            "engine": "google_trends_trending_now",
            "geo": region.upper(),
            "hours": str(hours),
            "only_active": "true" if only_active else "false",
            "hl": hl,
            "api_key": self.api_key
        }

        # SerpApi cache behavior: only pass no_cache if explicitly asked to force fresh fetch
        if no_cache:
            params["no_cache"] = "true"

        retrieved_at = datetime.now(timezone.utc)
        client = self._get_client()
        should_close_client = (self._external_client is None)

        last_exception: Optional[Exception] = None

        try:
            for attempt in range(1, self.max_retries + 1):
                try:
                    logger.info(
                        f"Fetching SerpApi trending searches (attempt {attempt}/{self.max_retries}) "
                        f"for geo={region}, hours={hours}, only_active={only_active}"
                    )
                    response = await client.get(self.base_url, params=params)

                    if response.status_code == 200:
                        try:
                            data = response.json()
                        except Exception as e:
                            raise TrendProviderResponseError(f"Malformed JSON response from SerpApi: {e}")

                        # Check for API-level errors
                        if "error" in data:
                            error_msg = str(data["error"])
                            if "Invalid API key" in error_msg or "Unauthorized" in error_msg:
                                raise TrendProviderAuthError(f"SerpApi Authentication Error: {error_msg}")
                            raise TrendProviderError(f"SerpApi Error: {error_msg}")

                        trending_searches = data.get("trending_searches", [])
                        if not isinstance(trending_searches, list):
                            raise TrendProviderResponseError(
                                f"Expected 'trending_searches' to be a list, got {type(trending_searches).__name__}"
                            )

                        results: List[TrendSnapshot] = []
                        for entry in trending_searches:
                            if not isinstance(entry, dict):
                                continue
                            try:
                                snapshot = self.normalize_trending_search(entry, region, retrieved_at)
                                # Filter by category if requested
                                if category:
                                    cat_match = False
                                    if snapshot.category and category.lower() in snapshot.category.lower():
                                        cat_match = True
                                    for c in snapshot.categories:
                                        if category.lower() in c.get("name", "").lower():
                                            cat_match = True
                                    if not cat_match:
                                        continue
                                results.append(snapshot)
                            except Exception as parse_err:
                                logger.warning(f"Failed to normalize trending search entry: {parse_err}")

                        logger.info(f"Successfully retrieved and normalized {len(results)} trending topics from SerpApi.")
                        return results

                    elif response.status_code in (401, 403):
                        raise TrendProviderAuthError(f"SerpApi HTTP {response.status_code}: Invalid or unauthorized API key.")
                    elif response.status_code == 429:
                        raise TrendProviderRateLimitError("SerpApi HTTP 429: Rate limit exceeded or monthly quota exhausted.")
                    elif response.status_code >= 500:
                        # Transient server error on SerpApi side, retry with backoff
                        logger.warning(f"SerpApi server error {response.status_code} on attempt {attempt}. Retrying...")
                        last_exception = TrendProviderError(f"SerpApi HTTP {response.status_code}")
                    else:
                        raise TrendProviderError(f"SerpApi HTTP {response.status_code}: {response.text[:200]}")

                except httpx.TimeoutException as te:
                    logger.warning(f"SerpApi request timed out on attempt {attempt}: {te}")
                    last_exception = TrendProviderTimeoutError(f"SerpApi request timed out: {te}")
                except (httpx.ConnectError, httpx.NetworkError) as ne:
                    logger.warning(f"SerpApi network error on attempt {attempt}: {ne}")
                    last_exception = TrendProviderError(f"SerpApi network error: {ne}")

                # If we have retries remaining, back off exponentially
                if attempt < self.max_retries:
                    sleep_time = self.backoff_factor * (2 ** (attempt - 1))
                    await asyncio.sleep(sleep_time)

            # If all retries failed
            if last_exception:
                raise last_exception
            raise TrendProviderError("SerpApi request failed after all retry attempts.")

        finally:
            if should_close_client:
                await client.aclose()

    async def get_topic_history(
        self,
        topic: str,
        region: str,
        start: datetime,
        end: datetime
    ) -> List[TrendSnapshot]:
        """
        SerpApi Google Trends Trending Now endpoint focuses on live trending topics.
        Historical snapshots are retrieved from our PostgreSQL persistence layer.
        """
        return []

    async def get_related_topics(
        self,
        topic: str,
        region: str
    ) -> List[str]:
        """
        Returns related breakdown terms if observed.
        """
        trends = await self.get_trending_topics(region=region)
        topic_lower = topic.lower().strip()
        for t in trends:
            if t.topic.lower().strip() == topic_lower or (t.canonical_topic and t.canonical_topic == self._normalize_canonical_topic(topic)):
                return t.trend_breakdown
        return []
