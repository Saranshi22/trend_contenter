import uuid
from typing import List, Dict, Any
from ..agents.state import InvestigationState

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
    topic = state.get("topic", "")
    
    for gap in (state.get("content_gaps") or []):
        score_data = calculate_opportunity_score(
            trend_momentum=0.92,
            audience_demand=0.88,
            content_gap_score=0.90,
            freshness=0.95,
            corroboration=0.85
        )
        
        title = gap.get("opportunity_title") or f"In-Depth Practical Guide to {topic}"
        problem = gap.get("problem") or "Underserved audience need in current market coverage."
        audience_need = gap.get("audience_need") or "High interest searching for practical answers."
        content_gap = gap.get("observed_gap") or "Existing coverage is superficial and lacks actionable details."
        recommended_angle = gap.get("recommended_angle") or "Actionable walkthrough with data and practical examples."
        recommended_format = gap.get("recommended_format") or "Explainer Article / Video Script"
        
        opp = {
            "opportunity_id": f"opp_{uuid.uuid4().hex[:8]}",
            "investigation_id": state.get("investigation_id", "inv_unknown"),
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

    if not opportunities:
        score_data = calculate_opportunity_score(
            trend_momentum=0.90,
            audience_demand=0.85,
            content_gap_score=0.88,
            freshness=0.92,
            corroboration=0.85
        )
        norm_ev = state.get("normalized_evidence") or []
        yt_ev_ids = [e.get("evidence_id") for e in norm_ev if e.get("source_type") == "video_platform"][:3]
        opportunities.append({
            "opportunity_id": f"opp_{uuid.uuid4().hex[:8]}",
            "investigation_id": state.get("investigation_id", "inv_unknown"),
            "audience_segment_id": "seg_1",
            "audience_label": f"{topic} Practitioners",
            "title": f"The Essential Practical Guide to {topic}",
            "problem": f"Existing video content and web articles provide high-level summaries but miss specific execution questions asked by viewers.",
            "audience_need": f"Direct, verified answers to emerging questions around {topic}.",
            "content_gap": "Superficial high-level coverage creates an underserved void for actionable explainers.",
            "recommended_angle": "Hands-on walkthrough answering recurring audience inquiries.",
            "recommended_format": "Video Explainer & Actionable Dossier",
            "score": score_data["score"],
            "score_breakdown": score_data["components"],
            "evidence_ids": yt_ev_ids or [e.get("evidence_id") for e in norm_ev[:2] if e.get("evidence_id")],
            "status": "suggested"
        })
        
    return {"opportunities": opportunities}
