import pytest
import httpx
from datetime import datetime, timezone
from unittest.mock import AsyncMock, patch

from apps.api.app.domain.models.trend import TrendSnapshot
from apps.api.app.integrations.trends.base import (
    TrendProviderTimeoutError,
    TrendProviderRateLimitError,
    TrendProviderAuthError,
    TrendProviderResponseError,
    TrendProviderError
)
from apps.api.app.integrations.trends.serpapi_provider import SerpApiTrendsProvider
from apps.api.app.integrations.trends.mock_provider import MockTrendsProvider
from apps.api.app.scoring.trend_qualification import calculate_qualification_score, qualify_trend_snapshot

# Sample SerpApi mock payload
SAMPLE_SERPAPI_RESPONSE = {
    "search_metadata": {
        "status": "Success",
        "total_time_taken": 0.45
    },
    "trending_searches": [
        {
            "query": "nepal floods flash floods",
            "start_timestamp": 1791786600,
            "active": True,
            "search_volume": 5000,
            "increase_percentage": 700.0,
            "categories": [{"id": 20, "name": "Climate"}],
            "trend_breakdown": ["kathmandu flood", "bagmati river"],
            "serpapi_google_trends_link": "https://serpapi.com/search.json?engine=google_trends&q=nepal+floods",
            "serpapi_news_link": "https://serpapi.com/search.json?engine=google_trends_news&token=abc"
        },
        {
            "query": "quiet luxury fashion trends",
            "start_timestamp": None,
            "active": False,
            "search_volume": None, # Missing metric
            "increase_percentage": 150.0,
            "categories": [{"id": 18, "name": "Style"}],
            "trend_breakdown": [],
            "serpapi_google_trends_link": "https://serpapi.com/search.json?engine=google_trends&q=quiet+luxury"
        }
    ]
}

@pytest.mark.asyncio
async def test_successful_retrieval():
    """Test successful retrieval and normalization of trending searches."""
    mock_client = AsyncMock(spec=httpx.AsyncClient)
    mock_response = httpx.Response(
        200,
        json=SAMPLE_SERPAPI_RESPONSE,
        request=httpx.Request("GET", "https://serpapi.com/search.json")
    )
    mock_client.get.return_value = mock_response

    provider = SerpApiTrendsProvider(
        api_key="test_key_123",
        client=mock_client
    )

    trends = await provider.get_trending_topics(region="IN")

    assert len(trends) == 2
    top = trends[0]
    assert top.topic == "nepal floods flash floods"
    assert top.canonical_topic == "nepal floods flash floods"
    assert top.region == "IN"
    assert top.category == "Climate"
    assert top.active is True
    assert top.search_volume == 5000
    assert top.increase_percentage == 700.0
    assert "bagmati river" in top.trend_breakdown
    assert top.source_links["trends"].startswith("https://serpapi.com")
    assert top.source_provider == "serpapi_google_trends"

@pytest.mark.asyncio
async def test_empty_results():
    """Test handling of empty trending searches."""
    mock_client = AsyncMock(spec=httpx.AsyncClient)
    mock_response = httpx.Response(
        200,
        json={"trending_searches": []},
        request=httpx.Request("GET", "https://serpapi.com/search.json")
    )
    mock_client.get.return_value = mock_response

    provider = SerpApiTrendsProvider(api_key="test_key_123", client=mock_client)
    trends = await provider.get_trending_topics(region="IN")

    assert trends == []

@pytest.mark.asyncio
async def test_malformed_json():
    """Test handling of malformed non-JSON response."""
    mock_client = AsyncMock(spec=httpx.AsyncClient)
    mock_response = httpx.Response(
        200,
        content=b"<!DOCTYPE html><html>Gateway Error</html>",
        headers={"content-type": "text/html"},
        request=httpx.Request("GET", "https://serpapi.com/search.json")
    )
    mock_client.get.return_value = mock_response

    provider = SerpApiTrendsProvider(api_key="test_key_123", client=mock_client)
    with pytest.raises(TrendProviderResponseError):
        await provider.get_trending_topics(region="IN")

@pytest.mark.asyncio
async def test_timeout_handling():
    """Test bounded retries and timeout error propagation."""
    mock_client = AsyncMock(spec=httpx.AsyncClient)
    mock_client.get.side_effect = httpx.TimeoutException("Connection timed out")

    provider = SerpApiTrendsProvider(
        api_key="test_key_123",
        max_retries=2,
        backoff_factor=0.01,
        client=mock_client
    )

    with pytest.raises(TrendProviderTimeoutError):
        await provider.get_trending_topics(region="IN")

    assert mock_client.get.call_count == 2

@pytest.mark.asyncio
async def test_auth_error():
    """Test HTTP 401 unauthorized error raises TrendProviderAuthError."""
    mock_client = AsyncMock(spec=httpx.AsyncClient)
    mock_response = httpx.Response(
        401,
        json={"error": "Invalid API key."},
        request=httpx.Request("GET", "https://serpapi.com/search.json")
    )
    mock_client.get.return_value = mock_response

    provider = SerpApiTrendsProvider(api_key="bad_key", client=mock_client)
    with pytest.raises(TrendProviderAuthError):
        await provider.get_trending_topics(region="IN")

@pytest.mark.asyncio
async def test_rate_limit_error():
    """Test HTTP 429 raises TrendProviderRateLimitError."""
    mock_client = AsyncMock(spec=httpx.AsyncClient)
    mock_response = httpx.Response(
        429,
        json={"error": "Your monthly search searches have been exhausted."},
        request=httpx.Request("GET", "https://serpapi.com/search.json")
    )
    mock_client.get.return_value = mock_response

    provider = SerpApiTrendsProvider(api_key="test_key", client=mock_client)
    with pytest.raises(TrendProviderRateLimitError):
        await provider.get_trending_topics(region="IN")

@pytest.mark.asyncio
async def test_normalization_no_fabrication():
    """Ensure missing fields in raw data are NOT fabricated."""
    provider = SerpApiTrendsProvider(api_key="dummy")
    now = datetime.now(timezone.utc)
    raw_incomplete = {
        "query": "Minimal Trend",
        # missing start_timestamp, search_volume, trend_breakdown
    }
    snapshot = provider.normalize_trending_search(raw_incomplete, "US", now)
    
    assert snapshot.topic == "Minimal Trend"
    assert snapshot.canonical_topic == "minimal trend"
    assert snapshot.search_volume is None
    assert snapshot.increase_percentage is None
    assert snapshot.start_timestamp is None
    assert snapshot.trend_breakdown == []
    assert snapshot.active is True  # safe default

def test_qualification_algorithm_scoring():
    """Test qualification algorithm calculation and threshold status."""
    now = datetime.now(timezone.utc)
    strong_trend = TrendSnapshot(
        trend_id="tr_1",
        topic="Breakout AI",
        region="IN",
        observed_at=now,
        active=True,
        search_volume=50000,
        increase_percentage=850.0,
        trend_breakdown=["ai prompt", "ai model"],
        source_links={"news": "http://news.com"}
    )

    res = calculate_qualification_score(strong_trend)
    assert res["qualification_score"] >= 0.70
    assert res["status"] == "qualified"
    assert res["metrics"]["normalized_velocity"] > 0.7

    weak_trend = TrendSnapshot(
        trend_id="tr_2",
        topic="Minor Footnote",
        region="IN",
        observed_at=now,
        active=False,
        search_volume=100,
        increase_percentage=10.0,
        trend_breakdown=[],
        source_links={}
    )
    res_weak = calculate_qualification_score(weak_trend)
    assert res_weak["qualification_score"] < 0.70
    assert res_weak["status"] == "candidate"

@pytest.mark.asyncio
async def test_mock_trends_provider():
    """Test MockTrendsProvider contract."""
    mock = MockTrendsProvider()
    trends = await mock.get_trending_topics(region="IN", only_active=True)
    assert len(trends) > 0
    assert all(t.region == "IN" and t.active for t in trends)

    topics = await mock.get_related_topics("nepal floods flash floods", "IN")
    assert "kathmandu flood" in topics
