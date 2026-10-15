import asyncio
import uuid
import os
from datetime import datetime
from apscheduler.schedulers.asyncio import AsyncIOScheduler

# Import the LangGraph workflow and config
from apps.api.app.agents.investigation_graph import investigation_app
from apps.api.app.config import settings

from dotenv import load_dotenv
load_dotenv()

import asyncio
import uuid
import os
import logging
from datetime import datetime, timezone
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from dotenv import load_dotenv

load_dotenv()

# Import the LangGraph workflow, DB, repository and config
from apps.api.app.agents.investigation_graph import investigation_app
from apps.api.app.config import settings
from apps.api.app.db_postgres import AsyncSessionLocal, init_db
from apps.api.app.repositories.trend_repository import PostgresTrendRepository
from apps.api.app.repositories.graph_repository import PostgresGraphWriter
from apps.api.app.integrations.trends import get_trend_provider
from apps.api.app.scoring.trend_qualification import qualify_trend_snapshot

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("worker")

async def poll_and_investigate_trends():
    """
    Scheduled job:
    1. Polls trending searches from configured trend provider (SerpApi / Mock).
    2. Qualifies each trend using the qualification algorithm.
    3. Persists trend snapshots and historical observations into PostgreSQL.
    4. Triggers LangGraph investigations ONLY if qualification threshold is met
       AND trend has not already been investigated (deduplication).
    """
    logger.info(f"[{datetime.now()}] [WORKER] Starting scheduled trend polling cycle...")
    
    provider = get_trend_provider()
    region = settings.TRENDS_GEO or "IN"
    hours = settings.TRENDS_HOURS or 4
    only_active = settings.TRENDS_ONLY_ACTIVE
    hl = settings.TRENDS_LANGUAGE or "en"
    no_cache = settings.SERPAPI_NO_CACHE
    threshold = settings.TREND_QUALIFICATION_THRESHOLD

    try:
        raw_trends = await provider.get_trending_topics(
            region=region,
            hours=hours,
            only_active=only_active,
            hl=hl,
            no_cache=no_cache
        )
        logger.info(f"[WORKER] Retrieved {len(raw_trends)} trend candidates from {settings.TRENDS_PROVIDER} (geo={region})")
    except Exception as e:
        logger.error(f"[WORKER] Error retrieving trends from provider: {e}")
        return

    async with AsyncSessionLocal() as session:
        repo = PostgresTrendRepository(session)
        graph_writer = PostgresGraphWriter(session)

        qualified_for_investigation = []

        for trend in raw_trends:
            # Check previous observation history for this trend
            prev_obs = await repo.get_observations(trend.trend_id, limit=5)
            
            # Run qualification algorithm
            qualified_trend = qualify_trend_snapshot(trend)
            
            # Check if this trend is already recorded and its current status
            existing = await repo.get_trend_by_id(trend.trend_id)
            if existing and existing.status in ("investigating", "investigated"):
                # Preserve investigated status so we don't repeat the expensive workflow
                qualified_trend.status = existing.status

            # Persist snapshot (records observation in trend_observations and upserts in trends)
            await repo.save_trend(qualified_trend)

            # Determine whether to launch an investigation
            # Deduplication rules: only launch if newly qualified and not already investigated
            if (
                qualified_trend.qualification_score >= threshold
                and qualified_trend.status == "qualified"
            ):
                qualified_for_investigation.append(qualified_trend)

        logger.info(
            f"[WORKER] Qualification complete. {len(qualified_for_investigation)} trends meet threshold ({threshold}) for investigation."
        )

        # Launch investigations for qualified trends (cap at top 2 per poll cycle to respect quota)
        for target in qualified_for_investigation[:2]:
            investigation_id = f"inv_worker_{uuid.uuid4().hex[:8]}"
            logger.info(f"[WORKER] Triggering LangGraph investigation {investigation_id} for qualified topic: '{target.topic}' (Score: {target.qualification_score})")
            
            # Mark status as investigating
            await repo.update_status(target.trend_id, "investigating")

            initial_state = {
                "investigation_id": investigation_id,
                "workspace_id": "workspace_worker_auto",
                "user_id": "system_worker",
                "trend_id": target.trend_id,
                "topic": target.topic,
                "region": target.region,
                "related_topics": target.trend_breakdown,
                "trend_history": [],
                "research_plan": {},
                "social_evidence": [],
                "web_evidence": [],
                "llm_evidence": [],
                "normalized_evidence": [],
                "narratives": [],
                "questions": [],
                "audience_segments": [],
                "content_gaps": [],
                "opportunities": [],
                "errors": [],
                "status": "started"
            }

            try:
                final_state = await investigation_app.ainvoke(initial_state)
                # Write results to Postgres graph
                await graph_writer.write_investigation_graph(final_state)
                # Mark status as investigated
                await repo.update_status(target.trend_id, "investigated")
                logger.info(f"[WORKER] Investigation {investigation_id} completed successfully for '{target.topic}'.")
            except Exception as inv_err:
                logger.error(f"[WORKER] Investigation {investigation_id} failed for '{target.topic}': {inv_err}")
                await repo.update_status(target.trend_id, "qualified")

async def start_worker():
    logger.info(f"[{datetime.now()}] [WORKER] Initializing Trend Contenter Background Scheduler...")
    logger.info(f"[WORKER] Trend Provider: {settings.TRENDS_PROVIDER} | LLM Provider: {settings.LLM_PROVIDER}")
    
    # Ensure database schema is ready
    await init_db()

    scheduler = AsyncIOScheduler()
    poll_minutes = settings.TRENDS_POLL_INTERVAL_MINUTES or 60
    
    # Schedule recurring polling job
    scheduler.add_job(poll_and_investigate_trends, 'interval', minutes=poll_minutes)
    
    # Also trigger an initial poll on startup
    asyncio.create_task(poll_and_investigate_trends())
    
    scheduler.start()
    logger.info(f"[WORKER] Scheduler active. Polling interval: every {poll_minutes} minutes.")

    try:
        while True:
            await asyncio.sleep(3600)
    except (KeyboardInterrupt, SystemExit):
        logger.info("[WORKER] Worker stopping...")

if __name__ == "__main__":
    asyncio.run(start_worker())

