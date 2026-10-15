from typing import List, Optional
from datetime import datetime, timezone
import uuid

from ...domain.models.trend import TrendSnapshot
from .base import TrendProvider

class MockTrendsProvider(TrendProvider):
    """
    Mock implementation of TrendProvider for automated tests and offline runs.
    """
    def __init__(self, sample_trends: Optional[List[TrendSnapshot]] = None):
        if sample_trends is not None:
            self._trends = sample_trends
        else:
            now = datetime.now(timezone.utc)
            self._trends = [
                TrendSnapshot(
                    trend_id="tr_in_nepal_floods",
                    topic="nepal floods flash floods",
                    canonical_topic="nepal floods flash floods",
                    region="IN",
                    category="Climate",
                    categories=[{"id": 20, "name": "Climate"}],
                    observed_at=now,
                    retrieved_at=now,
                    source="serpapi_google_trends",
                    source_provider="serpapi_google_trends",
                    active=True,
                    search_volume=5000,
                    increase_percentage=700.0,
                    trend_breakdown=["kathmandu flood", "bagmati river", "nepal weather"],
                    source_links={"trends": "https://trends.google.com", "news": "https://news.google.com"},
                    interest_value=5000.0,
                    growth_pct=700.0,
                    novelty_score=0.9,
                    qualification_score=0.85,
                    status="qualified"
                ),
                TrendSnapshot(
                    trend_id="tr_in_ai_tutors",
                    topic="AI Tutors and Online Learning",
                    canonical_topic="ai tutors and online learning",
                    region="IN",
                    category="Education",
                    categories=[{"id": 14, "name": "Education"}],
                    observed_at=now,
                    retrieved_at=now,
                    source="serpapi_google_trends",
                    source_provider="serpapi_google_trends",
                    active=True,
                    search_volume=20000,
                    increase_percentage=350.0,
                    trend_breakdown=["khanmigo", "chatgpt tutor", "math ai tutor"],
                    source_links={"trends": "https://trends.google.com"},
                    interest_value=20000.0,
                    growth_pct=350.0,
                    novelty_score=0.8,
                    qualification_score=0.78,
                    status="qualified"
                ),
                TrendSnapshot(
                    trend_id="tr_in_small_trend",
                    topic="Local Gardening Tips",
                    canonical_topic="local gardening tips",
                    region="IN",
                    category="Home & Garden",
                    categories=[{"id": 5, "name": "Home & Garden"}],
                    observed_at=now,
                    retrieved_at=now,
                    source="serpapi_google_trends",
                    source_provider="serpapi_google_trends",
                    active=False,
                    search_volume=500,
                    increase_percentage=20.0,
                    trend_breakdown=[],
                    source_links={},
                    interest_value=500.0,
                    growth_pct=20.0,
                    novelty_score=0.2,
                    qualification_score=0.35,
                    status="candidate"
                )
            ]

    async def get_trending_topics(
        self,
        region: str = "IN",
        category: Optional[str] = None,
        hours: int = 4,
        only_active: bool = True,
        hl: str = "en",
        no_cache: bool = False
    ) -> List[TrendSnapshot]:
        results = [t for t in self._trends if t.region == region.upper()]
        if only_active:
            results = [t for t in results if t.active]
        if category:
            results = [t for t in results if t.category and category.lower() in t.category.lower()]
        return results

    async def get_topic_history(
        self,
        topic: str,
        region: str,
        start: datetime,
        end: datetime
    ) -> List[TrendSnapshot]:
        return [t for t in self._trends if t.topic.lower() == topic.lower()]

    async def get_related_topics(
        self,
        topic: str,
        region: str
    ) -> List[str]:
        for t in self._trends:
            if t.topic.lower() == topic.lower():
                return t.trend_breakdown
        return []
