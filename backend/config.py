import os
from pathlib import Path
from dotenv import load_dotenv

# Load .env if present
BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")
load_dotenv(BASE_DIR.parent / ".env")

class Settings:
    # API Keys
    GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "") or os.getenv("GOOGLE_API_KEY", "")
    GOOGLE_CSE_API_KEY: str = os.getenv("GOOGLE_API_KEY", "") or os.getenv("GEMINI_API_KEY", "")
    GOOGLE_CSE_ID: str = os.getenv("GOOGLE_CSE_ID", "")
    SERPAPI_API_KEY: str = os.getenv("SERPAPI_API_KEY", "")

    # Models
    GEMINI_TEXT_MODEL: str = os.getenv("GEMINI_TEXT_MODEL", "gemini-2.0-flash")
    GEMINI_IMAGE_MODEL: str = os.getenv("GEMINI_IMAGE_MODEL", "gemini-3.1-pro-image")
    GEMINI_IMAGE_EDIT_MODEL: str = os.getenv("GEMINI_IMAGE_EDIT_MODEL", "gemini-3.1-pro-image")
    # Legacy alias support
    IMAGEN_MODEL: str = os.getenv("IMAGEN_MODEL", "gemini-3.1-pro-image")
    IMAGEN_EDIT_MODEL: str = os.getenv("IMAGEN_EDIT_MODEL", "gemini-3.1-pro-image")
    CLIP_MODEL_NAME: str = os.getenv("CLIP_MODEL_NAME", "clip-ViT-B-32")
    DEFAULT_RERANKER_MODEL: str = os.getenv("DEFAULT_RERANKER_MODEL", "hybrid")
    VEO_MODEL: str = os.getenv("VEO_MODEL", "veo-2.0-generate-001")

    # Directories
    CONTENT_DIR: Path = BASE_DIR / "content"
    FRONTEND_DIR: Path = BASE_DIR.parent / "frontend"

    # Host & Port
    HOST: str = os.getenv("HOST", "0.0.0.0")
    PORT: int = int(os.getenv("PORT", "8000"))

settings = Settings()
settings.CONTENT_DIR.mkdir(parents=True, exist_ok=True)

