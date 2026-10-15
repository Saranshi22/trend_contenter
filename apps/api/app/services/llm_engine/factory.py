from .gemini import GeminiEngine
from .openai_engine import OpenAIEngine
from .base import LLMEngine
from ...config import settings
import os

def get_llm_engine() -> LLMEngine:
    provider = (settings.LLM_PROVIDER or os.environ.get("LLM_PROVIDER", "")).lower()
    
    if provider == "gemini" or (not settings.OPENAI_API_KEY and (settings.GEMINI_API_KEY or os.environ.get("GEMINI_API_KEY"))):
        return GeminiEngine()
    elif provider == "openai" and settings.OPENAI_API_KEY:
        return OpenAIEngine()
    elif settings.GEMINI_API_KEY or os.environ.get("GEMINI_API_KEY"):
        return GeminiEngine()
    else:
        return OpenAIEngine()

