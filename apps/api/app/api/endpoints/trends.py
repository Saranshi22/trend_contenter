from fastapi import APIRouter, Depends, Query, HTTPException, BackgroundTasks
from typing import List, Optional, Dict, Any
from datetime import datetime
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

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
    background_tasks: BackgroundTasks,
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
    Automatically evaluates monitored watchlists and dispatches investigations.
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

    # 3. Automatic Watchlist Evaluation & Auto-Investigation Trigger
    try:
        from ...services.watchlist_matcher import evaluate_watchlist_triggers
        await evaluate_watchlist_triggers(
            db=db,
            user=current_user,
            background_tasks=background_tasks
        )
    except Exception as e:
        import logging
        logging.getLogger(__name__).warning(f"Watchlist evaluation error: {e}")

    return PollTrendsResponse(
        total_fetched=len(persisted_items),
        qualified_count=qualified_count,
        candidate_count=candidate_count,
        provider_used=settings.TRENDS_PROVIDER,
        region=region,
        trends=persisted_items
    )

class ProviderHealthItem(BaseModel):
    id: str
    name: str
    provider_type: str
    configured: bool
    status: str  # "healthy" | "degraded" | "unavailable" | "not_configured"
    label: str   # "Healthy • Live", "Degraded (Fallback)", "Unavailable", "Not Configured"
    badge_class: str
    last_runtime_status: Optional[str] = None
    details: str

class ProviderHealthSummary(BaseModel):
    providers: List[ProviderHealthItem]
    all_healthy: bool
    healthy_count: int
    total_count: int
    headline: str

@router.get("/provider-health", response_model=ProviderHealthSummary)
async def get_provider_health(
    db: AsyncSession = Depends(get_postgres_session)
):
    """
    Returns truthful runtime health across all 5 research providers based on:
    - Current environment configuration (API keys present)
    - Latest actual pipeline observations and execution results
    - Distinction between configured integrations vs successful live fetches
    """
    # 1. Fetch latest investigation to check real runtime source_statuses
    latest_inv_res = await db.execute(
        text("SELECT source_statuses, status FROM investigations ORDER BY created_at DESC LIMIT 1")
    )
    latest_inv = latest_inv_res.mappings().first()
    source_statuses = (latest_inv["source_statuses"] if latest_inv and latest_inv.get("source_statuses") else {}) or {}

    # 2. Check trends count in DB
    trends_res = await db.execute(text("SELECT COUNT(*) as cnt FROM trends"))
    trends_count = trends_res.scalar() or 0

    providers: List[ProviderHealthItem] = []

    # Provider 1: Google Trends Radar (SerpApi)
    has_serpapi = bool(settings.SERPAPI_API_KEY)
    if has_serpapi and trends_count > 0:
        providers.append(ProviderHealthItem(
            id="google_trends",
            name="Google Trends",
            provider_type="trend_radar",
            configured=True,
            status="healthy",
            label="Healthy • Live",
            badge_class="badge-emerald",
            last_runtime_status="ingested",
            details="Discover emerging searches and rising interest."
        ))
    elif has_serpapi:
        providers.append(ProviderHealthItem(
            id="google_trends",
            name="Google Trends",
            provider_type="trend_radar",
            configured=True,
            status="degraded",
            label="Awaiting Ingestion",
            badge_class="badge-amber",
            last_runtime_status="pending",
            details="Discover emerging searches and rising interest."
        ))
    else:
        providers.append(ProviderHealthItem(
            id="google_trends",
            name="Google Trends",
            provider_type="trend_radar",
            configured=False,
            status="not_configured",
            label="Not configured",
            badge_class="badge-neutral",
            last_runtime_status="missing_key",
            details="Discover emerging searches and rising interest."
        ))

    # Provider 2: Google News & Web Search (SerpApi)
    web_run = source_statuses.get("web")
    if has_serpapi and web_run == "success":
        providers.append(ProviderHealthItem(
            id="google_news",
            name="Google News & Web",
            provider_type="web_news",
            configured=True,
            status="healthy",
            label="Healthy • Live",
            badge_class="badge-emerald",
            last_runtime_status="success",
            details="Follow news coverage and supporting web sources."
        ))
    elif has_serpapi and web_run in ("failed", "auth_error", "error"):
        providers.append(ProviderHealthItem(
            id="google_news",
            name="Google News & Web",
            provider_type="web_news",
            configured=True,
            status="unavailable",
            label="Unavailable",
            badge_class="badge-amber",
            last_runtime_status=web_run,
            details="Follow news coverage and supporting web sources."
        ))
    elif has_serpapi and web_run == "degraded":
        providers.append(ProviderHealthItem(
            id="google_news",
            name="Google News & Web",
            provider_type="web_news",
            configured=True,
            status="degraded",
            label="Degraded",
            badge_class="badge-amber",
            last_runtime_status="degraded",
            details="Follow news coverage and supporting web sources."
        ))
    elif has_serpapi and not web_run:
        providers.append(ProviderHealthItem(
            id="google_news",
            name="Google News & Web",
            provider_type="web_news",
            configured=True,
            status="degraded",
            label="Awaiting Verification",
            badge_class="badge-amber",
            last_runtime_status="unverified",
            details="Follow news coverage and supporting web sources."
        ))
    else:
        providers.append(ProviderHealthItem(
            id="google_news",
            name="Google News & Web",
            provider_type="web_news",
            configured=False,
            status="not_configured",
            label="Not configured",
            badge_class="badge-neutral",
            last_runtime_status="missing_key",
            details="Follow news coverage and supporting web sources."
        ))

    # Provider 3: Reddit
    has_socialcrawl = bool(settings.get_socialcrawl_api_key())
    social_run = source_statuses.get("social")
    if not has_socialcrawl:
        providers.append(ProviderHealthItem(
            id="socialcrawl",
            name="Reddit",
            provider_type="social",
            configured=False,
            status="not_configured",
            label="Not configured",
            badge_class="badge-neutral",
            last_runtime_status="missing_key",
            details="Explore public conversations, reactions, and audience questions."
        ))
    elif social_run == "success":
        providers.append(ProviderHealthItem(
            id="socialcrawl",
            name="Reddit",
            provider_type="social",
            configured=True,
            status="healthy",
            label="Healthy • Live",
            badge_class="badge-emerald",
            last_runtime_status="success",
            details="Explore public conversations, reactions, and audience questions."
        ))
    elif social_run in ("failed", "auth_error"):
        providers.append(ProviderHealthItem(
            id="socialcrawl",
            name="Reddit",
            provider_type="social",
            configured=True,
            status="unavailable",
            label="Unavailable",
            badge_class="badge-amber",
            last_runtime_status=social_run,
            details="Explore public conversations, reactions, and audience questions."
        ))
    elif social_run == "credits_exhausted":
        providers.append(ProviderHealthItem(
            id="socialcrawl",
            name="Reddit",
            provider_type="social",
            configured=True,
            status="degraded",
            label="Credits Depleted",
            badge_class="badge-amber",
            last_runtime_status="credits_exhausted",
            details="Explore public conversations, reactions, and audience questions."
        ))
    elif social_run == "rate_limited":
        providers.append(ProviderHealthItem(
            id="socialcrawl",
            name="Reddit",
            provider_type="social",
            configured=True,
            status="degraded",
            label="Rate Limited",
            badge_class="badge-amber",
            last_runtime_status="rate_limited",
            details="Explore public conversations, reactions, and audience questions."
        ))
    elif social_run in ("degraded", "partial"):
        providers.append(ProviderHealthItem(
            id="socialcrawl",
            name="Reddit",
            provider_type="social",
            configured=True,
            status="degraded",
            label="Degraded",
            badge_class="badge-amber",
            last_runtime_status=social_run,
            details="Explore public conversations, reactions, and audience questions."
        ))
    elif not social_run:
        providers.append(ProviderHealthItem(
            id="socialcrawl",
            name="Reddit",
            provider_type="social",
            configured=True,
            status="degraded",
            label="Awaiting Verification",
            badge_class="badge-amber",
            last_runtime_status="unverified",
            details="Explore public conversations, reactions, and audience questions."
        ))
    else:
        providers.append(ProviderHealthItem(
            id="socialcrawl",
            name="Reddit",
            provider_type="social",
            configured=True,
            status="degraded",
            label="Degraded",
            badge_class="badge-amber",
            last_runtime_status=str(social_run),
            details="Explore public conversations, reactions, and audience questions."
        ))

    # Provider 4: YouTube
    has_yt = bool(settings.get_youtube_api_key())
    yt_run = source_statuses.get("youtube")
    if not has_yt:
        providers.append(ProviderHealthItem(
            id="youtube_v3",
            name="YouTube",
            provider_type="video",
            configured=False,
            status="not_configured",
            label="Not configured",
            badge_class="badge-neutral",
            last_runtime_status="missing_key",
            details="Discover trending videos and audience discussions."
        ))
    elif yt_run == "success":
        providers.append(ProviderHealthItem(
            id="youtube_v3",
            name="YouTube",
            provider_type="video",
            configured=True,
            status="healthy",
            label="Healthy • Live",
            badge_class="badge-emerald",
            last_runtime_status="success",
            details="Discover trending videos and audience discussions."
        ))
    elif yt_run == "quota_exceeded":
        providers.append(ProviderHealthItem(
            id="youtube_v3",
            name="YouTube",
            provider_type="video",
            configured=True,
            status="degraded",
            label="Quota Exceeded",
            badge_class="badge-amber",
            last_runtime_status="quota_exceeded",
            details="Discover trending videos and audience discussions."
        ))
    elif yt_run in ("failed", "auth_error", "error"):
        providers.append(ProviderHealthItem(
            id="youtube_v3",
            name="YouTube",
            provider_type="video",
            configured=True,
            status="unavailable",
            label="Unavailable",
            badge_class="badge-amber",
            last_runtime_status="failed",
            details="Discover trending videos and audience discussions."
        ))
    elif yt_run == "degraded":
        providers.append(ProviderHealthItem(
            id="youtube_v3",
            name="YouTube",
            provider_type="video",
            configured=True,
            status="degraded",
            label="Degraded",
            badge_class="badge-amber",
            last_runtime_status="degraded",
            details="Discover trending videos and audience discussions."
        ))
    elif not yt_run:
        providers.append(ProviderHealthItem(
            id="youtube_v3",
            name="YouTube",
            provider_type="video",
            configured=True,
            status="degraded",
            label="Awaiting Verification",
            badge_class="badge-amber",
            last_runtime_status="unverified",
            details="Discover trending videos and audience discussions."
        ))
    else:
        providers.append(ProviderHealthItem(
            id="youtube_v3",
            name="YouTube",
            provider_type="video",
            configured=True,
            status="degraded",
            label="Degraded",
            badge_class="badge-amber",
            last_runtime_status=str(yt_run),
            details="Discover trending videos and audience discussions."
        ))

    # Provider 5: LLM Monitoring system
    has_llm = bool(settings.OPENAI_API_KEY or settings.GEMINI_API_KEY)
    llm_run = source_statuses.get("llm")
    if not has_llm:
        providers.append(ProviderHealthItem(
            id="llm_monitoring",
            name="LLM Monitoring system",
            provider_type="llm_monitoring",
            configured=False,
            status="not_configured",
            label="Not configured",
            badge_class="badge-neutral",
            last_runtime_status="missing_key",
            details="Analyze how AI assistants respond to topics and brands."
        ))
    elif llm_run == "success":
        providers.append(ProviderHealthItem(
            id="llm_monitoring",
            name="LLM Monitoring system",
            provider_type="llm_monitoring",
            configured=True,
            status="healthy",
            label="Healthy • Live",
            badge_class="badge-emerald",
            last_runtime_status="success",
            details="Analyze how AI assistants respond to topics and brands."
        ))
    elif llm_run in ("failed", "auth_error", "error"):
        providers.append(ProviderHealthItem(
            id="llm_monitoring",
            name="LLM Monitoring system",
            provider_type="llm_monitoring",
            configured=True,
            status="unavailable",
            label="Unavailable",
            badge_class="badge-amber",
            last_runtime_status=llm_run,
            details="Analyze how AI assistants respond to topics and brands."
        ))
    elif llm_run in ("degraded", "quota_exceeded", "rate_limited"):
        providers.append(ProviderHealthItem(
            id="llm_monitoring",
            name="LLM Monitoring system",
            provider_type="llm_monitoring",
            configured=True,
            status="degraded",
            label="Degraded",
            badge_class="badge-amber",
            last_runtime_status=llm_run,
            details="Analyze how AI assistants respond to topics and brands."
        ))
    elif not llm_run:
        providers.append(ProviderHealthItem(
            id="llm_monitoring",
            name="LLM Monitoring system",
            provider_type="llm_monitoring",
            configured=True,
            status="degraded",
            label="Awaiting Verification",
            badge_class="badge-amber",
            last_runtime_status="unverified",
            details="Analyze how AI assistants respond to topics and brands."
        ))
    else:
        providers.append(ProviderHealthItem(
            id="llm_monitoring",
            name="LLM Monitoring system",
            provider_type="llm_monitoring",
            configured=True,
            status="degraded",
            label="Degraded",
            badge_class="badge-amber",
            last_runtime_status=str(llm_run),
            details="Analyze how AI assistants respond to topics and brands."
        ))

    healthy_count = sum(1 for p in providers if p.status == "healthy")
    all_healthy = (healthy_count == len(providers))
    degraded_count = len(providers) - healthy_count
    headline = (
        "All 5 Providers Operational" if all_healthy else f"{healthy_count} of {len(providers)} Providers Operational ({degraded_count} Degraded)"
    )

    return ProviderHealthSummary(
        providers=providers,
        all_healthy=all_healthy,
        healthy_count=healthy_count,
        total_count=len(providers),
        headline=headline
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
