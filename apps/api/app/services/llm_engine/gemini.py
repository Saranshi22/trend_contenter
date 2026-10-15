import os
import copy
import google.genai as genai
from typing import Type, TypeVar, Dict, Any
from pydantic import BaseModel
from .base import LLMEngine
from ...config import settings

T = TypeVar('T', bound=BaseModel)

def _prepare_google_genai_schema(schema_dict: Dict[str, Any]) -> Dict[str, Any]:
    """
    Inlines $defs into $ref occurrences and strips Google AI MLDev unsupported keys
    (title, default, example, pattern, min/max constraints) while uppercasing types.
    """
    schema = copy.deepcopy(schema_dict)
    defs = schema.pop("$defs", {})

    def _resolve(node: Any) -> Any:
        if isinstance(node, dict):
            if "$ref" in node:
                ref_key = node["$ref"].split("/")[-1]
                if ref_key in defs:
                    resolved = copy.deepcopy(defs[ref_key])
                    return _resolve(resolved)
            return {k: _resolve(v) for k, v in node.items()}
        elif isinstance(node, list):
            return [_resolve(item) for item in node]
        return node

    inlined = _resolve(schema)

    unsupported = {
        "title", "default", "example", "min_items", "max_items",
        "min_length", "max_length", "min_properties", "max_properties",
        "minimum", "maximum", "pattern", "property_ordering", "any_of", "nullable"
    }

    def _clean(node: Any) -> Any:
        if isinstance(node, dict):
            cleaned = {}
            for k, v in node.items():
                if k in unsupported:
                    continue
                if k == "type" and isinstance(v, str):
                    cleaned[k] = v.upper()
                else:
                    cleaned[k] = _clean(v)
            return cleaned
        elif isinstance(node, list):
            return [_clean(x) for x in node]
        return node

    return _clean(inlined)

class GeminiEngine(LLMEngine):
    def __init__(self):
        self.api_key = (os.environ.get("GEMINI_API_KEY") or settings.GEMINI_API_KEY or "").strip()
        self.client = genai.Client(api_key=self.api_key)
        self.model_name = settings.GEMINI_TEXT_MODEL

    async def generate_structured(self, prompt: str, schema: Type[T]) -> T:
        prepared_schema = _prepare_google_genai_schema(schema.model_json_schema())
        response = self.client.models.generate_content(
            model=self.model_name,
            contents=prompt,
            config=genai.types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=prepared_schema,
                temperature=0.2,
            ),
        )
        if hasattr(response, "text") and response.text:
            return schema.model_validate_json(response.text)
        return response.parsed

