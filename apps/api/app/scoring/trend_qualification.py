from typing import Dict, Any, Optional, List
import math
from datetime import datetime, timezone

from ..domain.models.trend import TrendSnapshot
from ..config import settings

def calculate_qualification_score(
    trend: TrendSnapshot,
    previous_observations: Optional[List[TrendSnapshot]] = None,
    weights: Optional[Dict[str, float]] = None
) -> Dict[str, Any]:
    """
    Implements Section 9: Trend qualification algorithm.
    qualification_score =
        0.35 * normalized_velocity +
        0.25 * normalized_acceleration +
        0.20 * novelty +
        0.10 * persistence +
        0.10 * source_availability
        
    Distinguishes provider-reported metrics (increase_percentage, search_volume)
    from internally calculated momentum and qualification scores.
    """
    if weights is None:
        weights = {
            "velocity": 0.35,
            "acceleration": 0.25,
            "novelty": 0.20,
            "persistence": 0.10,
            "source_availability": 0.10
        }

    # 1. Normalized Velocity
    # SerpApi provides increase_percentage (e.g. 100% to 1000%+) and search_volume (e.g. 500 to 500000+)
    inc_pct = trend.increase_percentage if trend.increase_percentage is not None else 0.0
    vol = trend.search_volume if trend.search_volume is not None else 0
    
    # Sigmoid / bounded log normalization for percentage increase
    # 100% -> ~0.35, 500% -> ~0.75, 1000%+ -> ~0.95
    pct_factor = min(inc_pct / 600.0, 1.0)
    vol_factor = min(math.log10(max(vol, 10)) / 5.0, 1.0)  # 10 -> 0.2, 1000 -> 0.6, 100000 -> 1.0
    
    normalized_velocity = round(min(max(0.6 * pct_factor + 0.4 * vol_factor, 0.05), 1.0), 3)

    # 2. Normalized Acceleration
    # Compare with previous observation if available
    if previous_observations and len(previous_observations) > 0:
        prev = previous_observations[-1]
        prev_vol = prev.search_volume or 0
        prev_pct = prev.increase_percentage or 0.0
        
        # Did velocity/volume accelerate since last poll?
        if vol > prev_vol or inc_pct > prev_pct:
            normalized_acceleration = 0.85
        elif vol == prev_vol and inc_pct == prev_pct:
            normalized_acceleration = 0.50
        else:
            normalized_acceleration = 0.30
    else:
        # Default starting acceleration assumption for newly surfaced trending topic
        normalized_acceleration = 0.65

    # 3. Novelty
    if not previous_observations or len(previous_observations) == 0:
        novelty = 1.0
    elif len(previous_observations) <= 2:
        novelty = 0.8
    else:
        novelty = max(0.4, 1.0 - (len(previous_observations) * 0.1))

    # 4. Persistence
    persistence = 1.0 if trend.active else 0.3

    # 5. Source Availability
    has_breakdown = bool(trend.trend_breakdown and len(trend.trend_breakdown) > 0)
    has_sources = bool(trend.source_links and len(trend.source_links) > 0)
    
    if has_breakdown and has_sources:
        source_availability = 1.0
    elif has_breakdown or has_sources:
        source_availability = 0.7
    else:
        source_availability = 0.4

    # Calculate final qualification score using configurable weights
    score = (
        weights["velocity"] * normalized_velocity +
        weights["acceleration"] * normalized_acceleration +
        weights["novelty"] * novelty +
        weights["persistence"] * persistence +
        weights["source_availability"] * source_availability
    )
    qualification_score = round(min(max(score, 0.0), 1.0), 3)

    threshold = settings.TREND_QUALIFICATION_THRESHOLD
    status = "qualified" if qualification_score >= threshold else "candidate"

    return {
        "qualification_score": qualification_score,
        "status": status,
        "metrics": {
            "normalized_velocity": normalized_velocity,
            "normalized_acceleration": normalized_acceleration,
            "novelty": round(novelty, 2),
            "persistence": round(persistence, 2),
            "source_availability": round(source_availability, 2)
        }
    }

def qualify_trend_snapshot(
    trend: TrendSnapshot,
    previous_observations: Optional[List[TrendSnapshot]] = None
) -> TrendSnapshot:
    """Qualifies a trend snapshot and updates its score and status in-place or returns updated model."""
    result = calculate_qualification_score(trend, previous_observations)
    trend.velocity = result["metrics"]["normalized_velocity"]
    trend.acceleration = result["metrics"]["normalized_acceleration"]
    trend.novelty_score = result["metrics"]["novelty"]
    trend.qualification_score = result["qualification_score"]
    
    # If the trend was already in progress or completed, do not demote it
    if trend.status not in ("investigating", "investigated"):
        trend.status = result["status"]
        
    return trend
