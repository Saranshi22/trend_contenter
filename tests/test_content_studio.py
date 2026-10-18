"""Tests for the Content Studio API (concepts, images, video, typography, media).

These run without Postgres or a Gemini key: the DB session is overridden and the
services fall back to their demo outputs when no API key is configured.
"""
import json
import pytest
from httpx import AsyncClient, ASGITransport
from PIL import Image
import uuid


from apps.api.app.main import app
from apps.api.app.config import settings
from apps.api.app.db_postgres import get_postgres_session
from apps.api.app.domain.models.user import User
from apps.api.app.security.auth import get_current_user
from apps.api.app.services.content_studio.image_utils import pil_to_base64

BASE = "/api/v1/content-studio"


class _FakeResult:
    def __init__(self, row):
        self._row = row

    def mappings(self):
        return self

    def first(self):
        return self._row


class _FakeSession:
    def __init__(self, row):
        self._row = row

    async def execute(self, *args, **kwargs):
        return _FakeResult(self._row)


OPPORTUNITY_ROW = {
    "opportunity_id": "opp_test_1",
    "segment_id": "seg_1",
    "audience_label": "Civic Activists",
    "audience_description": "Grassroots organizers",
    "audience_needs": '["Permit checklists"]',
    "audience_questions": '["How do we get a police NOC?"]',
    "audience_concerns": '["Sudden permit revocation"]',
    "title": "Unlocking CBD Ground: Your Guide to Organizing Protests",
    "score": 0.9,
    "problem": "Organizers are unsure of the legal process.",
    "audience_need": "Clear permit steps",
    "content_gap": "No step-by-step guide exists",
    "recommended_angle": "Legal explainer",
    "recommended_format": "In-Depth Citizen Guide",
    "score_breakdown": '{"trend_momentum": 0.92}',
}


@pytest.fixture(autouse=True)
def isolated_env(tmp_path, monkeypatch):
    """No API key, media written to a temp dir, and default (admin) dev user."""
    monkeypatch.setattr(settings, "GEMINI_API_KEY", "")
    monkeypatch.setattr(settings, "GEMINI_BASE_URL", "")
    monkeypatch.setattr(settings, "LLM_GATEWAY_TOKEN", "")
    monkeypatch.setattr(settings, "LLM_GATEWAY_BASE_URL", "")
    monkeypatch.setenv("GEMINI_API_KEY", "")
    monkeypatch.setenv("GEMINI_BASE_URL", "")
    monkeypatch.setenv("LLM_GATEWAY_TOKEN", "")
    monkeypatch.setenv("LLM_GATEWAY_BASE_URL", "")
    monkeypatch.setattr(settings, "CONTENT_STUDIO_MEDIA_DIR", tmp_path)
    orig_overrides = dict(app.dependency_overrides)
    yield
    app.dependency_overrides.clear()
    app.dependency_overrides.update(orig_overrides)


@pytest.fixture
def client():
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


@pytest.mark.asyncio
async def test_health_reports_models(client):
    async with client as c:
        res = await c.get(f"{BASE}/health")
    assert res.status_code == 200
    body = res.json()
    assert body["has_gemini_key"] is False
    assert body["models"]["image_generation"] == settings.GEMINI_IMAGE_MODEL
    assert body["models"]["video_generation"] in [settings.GEMINI_VIDEO_MODEL, settings.VEO_MODEL]


@pytest.mark.asyncio
async def test_concepts_from_markdown_brief_demo_mode(client):
    async with client as c:
        res = await c.post(f"{BASE}/concepts", json={"brief_text": "# Brief\nActivists need permits."})
    assert res.status_code == 200
    body = res.json()
    assert body["is_demo"] is True
    assert body["concepts"]
    first = body["concepts"][0]
    assert first["target_platform"] and first["platform_optimization_rationale"]
    assert first["hook"]
    assert first["image_prompt"] if first["media_type"] == "image" else first["video_prompt"]


@pytest.mark.asyncio
async def test_concepts_video_only_filter(client):
    async with client as c:
        res = await c.post(
            f"{BASE}/concepts",
            json={"brief_text": "x", "preferred_media_mix": "video_only", "num_concepts": 2},
        )
    assert res.status_code == 200
    assert all(item["media_type"] == "video" for item in res.json()["concepts"])


@pytest.mark.asyncio
async def test_concepts_without_brief_is_400(client):
    async with client as c:
        res = await c.post(f"{BASE}/concepts", json={})
    assert res.status_code == 400
    assert "No brief content" in res.json()["detail"]


@pytest.mark.asyncio
async def test_concepts_for_opportunity_builds_pdf_brief(client):
    app.dependency_overrides[get_postgres_session] = lambda: _FakeSession(OPPORTUNITY_ROW)
    async with client as c:
        res = await c.post(f"{BASE}/concepts/opportunity/opp_test_1", json={"num_concepts": 2})
    assert res.status_code == 200
    assert res.json()["concepts"]


@pytest.mark.asyncio
async def test_concepts_for_missing_opportunity_is_404(client):
    app.dependency_overrides[get_postgres_session] = lambda: _FakeSession(None)
    async with client as c:
        res = await c.post(f"{BASE}/concepts/opportunity/nope", json={})
    assert res.status_code == 404


@pytest.mark.asyncio
async def test_generate_experiments_from_opportunity_id_success(client, monkeypatch):
    """Regression test: Generates experiments supplying opportunity_id without brief_text."""
    monkeypatch.setattr(settings, "GEMINI_API_KEY", "fake_key")
    from apps.api.app.services.content_studio.experiment_service import experiment_service

    fake_response = type("FakeResp", (), {
        "text": json.dumps({
            "campaign_title": "CBD Ground Campaign",
            "campaign_summary": "Summary",
            "target_audience": "Civic Activists",
            "core_friction_point": "Permit issues",
            "variants": [
                {
                    "id": "var_1",
                    "variant_type": "trend_jacker",
                    "variant_label": "Variant A: The Trend Jacker",
                    "title": "Angle 1",
                    "hook": "Hook 1",
                    "angle": "Angle 1",
                    "instagram_copy": "IG 1",
                    "facebook_copy": "FB 1",
                    "email_subject": "Sub 1",
                    "email_preview": "Prev 1",
                    "email_body": "Body 1",
                    "visual_direction": "Visual 1",
                    "search_query": "Query 1",
                    "veo_motion_prompt": "Veo 1",
                    "hashtags": ["t1"],
                    "audience_fit_score": 0.95
                },
                {
                    "id": "var_2",
                    "variant_type": "educational_solution",
                    "variant_label": "Variant B: The Value Blueprint",
                    "title": "Angle 2",
                    "hook": "Hook 2",
                    "angle": "Angle 2",
                    "instagram_copy": "IG 2",
                    "facebook_copy": "FB 2",
                    "email_subject": "Sub 2",
                    "email_preview": "Prev 2",
                    "email_body": "Body 2",
                    "visual_direction": "Visual 2",
                    "search_query": "Query 2",
                    "veo_motion_prompt": "Veo 2",
                    "hashtags": ["t2"],
                    "audience_fit_score": 0.92
                },
                {
                    "id": "var_3",
                    "variant_type": "emotive_narrative",
                    "variant_label": "Variant C: The Human Story",
                    "title": "Angle 3",
                    "hook": "Hook 3",
                    "angle": "Angle 3",
                    "instagram_copy": "IG 3",
                    "facebook_copy": "FB 3",
                    "email_subject": "Sub 3",
                    "email_preview": "Prev 3",
                    "email_body": "Body 3",
                    "visual_direction": "Visual 3",
                    "search_query": "Query 3",
                    "veo_motion_prompt": "Veo 3",
                    "hashtags": ["t3"],
                    "audience_fit_score": 0.90
                }
            ]
        })
    })()

    fake_client = type("FakeClient", (), {
        "models": type("FakeModels", (), {
            "generate_content": lambda *args, **kwargs: fake_response
        })()
    })()

    monkeypatch.setattr(experiment_service, "_get_client", lambda *args, **kwargs: fake_client)
    app.dependency_overrides[get_postgres_session] = lambda: _FakeSession(OPPORTUNITY_ROW)

    async with client as c:
        res = await c.post(
            f"{BASE}/experiments/generate",
            json={"opportunity_id": "opp_test_1"}
        )
    assert res.status_code == 200
    body = res.json()
    assert body["campaign_title"] == "CBD Ground Campaign"
    assert len(body["variants"]) == 3


@pytest.mark.asyncio
async def test_generate_experiments_from_missing_opportunity_id(client, monkeypatch):
    monkeypatch.setattr(settings, "GEMINI_API_KEY", "fake_key")
    app.dependency_overrides[get_postgres_session] = lambda: _FakeSession(None)

    async with client as c:
        res = await c.post(
            f"{BASE}/experiments/generate",
            json={"opportunity_id": "opp_missing_999"}
        )
    assert res.status_code == 400
    assert "not found" in res.json()["detail"].lower()


@pytest.mark.asyncio
async def test_generate_experiments_db_failure(client, monkeypatch):
    monkeypatch.setattr(settings, "GEMINI_API_KEY", "fake_key")

    class _FailingSession:
        async def execute(self, *args, **kwargs):
            raise Exception("Database failure")

    app.dependency_overrides[get_postgres_session] = lambda: _FailingSession()

    async with client as c:
        res = await c.post(
            f"{BASE}/experiments/generate",
            json={"opportunity_id": "opp_test_1"}
        )
    assert res.status_code == 500
    assert "Database error" in res.json()["detail"]


@pytest.mark.asyncio
async def test_generate_experiments_with_real_persisted_opportunity(monkeypatch):
    """Verify that an existing persisted opportunity from the DB works end-to-end without brief_text."""
    import os
    from dotenv import dotenv_values
    env_vals = dotenv_values(".env")
    gateway_token = (os.environ.get("LLM_GATEWAY_TOKEN") or env_vals.get("LLM_GATEWAY_TOKEN") or "").strip()
    gateway_base = (os.environ.get("LLM_GATEWAY_BASE_URL") or env_vals.get("LLM_GATEWAY_BASE_URL") or "").strip()
    gemini_key = (os.environ.get("GEMINI_API_KEY") or env_vals.get("GEMINI_API_KEY") or "").strip()

    if not ((gateway_token and gateway_base) or gemini_key):
        pytest.skip("No real Gemini or Gateway credentials in environment")

    if gateway_token and gateway_base:
        monkeypatch.setattr(settings, "LLM_GATEWAY_TOKEN", gateway_token)
        monkeypatch.setenv("LLM_GATEWAY_TOKEN", gateway_token)
        monkeypatch.setattr(settings, "LLM_GATEWAY_BASE_URL", gateway_base)
        monkeypatch.setenv("LLM_GATEWAY_BASE_URL", gateway_base)
        monkeypatch.setattr(settings, "USE_LLM_GATEWAY_FOR_CONTENT_STUDIO", True)
        monkeypatch.setenv("USE_LLM_GATEWAY_FOR_CONTENT_STUDIO", "true")
    if gemini_key:
        monkeypatch.setattr(settings, "GEMINI_API_KEY", gemini_key)
        monkeypatch.setenv("GEMINI_API_KEY", gemini_key)


    from apps.api.app.services.content_studio.experiment_service import experiment_service
    from apps.api.app.domain.models.content_studio import GenerateExperimentsRequest
    from apps.api.app.db_postgres import AsyncSessionLocal
    from sqlalchemy import text

    async with AsyncSessionLocal() as session:
        res = await session.execute(text("SELECT opportunity_id FROM opportunities LIMIT 1"))
        row = res.mappings().first()
        if not row:
            pytest.skip("No opportunities in database to test against")
        opp_id = row["opportunity_id"]

    req = GenerateExperimentsRequest(opportunity_id=opp_id)
    response = await experiment_service.generate_experiments(req)
    assert response.campaign_title
    assert len(response.variants) == 3




@pytest.mark.asyncio
async def test_generate_image_then_fetch_media(client):
    async with client as c:
        res = await c.post(
            f"{BASE}/images/generate",
            json={"prompt": "Civic plaza at sunrise", "aspect_ratio": "1:1", "number_of_images": 1},
        )
        assert res.status_code == 200
        url = res.json()["images"][0]["url"]
        assert url.startswith(f"{BASE}/media/")

        media = await c.get(url)
        assert media.status_code == 200
        assert media.headers["content-type"].startswith("image/")


@pytest.mark.asyncio
async def test_media_rejects_unknown_and_traversal(client):
    async with client as c:
        assert (await c.get(f"{BASE}/media/missing.png")).status_code == 404
        assert (await c.get(f"{BASE}/media/..%2F..%2Fconfig.py")).status_code == 404


@pytest.mark.asyncio
async def test_add_text_overlay(client):
    b64 = pil_to_base64(Image.new("RGB", (400, 300), (30, 60, 90)))
    async with client as c:
        res = await c.post(f"{BASE}/images/add-text", json={"image_base64": b64, "text": "PERMITS 101"})
    assert res.status_code == 200
    assert res.json()["width"] == 400


@pytest.mark.asyncio
async def test_generate_video_demo_mode(client, monkeypatch):
    from apps.api.app.services.content_studio.veo_service import veo_service
    from apps.api.app.domain.models.content_studio import GenerateVideoResponse
    monkeypatch.setattr(
        veo_service,
        "generate_video",
        lambda req: GenerateVideoResponse(
            id="vid_test_123",
            video_url="/api/v1/content-studio/media/vid_test_123.mp4",
            video_uri="/api/v1/content-studio/media/vid_test_123.mp4",
            prompt=req.prompt,
            aspect_ratio=req.aspect_ratio,
            duration_seconds=req.duration_seconds,
            fps=req.fps,
            model_used="veo-2.0-generate-001",
            status="completed"
        )
    )
    async with client as c:
        res = await c.post(
            f"{BASE}/videos/generate",
            json={"prompt": "FPV drone over a plaza", "aspect_ratio": "9:16", "duration_seconds": 5},
        )
    assert res.status_code == 200
    body = res.json()
    assert body["aspect_ratio"] == "9:16"
    assert body["video_url"]


@pytest.mark.asyncio
async def test_viewer_cannot_generate(client):
    async def viewer():
        return User(
            user_id="v1", workspace_id="w1", email="v@x.io", full_name="Viewer", role="viewer"
        )

    app.dependency_overrides[get_current_user] = viewer
    async with client as c:
        denied = await c.post(f"{BASE}/images/generate", json={"prompt": "x"})
        allowed = await c.get(f"{BASE}/health")
    assert denied.status_code == 403
    assert allowed.status_code == 200


def test_url_normalization_and_deduplication():
    from apps.api.app.services.content_studio.search_service import (
        normalize_image_url,
        deduplicate_image_candidates,
        clean_and_optimize_query,
    )

    # 1. Tracking params removed
    url1 = "https://example.com/images/car.jpg?utm_source=twitter&utm_medium=social&gclid=123"
    assert normalize_image_url(url1) == "https://example.com/images/car.jpg"

    # 2. Unsplash photo ID extracted canonically
    u1 = "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=1200&q=80"
    u2 = "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=400"
    assert normalize_image_url(u1) == normalize_image_url(u2) == "unsplash:photo-1618005182384-a83a8bd57fbe"

    # 3. Trailing slashes stripped
    assert normalize_image_url("https://example.com/asset/") == "https://example.com/asset"

    # 4. Candidates deduplication
    candidates = [
        {
            "id": "c1",
            "image_url": "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=1200",
            "thumbnail_url": "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=400",
            "title": "Title 1",
            "source_domain": "unsplash.com",
        },
        {
            "id": "c2",
            "image_url": "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800",
            "thumbnail_url": "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=200",
            "title": "Title 2 (duplicate asset)",
            "source_domain": "unsplash.com",
        },
        {
            "id": "c3",
            "image_url": "https://example.com/flying_car_prototype.png",
            "thumbnail_url": "https://example.com/flying_car_prototype_thumb.png",
            "title": "Flying Car Prototype",
            "source_domain": "example.com",
        },
    ]
    deduped = deduplicate_image_candidates(candidates)
    assert len(deduped) == 2
    assert deduped[0]["id"] == "c1"
    assert deduped[1]["id"] == "c3"

    # 5. Query cleaning & optimization
    optimized = clean_and_optimize_query(
        prompt="A photo of a futuristic electric flying car soaring high resolution 4k",
        headline="Tesla Roadster Airborne",
        topic="Aviation & EV",
    )
    assert "flying" in optimized
    assert "car" in optimized
    assert "tesla" in optimized
    assert "photo" not in optimized
    assert "resolution" not in optimized


@pytest.mark.asyncio
async def test_search_service_empty_fallback_never_duplicates(monkeypatch):
    """When web search finds nothing, it should return [] without padding duplicate Unsplash assets."""
    from apps.api.app.services.content_studio.search_service import ImageSearchService

    service = ImageSearchService()

    # Mock web search returning 0 results
    async def mock_web_fallback(query, num_results=10):
        return []

    monkeypatch.setattr(service, "search_web_fallback", mock_web_fallback)
    candidates = await service.search_images(
        query="completely unheard of unique concept xyz12345",
        num_results=8,
        provider="web",
    )
    assert candidates == []


@pytest.mark.asyncio
async def test_recommend_images_endpoint(client, monkeypatch):
    """Verifies POST /content-studio/images/recommend returns deduplicated, ranked results."""
    from apps.api.app.services.content_studio.search_service import search_service

    mock_candidates = [
        {
            "id": "cand_1",
            "image_url": "https://example.com/ev_flying_car.jpg",
            "thumbnail_url": "https://example.com/ev_flying_car_thumb.jpg",
            "title": "EV Flying Car Concept Aero",
            "snippet": "Futuristic aerospace vehicle with vertical takeoff",
            "source_domain": "autonews.com",
            "width": 1200,
            "height": 800,
        },
        {
            "id": "cand_2",
            "image_url": "https://example.com/ev_flying_car.jpg?utm_source=feed",  # Duplicate of cand_1
            "thumbnail_url": "https://example.com/ev_flying_car_thumb.jpg",
            "title": "EV Flying Car Duplicate",
            "snippet": "Duplicate entry with tracking parameters",
            "source_domain": "autonews.com",
            "width": 1200,
            "height": 800,
        },
        {
            "id": "cand_3",
            "image_url": "https://example.com/aerospace_hangar.jpg",
            "thumbnail_url": "https://example.com/aerospace_hangar_thumb.jpg",
            "title": "Aviation Engineering Facility",
            "snippet": "Advanced flight systems manufacturing",
            "source_domain": "aerotech.org",
            "width": 1920,
            "height": 1080,
        },
    ]

    async def mock_search(*args, **kwargs):
        from apps.api.app.services.content_studio.search_service import deduplicate_image_candidates
        return deduplicate_image_candidates(mock_candidates)

    monkeypatch.setattr(search_service, "search_images", mock_search)

    async with client as c:
        res = await c.post(
            f"{BASE}/images/recommend",
            json={
                "prompt": "flying car concept aerospace",
                "num_results": 4,
                "headline": "Tesla Roadster Airborne",
                "topic": "Future Mobility",
            },
        )
    assert res.status_code == 200
    data = res.json()
    assert data["total_candidates"] == 2  # 1 duplicate was removed
    assert len(data["recommendations"]) == 2
    # Verify no duplicated URLs in recommendations
    urls = [r["image_url"] for r in data["recommendations"]]
    assert len(urls) == len(set(urls))


class _DraftDbSession:
    def __init__(self):
        self.drafts = {}

    async def execute(self, statement, params=None):
        sql = str(statement)
        params = params or {}
        cid = params.get("cid")
        from datetime import datetime

        if "INSERT INTO campaign_drafts" in sql:
            row = {
                "campaign_id": cid,
                "workspace_id": params.get("wid", "workspace_dev"),
                "user_id": params.get("uid", "user_dev"),
                "opportunity_id": params.get("oid"),
                "title": params.get("title"),
                "current_stage": params.get("stage"),
                "brief_data": params.get("brief"),
                "concepts_data": params.get("concepts"),
                "active_concept": params.get("active_concept"),
                "artwork_data": params.get("artwork"),
                "active_artwork": params.get("active_artwork"),
                "curated_assets": params.get("curated"),
                "selected_reference": params.get("selected_ref"),
                "copy_data": params.get("copy"),
                "email_data": params.get("email"),
                "publish_data": params.get("publish"),
                "status": params.get("status"),
                "created_at": datetime.now(),
                "updated_at": datetime.now(),
            }
            self.drafts[cid] = row
            return _FakeResult(row)
        elif "WHERE campaign_id = :cid" in sql and "SELECT" in sql:
            row = self.drafts.get(cid)
            return _FakeResult(row)
        elif "DELETE FROM campaign_drafts" in sql:
            deleted = bool(self.drafts.pop(cid, None))
            class _DelResult:
                rowcount = 1 if deleted else 0
            return _DelResult()
        elif "ORDER BY updated_at DESC" in sql:
            all_rows = list(self.drafts.values())
            summary_rows = [
                {
                    "campaign_id": r["campaign_id"],
                    "opportunity_id": r["opportunity_id"],
                    "title": r["title"],
                    "current_stage": r["current_stage"],
                    "status": r["status"],
                    "has_concepts": bool(r.get("concepts_data")),
                    "has_active_concept": bool(r.get("active_concept")),
                    "has_artwork": bool(r.get("artwork_data")),
                    "created_at": r.get("created_at"),
                    "updated_at": r.get("updated_at"),
                }
                for r in all_rows
            ]
            class _ListResult:
                def mappings(self):
                    return self
                def first(self):
                    return all_rows[0] if all_rows else None
                def all(self):
                    return summary_rows
            return _ListResult()
        return _FakeResult(None)

    async def commit(self):
        pass

    async def rollback(self):
        pass


@pytest.mark.asyncio
async def test_campaign_draft_lifecycle(client):
    """
    Validates end-to-end campaign draft persistence lifecycle:
    1. Create/save campaign draft
    2. Retrieve latest draft
    3. Retrieve draft by ID
    4. Update draft (stage advancement & artwork attachment)
    5. List drafts summary
    6. Delete draft and verify 404
    """
    draft_session = _DraftDbSession()
    app.dependency_overrides[get_postgres_session] = lambda: draft_session

    test_camp_id = f"camp_test_lifecycle_{uuid.uuid4().hex[:8]}"

    payload = {
        "campaign_id": test_camp_id,
        "title": "Quantum EV Roadshow 2026",
        "current_stage": "concepts",
        "brief_data": {
            "briefText": "Strategic expansion for clean energy transport.",
            "targetAudienceInput": "Tech Innovators & Fleet Operators",
            "campaignGoal": "lead_generation",
            "brandTone": "visionary",
            "numAssetsConfig": 4
        },
        "concepts_data": {
            "brief_title": "Quantum EV Roadshow",
            "variants": [
                {
                    "variant_id": "v1",
                    "variant_label": "The Zero-Friction Shift",
                    "hook": "The zero friction shift starts today.",
                    "title": "Quantum EV Concept",
                    "instagram_copy": "Future of transit is zero emissions.",
                    "facebook_copy": "Join the clean energy roadshow.",
                    "email_subject": "Exclusive: Quantum EV preview",
                    "email_body": "Full briefing inside.",
                    "search_query": "electric hypercar sleek studio"
                }
            ]
        },
        "active_concept": {
            "variant_id": "v1",
            "variant_label": "The Zero-Friction Shift",
            "hook": "The zero friction shift starts today.",
            "title": "Quantum EV Concept"
        },
        "artwork_data": {
            "imagePrompt": "Aerodynamic titanium hypercar on mountain road dusk",
            "aspectRatio": "16:9",
            "stylePreset": "photorealistic",
            "numImagesToGenerate": 4,
            "generatedImages": [
                {
                    "id": "img_1",
                    "url": "/api/v1/content-studio/media/gemini_gen_test1.png",
                    "prompt": "Aerodynamic titanium hypercar on mountain road dusk"
                }
            ]
        },
        "active_artwork": {
            "url": "/api/v1/content-studio/media/gemini_gen_test1.png",
            "title": "Titanium Dusk Preview"
        },
        "copy_data": {
            "instagramCaption": "Tailored Instagram caption for roadshow.",
            "facebookPostCopy": "Tailored Facebook copy for community."
        },
        "email_data": {
            "emailRecipients": "vip@quantum-ev.com",
            "emailSubject": "Exclusive invitation to preview Quantum EV",
            "emailHeadline": "The Zero-Friction Shift",
            "emailBody": "We are thrilled to present our 2026 fleet.",
            "emailTheme": "emerald_clean"
        },
        "publish_data": {
            "publishChannel": "email",
            "fromEmail": "campaigns@quantum-ev.com"
        }
    }

    async with client as c:
        # 1. Save draft
        res = await c.post(f"{BASE}/drafts", json=payload)
        assert res.status_code == 200, res.text
        data = res.json()
        assert data["campaign_id"] == test_camp_id
        assert data["title"] == "Quantum EV Roadshow 2026"
        assert data["current_stage"] == "concepts"
        assert data["brief_data"]["campaignGoal"] == "lead_generation"
        assert data["active_artwork"]["url"] == "/api/v1/content-studio/media/gemini_gen_test1.png"

        # 2. Retrieve draft by ID
        res = await c.get(f"{BASE}/drafts/{test_camp_id}")
        assert res.status_code == 200
        get_data = res.json()
        assert get_data["campaign_id"] == test_camp_id
        assert get_data["email_data"]["emailTheme"] == "emerald_clean"

        # 3. Retrieve latest draft
        res = await c.get(f"{BASE}/drafts/latest")
        assert res.status_code == 200
        latest_data = res.json()
        assert latest_data is not None
        assert latest_data["campaign_id"] == test_camp_id

        # 4. Update draft to 'publish' stage
        payload["current_stage"] = "publish"
        payload["title"] = "Quantum EV Roadshow 2026 - Ready to Launch"
        res = await c.post(f"{BASE}/drafts", json=payload)
        assert res.status_code == 200
        updated = res.json()
        assert updated["current_stage"] == "publish"
        assert updated["title"] == "Quantum EV Roadshow 2026 - Ready to Launch"

        # 5. List drafts
        res = await c.get(f"{BASE}/drafts")
        assert res.status_code == 200
        draft_list = res.json()
        assert "drafts" in draft_list
        match = next((d for d in draft_list["drafts"] if d["campaign_id"] == test_camp_id), None)
        assert match is not None
        assert match["current_stage"] == "publish"
        assert match["has_artwork"] is True
        assert match["has_active_concept"] is True

        # 6. Delete draft
        res = await c.delete(f"{BASE}/drafts/{test_camp_id}")
        assert res.status_code == 200
        del_data = res.json()
        assert del_data["status"] == "ok"

        # Verify 404 after deletion
        res = await c.get(f"{BASE}/drafts/{test_camp_id}")
        assert res.status_code == 404


@pytest.mark.asyncio
async def test_campaign_draft_not_found(client):
    draft_session = _DraftDbSession()
    app.dependency_overrides[get_postgres_session] = lambda: draft_session
    async with client as c:
        res = await c.get(f"{BASE}/drafts/camp_nonexistent_id_9999")
        assert res.status_code == 404


def test_is_likely_watermarked():
    from apps.api.app.services.content_studio.search_service import is_likely_watermarked

    # Watermarked stock image
    shutterstock_cand = {
        "title": "Stock Photo with watermark Royalty Free",
        "image_url": "https://image.shutterstock.com/z/stock-photo-12345.jpg",
        "source_domain": "shutterstock.com",
        "source_url": "https://shutterstock.com/image-photo/12345"
    }
    assert is_likely_watermarked(shutterstock_cand) is True

    # Clean editorial image
    clean_cand = {
        "title": "Modern electric car showcase 2026",
        "image_url": "https://images.unsplash.com/photo-ev-clean.jpg",
        "source_domain": "unsplash.com",
        "source_url": "https://unsplash.com/photos/ev-clean"
    }
    assert is_likely_watermarked(clean_cand) is False


@pytest.mark.asyncio
async def test_search_images_prioritizes_clean_and_preserves_source():
    from apps.api.app.services.content_studio.search_service import search_service

    async def mock_search(query, num_results=10, **kwargs):
        return [
            {
                "title": "Watermarked Stock 1",
                "image_url": "https://www.gettyimages.com/detail/photo/123.jpg",
                "source_domain": "gettyimages.com",
                "source_url": "https://www.gettyimages.com/detail/123",
                "is_watermarked": True
            },
            {
                "title": "Clean EV Innovation",
                "image_url": "https://images.wikimedia.org/clean_ev.jpg",
                "source_domain": "wikimedia.org",
                "source_url": "https://en.wikipedia.org/wiki/Electric_car",
                "is_watermarked": False
            },
            {
                "title": "Clean Tech Design",
                "image_url": "https://behance.net/clean_tech.png",
                "source_domain": "behance.net",
                "source_url": "https://behance.net/gallery/tech",
                "is_watermarked": False
            },
        ]

    original_serp = search_service.search_serpapi
    search_service.search_serpapi = mock_search

    try:
        candidates = await search_service.search_images(
            "Electric vehicles", 
            num_results=2, 
            provider="serpapi", 
            serpapi_key="mock_key"
        )
        assert len(candidates) == 2
        # Both returned should be clean because clean_candidates >= 2
        assert all(not c.get("is_watermarked") for c in candidates)
        assert candidates[0]["source_url"] == "https://en.wikipedia.org/wiki/Electric_car"
        assert candidates[1]["source_url"] == "https://behance.net/gallery/tech"
    finally:
        search_service.search_serpapi = original_serp


def test_reranker_preserves_source_and_watermark_metadata():
    from apps.api.app.services.content_studio.reranker_service import reranker_service

    candidates = [
        {
            "id": "cand_1",
            "title": "Clean Image",
            "image_url": "https://example.com/clean.jpg",
            "thumbnail_url": "https://example.com/clean_thumb.jpg",
            "snippet": "Clean tech image",
            "source_domain": "example.com",
            "source_url": "https://example.com/clean_page",
            "is_watermarked": False
        },
        {
            "id": "cand_2",
            "title": "Watermarked Shutterstock",
            "image_url": "https://shutterstock.com/wm.jpg",
            "thumbnail_url": "https://shutterstock.com/wm_thumb.jpg",
            "snippet": "Stock photo royalty free",
            "source_domain": "shutterstock.com",
            "source_url": "https://shutterstock.com/photo/1",
            "is_watermarked": True
        },
    ]

    results = reranker_service._heuristic_fallback(
        prompt="Clean visual",
        candidates=candidates,
        headline="Clean",
        visual_direction="Innovation"
    )
    assert len(results) == 2
    # First result should be the clean one due to watermark sorting penalty
    assert results[0].is_watermarked is False
    assert results[0].source_url == "https://example.com/clean_page"
    assert results[1].is_watermarked is True
    assert results[1].source_url == "https://shutterstock.com/photo/1"


def test_save_image_syncs_to_gcs_when_configured(monkeypatch):
    from unittest.mock import MagicMock
    from apps.api.app.services.content_studio.image_utils import save_image_bytes

    mock_adapter = MagicMock()
    monkeypatch.setattr("apps.api.app.config.settings.GCS_BUCKET", "test-bucket")
    monkeypatch.setattr(
        "apps.api.app.services.storage.get_gcp_storage_adapter",
        lambda *args, **kwargs: mock_adapter
    )

    test_bytes = b"fake-png-data"
    img_id, file_url = save_image_bytes(test_bytes, prefix="test_gcs", ext="png")

    assert img_id.startswith("test_gcs_")
    assert file_url.startswith("/api/v1/content-studio/media/")
    mock_adapter.upload_file_with_key_sync.assert_called_once()
    called_key = mock_adapter.upload_file_with_key_sync.call_args[0][0]
    called_bytes = mock_adapter.upload_file_with_key_sync.call_args[0][1]
    assert called_key.startswith("content_studio/test_gcs_")
    assert called_bytes == test_bytes


@pytest.mark.asyncio
async def test_get_media_downloads_from_gcs_if_missing_locally(client, monkeypatch):
    from unittest.mock import MagicMock

    mock_adapter = MagicMock()
    mock_adapter.download_file_sync.return_value = b"downloaded-from-gcs"
    monkeypatch.setattr("apps.api.app.config.settings.GCS_BUCKET", "test-bucket")
    monkeypatch.setattr(
        "apps.api.app.services.storage.get_gcp_storage_adapter",
        lambda *args, **kwargs: mock_adapter
    )

    filename = f"remote_asset_{uuid.uuid4().hex[:8]}.png"
    async with client as c:
        res = await c.get(f"{BASE}/media/{filename}")
        assert res.status_code == 200
        assert res.content == b"downloaded-from-gcs"
        mock_adapter.download_file_sync.assert_called_once_with(f"content_studio/{filename}")






