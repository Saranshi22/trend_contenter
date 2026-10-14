import uuid
from typing import List, Dict, Any
from ..agents.investigation_graph import InvestigationState

def calculate_opportunity_score(
    trend_momentum: float,
    audience_demand: float,
    content_gap_score: float,
    freshness: float,
    corroboration: float
) -> Dict[str, Any]:
    
    score = (
        0.25 * trend_momentum +
        0.20 * audience_demand +
        0.25 * content_gap_score +
        0.15 * freshness +
        0.15 * corroboration
    )
    
    return {
        "score": round(score, 2),
        "components": {
            "trend_momentum": trend_momentum,
            "audience_demand": audience_demand,
            "content_gap": content_gap_score,
            "freshness": freshness,
            "corroboration": corroboration
        }
    }

async def score_opportunities(state: InvestigationState) -> dict:
    """Node that maps content gaps to scored Content Opportunities (deterministic scoring + AI content)."""
    opportunities = []
    
    for gap in state.get("content_gaps", []):
        score_data = calculate_opportunity_score(
            trend_momentum=0.92,
            audience_demand=0.88,
            content_gap_score=0.90,
            freshness=0.95,
            corroboration=0.85
        )
        
        title = gap.get("opportunity_title") or f"In-Depth Guide to {state['topic']}"
        problem = gap.get("problem") or "Underserved audience need in current market coverage."
        audience_need = gap.get("audience_need") or "High interest searching for practical answers."
        content_gap = gap.get("observed_gap") or "Existing coverage is superficial and lacks actionable details."
        recommended_angle = gap.get("recommended_angle") or "Actionable walkthrough with data and practical examples."
        recommended_format = gap.get("recommended_format") or "Explainer Article / Video Script"
        
        opp = {
            "opportunity_id": f"opp_{uuid.uuid4().hex[:8]}",
            "investigation_id": state["investigation_id"],
            "audience_segment_id": gap.get("audience_segment_id") or "1",
            "audience_label": gap.get("audience_label") or "Target Audience",
            "title": title,
            "problem": problem,
            "audience_need": audience_need,
            "content_gap": content_gap,
            "recommended_angle": recommended_angle,
            "recommended_format": recommended_format,
            "score": score_data["score"],
            "score_breakdown": score_data["components"],
            "evidence_ids": gap.get("evidence_ids", []),
            "status": "suggested"
        }
        opportunities.append(opp)
        
    return {"opportunities": opportunities}
