import pytest
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import NullPool

from apps.api.app.main import app
from apps.api.app.config import settings
from apps.api.app.db_postgres import get_postgres_session
from apps.api.app.services.pdf_service import PDFService

# Use NullPool for tests to prevent event loop connection reuse conflicts
test_engine = create_async_engine(settings.POSTGRES_URI, poolclass=NullPool)
TestAsyncSessionLocal = sessionmaker(test_engine, class_=AsyncSession, expire_on_commit=False)

async def override_get_postgres_session():
    async with TestAsyncSessionLocal() as session:
        yield session

app.dependency_overrides[get_postgres_session] = override_get_postgres_session


def test_pdf_generation_full_data():
    """Verify that PDFService produces a valid, compliant PDF with all fields provided."""
    sample_data = {
        "opportunity_id": "opp_test_123",
        "title": "Comprehensive Urban Transit Guide for East Delhi Commuters",
        "score": 0.92,
        "problem": "Commuters lack clear information on metro feeder bus diversions.",
        "audience_need": "Real-time route maps and station access details.",
        "content_gap": "Official portals only provide generic circulars.",
        "recommended_angle": "Step-by-step commuter navigation blueprint.",
        "recommended_format": "Interactive Infographic & Guide",
        "score_breakdown": {
            "freshness": 0.95,
            "trend_momentum": 0.90,
            "audience_demand": 0.88,
            "content_gap": 0.94,
            "corroboration": 0.85
        },
        "audience_label": "Daily Office Commuters",
        "audience_description": "Salaried professionals commuting across arterial routes.",
        "audience_needs": ["Route detours", "First/last mile timings"],
        "audience_questions": ["Which feeder buses run past 9 PM?", "Is parking open at Anand Vihar?"],
        "audience_concerns": ["Unannounced roadblocks", "Surge fares"]
    }
    
    pdf_bytes = PDFService.generate_opportunity_brief(sample_data)
    assert isinstance(pdf_bytes, bytes)
    assert len(pdf_bytes) > 2000
    assert pdf_bytes.startswith(b"%PDF-")


def test_pdf_generation_sparse_data():
    """Verify that PDFService produces a valid PDF even when optional fields are empty or None."""
    sample_data = {
        "opportunity_id": "opp_sparse_456",
        "title": "Minimal Opportunity Title",
        "score": 0.75,
        "problem": None,
        "audience_need": None,
        "content_gap": None,
        "recommended_angle": None,
        "recommended_format": None,
        "score_breakdown": None,
        "audience_label": None,
        "audience_description": None,
        "audience_needs": None,
        "audience_questions": None,
        "audience_concerns": None
    }
    
    pdf_bytes = PDFService.generate_opportunity_brief(sample_data)
    assert isinstance(pdf_bytes, bytes)
    assert len(pdf_bytes) > 1000
    assert pdf_bytes.startswith(b"%PDF-")


@pytest.mark.asyncio
async def test_audiences_api_endpoint():
    """Verify that GET /api/v1/audiences/ returns a 200 with audience personas."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        response = await ac.get("/api/v1/audiences/")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        if len(data) > 0:
            item = data[0]
            assert "segment_id" in item
            assert "label" in item
            assert "needs" in item
            assert "questions" in item
            assert "concerns" in item


@pytest.mark.asyncio
async def test_opportunity_pdf_download_endpoint():
    """Verify that GET /api/v1/opportunities/{opp_id}/pdf returns application/pdf."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        opps_res = await ac.get("/api/v1/opportunities/")
        assert opps_res.status_code == 200
        opps = opps_res.json()
        if len(opps) > 0:
            target_id = opps[0]["opportunity_id"]
            pdf_res = await ac.get(f"/api/v1/opportunities/{target_id}/pdf")
            assert pdf_res.status_code == 200
            assert pdf_res.headers.get("content-type") == "application/pdf"
            assert "attachment" in pdf_res.headers.get("content-disposition", "")
            assert pdf_res.content.startswith(b"%PDF-")
