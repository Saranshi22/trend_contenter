from pydantic import BaseModel, Field
from typing import List
from ..config import settings
from .state import InvestigationState
from ..services.llm_engine.factory import get_llm_engine

class Driver(BaseModel):
    claim: str = Field(description="The potential driver of this trend")
    evidence_ids: List[str] = Field(description="List of evidence IDs supporting this driver")
    confidence: float = Field(description="Confidence score from 0.0 to 1.0")

class Narrative(BaseModel):
    name: str = Field(description="Short name for this narrative")
    description: str = Field(description="Detailed explanation")
    evidence_ids: List[str] = Field(description="Supporting evidence IDs")
    sentiment: str = Field(description="Sentiment, e.g., 'mixed', 'positive', 'negative'")

class Question(BaseModel):
    question: str = Field(description="The question being asked by users")
    frequency_signal: str = Field(description="High, medium, or low")
    evidence_ids: List[str] = Field(description="Supporting evidence IDs")

class TrendStory(BaseModel):
    summary: str = Field(description="Overall summary of the trend")
    drivers: List[Driver]
    narratives: List[Narrative]
    questions: List[Question]
    uncertainties: List[str]

async def synthesize_trend_story(state: InvestigationState) -> dict:
    """Agent node that creates the trend story, narratives, and questions."""
    engine = get_llm_engine()

    # Extract evidence snippets for grounding
    norm_ev = state.get("normalized_evidence", [])
    youtube_videos = [
        f"[{e.get('evidence_id')}] '{e.get('title')}' by {e.get('author')} (Views: {e.get('engagement', {}).get('views', 'N/A')})"
        for e in norm_ev if e.get("source_type") == "video_platform" and e.get("metadata", {}).get("retrieval_method") == "video_metadata"
    ][:6]

    youtube_comments = [
        f"[{e.get('evidence_id')}] \"{e.get('text_excerpt')}\" (on '{e.get('metadata', {}).get('video_title', 'video')}')"
        for e in norm_ev if e.get("source_type") == "video_platform" and e.get("metadata", {}).get("retrieval_method") == "comment_thread"
    ][:8]

    web_snippets = [
        f"[{e.get('evidence_id')}] {e.get('title')} ({e.get('author') or 'Web'}): {e.get('text_excerpt', '')[:120]}"
        for e in norm_ev if e.get("source_type") in ("web", "social")
    ][:6]

    related_queries = state.get('related_topics', []) or []
    related_str = ', '.join(related_queries) if related_queries else 'None'
    topic = state.get('topic', '')

    prompt = f"""
    You are an expert trend analyst. 
    Analyze this real-time search spike using multi-source intelligence:
    
    Topic: {topic}
    Region: {state.get('region', 'Global')}
    Google Trends Related Search Queries & Context: {related_str}
    
    Existing YouTube Video Coverage Sampled:
    {chr(10).join(youtube_videos) or 'No video metadata available.'}

    Viewer Comments & Questions Observed on YouTube:
    {chr(10).join(youtube_comments) or 'No public comments sampled.'}

    Web & Social Observations:
    {chr(10).join(web_snippets) or 'No web excerpts available.'}

    Synthesize a Trend Story explaining:
    1. What is driving this trend (drivers).
    2. What narratives and community interpretations are forming (narratives).
    3. What concrete questions people are asking (questions).
    4. Key uncertainties.
    
    CRITICAL DISAMBIGUATION & CONTEXT GROUNDING RULES:
    - The 'Google Trends Related Search Queries & Context' define why this search spike occurred in the real world.
    - You MUST use these related queries ({related_str}) to disambiguate the topic.
    - For example: if the topic is 'barcelona' and the related searches include 'fc barca', 'barca vs real madrid', etc., the spike is strictly about the football club and sporting events. All drivers and narratives MUST center on FC Barcelona football club, players, and match outcomes. You MUST strictly reject and discard any sampled web or video noise regarding Barcelona city travel, tourism, sightseeing, or vacation guides.
    - NEVER allow the narrative to drift to unrelated homonyms, broad municipal/tourism topics, or off-topic entities unless the related search queries explicitly indicate that context.
    - Represent conclusions as interpretations of the sampled content and conversations.
    - Video popularity does not prove content quality; a small set of comments does not establish population-wide demand.
    - CITE real evidence_ids from the brackets above (e.g. ['ev_yt_...']) in supporting evidence fields.
    - Do not invent sources or evidence IDs.
    """
    
    try:
        parsed_response = await engine.generate_structured(prompt, TrendStory)
        data = parsed_response.model_dump() if parsed_response else {}
        
        return {
            "narratives": data.get("narratives", []),
            "questions": data.get("questions", [])
        }
    except Exception as e:
        print(f"Error in trend story generation: {e}")
        anchor = related_queries[0].strip() if related_queries else ""
        context_label = f"{topic} ({anchor})" if anchor and anchor.lower() not in topic.lower() else topic
        # Derive fallback narratives and questions directly from observed evidence
        ev_ids = [e.get("evidence_id") for e in norm_ev[:3] if e.get("evidence_id")]
        fallback_narratives = [
            {
                "name": f"Surging Public Attention on {context_label}",
                "description": f"Analysis of search trends and multi-source signals shows rising interest and demand for authoritative updates regarding {context_label}.",
                "evidence_ids": ev_ids,
                "sentiment": "neutral"
            }
        ]
        fallback_questions = [
            {
                "question": f"What are the latest updates, developments, and key facts regarding {context_label}?",
                "frequency_signal": "high",
                "evidence_ids": ev_ids[:2]
            }
        ]
        return {
            "narratives": fallback_narratives,
            "questions": fallback_questions,
            "errors": [{"source": "trend_story", "message": str(e)}]
        }
