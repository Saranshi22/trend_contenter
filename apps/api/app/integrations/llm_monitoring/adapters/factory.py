from typing import Optional
from .base import ILLMAdapter
from .openai import ChatGPTAdapter
from .gemini import GeminiAdapter
from .claude import ClaudeAdapter
from .lite_llm import LiteLLMAdapter

class LLMAdapterFactory:
    @staticmethod
    def get_adapter(platform: str, model: Optional[str] = None) -> ILLMAdapter:
        platform = platform.lower()
        if platform in ["chatgpt", "openai"]:
            return ChatGPTAdapter(model=model) if model else ChatGPTAdapter()
        elif platform in ["gemini", "google"]:
            return GeminiAdapter(model=model) if model else GeminiAdapter()
        elif platform in ["claude", "anthropic"]:
            return ClaudeAdapter(model=model) if model else ClaudeAdapter()
        elif platform == "litellm":
            return LiteLLMAdapter(model=model) if model else LiteLLMAdapter()
        else:
            raise ValueError(f"Unsupported LLM platform: {platform}")
