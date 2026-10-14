from .gemini import GeminiEngine
from .openai_engine import OpenAIEngine
from .base import LLMEngine
from ...config import settings
import os

def get_llm_engine() -> LLMEngine:
    provider = (settings.LLM_PROVIDER or os.environ.get("LLM_PROVIDER", "openai")).lower()
    
    if provider == "openai":
        return OpenAIEngine()
    elif provider == "gemini":
        return GeminiEngine()
    else:
        raise ValueError(f"Unsupported LLM provider: {provider}")
