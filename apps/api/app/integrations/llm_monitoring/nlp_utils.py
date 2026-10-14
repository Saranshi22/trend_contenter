import re
from typing import List, Dict, Any

class NLPExtractor:
    @staticmethod
    def extract_citations(text: str) -> List[Dict[str, Any]]:
        """
        Extracts HTTP/HTTPS URLs from raw LLM responses and derives domain metadata.
        Reused from LLM Brand Radar NLPExtractor.
        """
        url_pattern = re.compile(r'https?://(?:[-\w.]|(?:%[\da-fA-F]{2}))+[^\s\)\],;\"\'<>]*')
        urls = url_pattern.findall(text)
        
        citations: List[Dict[str, Any]] = []
        seen = set()
        for idx, url in enumerate(urls):
            # Clean trailing punctuation
            clean_url = url.rstrip('.,;:)')
            if clean_url in seen:
                continue
            seen.add(clean_url)

            domain = clean_url.replace("http://", "").replace("https://", "").split("/")[0]
            citations.append({
                "url": clean_url,
                "domain": domain,
                "position": idx + 1
            })
        return citations

    @staticmethod
    def analyze_sentiment(text: str) -> str:
        """
        Determines sentiment polarity using TextBlob if available, otherwise heuristics.
        Reused from LLM Brand Radar NLPExtractor.
        """
        try:
            from textblob import TextBlob
            blob = TextBlob(text)
            polarity = blob.sentiment.polarity
            if polarity > 0.1:
                return "Positive"
            elif polarity < -0.1:
                return "Negative"
            else:
                return "Neutral"
        except Exception:
            return "Neutral"
