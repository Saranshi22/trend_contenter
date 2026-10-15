from anthropic import AsyncAnthropic
from typing import Dict, Any, Optional
from .base import ILLMAdapter
from ....config import settings

class ClaudeAdapter(ILLMAdapter):
    def __init__(self, api_key: Optional[str] = None, model: str = "claude-3-opus-20240229"):
        key = api_key or settings.ANTHROPIC_API_KEY
        if not key:
            raise ValueError("Anthropic API key not configured")
        self.client = AsyncAnthropic(api_key=key)
        self.model = model

    async def fetch_response(self, prompt_text: str) -> Dict[str, Any]:
        response = await self.client.messages.create(
            model=self.model,
            max_tokens=1000,
            messages=[
                {"role": "user", "content": prompt_text}
            ],
            timeout=float(settings.LLM_REQUEST_TIMEOUT_SECONDS)
        )
        content = response.content[0].text if response.content else ""
        return {
            "response_text": content,
            "raw_response": response.model_dump()
        }
