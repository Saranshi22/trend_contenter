from pydantic import BaseModel, Field
from typing import List
from ..config import settings
from .investigation_graph import InvestigationState
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
    
    prompt = f"""
    You are an expert trend analyst. 
    Analyze this real-time search spike:
    
    Topic: {state['topic']}
    Region: {state.get('region', 'Global')}
    Related Search Queries & Context: {', '.join(state.get('related_topics', [])) or 'None'}
    
    Synthesize a Trend Story explaining what is driving this trend, what real-world events or discussions caused this spike, what narratives are forming, and what concrete questions people are asking.
    
    For every material conclusion: 
    1. Identify supporting evidence. 
    2. State whether it is observed or inferred. 
    3. Assign confidence. 
    4. Do not invent sources.
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
        return {"errors": [{"source": "trend_story", "message": str(e)}]}
