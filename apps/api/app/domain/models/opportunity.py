from pydantic import BaseModel
from typing import Literal

class ContentOpportunity(BaseModel):
    opportunity_id: str
    investigation_id: str

    audience_segment_id: str

    title: str
    problem: str
    audience_need: str
    content_gap: str
    recommended_angle: str
    recommended_format: str

    score: float
    score_breakdown: dict[str, float]

    evidence_ids: list[str]

    status: Literal[
        "suggested",
        "selected",
        "in_generation",
        "generated",
        "approved",
        "rejected"
    ]
