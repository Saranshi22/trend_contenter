from pydantic import BaseModel, Field
from typing import Literal, List, Dict, Any, Optional
from datetime import datetime

class TrendSnapshot(BaseModel):
    trend_id: str
    topic: str
    canonical_topic: Optional[str] = None

    region: str
    category: Optional[str] = None
    categories: List[Dict[str, Any]] = Field(default_factory=list)

    observed_at: datetime
    retrieved_at: Optional[datetime] = None
    source: str = "serpapi_google_trends"
    source_provider: str = "serpapi_google_trends"

    # SerpApi Google Trends fields (preserved as reported, no fabrication)
    active: bool = True
    start_timestamp: Optional[datetime] = None
    end_timestamp: Optional[datetime] = None
    search_volume: Optional[int] = None
    increase_percentage: Optional[float] = None
    trend_breakdown: List[str] = Field(default_factory=list)
    source_links: Dict[str, str] = Field(default_factory=dict)

    interest_value: Optional[float] = None
    previous_interest_value: Optional[float] = None

    growth_pct: Optional[float] = None
    velocity: Optional[float] = None
    acceleration: Optional[float] = None

    novelty_score: float = 0.0
    qualification_score: float = 0.0

    status: Literal[
        "candidate",
        "qualified",
        "ignored",
        "investigating",
        "investigated"
    ] = "candidate"
    
    raw_data: Optional[Dict[str, Any]] = None
