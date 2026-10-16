import pytest
import httpx
from datetime import datetime, timezone
from unittest.mock import AsyncMock, patch

from apps.api.app.integrations.social.socialcrawl import (
    SocialCrawlProvider,
    SocialCrawlAuthError,
    SocialCrawlCreditError,
    SocialCrawlRateLimitError,
    SocialCrawlTimeoutError,
    SocialCrawlError
)
from apps.api.app.domain.models.evidence import EvidenceItem
from apps.api.app.agents.research_nodes import research_social


SAMPLE_SOCIALCRAWL_MULTI_RESPONSE = {
    "success": True,
    "platform": "search",
    "endpoint": "/v1/search/multi",
    "data": {
        "query": "artificial intelligence",
        "platforms": ["reddit", "twitter", "tiktok"],
        "sources": {
            "reddit": {"status": "ok", "rows": 2, "credits": 1},
            "twitter": {"status": "ok", "rows": 1, "credits": 1},
            "tiktok": {"status": "empty", "rows": 0, "credits": 0}
        },
        "items": [
            {
                "platform": "reddit",
                "post": {
                    "id": "1x2qvx0",
                    "url": "https://www.reddit.com/r/AskReddit/comments/1x2qvx0/what_do_you_think_ai_will_do_in_the_next_3_years/",
                    "content": {
                        "text": "What do you think AI will do in the next 3 years?"
                    },
                    "author": {
                        "username": "Embarrassed_Host501",
                        "display_name": "Host 501",
                        "verified": False
                    },
                    "engagement": {
                        "likes": 9,
                        "comments": 117,
                        "shares": 2,
                        "views": 500
                    },
                    "published_at": "2026-10-10T21:41:40.000Z",
                    "ext": {
                        "subreddit": "AskReddit",
                        "title": "What do you think AI will do in the next 3 years?",
                        "selftext": "Longer explanation about generative AI and LLMs in production.",
                        "upvote_ratio": 0.85
                    }
                },
                "computed": {
                    "relevance": {"p": 0.94, "sense": "target"},
                    "labels": {
                        "intent": {"label": "news_or_discussion"},
                        "niche": {"label": "technology"}
                    }
                }
            },
            {
                "platform": "twitter",
                "post": {
                    "id": "tweet_987654",
                    "url": "https://x.com/tech_creator/status/987654",
                    "content": {
                        "text": "Autonomous multi-agent workflows are replacing static pipelines."
                    },
                    "author": {
                        "username": "tech_creator",
                        "display_name": "Tech Creator",
                        "verified": True
                    },
                    "engagement": {
                        "likes": 420,
                        "comments": 53,
                        "shares": 88,
                        "views": 15000
                    },
                    "published_at": "2026-10-11T10:00:00.000Z",
                    "ext": {}
                },
                "computed": {
                    "relevance": {"p": 0.89},
                    "labels": {
                        "intent": {"label": "insights"},
                        "niche": {"label": "technology"}
                    }
                }
            },
            # Duplicate URL item to test deduplication
            {
                "platform": "reddit",
                "post": {
                    "id": "1x2qvx0_dup",
                    "url": "https://www.reddit.com/r/AskReddit/comments/1x2qvx0/what_do_you_think_ai_will_do_in_the_next_3_years/",
                    "content": {
                        "text": "Duplicate url text"
                    }
                }
            }
        ],
        "total": 3,
        "duplicates_removed": 0,
        "credits_charged": 2
    },
    "credits_used": 2,
    "credits_remaining": 96
}


@pytest.mark.asyncio
async def test_socialcrawl_unconfigured():
    """Unconfigured SocialCrawl provider safely returns empty evidence without throwing."""
    provider = SocialCrawlProvider(api_key="")
    assert provider.is_configured is False
    res = await provider.search("artificial intelligence")
    assert res == []


@pytest.mark.asyncio
async def test_socialcrawl_search_success_and_normalization():
    """Verify successful retrieval, schema normalization, and provenance preservation."""
    mock_client = AsyncMock(spec=httpx.AsyncClient)
    mock_response = httpx.Response(
        200,
        json=SAMPLE_SOCIALCRAWL_MULTI_RESPONSE,
        request=httpx.Request("GET", "https://www.socialcrawl.dev/v1/search/multi")
    )
    mock_client.get.return_value = mock_response

    provider = SocialCrawlProvider(
        api_key="sc_test_key_123",
        client=mock_client
    )

    items = await provider.search(
        query="artificial intelligence",
        platforms=["reddit", "twitter", "tiktok"],
        limit=10
    )

    # 3 raw items in payload, 1 duplicate URL -> 2 deduped items returned
    assert len(items) == 2

    # Verify first item (Reddit post)
    reddit_item = items[0]
    assert isinstance(reddit_item, EvidenceItem)
    assert reddit_item.source_type == "social"
    assert reddit_item.platform == "reddit"
    assert "What do you think AI will do" in reddit_item.title
    assert "Longer explanation about generative AI" in reddit_item.text_excerpt
    assert reddit_item.url == "https://www.reddit.com/r/AskReddit/comments/1x2qvx0/what_do_you_think_ai_will_do_in_the_next_3_years/"
    assert reddit_item.author == "Embarrassed_Host501"
    assert reddit_item.engagement["likes"] == 9
    assert reddit_item.engagement["comments"] == 117
    assert reddit_item.engagement["upvote_ratio"] == 0.85
    assert reddit_item.confidence == 0.94
    assert reddit_item.is_inferred is False
    assert reddit_item.metadata["retrieved_by"] == "socialcrawl"
    assert reddit_item.metadata["retrieval_method"] == "search_multi"
    assert reddit_item.metadata["subreddit"] == "AskReddit"
    assert reddit_item.metadata["post_id"] == "1x2qvx0"
    assert len(reddit_item.content_hash) == 64

    # Verify second item (Twitter post)
    twitter_item = items[1]
    assert twitter_item.source_type == "social"
    assert twitter_item.platform == "twitter"
    assert twitter_item.author == "tech_creator"
    assert twitter_item.engagement["likes"] == 420
    assert twitter_item.engagement["shares"] == 88
    assert twitter_item.engagement["views"] == 15000
    assert twitter_item.confidence == 0.89
    assert twitter_item.metadata["retrieved_by"] == "socialcrawl"


@pytest.mark.asyncio
async def test_socialcrawl_auth_error():
    """Verify HTTP 401 raises SocialCrawlAuthError."""
    mock_client = AsyncMock(spec=httpx.AsyncClient)
    mock_response = httpx.Response(
        401,
        json={"error": "Invalid API key."},
        request=httpx.Request("GET", "https://www.socialcrawl.dev/v1/search/multi")
    )
    mock_client.get.return_value = mock_response

    provider = SocialCrawlProvider(api_key="bad_key", client=mock_client)
    with pytest.raises(SocialCrawlAuthError):
        await provider.search("query")


@pytest.mark.asyncio
async def test_socialcrawl_credit_error():
    """Verify HTTP 402 raises SocialCrawlCreditError."""
    mock_client = AsyncMock(spec=httpx.AsyncClient)
    mock_response = httpx.Response(
        402,
        json={"error": "Credits exhausted."},
        request=httpx.Request("GET", "https://www.socialcrawl.dev/v1/search/multi")
    )
    mock_client.get.return_value = mock_response

    provider = SocialCrawlProvider(api_key="sc_depleted", client=mock_client)
    with pytest.raises(SocialCrawlCreditError):
        await provider.search("query")


@pytest.mark.asyncio
async def test_socialcrawl_rate_limit_error():
    """Verify HTTP 429 raises SocialCrawlRateLimitError."""
    mock_client = AsyncMock(spec=httpx.AsyncClient)
    mock_response = httpx.Response(
        429,
        json={"error": "Rate limit exceeded."},
        request=httpx.Request("GET", "https://www.socialcrawl.dev/v1/search/multi")
    )
    mock_client.get.return_value = mock_response

    provider = SocialCrawlProvider(api_key="sc_key", client=mock_client)
    with pytest.raises(SocialCrawlRateLimitError):
        await provider.search("query")


@pytest.mark.asyncio
async def test_socialcrawl_timeout_error():
    """Verify network timeout raises SocialCrawlTimeoutError."""
    mock_client = AsyncMock(spec=httpx.AsyncClient)
    mock_client.get.side_effect = httpx.TimeoutException("Read timed out")

    provider = SocialCrawlProvider(api_key="sc_key", client=mock_client)
    with pytest.raises(SocialCrawlTimeoutError):
        await provider.search("query")


@pytest.mark.asyncio
async def test_socialcrawl_caching():
    """Verify second identical search within TTL hits in-memory cache without issuing HTTP request."""
    mock_client = AsyncMock(spec=httpx.AsyncClient)
    mock_response = httpx.Response(
        200,
        json=SAMPLE_SOCIALCRAWL_MULTI_RESPONSE,
        request=httpx.Request("GET", "https://www.socialcrawl.dev/v1/search/multi")
    )
    mock_client.get.return_value = mock_response

    provider = SocialCrawlProvider(api_key="sc_key", client=mock_client)
    res1 = await provider.search("quantum computing", platforms=["reddit"])
    assert len(res1) == 2
    assert mock_client.get.call_count == 1

    # Second call for quantum computing
    res2 = await provider.search("quantum computing", platforms=["reddit"])
    assert len(res2) == 2
    # call_count should still be 1 due to caching
    assert mock_client.get.call_count == 1


@pytest.mark.asyncio
async def test_langgraph_research_social_node():
    """Verify LangGraph research_social node correctly gathers and stores social evidence."""
    mock_client = AsyncMock(spec=httpx.AsyncClient)
    mock_response = httpx.Response(
        200,
        json=SAMPLE_SOCIALCRAWL_MULTI_RESPONSE,
        request=httpx.Request("GET", "https://www.socialcrawl.dev/v1/search/multi")
    )
    mock_client.get.return_value = mock_response

    state = {
        "topic": "multimodal agents",
        "investigation_id": "inv_12345",
        "region": "IN",
        "research_plan": {
            "social_queries": ["multimodal agents", "multimodal agent discussion"]
        },
        "source_statuses": {}
    }

    with patch("apps.api.app.agents.research_nodes.SocialCrawlProvider") as mock_prov_cls:
        instance = SocialCrawlProvider(api_key="sc_key", client=mock_client)
        mock_prov_cls.return_value = instance

        res = await research_social(state)

        assert "social_evidence" in res
        assert len(res["social_evidence"]) >= 2
        assert res["source_statuses"]["social"] == "success"
        first_ev = res["social_evidence"][0]
        assert first_ev["investigation_id"] == "inv_12345"
        assert first_ev["source_type"] == "social"
        assert first_ev["metadata"]["retrieved_by"] == "socialcrawl"


@pytest.mark.asyncio
async def test_langgraph_research_social_unconfigured():
    """Verify research_social handles missing SocialCrawl key without failing investigation."""
    state = {
        "topic": "multimodal agents",
        "investigation_id": "inv_12345",
        "research_plan": {},
        "source_statuses": {}
    }

    with patch("apps.api.app.agents.research_nodes.SocialCrawlProvider") as mock_prov_cls:
        instance = SocialCrawlProvider(api_key="")  # Unconfigured
        mock_prov_cls.return_value = instance

        res = await research_social(state)

        assert res["social_evidence"] == []
        assert res["source_statuses"]["social"] == "not_configured"
        assert any(e.get("source") == "social_research" for e in res["errors"])
