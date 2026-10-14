from pydantic import BaseModel, Field
from typing import List
from ..config import settings
from .investigation_graph import InvestigationState
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
    """Agent node that identifies content gaps."""
    engine = get_llm_engine()
    
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
    
    For each target audience segment, identify high-value, specific content gaps.
    DO NOT output generic placeholder titles like "New Content Opportunity for...". 
    Instead, generate:
    1. A punchy, authoritative editorial title tailored to the trend.
    2. A concrete problem statement describing what the audience is confused or concerned about.
    3. Their exact information need.
    4. The specific gap in existing web coverage.
    5. A practical recommended angle and format.
    """
    
    try:
        parsed_response = await engine.generate_structured(prompt, GapAnalysis)
        gaps = [g.model_dump() for g in parsed_response.content_gaps] if parsed_response else []
        
        return {"content_gaps": gaps}
    except Exception as e:
        print(f"Error in gap detection: {e}")
        return {"errors": [{"source": "gap_agent", "message": str(e)}]}
