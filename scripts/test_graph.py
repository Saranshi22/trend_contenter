import asyncio
import os
import sys

# Add the root directory to Python path so we can import apps
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from apps.api.app.agents.investigation_graph import investigation_app
from apps.api.app.config import settings

from dotenv import load_dotenv
load_dotenv()  # Load .env file automatically

async def run_test():
    # Seed data representing the initial state from a Trend
    initial_state = {
        "investigation_id": "inv_test_yt_01",
        "workspace_id": "ws_123",
        "user_id": "user_123",
        "trend_id": "trend_123",
        "topic": "AI tutors",
        "region": "IN",
        "trend_history": [],
        "related_topics": ["personalized learning", "edtech", "homework ai"],
        "research_plan": {},
        "social_evidence": [],
        "web_evidence": [],
        "youtube_evidence": [],
        "youtube_questions": [],
        "youtube_videos": [],
        "llm_evidence": [],
        "source_statuses": {"social": "pending", "web": "pending", "youtube": "pending", "llm": "pending"},
        "llm_analysis": {},
        "normalized_evidence": [],
        "narratives": [],
        "questions": [],
        "audience_segments": [],
        "content_gaps": [],
        "opportunities": [],
        "errors": [],
        "status": "started",
        "stage": "Testing LangGraph YouTube Pipeline"
    }

    print("Running InvestigationGraph for topic: 'AI tutors'...")
    try:
        # Run the graph
        result = await investigation_app.ainvoke(initial_state)
        
        print("\n================= LangGraph Investigation Completed =================")
        print(f"Source Statuses: {result.get('source_statuses')}")
        print(f"Total Normalized Evidence Items: {len(result.get('normalized_evidence', []))}")
        
        # YouTube breakdown
        yt_items = [e for e in result.get('normalized_evidence', []) if e.get('platform') == 'youtube']
        yt_vids = [e for e in yt_items if e.get('metadata', {}).get('retrieval_method') == 'video_metadata']
        yt_cmts = [e for e in yt_items if e.get('metadata', {}).get('retrieval_method') == 'comment_thread']
        print(f"YouTube Total Evidence: {len(yt_items)} (Videos: {len(yt_vids)}, Comments: {len(yt_cmts)})")
        
        if yt_vids:
            print("\nSample YouTube Video:")
            sample_v = yt_vids[0]
            print(f"  Title: {sample_v.get('title')}")
            print(f"  URL: {sample_v.get('url')}")
            print(f"  Views: {sample_v.get('engagement', {}).get('views')} | Likes: {sample_v.get('engagement', {}).get('likes')}")
            print(f"  Thumbnail: {sample_v.get('metadata', {}).get('thumbnail_url')}")
            
        if yt_cmts:
            print("\nSample YouTube Audience Comment:")
            sample_c = yt_cmts[0]
            print(f"  Excerpt: \"{sample_c.get('text_excerpt')}\"")
            print(f"  Author: {sample_c.get('author')} | Likes: {sample_c.get('engagement', {}).get('likes')}")
            print(f"  Parent Video: {sample_c.get('metadata', {}).get('video_title')}")
            print(f"  URL: {sample_c.get('url')}")
            
        print("\nContent Gaps Identified:")
        for gap in result.get('content_gaps', [])[:2]:
            print(f"  - [{gap.get('audience_label')}] {gap.get('opportunity_title')}")
            print(f"    Problem: {gap.get('problem')}")
            print(f"    Evidence IDs: {gap.get('evidence_ids')}")
            
        print("\nScored Content Opportunities:")
        for opp in result.get('opportunities', [])[:2]:
            print(f"  - {opp.get('title')} (Score: {opp.get('score')})")
            print(f"    Format: {opp.get('recommended_format')}")
            print(f"    Evidence IDs: {opp.get('evidence_ids')}")

        if result.get("errors"):
            print(f"\nPipeline Notice / Warnings: {result.get('errors')}")

    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"\nError running graph: {e}")

if __name__ == "__main__":
    asyncio.run(run_test())
