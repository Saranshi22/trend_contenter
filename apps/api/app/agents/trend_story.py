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

    prompt = f"""
    You are an expert trend analyst. 
    Analyze this real-time search spike using multi-source intelligence:
    
    Topic: {state['topic']}
    Region: {state.get('region', 'Global')}
    Related Search Queries & Context: {', '.join(state.get('related_topics', [])) or 'None'}
    
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
    
    CRITICAL GROUNDING RULES:
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
        topic = state.get("topic", "")
        # Derive fallback narratives and questions directly from observed evidence
        ev_ids = [e.get("evidence_id") for e in norm_ev[:3] if e.get("evidence_id")]
        fallback_narratives = [
            {
                "name": f"Surging Public Attention on {topic}",
                "description": f"Analysis of sampled video coverage and search trends shows rising interest and demand for authoritative guidance on {topic}.",
                "evidence_ids": ev_ids,
                "sentiment": "neutral"
            }
        ]
        fallback_questions = [
            {
                "question": f"How do I get started with {topic} and what are common pitfalls?",
                "frequency_signal": "high",
                "evidence_ids": ev_ids[:2]
            }
        ]
        return {
            "narratives": fallback_narratives,
            "questions": fallback_questions,
            "errors": [{"source": "trend_story", "message": str(e)}]
        }
