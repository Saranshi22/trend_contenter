import os
import sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from datetime import datetime, timezone, timedelta

from apps.api.app.integrations.video.youtube_data_api import (
    YouTubeDataApiProvider,
    YouTubeQuotaExceededError,
    cleanup_expired_youtube_evidence
)
from apps.api.app.agents.research_nodes import research_youtube, normalize_and_deduplicate
from apps.api.app.domain.models.evidence import EvidenceItem


@pytest.mark.asyncio
async def test_youtube_provider_initialization():
    provider = YouTubeDataApiProvider(api_key="AIzaSyTestKey123")
    assert provider.is_configured is True
    assert provider.quota_used == 0

    unconfigured = YouTubeDataApiProvider(api_key="")
    assert unconfigured.is_configured is False


@pytest.mark.asyncio
async def test_youtube_search_and_enrichment_flow():
    provider = YouTubeDataApiProvider(api_key="AIzaSyTestKey123")

    mock_search_response = MagicMock()
    mock_search_response.status_code = 200
    mock_search_response.json.return_value = {
        "items": [
            {
                "id": {"videoId": "vid_001"},
                "snippet": {
                    "title": "Deep Dive into Emerging Tech",
                    "description": "Full breakdown of tech trends and implementation.",
                    "channelId": "ch_123",
                    "channelTitle": "Tech Explainer",
                    "publishedAt": "2026-10-10T12:00:00Z",
                    "thumbnails": {"high": {"url": "https://img.youtube.com/vi/vid_001/hqdefault.jpg"}}
                }
            }
        ]
    }

    mock_videos_response = MagicMock()
    mock_videos_response.status_code = 200
    mock_videos_response.json.return_value = {
        "items": [
            {
                "id": "vid_001",
                "snippet": {
                    "title": "Deep Dive into Emerging Tech",
                    "description": "Full breakdown of tech trends.",
                    "channelId": "ch_123",
                    "channelTitle": "Tech Explainer",
                    "publishedAt": "2026-10-10T12:00:00Z",
                    "thumbnails": {"high": {"url": "https://img.youtube.com/vi/vid_001/hqdefault.jpg"}},
                    "categoryId": "28"
                },
                "contentDetails": {"duration": "PT15M30S"},
                "statistics": {
                    "viewCount": "50000",
                    "likeCount": "2500",
                    "commentCount": "120"
                }
            }
        ]
    }

    mock_comments_response = MagicMock()
    mock_comments_response.status_code = 200
    mock_comments_response.json.return_value = {
        "items": [
            {
                "id": "cmt_001",
                "snippet": {
                    "topLevelComment": {
                        "id": "cmt_001",
                        "snippet": {
                            "videoId": "vid_001",
                            "textDisplay": "How do we deploy this in production safely?",
                            "authorDisplayName": "DeveloperUser",
                            "likeCount": 15,
                            "publishedAt": "2026-10-11T08:00:00Z"
                        }
                    },
                    "totalReplyCount": 3
                }
            }
        ]
    }

    async def mock_get(url, **kwargs):
        if "/search" in url:
            return mock_search_response
        elif "/videos" in url:
            return mock_videos_response
        elif "/commentThreads" in url:
            return mock_comments_response
        raise ValueError(f"Unexpected url: {url}")

    with patch("httpx.AsyncClient.get", side_effect=mock_get):
        result = await provider.investigate_trend(
            topic="emerging tech",
            investigation_id="inv_test_001",
            region="IN"
        )

        assert result["status"] == "success"
        assert result["video_count"] == 1
        assert result["comment_count"] == 1
        assert len(result["evidence"]) == 2  # 1 video + 1 comment
        assert result["quota_used"] == 102  # 100 search + 1 enrich + 1 comments

        # Check video evidence normalization
        video_ev = result["evidence"][0]
        assert video_ev["source_type"] == "video_platform"
        assert video_ev["platform"] == "youtube"
        assert video_ev["metadata"]["retrieval_method"] == "video_metadata"
        assert video_ev["metadata"]["video_id"] == "vid_001"
        assert video_ev["engagement"]["views"] == 50000
        assert video_ev["engagement"]["likes"] == 2500

        # Check comment evidence normalization
        comment_ev = result["evidence"][1]
        assert comment_ev["source_type"] == "video_platform"
        assert comment_ev["platform"] == "youtube"
        assert comment_ev["metadata"]["retrieval_method"] == "comment_thread"
        assert comment_ev["metadata"]["comment_id"] == "cmt_001"
        assert "How do we deploy this" in comment_ev["text_excerpt"]
        assert comment_ev["engagement"]["likes"] == 15


@pytest.mark.asyncio
async def test_youtube_research_node_in_graph():
    state = {
        "investigation_id": "inv_graph_01",
        "topic": "Solar Energy",
        "region": "IN",
        "research_plan": {
            "youtube_queries": ["Solar Energy innovations"]
        },
        "source_statuses": {"social": "success", "web": "success"}
    }

    with patch.object(YouTubeDataApiProvider, "investigate_trend") as mock_inv:
        mock_inv.return_value = {
            "status": "success",
            "evidence": [
                {
                    "evidence_id": "ev_yt_v_123",
                    "investigation_id": "inv_graph_01",
                    "source_type": "video_platform",
                    "platform": "youtube",
                    "title": "Solar Energy Breakthrough",
                    "text_excerpt": "Latest breakthrough in solar panels.",
                    "url": "https://www.youtube.com/watch?v=123",
                    "published_at": datetime.now(timezone.utc),
                    "retrieved_at": datetime.now(timezone.utc),
                    "author": "CleanTech Daily",
                    "engagement": {"views": 10000, "likes": 500},
                    "metadata": {"retrieval_method": "video_metadata", "video_id": "123"},
                    "content_hash": "hash_123",
                    "confidence": 0.90,
                    "is_inferred": False
                }
            ],
            "top_questions": ["Is this viable for residential setups?"],
            "videos": [{"video_id": "123", "title": "Solar Energy Breakthrough"}]
        }

        output = await research_youtube(state)

        assert output["source_statuses"]["youtube"] == "success"
        assert len(output["youtube_evidence"]) == 1
        assert output["youtube_questions"] == ["Is this viable for residential setups?"]


@pytest.mark.asyncio
async def test_normalize_and_deduplicate_with_youtube():
    state = {
        "investigation_id": "inv_norm_01",
        "social_evidence": [],
        "web_evidence": [],
        "youtube_evidence": [
            {
                "evidence_id": "ev_yt_v_1",
                "source_type": "video_platform",
                "platform": "youtube",
                "title": "YouTube Video 1",
                "text_excerpt": "Description of video 1",
                "url": "https://youtube.com/watch?v=1",
                "published_at": datetime.now(timezone.utc).isoformat(),
                "retrieved_at": datetime.now(timezone.utc).isoformat(),
                "author": "Tech Channel",
                "engagement": {"views": 1200},
                "metadata": {"video_id": "1", "retrieval_method": "video_metadata"}
            }
        ],
        "llm_evidence": []
    }

    result = await normalize_and_deduplicate(state)
    assert len(result["normalized_evidence"]) == 1
    item = result["normalized_evidence"][0]
    assert item["source_type"] == "video_platform"
    assert item["platform"] == "youtube"
    assert item["title"] == "YouTube Video 1"


@pytest.mark.asyncio
async def test_youtube_compliance_30_day_cleanup():
    mock_session = AsyncMock()
    mock_result = MagicMock()
    mock_result.rowcount = 5
    mock_session.execute.return_value = mock_result

    purged = await cleanup_expired_youtube_evidence(mock_session, retention_days=30)
    assert purged == 5
    assert mock_session.commit.called
