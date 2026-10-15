from pydantic import BaseModel, Field
from typing import List
from ..config import settings
from .state import InvestigationState
from ..services.llm_engine.factory import get_llm_engine

class ContentGap(BaseModel):
    audience_segment_id: str = Field(description="Segment identifier")
    audience_label: str = Field(description="Human-readable label of the audience segment")
    opportunity_title: str = Field(description="Specific, compelling editorial headline or title for this content piece")
    problem: str = Field(description="Concrete real-world problem, confusion, or obstacle faced by this audience")
    audience_need: str = Field(description="Exact questions or information needs this audience is actively searching for")
    observed_gap: str = Field(description="Why current coverage or search results fail this audience (e.g. too superficial, outdated, lacks logistics)")
    recommended_angle: str = Field(description="Distinctive, actionable editorial angle that sets this content apart")
    recommended_format: str = Field(description="Best content format (e.g. 'In-Depth Citizen Guide', 'Visual Explainer & Map', 'FAQ Dossier', 'Video Script')")
    evidence_ids: List[str] = Field(default_factory=list)

class GapAnalysis(BaseModel):
    content_gaps: List[ContentGap]

async def detect_content_gaps(state: InvestigationState) -> dict:
    """Agent node that identifies content gaps by comparing existing media vs audience questions."""
    engine = get_llm_engine()

    # Extract sampled content & audience questions from normalized evidence
    norm_ev = state.get("normalized_evidence", [])
    youtube_videos = [
        f"[{e.get('evidence_id')}] '{e.get('title')}' ({e.get('author')}) - Views: {e.get('engagement', {}).get('views', 'N/A')}"
        for e in norm_ev if e.get("source_type") == "video_platform" and e.get("metadata", {}).get("retrieval_method") == "video_metadata"
    ][:8]

    youtube_questions = [
        f"[{e.get('evidence_id')}] \"{e.get('text_excerpt')}\""
        for e in norm_ev if e.get("source_type") == "video_platform" and e.get("metadata", {}).get("retrieval_method") == "comment_thread"
    ][:10]

    web_coverage = [
        f"[{e.get('evidence_id')}] '{e.get('title')}' ({e.get('author') or 'Web'})"
        for e in norm_ev if e.get("source_type") == "web"
    ][:6]

    prompt = f"""
    You are an expert editorial content strategist.
    Topic: {state['topic']}
    Region: {state.get('region', 'Global')}
    Related Search Terms: {', '.join(state.get('related_topics', [])) or 'None'}
    
    Target Audiences Identified:
    {state.get('audience_segments', [])}
    
    Narratives and User Questions:
    {state.get('narratives', [])}
    {state.get('questions', [])}

    Existing Content Coverage Sampled:
    - YouTube Videos Available:
    {chr(10).join(youtube_videos) or 'No videos sampled.'}
    - Web / News Coverage:
    {chr(10).join(web_coverage) or 'No web articles sampled.'}

    Audience Questions & Confusion Observed (from YouTube Public Comments & Social):
    {chr(10).join(youtube_questions) or 'No comment questions recorded.'}

    Compare what content already exists in search/video results against the explicit questions asked by real viewers.
    Identify high-value, specific content gaps where current coverage fails to address recurring audience needs.

    CRITICAL RULES:
    1. Clearly distinguish an observed question from an evidence-supported content gap.
    2. A missing video result does not prove a gap; recurring unanswered questions from users indicate an underserved audience need.
    3. Do NOT output generic placeholder titles like "New Content Opportunity for...".
    4. Link relevant evidence_ids from the brackets above (e.g. ['ev_yt_...']) in the evidence_ids list.
    """
    
    try:
        parsed_response = await engine.generate_structured(prompt, GapAnalysis)
        gaps = [g.model_dump() for g in parsed_response.content_gaps] if parsed_response else []
        
        return {"content_gaps": gaps}
    except Exception as e:
        print(f"Error in gap detection: {e}")
        topic = state.get("topic", "")
        # Identify evidence IDs from YouTube and web for attribution
        yt_ev_ids = [e.get("evidence_id") for e in norm_ev if e.get("source_type") == "video_platform"][:3]
        fallback_gaps = [
            {
                "audience_segment_id": "seg_practitioners",
                "audience_label": f"{topic} Practitioners & Enthusiasts",
                "opportunity_title": f"The Essential Practical Guide to {topic}",
                "problem": f"Existing video content and articles cover high-level news but overlook the recurring implementation and setup questions raised in viewer comments.",
                "audience_need": f"Hands-on, reliable answers to the specific practical questions emerging around {topic}.",
                "observed_gap": "Market coverage is saturated with superficial overviews, creating a gap for authoritative, actionable answers to real audience inquiries.",
                "recommended_angle": "Step-by-step practical guide addressing top unanswered questions from community discussions.",
                "recommended_format": "Visual Explainer & Field Guide",
                "evidence_ids": yt_ev_ids or [e.get("evidence_id") for e in norm_ev[:2] if e.get("evidence_id")]
            }
        ]
        return {
            "content_gaps": fallback_gaps,
            "errors": [{"source": "gap_agent", "message": str(e)}]
        }
