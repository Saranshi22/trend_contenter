from typing import TypedDict, List, Dict, Any

class InvestigationState(TypedDict):
    investigation_id: str
    workspace_id: str
    user_id: str

    trend_id: str
    topic: str
    region: str

    trend_history: List[Dict[str, Any]]
    related_topics: List[str]

    research_plan: Dict[str, Any]

    social_evidence: List[Dict[str, Any]]
    web_evidence: List[Dict[str, Any]]
    llm_evidence: List[Dict[str, Any]]

    source_statuses: Dict[str, str]
    llm_analysis: Dict[str, Any]

    normalized_evidence: List[Dict[str, Any]]

    narratives: List[Dict[str, Any]]
    questions: List[Dict[str, Any]]

    audience_segments: List[Dict[str, Any]]
    content_gaps: List[Dict[str, Any]]
    opportunities: List[Dict[str, Any]]

    errors: List[Dict[str, Any]]
    status: str
    stage: str

from langgraph.graph import StateGraph, END
from .planner import create_research_plan
from .research_nodes import research_social, research_web, monitor_llm, normalize_and_deduplicate
from .trend_story import synthesize_trend_story
from .audience_agent import discover_audiences
from .gap_agent import detect_content_gaps
from ..scoring.opportunity_score import score_opportunities

# Define graph
workflow = StateGraph(InvestigationState)

# Add nodes
workflow.add_node("planner", create_research_plan)
workflow.add_node("research_social", research_social)
workflow.add_node("research_web", research_web)
workflow.add_node("monitor_llm", monitor_llm)
workflow.add_node("normalize_evidence", normalize_and_deduplicate)
workflow.add_node("trend_story", synthesize_trend_story)
workflow.add_node("audience_discovery", discover_audiences)
workflow.add_node("gap_analysis", detect_content_gaps)
workflow.add_node("opportunity_scoring", score_opportunities)

# Build edges
workflow.set_entry_point("planner")
workflow.add_edge("planner", "research_social")
workflow.add_edge("research_social", "research_web")
workflow.add_edge("research_web", "monitor_llm")
workflow.add_edge("monitor_llm", "normalize_evidence")
workflow.add_edge("normalize_evidence", "trend_story")
workflow.add_edge("trend_story", "audience_discovery")
workflow.add_edge("audience_discovery", "gap_analysis")
workflow.add_edge("gap_analysis", "opportunity_scoring")
workflow.add_edge("opportunity_scoring", END)

# Compile graph
investigation_app = workflow.compile()
