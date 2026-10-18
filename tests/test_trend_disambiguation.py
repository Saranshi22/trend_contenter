import pytest
from apps.api.app.agents.planner import create_research_plan
from apps.api.app.agents.trend_story import synthesize_trend_story
from apps.api.app.agents.audience_agent import discover_audiences
from apps.api.app.agents.gap_agent import detect_content_gaps
from apps.api.app.agents.research_nodes import research_web, research_youtube

@pytest.mark.asyncio
async def test_planner_fallback_disambiguates_topic():
    # When topic is ambiguous ("barcelona") but related queries point to "fc barca"
    state = {
        "topic": "barcelona",
        "region": "ES",
        "related_topics": ["fc barca", "barca match", "la liga"],
        "investigation_id": "inv_test_123"
    }
    
    # Run planner (fallback branch if LLM is mocked/unavailable)
    result = await create_research_plan(state)
    plan = result.get("research_plan", {})
    
    web_queries = plan.get("web_queries", [])
    youtube_queries = plan.get("youtube_queries", [])
    
    # Check that queries are anchored with the disambiguation context
    assert any("fc barca" in q.lower() or "barcelona" in q.lower() for q in web_queries)
    assert any("fc barca" in q.lower() or "barcelona" in q.lower() for q in youtube_queries)

@pytest.mark.asyncio
async def test_trend_story_fallback_uses_related_context():
    state = {
        "topic": "barcelona",
        "region": "ES",
        "related_topics": ["fc barca", "barca match"],
        "normalized_evidence": [],
        "investigation_id": "inv_test_456"
    }
    
    result = await synthesize_trend_story(state)
    narratives = result.get("narratives", [])
    questions = result.get("questions", [])
    
    assert len(narratives) > 0
    full_narrative = (narratives[0].get("name", "") + " " + narratives[0].get("description", "")).lower()
    assert any(term in full_narrative for term in ["barca", "barcelona", "club", "team", "match"])

@pytest.mark.asyncio
async def test_audience_and_gap_fallbacks_anchor_in_related_queries():
    state = {
        "topic": "barcelona",
        "region": "ES",
        "related_topics": ["fc barca", "barca match"],
        "normalized_evidence": [],
        "questions": [],
        "narratives": [],
        "investigation_id": "inv_test_789"
    }
    
    aud_res = await discover_audiences(state)
    segments = aud_res.get("audience_segments", [])
    assert len(segments) > 0
    desc = (segments[0].get("description") or "") + " " + (segments[0].get("label") or "")
    assert any(term in desc.lower() for term in ["barca", "club", "team", "match", "fc barcelona"])

    gap_res = await detect_content_gaps(state)
    gaps = gap_res.get("content_gaps", [])
    assert len(gaps) > 0
    gap_text = (gaps[0].get("opportunity_title") or "") + " " + (gaps[0].get("strategic_rationale") or "")
    assert any(term in gap_text.lower() for term in ["barca", "barcelona", "match", "club", "football"])
