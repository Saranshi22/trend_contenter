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
    youtube_evidence: List[Dict[str, Any]]
    youtube_questions: List[str]
    youtube_videos: List[Dict[str, Any]]
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
