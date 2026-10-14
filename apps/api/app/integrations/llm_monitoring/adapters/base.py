from abc import ABC, abstractmethod
from typing import Dict, Any

class ILLMAdapter(ABC):
    @abstractmethod
    async def fetch_response(self, prompt_text: str) -> Dict[str, Any]:
        """
        Send a prompt to the LLM and return a standardized response format.
        Expected return format:
        {
            "response_text": str,
            "raw_response": dict
        }
        """
        pass
