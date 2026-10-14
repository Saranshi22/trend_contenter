from pydantic import BaseModel, Field
from typing import List
from ..config import settings
from .investigation_graph import InvestigationState
from ..services.llm_engine.factory import get_llm_engine

class ResearchPlan(BaseModel):
    research_questions: List[str] = Field(description="Questions to investigate about this trend")
    social_queries: List[str] = Field(description="Search queries for social media platforms")
    web_queries: List[str] = Field(description="Search queries for general web and news")
    llm_probes: List[str] = Field(description="Questions to ask AI models to understand their knowledge gaps")

async def create_research_plan(state: InvestigationState) -> dict:
    """Agent node that creates the initial research plan for a trend."""
    engine = get_llm_engine()
    
    prompt = f"""
    You are an expert content strategist and research planner.
    Create a research plan for the following trend:
    
    Topic: {state['topic']}
    Region: {state['region']}
    Related Topics: {', '.join(state['related_topics'])}
    
    Your goal is to investigate what is driving this trend, what people are discussing, and what information is underserved.
    """
    
    try:
        parsed_response = await engine.generate_structured(prompt, ResearchPlan)
        plan_dict = parsed_response.model_dump() if parsed_response else {}
        return {"research_plan": plan_dict}
    except Exception as e:
        print(f"Error in planner: {e}")
        return {"errors": [{"source": "planner", "message": str(e)}]}
