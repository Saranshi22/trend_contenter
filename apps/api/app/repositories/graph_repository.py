from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from typing import Dict, Any, List
import json
import uuid
from datetime import datetime, timezone

class PostgresGraphWriter:
    """
    Acts as the relationship (graph) and investigation state writer using PostgreSQL.
    """
    def __init__(self, session: AsyncSession):
        self.session = session
        
    async def write_investigation_graph(self, state: dict) -> None:
        """
        Takes the investigation state and writes the graph relationships & evidence:
        Investigation -> Evidence -> Trend -> Narrative -> Question -> Audience -> Opportunity
        """
        inv_id = state.get("investigation_id") or f"inv_{uuid.uuid4().hex[:8]}"
        workspace_id = state.get("workspace_id") or "workspace_dev"
        user_id = state.get("user_id") or "dev_user"
        topic = state.get("topic", "")
        region = state.get("region", "IN")
        trend_id = state.get("trend_id", f"trend_{uuid.uuid4().hex[:8]}")

        # 1. Upsert Investigation Record
        source_statuses = json.dumps(state.get("source_statuses") or {"social": "success", "web": "success", "llm": "success"})
        research_plan = json.dumps(state.get("research_plan") or {})
        narratives_json = json.dumps(state.get("narratives") or [])
        questions_json = json.dumps(state.get("questions") or [])
        audiences_json = json.dumps(state.get("audience_segments") or [])
        gaps_json = json.dumps(state.get("content_gaps") or [])
        opps_json = json.dumps(state.get("opportunities") or [])
        llm_analysis_json = json.dumps(state.get("llm_analysis") or {})
        errors_json = json.dumps(state.get("errors") or [])

        await self.session.execute(
            text("""
                INSERT INTO investigations (
                    investigation_id, workspace_id, user_id, topic, region,
                    status, stage, source_statuses, research_plan, narratives,
                    questions, audience_segments, content_gaps, opportunities,
                    llm_analysis, errors, updated_at
                ) VALUES (
                    :iid, :wid, :uid, :top, :reg,
                    'complete', 'Complete', :src, :plan, :nars,
                    :qs, :auds, :gaps, :opps,
                    :llm, :errs, NOW()
                ) ON CONFLICT (investigation_id) DO UPDATE SET
                    status = 'complete',
                    stage = 'Complete',
                    source_statuses = EXCLUDED.source_statuses,
                    research_plan = EXCLUDED.research_plan,
                    narratives = EXCLUDED.narratives,
                    questions = EXCLUDED.questions,
                    audience_segments = EXCLUDED.audience_segments,
                    content_gaps = EXCLUDED.content_gaps,
                    opportunities = EXCLUDED.opportunities,
                    llm_analysis = EXCLUDED.llm_analysis,
                    errors = EXCLUDED.errors,
                    updated_at = NOW()
            """),
            {
                "iid": inv_id,
                "wid": workspace_id,
                "uid": user_id,
                "top": topic,
                "reg": region,
                "src": source_statuses,
                "plan": research_plan,
                "nars": narratives_json,
                "qs": questions_json,
                "auds": audiences_json,
                "gaps": gaps_json,
                "opps": opps_json,
                "llm": llm_analysis_json,
                "errs": errors_json
            }
        )

        # 2. Write Normalized Evidence
        normalized_evidence = state.get("normalized_evidence", [])
        for ev in normalized_evidence:
            ev_id = ev.get("evidence_id") or f"ev_{uuid.uuid4().hex[:8]}"
            await self.session.execute(
                text("""
                    INSERT INTO investigation_evidence (
                        evidence_id, investigation_id, source_type, platform,
                        title, text_excerpt, url, author, engagement,
                        metadata, content_hash, confidence, is_inferred
                    ) VALUES (
                        :eid, :iid, :stype, :plat,
                        :t, :txt, :url, :auth, :eng,
                        :meta, :chash, :conf, :inf
                    ) ON CONFLICT (evidence_id) DO NOTHING
                """),
                {
                    "eid": ev_id,
                    "iid": inv_id,
                    "stype": ev.get("source_type", "web"),
                    "plat": ev.get("platform", "web"),
                    "t": ev.get("title", ""),
                    "txt": ev.get("text_excerpt", ""),
                    "url": ev.get("url"),
                    "auth": ev.get("author"),
                    "eng": json.dumps(ev.get("engagement") or {}),
                    "meta": json.dumps(ev.get("metadata") or {}),
                    "chash": ev.get("content_hash", ""),
                    "conf": float(ev.get("confidence") or 0.85),
                    "inf": bool(ev.get("is_inferred", False))
                }
            )

        # 3. Write Trend
        await self.session.execute(
            text("INSERT INTO trends (trend_id, topic, observed_at) VALUES (:tid, :top, NOW()) ON CONFLICT (trend_id) DO NOTHING"),
            {"tid": trend_id, "top": topic}
        )

        # 4. Write Narratives
        narratives = state.get("narratives", [])
        narrative_ids = []
        for n in narratives:
            n_id = n.get("narrative_id") or f"nar_{uuid.uuid4().hex[:8]}"
            narrative_ids.append(n_id)
            await self.session.execute(
                text("INSERT INTO narratives (narrative_id, trend_id, name, sentiment) VALUES (:nid, :tid, :nm, :snt) ON CONFLICT (narrative_id) DO NOTHING"),
                {"nid": n_id, "tid": trend_id, "nm": n.get("name", "General Narrative"), "snt": n.get("sentiment", "neutral")}
            )

        # 5. Write Questions
        default_n_id = narrative_ids[0] if narrative_ids else None
        questions = state.get("questions", [])
        question_ids = []
        for q in questions:
            q_id = q.get("question_id") or f"q_{uuid.uuid4().hex[:8]}"
            question_ids.append(q_id)
            await self.session.execute(
                text("INSERT INTO questions (question_id, narrative_id, question) VALUES (:qid, :nid, :q) ON CONFLICT (question_id) DO NOTHING"),
                {"qid": q_id, "nid": default_n_id, "q": q.get("question", "")}
            )

        # 6. Write Audiences
        default_q_id = question_ids[0] if question_ids else None
        audiences = state.get("audience_segments", [])
        audience_ids = set()
        for aud in audiences:
            a_id = aud.get("segment_id") or f"seg_{uuid.uuid4().hex[:8]}"
            audience_ids.add(a_id)
            await self.session.execute(
                text("""
                    INSERT INTO audiences (segment_id, question_id, label, description, needs, questions, concerns)
                    VALUES (:aid, :qid, :lbl, :desc, :needs, :questions, :concerns)
                    ON CONFLICT (segment_id) DO UPDATE SET
                        label = EXCLUDED.label,
                        description = EXCLUDED.description,
                        needs = EXCLUDED.needs,
                        questions = EXCLUDED.questions,
                        concerns = EXCLUDED.concerns
                """),
                {
                    "aid": a_id,
                    "qid": default_q_id,
                    "lbl": aud.get("label", "General Audience"),
                    "desc": aud.get("description", "Identified target group"),
                    "needs": json.dumps(aud.get("needs") or []),
                    "questions": json.dumps(aud.get("questions") or []),
                    "concerns": json.dumps(aud.get("concerns") or [])
                }
            )

        # 7. Write Opportunities
        opportunities = state.get("opportunities", [])
        for opp in opportunities:
            o_id = opp.get("opportunity_id") or f"opp_{uuid.uuid4().hex[:8]}"
            a_id = opp.get("audience_segment_id")
            
            if not a_id or a_id not in audience_ids:
                a_id = a_id or f"seg_{uuid.uuid4().hex[:8]}"
                aud_lbl = opp.get("audience_label") or "Target Audience"
                await self.session.execute(
                    text("INSERT INTO audiences (segment_id, question_id, label) VALUES (:aid, :qid, :lbl) ON CONFLICT (segment_id) DO UPDATE SET label = EXCLUDED.label"),
                    {"aid": a_id, "qid": default_q_id, "lbl": aud_lbl}
                )
                audience_ids.add(a_id)

            sb = json.dumps(opp.get("score_breakdown") or {})
            ev_ids = json.dumps(opp.get("evidence_ids") or [])
            await self.session.execute(
                text("""
                    INSERT INTO opportunities (
                        opportunity_id, investigation_id, segment_id, title, problem, audience_need,
                        content_gap, recommended_angle, recommended_format, score, score_breakdown, evidence_ids, status
                    ) VALUES (
                        :oid, :iid, :aid, :t, :prob, :need,
                        :gap, :angle, :fmt, :s, :sb, :ev_ids, 'suggested'
                    ) ON CONFLICT (opportunity_id) DO UPDATE SET
                        investigation_id = EXCLUDED.investigation_id,
                        title = EXCLUDED.title,
                        problem = EXCLUDED.problem,
                        audience_need = EXCLUDED.audience_need,
                        content_gap = EXCLUDED.content_gap,
                        recommended_angle = EXCLUDED.recommended_angle,
                        recommended_format = EXCLUDED.recommended_format,
                        score = EXCLUDED.score,
                        score_breakdown = EXCLUDED.score_breakdown,
                        evidence_ids = EXCLUDED.evidence_ids
                """),
                {
                    "oid": o_id,
                    "iid": inv_id,
                    "aid": a_id,
                    "t": opp.get("title", "Content Opportunity"),
                    "prob": opp.get("problem", "Underserved audience need"),
                    "need": opp.get("audience_need", "Comprehensive coverage"),
                    "gap": opp.get("content_gap", "Lack of practical, authoritative guide"),
                    "angle": opp.get("recommended_angle", "Direct, actionable insights"),
                    "fmt": opp.get("recommended_format", "Long-form Guide"),
                    "s": float(opp.get("score") or 0.85),
                    "sb": sb,
                    "ev_ids": ev_ids
                }
            )

        # 8. Record in Admin Audit Log
        await self.session.execute(
            text("""
                INSERT INTO admin_audit_logs (actor_user_id, workspace_id, action, resource_type, resource_id, metadata)
                VALUES (:uid, :wid, 'INVESTIGATION_COMPLETED', 'investigation', :iid, :meta)
            """),
            {
                "uid": user_id,
                "wid": workspace_id,
                "iid": inv_id,
                "meta": json.dumps({"topic": topic, "opportunities_generated": len(opportunities), "evidence_count": len(normalized_evidence)})
            }
        )

        await self.session.commit()
