"""Tests for the Content Studio API (concepts, images, video, typography, media).

These run without Postgres or a Gemini key: the DB session is overridden and the
services fall back to their demo outputs when no API key is configured.
"""
import pytest
from httpx import AsyncClient, ASGITransport
from PIL import Image

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
async def test_generate_video_demo_mode(client):
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


