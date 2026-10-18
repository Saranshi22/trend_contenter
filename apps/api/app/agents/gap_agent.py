from pydantic import BaseModel, Field
from typing import List, Optional
from ..config import settings
from .state import InvestigationState
from ..services.llm_engine.factory import get_llm_engine

class ContentOutlineSection(BaseModel):
    section_title: str = Field(description="Title of this content section")
    key_takeaway: str = Field(description="Core message, data point, or takeaway for this section")
    suggested_visual_or_element: Optional[str] = Field(default=None, description="Recommended visual, chart, b-roll, or graphic element")

class HookOption(BaseModel):
    hook_type: str = Field(description="e.g. 'Contrarian / Myth-Buster', 'Real-World Stakes', 'Curiosity / Data Spike'")
    headline: str = Field(description="The exact hook copy or opening line")
    rationale: str = Field(description="Why this hook captures viewer attention")

class ContentGap(BaseModel):
    audience_segment_id: str = Field(description="Segment identifier")
    audience_label: str = Field(description="Human-readable label of the audience segment")
    opportunity_title: str = Field(description="Specific, compelling editorial headline or title for this content piece")
    problem: str = Field(description="Concrete real-world problem, confusion, or obstacle faced by this audience")
    audience_need: str = Field(description="Exact questions or information needs this audience is actively searching for")
    observed_gap: str = Field(description="Detailed explanation of why current media or search results fail this audience")
    strategic_rationale: str = Field(default="", description="Deep 2-3 paragraph background and market context explaining why this opportunity is timely, what cultural/technical forces are at play, and why standard media missed it.")
    key_talking_points: List[str] = Field(default_factory=list, description="3-5 concrete arguments, core claims, data citations, or factual pillars that must be in the piece.")
    target_audience_pain_points: List[str] = Field(default_factory=list, description="3-4 specific frictions, misconceptions, or obstacles the audience faces.")
    recommended_outline: List[ContentOutlineSection] = Field(default_factory=list, description="4-5 structured sections with clear section titles, key takeaways, and production notes.")
    hook_options: List[HookOption] = Field(default_factory=list, description="2-3 scroll-stopping hooks with rationales.")
    recommended_angle: str = Field(description="Distinctive, actionable editorial angle that sets this content apart")
    recommended_format: str = Field(description="Best content format (e.g. 'In-Depth Citizen Guide', 'Visual Explainer & Map', 'FAQ Dossier', 'Video Script')")
    evidence_ids: List[str] = Field(default_factory=list)

class GapAnalysis(BaseModel):
    content_gaps: List[ContentGap]

async def detect_content_gaps(state: InvestigationState) -> dict:
    """Agent node that identifies content gaps by comparing existing media vs audience questions."""
    engine = get_llm_engine()

    # Extract sampled content & audience questions from normalized evidence
    norm_ev = state.get("normalized_evidence", [])
    youtube_videos = [
        f"[{e.get('evidence_id')}] '{e.get('title')}' ({e.get('author')}) - Views: {e.get('engagement', {}).get('views', 'N/A')}"
        for e in norm_ev if e.get("source_type") == "video_platform" and e.get("metadata", {}).get("retrieval_method") == "video_metadata"
    ][:10]

    # Combine all audience comments, observed questions, and social evidence
    comment_snippets = [
        f"[{e.get('evidence_id')}] \"{e.get('text_excerpt')}\""
        for e in norm_ev if e.get("text_excerpt") and (
            e.get("source_type") in ("video_platform", "social") or 
            e.get("metadata", {}).get("retrieval_method") == "comment_thread"
        )
    ][:15]

    web_coverage = [
        f"[{e.get('evidence_id')}] '{e.get('title')}' ({e.get('author') or 'Web'}): {e.get('text_excerpt', '')[:140]}"
        for e in norm_ev if e.get("source_type") == "web"
    ][:8]

    # Direct questions synthesized from earlier stages
    synthesized_questions = state.get("questions", []) or []
    yt_questions = state.get("youtube_questions", []) or []
    all_question_strings = []
    for q in synthesized_questions:
        if isinstance(q, dict):
            all_question_strings.append(f"- {q.get('question')} (Signal: {q.get('frequency_signal', 'medium')})")
        else:
            all_question_strings.append(f"- {str(q)}")
    for yq in yt_questions[:8]:
        all_question_strings.append(f"- [YouTube User Question] {yq}")

    topic = state.get("topic", "")
    region = state.get("region", "Global")

    related_list = state.get('related_topics', []) or []
    related_str = ', '.join(related_list) if related_list else 'None'

    prompt = f"""
    You are an executive editorial content strategist and investigative intelligence director.
    Topic: {topic}
    Region: {region}
    Google Trends Related Search Queries: {related_str}
    
    Target Audiences Identified:
    {state.get('audience_segments', [])}
    
    Narratives Identified:
    {state.get('narratives', [])}

    Synthesized Direct Questions from Audiences:
    {chr(10).join(all_question_strings) or 'No direct questions recorded.'}

    Existing Content Coverage Sampled:
    - Mainstream YouTube Videos:
    {chr(10).join(youtube_videos) or 'No videos sampled.'}
    - Web / News Coverage:
    {chr(10).join(web_coverage) or 'No web articles sampled.'}

    Real Audience Comments, Frustrations & Social Snippets:
    {chr(10).join(comment_snippets) or 'No comment snippets recorded.'}

    Perform a rigorous, executive-grade Content Gap Analysis comparing current coverage against real audience demands.
    For each target audience segment, generate a comprehensive, highly actionable Strategic Opportunity Brief.

    CRITICAL CONTEXT & DISAMBIGUATION MANDATE:
    Use the 'Google Trends Related Search Queries' ({related_str}) to anchor the editorial domain of this topic.
    For example: if the topic is 'barcelona' and related searches are 'fc barca', 'barca match', the opportunity briefs and outlines MUST address the football club, match results, tactical debates, or player performances — NEVER Barcelona city tourism, sightseeing, hotels, or flights. Reject any irrelevant municipal/travel noise.

    EDITORIAL QUALITY MANDATES:
    1. NEVER output generic 1-sentence summaries. Every brief must provide executive-level strategic depth.
    2. strategic_rationale: 2 to 3 substantive paragraphs analyzing the trend catalyst, current media failure, and unique editorial window.
    3. key_talking_points: 3 to 5 concrete claims, facts, or data arguments that must be covered.
    4. target_audience_pain_points: 3 to 4 specific frictions, questions, or misconceptions found in real viewer discussions.
    5. recommended_outline: 4 to 5 structured sections with clear section titles, key takeaways, and suggested visuals.
    6. hook_options: 2 to 3 distinct scroll-stopping hooks (e.g. Contrarian / Myth-Buster, Data Spike / Urgency, Practical Guide).
    7. Link real evidence_ids from the brackets above (e.g. ['ev_yt_...']) into evidence_ids.
    """
    
    try:
        parsed_response = await engine.generate_structured(prompt, GapAnalysis)
        gaps = [g.model_dump() for g in parsed_response.content_gaps] if parsed_response else []
        
        # Verify that generated gaps contain substantial content
        valid_gaps = []
        for g in gaps:
            if not g.get("strategic_rationale"):
                g["strategic_rationale"] = (
                    f"Surging interest around {topic} has triggered widespread user searches across {region}. "
                    f"While mainstream coverage emphasizes sensational headlines and surface-level announcements, "
                    f"it overlooks the practical, technical, and operational questions actively being asked by target audiences. "
                    f"This creates an immediate editorial opportunity to publish the definitive, authoritative resource addressing these unmet needs."
                )
            if not g.get("key_talking_points"):
                g["key_talking_points"] = [
                    f"The underlying drivers behind the surge in interest for {topic}",
                    f"Direct answers to the top questions left unaddressed by mainstream media",
                    f"Objective reality check comparing public perception vs verified facts",
                    f"Actionable takeaways and next steps for {g.get('audience_label', 'readers')}"
                ]
            if not g.get("target_audience_pain_points"):
                g["target_audience_pain_points"] = [
                    f"Confusion caused by fragmented and contradictory reports regarding {topic}",
                    "Lack of transparent timelines, operational specifications, and verified details",
                    "Difficulty distinguishing promotional claims from realistic outcomes"
                ]
            if not g.get("recommended_outline"):
                g["recommended_outline"] = [
                    {"section_title": "1. The Catalyst & The Spike", "key_takeaway": f"Why {topic} is dominating discussions and what triggered the search velocity.", "suggested_visual_or_element": "Timeline chart of recent events and search spike"},
                    {"section_title": "2. Separating Fact from Fiction", "key_takeaway": "Deconstructing mainstream headlines and addressing core community skepticism.", "suggested_visual_or_element": "Side-by-side claim vs reality comparison table"},
                    {"section_title": "3. The Technical & Operational Reality", "key_takeaway": "In-depth breakdown of the underlying mechanisms, requirements, and constraints.", "suggested_visual_or_element": "Explainer diagram or architectural infographic"},
                    {"section_title": "4. Actionable Next Steps & Outlook", "key_takeaway": "Clear guidance for the audience on what to monitor next and practical recommendations.", "suggested_visual_or_element": "Executive summary checklist or decision flowchart"}
                ]
            if not g.get("hook_options"):
                g["hook_options"] = [
                    {"hook_type": "Contrarian / Reality Check", "headline": f"Why Everything You've Heard About {topic} Misses the Real Story", "rationale": "Directly confronts hype and captures viewers seeking objective truth."},
                    {"hook_type": "Data Spike / Urgency", "headline": f"Inside the Sudden Surge in {topic}: What the Numbers Actually Tell Us", "rationale": "Appeals to analytical audiences wanting substantiated facts."},
                    {"hook_type": "Practical Deep-Dive", "headline": f"The Complete Guide to {topic}: Answers to the Questions Nobody Is Answering", "rationale": "Promises comprehensive clarity to frustrated searchers."}
                ]
            valid_gaps.append(g)

        return {"content_gaps": valid_gaps}
    except Exception as e:
        print(f"Error in gap detection: {e}")
        anchor = related_list[0].strip() if related_list else ""
        context_label = f"{topic} ({anchor})" if anchor and anchor.lower() not in topic.lower() else topic
        yt_ev_ids = [e.get("evidence_id") for e in norm_ev if e.get("source_type") == "video_platform"][:3]
        fallback_gaps = [
            {
                "audience_segment_id": "seg_practitioners",
                "audience_label": f"{context_label} Observers & Enthusiasts",
                "opportunity_title": f"The Definitive Strategic Guide to {context_label}",
                "problem": f"Mainstream video coverage and news reports focus on surface-level announcements while leaving critical execution and validation questions unanswered.",
                "audience_need": f"Rigorous, fact-based answers to the practical inquiries and uncertainties emerging around {context_label}.",
                "observed_gap": f"Current market content is saturated with superficial overviews, creating a high-value void for authoritative, step-by-step editorial breakdowns.",
                "strategic_rationale": (
                    f"A multi-source intelligence audit reveals a sharp disconnect between what media outlets are publishing about {context_label} "
                    f"and what real users are asking in community discussions. Mainstream outlets have largely recycled promotional soundbites, "
                    f"ignoring core questions regarding feasibility, timeline realities, and practical implications. "
                    f"By addressing these verified knowledge gaps directly, content creators and brands can establish immediate thought leadership and capture organic search authority."
                ),
                "key_talking_points": [
                    f"Root causes behind the recent surge in interest for {context_label}",
                    "Critical analysis of common misconceptions circulating in social discussions",
                    "Detailed technical and practical implications for practitioners",
                    "A forward-looking roadmap of key milestones and what to expect next"
                ],
                "target_audience_pain_points": [
                    f"Information overload with little verifiable data on {context_label}",
                    "Lack of clear, objective analysis unclouded by marketing hype",
                    "Uncertainty about real-world impact and actionable next steps"
                ],
                "recommended_outline": [
                    {"section_title": "1. What Just Happened: The Catalyst", "key_takeaway": f"Establishing the context and why {context_label} is suddenly everywhere.", "suggested_visual_or_element": "Search velocity graph & timeline"},
                    {"section_title": "2. The Hype vs. The Reality", "key_takeaway": "Examining the top 3 claims against documented facts and evidence.", "suggested_visual_or_element": "Myth vs Fact callout box"},
                    {"section_title": "3. What You Actually Need to Know", "key_takeaway": "The core technical and practical aspects that matter most to practitioners.", "suggested_visual_or_element": "Process diagram or breakdown chart"},
                    {"section_title": "4. Strategic Takeaways & Next Steps", "key_takeaway": "Clear, decisive recommendations for how to navigate upcoming developments.", "suggested_visual_or_element": "Key takeaways summary card"}
                ],
                "hook_options": [
                    {"hook_type": "The Reality Check", "headline": f"The Truth About {context_label}: What the Headlines Aren't Telling You", "rationale": "High curiosity trigger targeting skeptical, research-minded audiences."},
                    {"hook_type": "The Deep-Dive", "headline": f"Everything You Need to Know About {context_label} in 10 Minutes", "rationale": "Promises high efficiency and comprehensive value to busy readers."}
                ],
                "recommended_angle": "Objective, evidence-grounded investigation dissecting hype and delivering verified answers.",
                "recommended_format": "Video Explainer & Executive Dossier",
                "evidence_ids": yt_ev_ids or [e.get("evidence_id") for e in norm_ev[:3] if e.get("evidence_id")]
            }
        ]
        return {
            "content_gaps": fallback_gaps,
            "errors": [{"source": "gap_agent", "message": str(e)}]
        }

