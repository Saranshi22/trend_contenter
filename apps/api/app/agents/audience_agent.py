from pydantic import BaseModel, Field
from typing import List
from ..config import settings
from .state import InvestigationState
from ..services.llm_engine.factory import get_llm_engine

class AudienceSegment(BaseModel):
    segment_id: str = Field(description="Unique identifier for the segment")
    label: str = Field(description="Name of the audience segment")
    description: str = Field(description="Detailed description")
    needs: List[str] = Field(description="Core information needs")
    questions: List[str] = Field(description="Questions they are asking")
    concerns: List[str] = Field(description="Concerns they have")
    evidence_ids: List[str] = Field(description="Supporting evidence IDs")

class AudienceDiscovery(BaseModel):
    segments: List[AudienceSegment]

async def discover_audiences(state: InvestigationState) -> dict:
    """Agent node that identifies and labels audience segments."""
    engine = get_llm_engine()
    
    prompt = f"""
    You are an expert audience researcher and ethnographer.
    Analyze the following trend, context, questions, and narratives:
    
    Topic: {state['topic']}
    Region: {state.get('region', 'Global')}
    Related Search Queries: {', '.join(state.get('related_topics', [])) or 'None'}
    Questions: {state.get('questions', [])}
    Narratives: {state.get('narratives', [])}
    
    Identify 2 to 3 distinct, realistic audience segments who are directly affected by or interested in this specific topic.
    Give each segment a descriptive, human-readable label (e.g., 'Daily Commuters & East Delhi Residents', 'Protest Organizers & Civil Rights Groups', 'City Administration Watchers').
    """
    
    try:
        parsed_response = await engine.generate_structured(prompt, AudienceDiscovery)
        segments = parsed_response.segments if parsed_response else []
        valid_segments = [s.model_dump() for s in segments if len(s.evidence_ids) >= 0] 
        
        return {"audience_segments": valid_segments}
    except Exception as e:
        print(f"Error in audience discovery: {e}")
        topic = state.get("topic", "")
        norm_ev = state.get("normalized_evidence", [])
        ev_ids = [e.get("evidence_id") for e in norm_ev[:2] if e.get("evidence_id")]
        fallback_segments = [
            {
                "segment_id": "seg_practitioners",
                "label": f"{topic} Practitioners & Enthusiasts",
                "description": f"Individuals actively exploring implementations and news related to {topic}.",
                "needs": ["Practical tutorials", "Verified updates"],
                "questions": [f"What are best practices for {topic}?"],
                "concerns": ["Complexity and inconsistent information"],
                "evidence_ids": ev_ids
            }
        ]
        return {
            "audience_segments": fallback_segments,
            "errors": [{"source": "audience_agent", "message": str(e)}]
        }
