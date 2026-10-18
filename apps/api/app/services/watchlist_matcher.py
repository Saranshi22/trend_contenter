import json
import uuid
import logging
import re
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional
import httpx
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from fastapi import BackgroundTasks

from ..domain.models.user import User
from ..domain.models.trend import TrendSnapshot
from ..repositories.trend_repository import PostgresTrendRepository
from ..api.endpoints.investigations import run_investigation_task, InvestigationRequest
from ..config import settings

logger = logging.getLogger(__name__)

async def probe_targeted_trend(query: str, region: str, db: AsyncSession) -> Optional[Dict[str, Any]]:
    """
    Probes Google Trends via SerpApi for a targeted keyword/topic when not found in broad trending feeds.
    If search interest is active or spiking (e.g. breakout queries or recent search interest index),
    constructs and persists a TrendSnapshot into PostgreSQL and returns the trend dict.
    """
    if not settings.SERPAPI_API_KEY:
        logger.warning("SerpApi API key not configured for targeted trend probe.")
        return None

    clean_q = query.strip()
    clean_reg = (region or "US").strip().upper()
    if clean_reg == "ALL":
        clean_reg = "US"

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            # 1. Check interest over time
            resp = await client.get(
                "https://serpapi.com/search.json",
                params={
                    "engine": "google_trends",
                    "q": clean_q,
                    "geo": clean_reg,
                    "api_key": settings.SERPAPI_API_KEY
                }
            )
            if resp.status_code != 200:
                logger.warning(f"SerpApi google_trends returned {resp.status_code} for query '{clean_q}'")
                return None

            data = resp.json()
            timeline = data.get("interest_over_time", {}).get("timeline_data", [])
            latest_val = 0.0
            if timeline:
                # Inspect recent data points
                for pt in reversed(timeline[-4:]):
                    vals = pt.get("values", [])
                    if vals:
                        v = float(vals[0].get("extracted_value", 0) or 0)
                        if v > latest_val:
                            latest_val = v

            # 2. Check related queries to extract breakout and related search context
            rel_resp = await client.get(
                "https://serpapi.com/search.json",
                params={
                    "engine": "google_trends",
                    "q": clean_q,
                    "geo": clean_reg,
                    "data_type": "RELATED_QUERIES",
                    "api_key": settings.SERPAPI_API_KEY
                }
            )
            related = []
            if rel_resp.status_code == 200:
                rdata = rel_resp.json()
                for item in rdata.get("related_queries", {}).get("top", [])[:12]:
                    q = item.get("query")
                    if q and q not in related:
                        related.append(q)
                for item in rdata.get("related_queries", {}).get("rising", [])[:12]:
                    q = item.get("query")
                    if q and q not in related:
                        related.append(q)

            # If there is measurable search interest or active related queries
            if latest_val < 15.0 and len(related) == 0:
                logger.info(f"Targeted probe for '{clean_q}' in {clean_reg} had insufficient search activity (val={latest_val}).")
                return None

            # Determine best display topic
            best_topic = clean_q.title()
            for r in related:
                r_lower = r.lower()
                # If a related query contains multiple terms from the query, it might be more specific
                if all(w in r_lower for w in clean_q.lower().split()):
                    best_topic = r.title()
                    break

            # Calculate qualification score based on Google Trends interest index (0-100)
            qual_score = min(0.96, max(0.65, latest_val / 100.0))

            canonical = re.sub(r"[^\w\s]", " ", best_topic.lower())
            canonical = " ".join(canonical.split())
            safe_slug = re.sub(r"\W+", "_", canonical)[:40] or uuid.uuid4().hex[:8]
            trend_id = f"tr_{clean_reg.lower()}_{safe_slug}"

            now = datetime.now(timezone.utc)
            snapshot = TrendSnapshot(
                trend_id=trend_id,
                topic=best_topic,
                canonical_topic=canonical,
                region=clean_reg,
                category="Technology & Automotive",
                active=True,
                search_volume=int(max(25000, latest_val * 1000)),
                increase_percentage=float(latest_val),
                trend_breakdown=related[:15],
                source_links={"google_trends": f"https://trends.google.com/trends/explore?q={clean_q.replace(' ', '+')}&geo={clean_reg}"},
                source_provider="serpapi_google_trends",
                start_timestamp=now,
                observed_at=now,
                retrieved_at=now,
                qualification_score=qual_score,
                status="candidate"
            )

            repo = PostgresTrendRepository(db)
            await repo.save_trend(snapshot)
            await db.commit()

            logger.info(f"Targeted probe matched and ingested trend '{best_topic}' ({clean_reg}) with score {qual_score:.2f}")

            return {
                "trend_id": trend_id,
                "topic": best_topic,
                "region": clean_reg,
                "category": snapshot.category,
                "qualification_score": qual_score,
                "trend_breakdown": snapshot.trend_breakdown,
                "status": "candidate"
            }
    except Exception as e:
        logger.error(f"Error during targeted trend probe for '{clean_q}': {e}", exc_info=True)
        return None


async def evaluate_watchlist_triggers(
    db: AsyncSession,
    user: User,
    background_tasks: Optional[BackgroundTasks] = None,
    target_trends: Optional[List[Dict[str, Any]]] = None,
    specific_watchlist_id: Optional[str] = None,
    return_details: bool = False
) -> Any:
    """
    Evaluates monitored watchlists against trends in the database.
    If no trends in DB match, executes a live targeted Google Trends probe for the watchlist keywords.
    When a trend meets the keyword match, region match, and qualification threshold,
    and auto_investigate is True, automatically dispatches an autonomous research investigation.
    """
    workspace_id = str(getattr(user, "workspace_id", "workspace_dev"))
    user_id = str(getattr(user, "user_id", getattr(user, "id", "dev_user")))

    # 1. Fetch active watchlists for workspace
    query = "SELECT * FROM watchlists WHERE workspace_id = :wid"
    params: Dict[str, Any] = {"wid": workspace_id}
    if specific_watchlist_id:
        query += " AND watchlist_id = :wlid"
        params["wlid"] = specific_watchlist_id

    wl_result = await db.execute(text(query), params)
    watchlists = wl_result.mappings().all()
    if not watchlists:
        return {"triggered": [], "already_investigated": []} if return_details else []

    triggered_investigations = []
    already_investigated = []

    for wl in watchlists:
        if not wl.get("auto_investigate"):
            continue

        raw_keywords = wl.get("keywords")
        if isinstance(raw_keywords, str):
            try:
                keywords = json.loads(raw_keywords)
            except Exception:
                keywords = []
        elif isinstance(raw_keywords, list):
            keywords = raw_keywords
        else:
            keywords = []

        keywords = [k.lower().strip() for k in keywords if k and k.strip()]
        if not keywords:
            continue

        min_score = float(wl.get("min_qualification_score") or 0.70)
        wl_region = (wl.get("region") or "").strip().upper()

        # 2. Fetch candidate trends for this specific watchlist's region
        if target_trends is None:
            if wl_region and wl_region != "ALL":
                trends_query = """
                    SELECT trend_id, topic, region, category, qualification_score, trend_breakdown, status
                    FROM trends
                    WHERE UPPER(region) = :reg
                    ORDER BY qualification_score DESC
                    LIMIT 200
                """
                tr_result = await db.execute(text(trends_query), {"reg": wl_region})
            else:
                trends_query = """
                    SELECT trend_id, topic, region, category, qualification_score, trend_breakdown, status
                    FROM trends
                    ORDER BY qualification_score DESC
                    LIMIT 200
                """
                tr_result = await db.execute(text(trends_query))
            trends_rows = tr_result.mappings().all()
            trends_to_check = [dict(r) for r in trends_rows]
        else:
            trends_to_check = list(target_trends)

        # Helper matching function
        def matches_watchlist(trend_dict: Dict[str, Any]) -> bool:
            # Region check
            t_region = (trend_dict.get("region") or "").strip().upper()
            if wl_region and wl_region != "ALL" and t_region and wl_region != t_region:
                return False

            topic = str(trend_dict.get("topic", "")).lower()
            raw_bd = trend_dict.get("trend_breakdown")
            bd_text = ""
            if isinstance(raw_bd, list):
                bd_text = " ".join([str(b).lower() for b in raw_bd])
            elif isinstance(raw_bd, str):
                bd_text = raw_bd.lower()

            searchable = f"{topic} {bd_text}"
            for kw in keywords:
                clean_kw = kw.strip().lower()
                if not clean_kw:
                    continue
                # Use word-boundary regex matching to avoid substring false positives (e.g. 'ai' matching 'entertainment' or 'saints')
                pattern = rf"\b{re.escape(clean_kw)}\b"
                if re.search(pattern, searchable, re.IGNORECASE):
                    return True
            return False

        matching_trends = [t for t in trends_to_check if matches_watchlist(t)]

        # 3. If no matching trends exist in DB, probe Google Trends directly for the keywords
        if not matching_trends:
            probed_candidates = []
            # Candidate queries: joined keywords, individual keywords, or watchlist name
            queries_to_try = []
            if len(keywords) > 1:
                queries_to_try.append(" ".join(keywords))
            wl_name = str(wl.get("name") or "").strip()
            if wl_name and wl_name.lower() not in [q.lower() for q in queries_to_try]:
                queries_to_try.append(wl_name)
            for k in keywords:
                if k not in queries_to_try:
                    queries_to_try.append(k)

            for probe_q in queries_to_try[:2]:
                probed_trend = await probe_targeted_trend(probe_q, wl_region or "US", db)
                if probed_trend:
                    probed_candidates.append(probed_trend)
                    break

            for pt in probed_candidates:
                if matches_watchlist(pt):
                    matching_trends.append(pt)

        # 4. Evaluate matched trends for triggers
        for trend in matching_trends:
            trend_score = float(trend.get("qualification_score", 0.0) or 0.0)
            if trend_score < min_score:
                logger.info(
                    f"Watchlist '{wl.get('name')}': trend '{trend.get('topic')}' matched keywords "
                    f"but score {trend_score:.2f} < threshold {min_score:.2f}"
                )
                continue

            # Check if an investigation for this topic already exists
            existing_inv = await db.execute(
                text("""
                    SELECT investigation_id, status FROM investigations 
                    WHERE workspace_id = :wid AND LOWER(topic) = LOWER(:t)
                    LIMIT 1
                """),
                {"wid": workspace_id, "t": trend.get("topic")}
            )
            existing_row = existing_inv.mappings().first()
            if existing_row:
                already_investigated.append({
                    "investigation_id": existing_row["investigation_id"],
                    "topic": trend.get("topic"),
                    "status": existing_row["status"],
                    "watchlist_name": wl.get("name")
                })
                continue

            # Launch auto-investigation!
            investigation_id = f"inv_{uuid.uuid4().hex[:8]}"
            await db.execute(
                text("""
                    INSERT INTO investigations (
                        investigation_id, workspace_id, user_id, topic, region,
                        status, stage, source_statuses, created_at, updated_at
                    ) VALUES (
                        :iid, :wid, :uid, :top, :reg,
                        'queued', 'Queued', '{"social": "pending", "web": "pending", "youtube": "pending", "llm": "pending"}', NOW(), NOW()
                    )
                """),
                {
                    "iid": investigation_id,
                    "wid": workspace_id,
                    "uid": user_id,
                    "top": trend.get("topic"),
                    "reg": trend.get("region") or wl_region or "US"
                }
            )
            # Mark trend as investigating
            await db.execute(
                text("UPDATE trends SET status = 'investigating' WHERE trend_id = :tid"),
                {"tid": trend.get("trend_id")}
            )
            await db.commit()

            raw_breakdown = trend.get("trend_breakdown")
            breakdown_list = raw_breakdown if isinstance(raw_breakdown, list) else []
            inv_req = InvestigationRequest(
                topic=trend.get("topic"),
                region=trend.get("region") or wl_region or "US",
                related_topics=breakdown_list
            )

            if background_tasks:
                background_tasks.add_task(run_investigation_task, investigation_id, inv_req, user)
            else:
                import asyncio
                asyncio.create_task(run_investigation_task(investigation_id, inv_req, user))

            logger.info(
                f"[Watchlist Auto-Investigate] Dispatched investigation {investigation_id} for topic '{trend.get('topic')}' "
                f"matching watchlist '{wl.get('name')}' (score {trend_score:.2f} >= {min_score:.2f})"
            )

            triggered_investigations.append({
                "investigation_id": investigation_id,
                "topic": trend.get("topic"),
                "watchlist_id": wl.get("watchlist_id"),
                "watchlist_name": wl.get("name"),
                "score": trend_score
            })

    if return_details:
        return {
            "triggered": triggered_investigations,
            "already_investigated": already_investigated
        }
    return triggered_investigations
