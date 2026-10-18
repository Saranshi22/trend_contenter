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
    
    related_list = state.get('related_topics', []) or []
    related_str = ', '.join(related_list) if related_list else 'None provided'
    topic = state.get('topic', '')
    region = state.get('region', 'IN')
    
    prompt = f"""
    You are an expert content strategist and research planner.
    Create a research plan for the following trend:
    
    Topic: {topic}
    Region: {region}
    Google Trends Related Search Queries: {related_str}
    
    CRITICAL CONTEXT & DISAMBIGUATION MANDATE:
    Google Trends returns related searches that define why this spike occurred.
    You MUST use the related queries ({related_str}) to disambiguate the topic and anchor ALL queries.
    - For example: if the topic is 'barcelona' and related searches are 'fc barca', 'barca match', all search queries (web, youtube, social) and questions MUST focus on FC Barcelona football club and matches — NOT Barcelona city travel, tourism, or holidays.
    - If the topic is polysemous, never generate generic, unanchored single-word queries. Every query must incorporate the specific angle or entity specified in the related searches.
    
    Your goal is to investigate what is driving this trend, what people are discussing, and what information is underserved.
    """
    
    try:
        parsed_response = await engine.generate_structured(prompt, ResearchPlan)
        plan_dict = parsed_response.model_dump() if parsed_response else {}
        return {"research_plan": plan_dict}
    except Exception as e:
        print(f"Error in planner: {e}")
        anchor = related_list[0].strip() if related_list else ""
        query_context = f"{topic} {anchor}".strip() if anchor and anchor.lower() not in topic.lower() else topic
        fallback_plan = {
            "research_questions": [
                f"Why is {query_context} trending?",
                f"What questions do people have about {query_context}?"
            ],
            "social_queries": [query_context, f"{query_context} discussion"],
            "web_queries": [query_context, f"{query_context} news"],
            "youtube_queries": [query_context, f"{query_context} explainer", f"{query_context} highlights"],
            "llm_probes": [f"What is happening with {query_context}?", f"Why is {query_context} trending?"]
        }
        return {
            "research_plan": fallback_plan,
            "errors": [{"source": "planner", "message": str(e)}]
        }
