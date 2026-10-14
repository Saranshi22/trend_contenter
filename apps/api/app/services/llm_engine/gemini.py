import os
import google.genai as genai
from typing import Type, TypeVar
from pydantic import BaseModel
from .base import LLMEngine
from ...config import settings

T = TypeVar('T', bound=BaseModel)

class GeminiEngine(LLMEngine):
    def __init__(self):
        self.api_key = os.environ.get("GEMINI_API_KEY")
        self.client = genai.Client(api_key=self.api_key)
        self.model_name = settings.GEMINI_TEXT_MODEL

    async def generate_structured(self, prompt: str, schema: Type[T]) -> T:
        response = self.client.models.generate_content(
            model=self.model_name,
            contents=prompt,
            config=genai.types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=schema,
                temperature=0.2,
            ),
        )
        return response.parsed
