from pydantic import BaseModel
from typing import Literal
from datetime import datetime

class EvidenceItem(BaseModel):
    evidence_id: str
    investigation_id: str

    source_type: Literal[
        "trend",
        "social",
        "web",
        "news",
        "llm"
    ]

    platform: str

    title: str | None = None
    text_excerpt: str | None = None
    url: str | None = None

    published_at: datetime | None = None
    retrieved_at: datetime

    author: str | None = None
    engagement: dict[str, float | int] = {}
    metadata: dict = {}

    content_hash: str
