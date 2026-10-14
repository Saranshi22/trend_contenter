from fastapi import APIRouter, Depends, Query, HTTPException, BackgroundTasks
from typing import List, Optional, Dict, Any
from datetime import datetime
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from ...db_postgres import get_postgres_session
from ...repositories.trend_repository import PostgresTrendRepository
from ...integrations.trends import get_trend_provider
from ...scoring.trend_qualification import qualify_trend_snapshot
from ...config import settings
from ...security.auth import get_current_user
from ...domain.models.user import User

router = APIRouter()

class ProviderMetrics(BaseModel):
    search_volume: Optional[int] = Field(None, description="SerpApi provider-reported search volume")
    increase_percentage: Optional[float] = Field(None, description="SerpApi provider-reported increase percentage")
    start_timestamp: Optional[datetime] = None
    end_timestamp: Optional[datetime] = None
    trend_breakdown: List[str] = Field(default_factory=list)
    source_links: Dict[str, str] = Field(default_factory=dict)
    source_provider: str = "serpapi_google_trends"

class InternalMetrics(BaseModel):
    qualification_score: float = Field(..., description="Internally computed qualification score [0.0 - 1.0]")
    velocity: Optional[float] = Field(None, description="Internally normalized velocity metric")
    acceleration: Optional[float] = Field(None, description="Internally normalized acceleration metric")
    novelty_score: float = Field(0.0, description="Internally computed novelty score")
    status: str = Field("candidate", description="Trend pipeline qualification status")

class TrendRadarItem(BaseModel):
    trend_id: str
    topic: str
    canonical_topic: Optional[str] = None
    region: str
    category: Optional[str] = None
    active: bool
    observed_at: datetime
    retrieved_at: Optional[datetime] = None
    provider_metrics: ProviderMetrics
    internal_metrics: InternalMetrics

class PollTrendsResponse(BaseModel):
    total_fetched: int
    qualified_count: int
    candidate_count: int
    provider_used: str
    region: str
    trends: List[TrendRadarItem]

def _to_radar_item(t) -> TrendRadarItem:
    return TrendRadarItem(
        trend_id=t.trend_id,
        topic=t.topic,
        canonical_topic=t.canonical_topic,
        region=t.region,
        category=t.category,
        active=t.active,
        observed_at=t.observed_at,
        retrieved_at=t.retrieved_at,
        provider_metrics=ProviderMetrics(
            search_volume=t.search_volume,
            increase_percentage=t.increase_percentage,
            start_timestamp=t.start_timestamp,
            end_timestamp=t.end_timestamp,
            trend_breakdown=t.trend_breakdown,
            source_links=t.source_links,
            source_provider=t.source_provider
        ),
        internal_metrics=InternalMetrics(
            qualification_score=t.qualification_score,
            velocity=t.velocity,
            acceleration=t.acceleration,
            novelty_score=t.novelty_score,
            status=t.status
        )
    )

@router.get("/", response_model=List[TrendRadarItem])
async def list_trends(
    region: Optional[str] = Query(None, description="Filter by region e.g. IN, US"),
    status: Optional[str] = Query(None, description="Filter by status: candidate, qualified, investigated"),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_postgres_session),
    current_user: User = Depends(get_current_user)
):
    """
    Exposes persisted trends for the Trend Radar.
    Clearly distinguishes provider-reported metrics from internal qualification/momentum scores.
    """
    repo = PostgresTrendRepository(db)
    trends = await repo.get_trends(region=region, status=status, limit=limit)
    return [_to_radar_item(t) for t in trends]

@router.post("/poll", response_model=PollTrendsResponse)
async def poll_trends_now(
    region: str = Query("IN", description="Target region (default: IN)"),
    hours: int = Query(4, ge=1, le=48),
    only_active: bool = Query(True),
    no_cache: bool = Query(False, description="Force live un-cached fetch from SerpApi"),
    db: AsyncSession = Depends(get_postgres_session),
    current_user: User = Depends(get_current_user)
):
    """
    Triggers an immediate poll of the configured trend provider (SerpApi).
    Normalizes results, persists snapshots to PostgreSQL, and qualifies trends.
    """
    provider = get_trend_provider()
    repo = PostgresTrendRepository(db)

    # 1. Fetch from provider
    raw_snapshots = await provider.get_trending_topics(
        region=region,
        hours=hours,
        only_active=only_active,
        no_cache=no_cache
    )

    # 2. Qualify and persist each trend
    persisted_items: List[TrendRadarItem] = []
    qualified_count = 0
    candidate_count = 0

    for snap in raw_snapshots:
        # Check existing observations for acceleration & novelty
        prev_obs = await repo.get_observations(snap.trend_id, limit=5)
        # Qualify using algorithm
        qualified = qualify_trend_snapshot(snap)
        
        # Save to PostgreSQL (both observation record and active trends upsert)
        saved = await repo.save_trend(qualified)
        radar_item = _to_radar_item(saved)
        persisted_items.append(radar_item)

        if saved.status == "qualified":
            qualified_count += 1
        else:
            candidate_count += 1

    return PollTrendsResponse(
        total_fetched=len(persisted_items),
        qualified_count=qualified_count,
        candidate_count=candidate_count,
        provider_used=settings.TRENDS_PROVIDER,
        region=region,
        trends=persisted_items
    )

@router.get("/{trend_id}/history")
async def get_trend_history(
    trend_id: str,
    db: AsyncSession = Depends(get_postgres_session),
    current_user: User = Depends(get_current_user)
):
    """
    Returns observation history for a specific trend to inspect velocity over time.
    """
    repo = PostgresTrendRepository(db)
    observations = await repo.get_observations(trend_id, limit=50)
    if not observations:
        raise HTTPException(status_code=404, detail=f"No observations found for trend_id: {trend_id}")
    return observations
