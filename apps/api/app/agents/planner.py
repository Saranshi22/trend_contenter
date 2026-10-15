from pydantic import BaseModel, Field
from typing import List
from ..config import settings
from .state import InvestigationState
from ..services.llm_engine.factory import get_llm_engine

class ResearchPlan(BaseModel):
    research_questions: List[str] = Field(description="Questions to investigate about this trend")
    social_queries: List[str] = Field(description="Search queries for social media platforms")
    web_queries: List[str] = Field(description="Search queries for general web and news")
    youtube_queries: List[str] = Field(default_factory=list, description="Search queries for YouTube videos and public comment analysis")
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
        topic = state.get("topic", "")
        fallback_plan = {
            "research_questions": [f"Why is {topic} trending?", f"What questions do people have about {topic}?"],
            "social_queries": [topic, f"{topic} review"],
            "web_queries": [topic, f"{topic} news"],
            "youtube_queries": [topic, f"{topic} tutorial", f"{topic} explainer"],
            "llm_probes": [f"What is {topic}?", f"Why is {topic} trending?"]
        }
        return {
            "research_plan": fallback_plan,
            "errors": [{"source": "planner", "message": str(e)}]
        }
