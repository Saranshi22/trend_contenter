#!/usr/bin/env python3
"""
Cloud Run Job / Standalone Script: Periodic Trend Ingestion
Fetches trending searches from SerpApi, normalizes them, and persists them into PostgreSQL.
"""
import asyncio
import os
import sys

# Ensure root directory is on PYTHONPATH
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from apps.api.app.config import settings
from apps.api.app.db_postgres import AsyncSessionLocal, init_db
from apps.api.app.integrations.trends.serpapi_provider import SerpApiTrendsProvider
from apps.api.app.repositories.trend_repository import PostgresTrendRepository
from apps.api.app.domain.models.user import User

async def main():
    print("Starting Cloud Run Trend Ingestion Job...")
    await init_db()

    provider = SerpApiTrendsProvider()
    region = settings.TRENDS_GEO or "IN"
    print(f"Fetching live trending searches for geo={region} via SerpApi...")

    trends = await provider.fetch_trending_searches(region=region)
    print(f"Retrieved {len(trends)} trend candidates from provider.")

    user = User(
        user_id="job_runner",
        workspace_id="workspace_dev",
        email="cron@trendcontenter.local",
        full_name="Cloud Scheduler Ingestion Job",
        role="workspace_admin"
    )

    async with AsyncSessionLocal() as session:
        repo = PostgresTrendRepository(session)
        ingested = await repo.save_and_qualify_trends(trends, user)
        print(f"Successfully qualified and stored {len(ingested)} trends in PostgreSQL.")

    print("Cloud Run Ingestion Job completed successfully.")

if __name__ == "__main__":
    asyncio.run(main())
