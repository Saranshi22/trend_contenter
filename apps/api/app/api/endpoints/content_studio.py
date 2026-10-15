import base64
import logging
from pathlib import Path
from typing import Any, Dict

from fastapi import APIRouter, Depends, HTTPException
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import FileResponse
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from ...config import settings
from ...db_postgres import get_postgres_session
from ...domain.models.content_studio import (
    AddTextRequest,
    AddTextResponse,
    AnalyzeImageRequest,
    AnalyzeImageResponse,
    EditImageRequest,
    EditImageResponse,
    EnhancePromptRequest,
    EnhancePromptResponse,
    GenerateConceptsRequest,
    GenerateConceptsResponse,
    GenerateImageRequest,
    GenerateImageResponse,
    GenerateVideoRequest,
    GenerateVideoResponse,
    OpportunityConceptsRequest,
)
from ...domain.models.user import User
from ...security.auth import require_permission
from ...services.content_studio.concept_service import concept_service
from ...services.content_studio.gemini_service import gemini_service
from ...services.content_studio.typography_service import TypographyService
from ...services.content_studio.veo_service import veo_service
from ...services.pdf_service import PDFService
from .opportunities import _parse_dict, _parse_json_list

logger = logging.getLogger(__name__)

HTTP_400_RESPONSE = {400: {"description": "Invalid request (e.g. no brief content provided)"}}
HTTP_404_RESPONSE = {404: {"description": "Opportunity not found"}}
HTTP_500_RESPONSE = {
    500: {
        "description": "Internal Server Error",
        "content": {"application/json": {"example": {"detail": "Internal server error message"}}},
    }
}

router = APIRouter(responses=HTTP_500_RESPONSE)

SAMPLE_BRIEF_PATH = Path(__file__).resolve().parents[2] / "services" / "content_studio" / "sample_brief.md"

require_read = require_permission("content.read")
require_write = require_permission("content.write")


def _fail(endpoint: str, exc: Exception) -> HTTPException:
    """Log and convert an unexpected error into a 500; client mistakes become 400."""
    if isinstance(exc, ValueError):
        return HTTPException(status_code=400, detail=str(exc))
    logger.exception("Error in content-studio %s: %s", endpoint, exc)
    return HTTPException(status_code=500, detail=str(exc))


@router.get("/health")
async def content_studio_health(current_user: User = Depends(require_read)):
    """Reports which generation models are configured and whether a Gemini key is present."""
    return {
        "has_gemini_key": bool(settings.GEMINI_API_KEY),
        "models": {
            "text": settings.GEMINI_TEXT_MODEL,
            "image_generation": settings.GEMINI_IMAGE_MODEL,
            "image_editing": settings.GEMINI_IMAGE_EDIT_MODEL,
            "video_generation": settings.VEO_MODEL,
        },
    }


@router.get("/media/{filename}", response_class=FileResponse)
async def get_media(filename: str):
    """
    Serves generated images/videos. Public by design so <img>/<video> tags can load them
    (filenames are random UUID-based identifiers).
    """
    media_dir = settings.CONTENT_STUDIO_MEDIA_DIR.resolve()
    path = (media_dir / filename).resolve()
    if path.parent != media_dir or not path.is_file():
        raise HTTPException(status_code=404, detail="Media not found")
    return FileResponse(path)


# ---------------------------------------------------------------------------
# Concepts
# ---------------------------------------------------------------------------

@router.get("/sample-brief")
async def get_sample_brief(current_user: User = Depends(require_read)):
    """Returns a sample opportunity dossier in Markdown for demos / quick start."""
    if not SAMPLE_BRIEF_PATH.exists():
        raise HTTPException(status_code=404, detail="Sample brief not found")
    return {"brief_markdown": SAMPLE_BRIEF_PATH.read_text(encoding="utf-8")}


@router.post(
    "/concepts",
    response_model=GenerateConceptsResponse,
    responses={**HTTP_400_RESPONSE, **HTTP_500_RESPONSE},
)
async def generate_concepts(req: GenerateConceptsRequest, current_user: User = Depends(require_write)):
    """
    Analyses an uploaded brief (PDF / Markdown / pasted text) with Gemini and returns
    platform-optimised image & video concepts with ready-to-run generation prompts.
    """
    try:
        return await run_in_threadpool(concept_service.generate_concepts, req)
    except Exception as e:
        raise _fail("/concepts", e)


async def _load_opportunity_brief(db: AsyncSession, opportunity_id: str) -> Dict[str, Any]:
    result = await db.execute(
        text("""
            SELECT o.opportunity_id, o.segment_id, COALESCE(a.label, 'Target Audience') as audience_label,
                   a.description as audience_description, a.needs as audience_needs,
                   a.questions as audience_questions, a.concerns as audience_concerns,
                   o.title, o.score, o.problem, o.audience_need, o.content_gap,
                   o.recommended_angle, o.recommended_format, o.score_breakdown
            FROM opportunities o
            LEFT JOIN audiences a ON o.segment_id = a.segment_id
            WHERE o.opportunity_id = :oid
        """),
        {"oid": opportunity_id},
    )
    row = result.mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Opportunity not found")

    return {
        "opportunity_id": row["opportunity_id"],
        "title": row["title"],
        "score": row["score"],
        "problem": row.get("problem") or "Underserved audience need",
        "audience_need": row.get("audience_need") or "High interest, missing high-quality guidance",
        "content_gap": row.get("content_gap") or "Absence of clear, comprehensive synthesis",
        "recommended_angle": row.get("recommended_angle") or "Practical, actionable guide with data",
        "recommended_format": row.get("recommended_format") or "Explainer Article / Video Script",
        "score_breakdown": _parse_dict(row.get("score_breakdown")),
        "audience_label": row.get("audience_label") or "Target Audience",
        "audience_description": row.get("audience_description") or "",
        "audience_needs": _parse_json_list(row.get("audience_needs")),
        "audience_questions": _parse_json_list(row.get("audience_questions")),
        "audience_concerns": _parse_json_list(row.get("audience_concerns")),
    }


@router.post(
    "/concepts/opportunity/{opportunity_id}",
    response_model=GenerateConceptsResponse,
    responses={**HTTP_404_RESPONSE, **HTTP_500_RESPONSE},
)
async def generate_concepts_for_opportunity(
    opportunity_id: str,
    options: OpportunityConceptsRequest = OpportunityConceptsRequest(),
    db: AsyncSession = Depends(get_postgres_session),
    current_user: User = Depends(require_write),
):
    """
    Generates concepts straight from a staged opportunity: its executive PDF dossier is rendered
    server-side by the existing PDF service and fed to Gemini as the brief.
    """
    data = await _load_opportunity_brief(db, opportunity_id)
    try:
        pdf_bytes = PDFService.generate_opportunity_brief(data)
        req = GenerateConceptsRequest(
            file_base64="data:application/pdf;base64," + base64.b64encode(pdf_bytes).decode("ascii"),
            file_mime_type="application/pdf",
            num_concepts=options.num_concepts,
            preferred_media_mix=options.preferred_media_mix,
            target_platforms=options.target_platforms,
        )
        return await run_in_threadpool(concept_service.generate_concepts, req)
    except Exception as e:
        raise _fail(f"/concepts/opportunity/{opportunity_id}", e)


# ---------------------------------------------------------------------------
# Images
# ---------------------------------------------------------------------------

@router.post("/images/generate", response_model=GenerateImageResponse, responses=HTTP_500_RESPONSE)
async def generate_images(req: GenerateImageRequest, current_user: User = Depends(require_write)):
    """Generates images with Gemini multimodal image models (gemini-3.1-pro-image and more)."""
    try:
        return await run_in_threadpool(gemini_service.generate_image, req)
    except Exception as e:
        raise _fail("/images/generate", e)


@router.post("/images/edit", response_model=EditImageResponse, responses=HTTP_500_RESPONSE)
async def edit_image(req: EditImageRequest, current_user: User = Depends(require_write)):
    """Edits an image (background swap, object add/remove/modify) with Gemini image models."""
    try:
        return await run_in_threadpool(gemini_service.edit_image, req)
    except Exception as e:
        raise _fail("/images/edit", e)


@router.post("/images/add-text", response_model=AddTextResponse, responses=HTTP_500_RESPONSE)
async def add_text_to_image(req: AddTextRequest, current_user: User = Depends(require_write)):
    """Overlays stylised typography (shadow, outline, badge) on an image."""
    try:
        return await run_in_threadpool(TypographyService.add_text_to_image, req)
    except Exception as e:
        raise _fail("/images/add-text", e)


@router.post("/images/enhance-prompt", response_model=EnhancePromptResponse, responses=HTTP_500_RESPONSE)
async def enhance_prompt(req: EnhancePromptRequest, current_user: User = Depends(require_write)):
    """Expands a short idea into a detailed image/video prompt with Gemini."""
    try:
        return await run_in_threadpool(gemini_service.enhance_prompt, req)
    except Exception as e:
        raise _fail("/images/enhance-prompt", e)


@router.post("/images/analyze", response_model=AnalyzeImageResponse, responses=HTTP_500_RESPONSE)
async def analyze_image(req: AnalyzeImageRequest, current_user: User = Depends(require_write)):
    """Analyses an image (subjects, background, composition) and suggests creative edits."""
    try:
        return await run_in_threadpool(gemini_service.analyze_image, req)
    except Exception as e:
        raise _fail("/images/analyze", e)


# ---------------------------------------------------------------------------
# Video
# ---------------------------------------------------------------------------

@router.post("/videos/generate", response_model=GenerateVideoResponse, responses=HTTP_500_RESPONSE)
async def generate_video(req: GenerateVideoRequest, current_user: User = Depends(require_write)):
    """Generates cinematic video with Google Veo (text-to-video and image-to-video)."""
    try:
        return await run_in_threadpool(veo_service.generate_video, req)
    except Exception as e:
        raise _fail("/videos/generate", e)

