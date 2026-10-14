from typing import Dict, Any, Optional
import litellm
from .base import ILLMAdapter
from ....config import settings

class LiteLLMAdapter(ILLMAdapter):
    def __init__(self, model: str = "gpt-4o-mini", api_key: Optional[str] = None):
        self.model = model
        self.api_key = api_key or settings.OPENAI_API_KEY

    async def fetch_response(self, prompt_text: str) -> Dict[str, Any]:
        response = await litellm.acompletion(
            model=self.model,
            messages=[
                {"role": "user", "content": prompt_text}
            ],
            api_key=self.api_key if self.api_key else None,
            timeout=float(settings.LLM_REQUEST_TIMEOUT_SECONDS)
        )
        content = response.choices[0].message.content or ""
        return {
            "response_text": content,
            "raw_response": response.model_dump()
        }
