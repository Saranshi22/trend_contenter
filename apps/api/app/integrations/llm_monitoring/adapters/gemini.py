from typing import Dict, Any, Optional
from .base import ILLMAdapter
from ....config import settings

class GeminiAdapter(ILLMAdapter):
    def __init__(self, api_key: Optional[str] = None, model: str = "gemini-1.5-pro"):
        key = api_key or settings.GEMINI_API_KEY
        if not key:
            raise ValueError("Gemini API key not configured")
        self.api_key = key
        self.model_name = model

    async def fetch_response(self, prompt_text: str) -> Dict[str, Any]:
        # Try google.genai first (recommended by Google SDK)
        try:
            from google import genai
            client = genai.Client(api_key=self.api_key)
            response = await client.aio.models.generate_content(
                model=self.model_name,
                contents=prompt_text
            )
            text = response.text or ""
            return {
                "response_text": text,
                "raw_response": {"text": text}
            }
        except Exception:
            # Fallback to google.generativeai
            import google.generativeai as legacy_genai
            legacy_genai.configure(api_key=self.api_key)
            model = legacy_genai.GenerativeModel(self.model_name)
            response = await model.generate_content_async(prompt_text)
            text = response.text or ""
            return {
                "response_text": text,
                "raw_response": {"text": text}
            }
