import json
from datetime import datetime, timezone
from typing import List, Optional, Dict, Any
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

from .base import BaseRepository
from ..domain.models.trend import TrendSnapshot

class PostgresTrendRepository:
    """
    Persists trend snapshots and historical observations into PostgreSQL.
    Deduplicates repeated polls in the active trends table without deleting historical observations.
    """
    def __init__(self, session: AsyncSession):
        self.session = session

    @staticmethod
    def _to_naive_dt(dt: Optional[datetime]) -> Optional[datetime]:
        if dt is None:
            return None
        if dt.tzinfo is not None:
            return dt.astimezone(timezone.utc).replace(tzinfo=None)
        return dt

    async def save_trend(self, trend: TrendSnapshot) -> TrendSnapshot:
        """
        Saves a trend snapshot:
        1. Appends an observation entry into trend_observations table (historical audit log).
        2. Upserts latest snapshot into trends table (deduplicated active view).
        """
        now = datetime.now(timezone.utc)
        retrieved_at = self._to_naive_dt(trend.retrieved_at or now)
        observed_at = self._to_naive_dt(trend.observed_at or trend.retrieved_at or now)
        start_ts = self._to_naive_dt(trend.start_timestamp)
        end_ts = self._to_naive_dt(trend.end_timestamp)

        # 1. Historical observation snapshot
        obs_stmt = text("""
            INSERT INTO trend_observations (
                trend_id, topic, region, category, search_volume,
                increase_percentage, active, observed_at, retrieved_at, raw_payload
            ) VALUES (
                :trend_id, :topic, :region, :category, :search_volume,
                :increase_percentage, :active, :observed_at, :retrieved_at, :raw_payload
            )
        """)
        await self.session.execute(obs_stmt, {
            "trend_id": trend.trend_id,
            "topic": trend.topic,
            "region": trend.region,
            "category": trend.category,
            "search_volume": trend.search_volume,
            "increase_percentage": trend.increase_percentage,
            "active": trend.active,
            "observed_at": observed_at,
            "retrieved_at": retrieved_at,
            "raw_payload": json.dumps(trend.raw_data or {})
        })

        # 2. Upsert active trends view with deduplication
        trend_stmt = text("""
            INSERT INTO trends (
                trend_id, topic, canonical_topic, region, category, active,
                search_volume, increase_percentage, trend_breakdown, source_links,
                source_provider, start_timestamp, end_timestamp, observed_at,
                retrieved_at, novelty_score, qualification_score, status
            ) VALUES (
                :trend_id, :topic, :canonical_topic, :region, :category, :active,
                :search_volume, :increase_percentage, :trend_breakdown, :source_links,
                :source_provider, :start_timestamp, :end_timestamp, :observed_at,
                :retrieved_at, :novelty_score, :qualification_score, :status
            )
            ON CONFLICT (trend_id) DO UPDATE SET
                active = EXCLUDED.active,
                search_volume = EXCLUDED.search_volume,
                increase_percentage = EXCLUDED.increase_percentage,
                trend_breakdown = EXCLUDED.trend_breakdown,
                source_links = EXCLUDED.source_links,
                retrieved_at = EXCLUDED.retrieved_at,
                novelty_score = EXCLUDED.novelty_score,
                qualification_score = EXCLUDED.qualification_score,
                status = CASE 
                    WHEN trends.status IN ('investigating', 'investigated') THEN trends.status
                    ELSE EXCLUDED.status
                END
        """)

        await self.session.execute(trend_stmt, {
            "trend_id": trend.trend_id,
            "topic": trend.topic,
            "canonical_topic": trend.canonical_topic or trend.topic.lower(),
            "region": trend.region,
            "category": trend.category,
            "active": trend.active,
            "search_volume": trend.search_volume,
            "increase_percentage": trend.increase_percentage,
            "trend_breakdown": json.dumps(trend.trend_breakdown or []),
            "source_links": json.dumps(trend.source_links or {}),
            "source_provider": trend.source_provider,
            "start_timestamp": start_ts,
            "end_timestamp": end_ts,
            "observed_at": observed_at,
            "retrieved_at": retrieved_at,
            "novelty_score": trend.novelty_score,
            "qualification_score": trend.qualification_score,
            "status": trend.status
        })

        await self.session.commit()
        return trend

    async def get_trends(
        self,
        region: Optional[str] = None,
        status: Optional[str] = None,
        limit: int = 100
    ) -> List[TrendSnapshot]:
        """Fetch trends from PostgreSQL ordered by qualification score and freshness."""
        query = "SELECT * FROM trends WHERE 1=1"
        params: Dict[str, Any] = {"limit": limit}

        if region:
            query += " AND UPPER(region) = :region"
            params["region"] = region.upper()
        if status:
            query += " AND status = :status"
            params["status"] = status

        query += " ORDER BY qualification_score DESC, retrieved_at DESC NULLS LAST LIMIT :limit"

        result = await self.session.execute(text(query), params)
        rows = result.mappings().all()

        snapshots: List[TrendSnapshot] = []
        for row in rows:
            tb = row.get("trend_breakdown")
            if isinstance(tb, str):
                try:
                    tb = json.loads(tb)
                except Exception:
                    tb = []
            elif not isinstance(tb, list):
                tb = []

            sl = row.get("source_links")
            if isinstance(sl, str):
                try:
                    sl = json.loads(sl)
                except Exception:
                    sl = {}
            elif not isinstance(sl, dict):
                sl = {}

            snapshots.append(
                TrendSnapshot(
                    trend_id=row["trend_id"],
                    topic=row["topic"],
                    canonical_topic=row.get("canonical_topic"),
                    region=row.get("region") or "IN",
                    category=row.get("category"),
                    active=bool(row.get("active", True)),
                    search_volume=row.get("search_volume"),
                    increase_percentage=row.get("increase_percentage"),
                    trend_breakdown=tb,
                    source_links=sl,
                    source=row.get("source_provider") or "serpapi_google_trends",
                    source_provider=row.get("source_provider") or "serpapi_google_trends",
                    start_timestamp=row.get("start_timestamp"),
                    end_timestamp=row.get("end_timestamp"),
                    observed_at=row.get("observed_at") or datetime.now(timezone.utc),
                    retrieved_at=row.get("retrieved_at"),
                    novelty_score=float(row.get("novelty_score") or 0.0),
                    qualification_score=float(row.get("qualification_score") or 0.0),
                    status=row.get("status") or "candidate"
                )
            )
        return snapshots

    async def get_trend_by_id(self, trend_id: str) -> Optional[TrendSnapshot]:
        stmt = text("SELECT * FROM trends WHERE trend_id = :trend_id")
        result = await self.session.execute(stmt, {"trend_id": trend_id})
        row = result.mappings().first()
        if not row:
            return None
        trends = await self.get_trends(limit=1)
        # Helper to construct snapshot
        for t in await self.get_trends(limit=200):
            if t.trend_id == trend_id:
                return t
        return None

    async def get_observations(self, trend_id: str, limit: int = 50) -> List[Dict[str, Any]]:
        stmt = text("""
            SELECT id, trend_id, topic, region, category, search_volume,
                   increase_percentage, active, observed_at, retrieved_at
            FROM trend_observations
            WHERE trend_id = :trend_id
            ORDER BY retrieved_at DESC
            LIMIT :limit
        """)
        result = await self.session.execute(stmt, {"trend_id": trend_id, "limit": limit})
        return [dict(r) for r in result.mappings().all()]

    async def update_status(self, trend_id: str, status: str) -> None:
        stmt = text("UPDATE trends SET status = :status WHERE trend_id = :trend_id")
        await self.session.execute(stmt, {"trend_id": trend_id, "status": status})
        await self.session.commit()


class TrendRepository(BaseRepository[TrendSnapshot]):
    """Preserves Mongo-backed repository for backward compatibility."""
    def __init__(self):
        super().__init__(TrendSnapshot, "trend_snapshots")
        
    async def get_qualified_trends(self, region: str = None) -> list[TrendSnapshot]:
        query = {"status": "qualified"}
        if region:
            query["region"] = region
            
        cursor = self.collection.find(query).sort("qualification_score", -1)
        trends = await cursor.to_list(length=100)
        return [self.model_class(**doc) for doc in trends]

