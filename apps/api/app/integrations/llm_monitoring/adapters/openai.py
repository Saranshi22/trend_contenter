from openai import AsyncOpenAI
from typing import Dict, Any, Optional
from .base import ILLMAdapter
from ....config import settings

class ChatGPTAdapter(ILLMAdapter):
    def __init__(self, api_key: Optional[str] = None, model: str = "gpt-4o-mini"):
        key = api_key or settings.OPENAI_API_KEY
        if not key:
            raise ValueError("OpenAI API key not configured")
        self.client = AsyncOpenAI(api_key=key)
        self.model = model

    async def fetch_response(self, prompt_text: str) -> Dict[str, Any]:
        response = await self.client.chat.completions.create(
            model=self.model,
            messages=[
                {"role": "user", "content": prompt_text}
            ],
            timeout=float(settings.LLM_REQUEST_TIMEOUT_SECONDS)
        )
        content = response.choices[0].message.content or ""
        return {
            "response_text": content,
            "raw_response": response.model_dump()
        }
