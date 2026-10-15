import pytest
from datetime import datetime, timezone
import uuid

from apps.api.app.domain.models.trend import TrendSnapshot
from apps.api.app.db_postgres import AsyncSessionLocal, init_db
from apps.api.app.repositories.trend_repository import PostgresTrendRepository

@pytest.mark.asyncio
async def test_postgres_deduplication_and_observations():
    """
    Test that multiple polls:
    1. Append historical observations to trend_observations without deleting past ones.
    2. Deduplicate updates in the trends table.
    """
    await init_db()
    
    unique_topic = f"Test Topic {uuid.uuid4().hex[:6]}"
    trend_id = f"tr_test_{uuid.uuid4().hex[:6]}"
    now1 = datetime.now(timezone.utc)
    
    snap1 = TrendSnapshot(
        trend_id=trend_id,
        topic=unique_topic,
        canonical_topic=unique_topic.lower(),
        region="IN",
        category="Tech",
        observed_at=now1,
        retrieved_at=now1,
        active=True,
        search_volume=1000,
        increase_percentage=150.0,
        trend_breakdown=["term1"],
        source_links={"news": "http://example.com/1"},
        status="candidate"
    )

    async with AsyncSessionLocal() as session:
        repo = PostgresTrendRepository(session)
        
        # 1st Poll
        await repo.save_trend(snap1)
        
        # Check active trend exists
        saved1 = await repo.get_trend_by_id(trend_id)
        assert saved1 is not None
        assert saved1.search_volume == 1000
        
        # Observations count should be 1
        obs1 = await repo.get_observations(trend_id)
        assert len(obs1) == 1
        assert obs1[0]["search_volume"] == 1000

        # 2nd Poll (e.g. 1 hour later, search volume increased to 2500)
        now2 = datetime.now(timezone.utc)
        snap2 = TrendSnapshot(
            trend_id=trend_id,
            topic=unique_topic,
            canonical_topic=unique_topic.lower(),
            region="IN",
            category="Tech",
            observed_at=now1,
            retrieved_at=now2, # new poll time
            active=True,
            search_volume=2500,
            increase_percentage=350.0,
            trend_breakdown=["term1", "term2"],
            source_links={"news": "http://example.com/2"},
            status="qualified"
        )
        await repo.save_trend(snap2)

        # Active trend is updated in place (deduplicated)
        saved2 = await repo.get_trend_by_id(trend_id)
        assert saved2.search_volume == 2500
        assert saved2.increase_percentage == 350.0
        assert saved2.status == "qualified"

        # BUT historical observations were preserved (now 2 rows)
        obs2 = await repo.get_observations(trend_id)
        assert len(obs2) == 2
        vols = [o["search_volume"] for o in obs2]
        assert 1000 in vols
        assert 2500 in vols
