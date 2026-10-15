import os
import logging
from pathlib import Path
from fastapi import FastAPI, HTTPException, Request, APIRouter
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse

from config import settings
from models.schemas import (
    GenerateImageRequest,
    GenerateImageResponse,
    EditImageRequest,
    EditImageResponse,
    AddTextRequest,
    AddTextResponse,
    EnhancePromptRequest,
    EnhancePromptResponse,
    AnalyzeImageRequest,
    AnalyzeImageResponse,
    RecommendImagesRequest,
    RecommendImagesResponse,
    GenerateVideoRequest,
    GenerateVideoResponse,
    GenerateConceptsRequest,
    GenerateConceptsResponse
)
from services.gemini_service import gemini_service
from services.veo_service import veo_service
from services.concept_service import concept_service
from services.typography_service import TypographyService
from services.search_service import search_service
from services.reranker_service import reranker_service

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("trend_contenter")

app = FastAPI(
    title="Trend Contenter - Gemini Image Generation, Editing & Recommendation Engine",
    description="Full-stack AI image generation, inpainting/editing, precision typography, and Google Search Image Recommendation Engine with Multimodal Reranking.",
    version="1.0.0"
)

# API v1 Router
HTTP_500_RESPONSE = {
    500: {
        "description": "Internal Server Error",
        "content": {"application/json": {"example": {"detail": "Internal server error message"}}}
    }
}

api_v1 = APIRouter(
    prefix="/api/v1",
    tags=["v1"],
    responses=HTTP_500_RESPONSE
)

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount content static folder
settings.CONTENT_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/content", StaticFiles(directory=str(settings.CONTENT_DIR)), name="content")

# Health & Config Endpoint
@api_v1.get("/health")
async def health_check():
    return {
        "status": "online",
        "has_gemini_key": bool(settings.GEMINI_API_KEY),
        "has_google_cse": bool(settings.GOOGLE_CSE_API_KEY and settings.GOOGLE_CSE_ID),
        "has_serpapi_key": bool(settings.SERPAPI_API_KEY),
        "models": {
            "text": settings.GEMINI_TEXT_MODEL,
            "image_generation": settings.GEMINI_IMAGE_MODEL,
            "image_editing": settings.GEMINI_IMAGE_EDIT_MODEL,
            "video_generation": settings.VEO_MODEL,
            "clip_reranker": settings.CLIP_MODEL_NAME
        }
    }

# 1. Content Generation (Images)
@api_v1.post("/generate", response_model=GenerateImageResponse, responses=HTTP_500_RESPONSE)
async def generate_images(req: GenerateImageRequest):
    """Generates images using latest Google Gemini multimodal image generation models (gemini-3.1-pro-image and more)."""
    try:
        return gemini_service.generate_image(req)
    except Exception as e:
        logger.exception(f"Error in /api/v1/generate: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# 2. Concept & Content Idea Generation from Briefs (PDF / Markdown)
@api_v1.post("/generate-concepts", response_model=GenerateConceptsResponse, responses=HTTP_500_RESPONSE)
async def generate_concepts(req: GenerateConceptsRequest):
    """
    Ingests content opportunity briefs (PDF / Markdown / plain text), analyzes them via Gemini,
    and produces structured concepts with target platform rationale, hooks, and ready-to-run 
    prompts for Gemini 3.1 Pro Image and Google Veo Video.
    """
    try:
        return concept_service.generate_concepts(req)
    except Exception as e:
        logger.exception(f"Error in /api/v1/generate-concepts: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_v1.get("/sample-brief")
async def get_sample_brief():
    """Returns the sample CBD Ground executive opportunity dossier for demo/quick-start."""
    sample_path = settings.CONTENT_DIR / "sample_brief.md"
    if not sample_path.exists():
        # Look in workspace relative if not in content dir
        sample_path = Path(__file__).resolve().parent / "content" / "sample_brief.md"
    if sample_path.exists():
        return {"brief_markdown": sample_path.read_text(encoding="utf-8")}
    return {"brief_markdown": "# CBD Ground Organizing Brief\nNo sample file found."}

# 3. Video Generation (Google Veo)
@api_v1.post("/generate-video", response_model=GenerateVideoResponse, responses=HTTP_500_RESPONSE)
async def generate_video(req: GenerateVideoRequest):
    """Generates cinematic videos using Google Veo models (e.g. veo-2.0-generate-001). Supports text-to-video and image-to-video."""
    try:
        return veo_service.generate_video(req)
    except Exception as e:
        logger.exception(f"Error in /api/v1/generate-video: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# 4. Image Editing (Background, Object replacement/removal/addition/modification)
@api_v1.post("/edit", response_model=EditImageResponse, responses=HTTP_500_RESPONSE)
async def edit_image(req: EditImageRequest):
    """Edits images: background swap, object removal, addition, modification using multimodal Gemini models (gemini-3.1-pro-image)."""
    try:
        return gemini_service.edit_image(req)
    except Exception as e:
        logger.exception(f"Error in /api/v1/edit: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# 5. Precision Typography Addition
@api_v1.post("/add-text", response_model=AddTextResponse, responses=HTTP_500_RESPONSE)
async def add_text_to_image(req: AddTextRequest):
    """Adds stylized typography, drop shadow, badge backgrounds, and custom text to images."""
    try:
        return TypographyService.add_text_to_image(req)
    except Exception as e:
        logger.exception(f"Error in /api/v1/add-text: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# 6. Prompt Enhancement with Gemini
@api_v1.post("/enhance-prompt", response_model=EnhancePromptResponse, responses=HTTP_500_RESPONSE)
async def enhance_prompt(req: EnhancePromptRequest):
    """Uses Gemini 2.0 to expand and optimize prompts for maximum photorealism and impact."""
    try:
        return gemini_service.enhance_prompt(req)
    except Exception as e:
        logger.exception(f"Error in /api/v1/enhance-prompt: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# 7. Multimodal Image Analysis
@api_v1.post("/analyze", response_model=AnalyzeImageResponse, responses=HTTP_500_RESPONSE)
async def analyze_image(req: AnalyzeImageRequest):
    """Analyzes an image to detect objects, backgrounds, style, and suggests creative edits."""
    try:
        return gemini_service.analyze_image(req)
    except Exception as e:
        logger.exception(f"Error in /api/v1/analyze: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# 8. Image Recommendation Engine with Google Search & Multimodal Reranker
@api_v1.post("/recommend", response_model=RecommendImagesResponse, responses=HTTP_500_RESPONSE)
async def recommend_images(req: RecommendImagesRequest):
    """
    Image Recommendation Engine:
    1. Searches candidate images using Google Search Image API (CSE / SerpApi / Web).
    2. Uses a Reranker model (CLIP / Gemini / Hybrid) to rank candidates by accuracy and relevance.
    """
    try:
        # Step 1: Search images based on prompt
        candidates = await search_service.search_images(
            query=req.prompt,
            num_results=max(req.num_results * 2, 12),
            provider=req.search_provider or "auto",
            serpapi_key=req.serpapi_key,
            google_cse_key=req.google_cse_key,
            google_cse_id=req.google_cse_id
        )

        # Step 2: Rerank candidates with the selected reranker model
        ranked_items = await reranker_service.rerank(
            prompt=req.prompt,
            candidates=candidates,
            model_type=req.reranker_model or "hybrid",
            gemini_api_key=req.gemini_api_key
        )

        final_recommendations = ranked_items[:req.num_results]

        return RecommendImagesResponse(
            prompt=req.prompt,
            total_candidates=len(candidates),
            reranker_model=req.reranker_model or "hybrid",
            recommendations=final_recommendations
        )
    except Exception as e:
        logger.exception(f"Error in /api/v1/recommend: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# Include versioned API router
app.include_router(api_v1)

# Mount Frontend static files
if settings.FRONTEND_DIR.exists():
    app.mount("/static", StaticFiles(directory=str(settings.FRONTEND_DIR)), name="static")

    @app.get("/")
    async def serve_index():
        index_file = settings.FRONTEND_DIR / "index.html"
        if index_file.exists():
            return FileResponse(index_file)
        return {"message": "Frontend index.html not found, please check frontend/ directory."}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host=settings.HOST, port=settings.PORT, reload=True)
