import hashlib
from datetime import datetime, timezone
import pytest
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import NullPool
from unittest.mock import patch

from apps.api.app.main import app
from apps.api.app.config import settings
from apps.api.app.db_postgres import get_postgres_session
from apps.api.app.domain.models.evidence import EvidenceItem

# Use NullPool for tests to prevent event loop connection reuse conflicts
test_engine = create_async_engine(settings.POSTGRES_URI, poolclass=NullPool)
TestAsyncSessionLocal = sessionmaker(test_engine, class_=AsyncSession, expire_on_commit=False)

async def override_get_postgres_session():
    async with TestAsyncSessionLocal() as session:
        yield session

app.dependency_overrides[get_postgres_session] = override_get_postgres_session


def test_evidence_normalization_and_provenance():
    """Workstream A: Verify EvidenceItem schema, hashing, and provenance rules."""
    content = "Detailed Reddit discussion about real-time multimodal agents"
    content_hash = hashlib.sha256(content.encode('utf-8')).hexdigest()
    
    item = EvidenceItem(
        evidence_id="evi_test123",
        investigation_id="inv_test123",
        source_type="social",
        platform="reddit",
        url="https://reddit.com/r/MachineLearning/comments/abc123",
        title="Multimodal agents overview",
        text_excerpt=content,
        retrieved_at=datetime.now(timezone.utc),
        content_hash=content_hash,
        metadata={"retrieved_by": "serpapi_reddit", "query": "multimodal agents", "is_inferred": False}
    )

    assert item.content_hash == content_hash
    assert item.source_type == "social"
    assert item.platform == "reddit"
    assert item.url.startswith("https://")
    assert item.metadata["is_inferred"] is False


@pytest.mark.asyncio
async def test_investigation_query_and_state():
    """Workstream B: Test investigation listing, detail retrieval, and source tracking."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        res = await ac.get("/api/v1/investigations/")
        assert res.status_code == 200
        inv_list = res.json()
        assert isinstance(inv_list, list)

        if len(inv_list) > 0:
            inv_id = inv_list[0]["investigation_id"]
            res_detail = await ac.get(f"/api/v1/investigations/{inv_id}")
            assert res_detail.status_code == 200
            detail = res_detail.json()
            assert detail["investigation_id"] == inv_id
            assert "source_statuses" in detail
            assert "social" in detail["source_statuses"]
            assert "web" in detail["source_statuses"]
            assert "llm" in detail["source_statuses"]


@pytest.mark.asyncio
async def test_investigation_retry_endpoint():
    """Workstream B: Test retry endpoint triggering."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        res_list = await ac.get("/api/v1/investigations/")
        if res_list.status_code == 200 and len(res_list.json()) > 0:
            inv_id = res_list.json()[0]["investigation_id"]
            with patch("apps.api.app.api.endpoints.investigations.run_investigation_task"):
                res_retry = await ac.post(f"/api/v1/investigations/{inv_id}/retry")
                assert res_retry.status_code == 200
                retry_data = res_retry.json()
                assert retry_data["status"] == "retrying"


@pytest.mark.asyncio
async def test_opportunity_api_contract_and_selection():
    """Workstream D: Test stable Opportunity API response contract and select endpoint."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        res = await ac.get("/api/v1/opportunities/")
        assert res.status_code == 200
        opps = res.json()
        
        if len(opps) > 0:
            target_opp = opps[0]
            opp_id = target_opp["opportunity_id"]

            # 2. Fetch individual opportunity
            res_ind = await ac.get(f"/api/v1/opportunities/{opp_id}")
            assert res_ind.status_code == 200
            data = res_ind.json()

            # Contract assertions required by Content Studio
            assert "opportunity_id" in data
            assert "title" in data
            assert "score" in data
            assert "audience_label" in data or "audience_need" in data
            assert "supported_formats" in data
            assert "evidence_references" in data
            assert "status" in data

            # 3. Select opportunity for Content Studio handoff
            res_select = await ac.post(f"/api/v1/opportunities/{opp_id}/select")
            assert res_select.status_code == 200
            sel_data = res_select.json()
            assert sel_data["status"] == "selected"


@pytest.mark.asyncio
async def test_rbac_and_admin_security():
    """Workstream E: Test admin users, configuration, masked credentials, and audit trail."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # 1. Admin users endpoint
        res_users = await ac.get("/api/v1/admin/users")
        assert res_users.status_code == 200
        users = res_users.json()
        assert len(users) >= 1
        assert any(u["role"] == "workspace_admin" for u in users)

        # 2. Masked credentials in integrations endpoint (CRITICAL SECURITY CHECK)
        res_integ = await ac.get("/api/v1/admin/integrations")
        assert res_integ.status_code == 200
        integrations = res_integ.json()
        assert len(integrations) >= 3
        for integ in integrations:
            key_masked = integ.get("api_key_masked", "")
            # Ensure raw full API key is NEVER exposed
            assert not key_masked.startswith("AIzaSy") or "..." in key_masked
            assert not key_masked.startswith("sk-proj-") or "..." in key_masked

        # 3. Workspace config
        res_cfg = await ac.get("/api/v1/admin/config")
        assert res_cfg.status_code == 200
        cfg = res_cfg.json()
        assert "default_region" in cfg
        assert "poll_interval_minutes" in cfg
        assert "workspace_id" in cfg

        # 4. Audit trail
        res_audit = await ac.get("/api/v1/admin/audit")
        assert res_audit.status_code == 200
        logs = res_audit.json()
        assert isinstance(logs, list)


@pytest.mark.asyncio
async def test_watchlists_crud():
    """Workstream F: Test watchlists creation and listing."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        payload = {
            "name": "Generative AI Agents",
            "keywords": ["multimodal agent", "autogen", "langgraph"],
            "region": "IN",
            "min_qualification_score": 0.75,
            "auto_investigate": True
        }
        res = await ac.post("/api/v1/watchlists/", json=payload)
        assert res.status_code == 200
        created = res.json()
        assert created["name"] == payload["name"]
        assert created["auto_investigate"] is True

        # List watchlists
        res_list = await ac.get("/api/v1/watchlists/")
        assert res_list.status_code == 200
        items = res_list.json()
        assert any(w["name"] == payload["name"] for w in items)
