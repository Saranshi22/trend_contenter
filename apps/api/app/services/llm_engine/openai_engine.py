import os
from typing import Type, TypeVar
from pydantic import BaseModel
from openai import AsyncOpenAI
from .base import LLMEngine
from ...config import settings

T = TypeVar('T', bound=BaseModel)

class OpenAIEngine(LLMEngine):
    def __init__(self):
        self.api_key = settings.OPENAI_API_KEY or os.environ.get("OPENAI_API_KEY")
        self.client = AsyncOpenAI(api_key=self.api_key)
        self.model_name = settings.OPENAI_TEXT_MODEL

    async def generate_structured(self, prompt: str, schema: Type[T]) -> T:
        response = await self.client.beta.chat.completions.parse(
            model=self.model_name,
            messages=[
                {"role": "user", "content": prompt}
            ],
            response_format=schema,
            temperature=0.2,
        )
        return response.choices[0].message.parsed
