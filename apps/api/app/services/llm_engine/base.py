from typing import Protocol, Type, TypeVar
from pydantic import BaseModel

T = TypeVar('T', bound=BaseModel)

class LLMEngine(Protocol):
    async def generate_structured(self, prompt: str, schema: Type[T]) -> T:
        """Generates a structured response based on the provided Pydantic schema."""
        ...
