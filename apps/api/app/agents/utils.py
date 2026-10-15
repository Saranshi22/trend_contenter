import hashlib
from typing import List
from ..domain.models.evidence import EvidenceItem

def deduplicate_evidence(evidence_list: List[EvidenceItem]) -> List[EvidenceItem]:
    """
    Deduplicates evidence based on:
    1. Exact URL match (if present)
    2. Exact content_hash match
    """
    seen_urls = set()
    seen_hashes = set()
    deduplicated = []

    for item in evidence_list:
        if item.url and item.url in seen_urls:
            continue
        if item.content_hash in seen_hashes:
            continue

        if item.url:
            seen_urls.add(item.url)
        seen_hashes.add(item.content_hash)
        
        deduplicated.append(item)

    return deduplicated

def generate_content_hash(text: str) -> str:
    """Generates a SHA-256 hash for content deduplication."""
    if not text:
        return ""
    # Simplified semantic normalization (lowercase, stripped)
    normalized_text = text.lower().strip()
    return hashlib.sha256(normalized_text.encode('utf-8')).hexdigest()
