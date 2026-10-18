from io import BytesIO
from datetime import datetime
from typing import Dict, Any, List, Optional
import json

from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.platypus import (
    SimpleDocTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
    KeepTogether,
    HRFlowable
)
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT, TA_JUSTIFY

# Clean, professional color palette (Strictly NO PURPLE)
COLOR_PRIMARY_DARK = colors.HexColor("#0f172a")    # Deep slate
COLOR_ACCENT_BLUE = colors.HexColor("#0284c7")     # Ocean / Cyan blue
COLOR_ACCENT_EMERALD = colors.HexColor("#059669")  # Emerald green
COLOR_TEXT_MAIN = colors.HexColor("#1e293b")       # Dark charcoal
COLOR_TEXT_MUTED = colors.HexColor("#64748b")      # Slate gray
COLOR_BG_LIGHT = colors.HexColor("#f8fafc")        # Card background
COLOR_BG_CYAN = colors.HexColor("#f0f9ff")         # Soft blue tint
COLOR_BG_EMERALD = colors.HexColor("#ecfdf5")      # Soft emerald tint
COLOR_BORDER = colors.HexColor("#e2e8f0")          # Divider border


def _draw_page_decorations(canvas, doc):
    """Draws top and bottom subtle branding borders and page numbers."""
    canvas.saveState()
    
    # Top decorative hairline
    canvas.setStrokeColor(COLOR_ACCENT_BLUE)
    canvas.setLineWidth(3)
    canvas.line(36, letter[1] - 18, letter[0] - 36, letter[1] - 18)
    
    # Bottom footer line
    canvas.setStrokeColor(COLOR_BORDER)
    canvas.setLineWidth(0.75)
    canvas.line(36, 40, letter[0] - 36, 40)
    
    # Bottom footer text
    canvas.setFont("Helvetica", 8)
    canvas.setFillColor(COLOR_TEXT_MUTED)
    canvas.drawString(
        36, 26, 
        "TREND CONTENTER  •  Autonomous Trend & Audience Intelligence Platform  •  Confidential Brief"
    )
    canvas.drawRightString(letter[0] - 36, 26, f"Page {canvas.getPageNumber()}")
    
    canvas.restoreState()


class PDFService:
    @staticmethod
    def generate_opportunity_brief(data: Dict[str, Any]) -> bytes:
        """
        Generates an executive-ready PDF brief for a specific content opportunity.
        Returns the PDF binary content as bytes.
        """
        buffer = BytesIO()
        
        # 0.5 inch margins (36 pt) for modern executive layout
        doc = SimpleDocTemplate(
            buffer,
            pagesize=letter,
            leftMargin=36,
            rightMargin=36,
            topMargin=36,
            bottomMargin=50
        )
        
        base_styles = getSampleStyleSheet()
        
        # Custom Typography Styles
        style_header_brand = ParagraphStyle(
            "BrandHeader",
            parent=base_styles["Normal"],
            fontName="Helvetica-Bold",
            fontSize=10,
            leading=13,
            textColor=COLOR_ACCENT_BLUE,
            alignment=TA_LEFT,
            spaceAfter=2
        )
        
        style_header_sub = ParagraphStyle(
            "BrandHeaderSub",
            parent=base_styles["Normal"],
            fontName="Helvetica",
            fontSize=8,
            leading=10,
            textColor=COLOR_TEXT_MUTED,
            alignment=TA_LEFT
        )
        
        style_title = ParagraphStyle(
            "OpportunityTitle",
            parent=base_styles["Heading1"],
            fontName="Helvetica-Bold",
            fontSize=19,
            leading=23,
            textColor=COLOR_PRIMARY_DARK,
            alignment=TA_LEFT,
            spaceAfter=6
        )
        
        style_section_heading = ParagraphStyle(
            "SectionHeading",
            parent=base_styles["Heading2"],
            fontName="Helvetica-Bold",
            fontSize=11,
            leading=14,
            textColor=COLOR_ACCENT_BLUE,
            textTransform="uppercase",
            spaceBefore=10,
            spaceAfter=4
        )
        
        style_body = ParagraphStyle(
            "CustomBody",
            parent=base_styles["Normal"],
            fontName="Helvetica",
            fontSize=9.5,
            leading=13.5,
            textColor=COLOR_TEXT_MAIN,
            alignment=TA_LEFT,
            spaceAfter=4
        )
        
        style_body_bold = ParagraphStyle(
            "CustomBodyBold",
            parent=base_styles["Normal"],
            fontName="Helvetica-Bold",
            fontSize=9.5,
            leading=13.5,
            textColor=COLOR_PRIMARY_DARK,
            alignment=TA_LEFT
        )

        style_bullet = ParagraphStyle(
            "CustomBullet",
            parent=base_styles["Normal"],
            fontName="Helvetica",
            fontSize=9,
            leading=12.5,
            textColor=COLOR_TEXT_MAIN,
            leftIndent=14,
            spaceAfter=3
        )
        
        style_callout_label = ParagraphStyle(
            "CalloutLabel",
            parent=base_styles["Normal"],
            fontName="Helvetica-Bold",
            fontSize=8,
            leading=10,
            textColor=COLOR_TEXT_MUTED,
            textTransform="uppercase"
        )
        
        style_callout_val = ParagraphStyle(
            "CalloutVal",
            parent=base_styles["Normal"],
            fontName="Helvetica-Bold",
            fontSize=10,
            leading=13,
            textColor=COLOR_PRIMARY_DARK
        )

        story = []
        
        from datetime import timezone
        now_str = datetime.now(timezone.utc).strftime("%B %d, %Y • %H:%M UTC")
        header_table = Table(
            [
                [
                    Paragraph("<b>TREND CONTENTER</b> &nbsp;|&nbsp; CONTENT INTELLIGENCE", style_header_brand),
                    Paragraph(f"<b>DATE:</b> {now_str}", style_header_sub)
                ],
                [
                    Paragraph("EXECUTIVE OPPORTUNITY DOSSIER", style_header_sub),
                    Paragraph(f"<b>BRIEF ID:</b> {data.get('opportunity_id', 'OPP-UNK')}", style_header_sub)
                ]
            ],
            colWidths=[380, 160]
        )
        header_table.setStyle(TableStyle([
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
            ('ALIGN', (1, 0), (1, -1), 'RIGHT'),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 1),
            ('TOPPADDING', (0, 0), (-1, -1), 0),
        ]))
        story.append(header_table)
        story.append(Spacer(1, 12))
        
        # 2. Main Title & Key Metric Banner
        score_val = data.get("score", 0.0)
        score_pct = int(score_val * 100) if score_val <= 1.0 else int(score_val)
        
        story.append(Paragraph(data.get("title", "Untitled Content Opportunity"), style_title))
        
        # Metadata Badges (Target Audience, Format, Angle, Opportunity Score)
        meta_boxes = [
            [
                Paragraph("TARGET AUDIENCE", style_callout_label),
                Paragraph("RECOMMENDED FORMAT", style_callout_label),
                Paragraph("EDITORIAL ANGLE", style_callout_label),
                Paragraph("OPPORTUNITY SCORE", style_callout_label)
            ],
            [
                Paragraph(f"<b>{data.get('audience_label') or 'General Audience'}</b>", style_callout_val),
                Paragraph(f"<b>{data.get('recommended_format') or 'In-Depth Guide'}</b>", style_callout_val),
                Paragraph(f"{data.get('recommended_angle') or 'Authoritative & Actionable'}", style_body),
                Paragraph(f"<font color='#059669'><b>{score_pct} / 100</b></font>", ParagraphStyle(
                    "ScoreLarge",
                    parent=style_callout_val,
                    fontSize=13,
                    leading=15,
                    textColor=COLOR_ACCENT_EMERALD
                ))
            ]
        ]
        meta_table = Table(meta_boxes, colWidths=[150, 120, 190, 80])
        meta_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, -1), COLOR_BG_LIGHT),
            ('BOX', (0, 0), (-1, -1), 1, COLOR_BORDER),
            ('INNERGRID', (0, 0), (-1, -1), 0.5, COLOR_BORDER),
            ('TOPPADDING', (0, 0), (-1, -1), 6),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
            ('LEFTPADDING', (0, 0), (-1, -1), 8),
            ('RIGHTPADDING', (0, 0), (-1, -1), 8),
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ]))
        story.append(meta_table)
        story.append(Spacer(1, 14))

        # 3. Score Breakdown Matrix
        sb = data.get("score_breakdown") or {}
        if isinstance(sb, str):
            try:
                sb = json.loads(sb)
            except Exception:
                sb = {}
        
        if sb:
            sb_items = [
                ("Search Velocity", sb.get("demand_volume") or sb.get("trend_momentum")),
                ("Content Gap Void", sb.get("competition_gap") or sb.get("content_gap")),
                ("Audience Urgency", sb.get("audience_fit") or sb.get("audience_demand")),
                ("Timing & Freshness", sb.get("freshness")),
                ("Corroboration", sb.get("corroboration"))
            ]
            valid_sb = [(k, v) for k, v in sb_items if v is not None]
            if valid_sb:
                story.append(Paragraph("OPPORTUNITY QUALIFICATION METRICS", style_section_heading))
                sb_headers = [Paragraph(f"<b>{k}</b>", style_callout_label) for k, _ in valid_sb]
                sb_scores = []
                for _, v in valid_sb:
                    pct = int(v * 100) if v <= 1.0 else int(v)
                    sb_scores.append(Paragraph(f"<b>{pct}%</b>", style_body_bold))
                
                col_w = 540 / len(valid_sb)
                sb_table = Table([sb_headers, sb_scores], colWidths=[col_w] * len(valid_sb))
                sb_table.setStyle(TableStyle([
                    ('BACKGROUND', (0, 0), (-1, -1), COLOR_BG_CYAN),
                    ('BOX', (0, 0), (-1, -1), 1, colors.HexColor("#bae6fd")),
                    ('INNERGRID', (0, 0), (-1, -1), 0.5, colors.HexColor("#e0f2fe")),
                    ('TOPPADDING', (0, 0), (-1, -1), 5),
                    ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
                    ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
                ]))
                story.append(sb_table)
                story.append(Spacer(1, 10))

        # 4. Strategic Rationale & Market Context
        strat_rationale = data.get("strategic_rationale")
        if strat_rationale:
            story.append(Paragraph("STRATEGIC CONTEXT & MARKET CATALYST", style_section_heading))
            story.append(Paragraph(strat_rationale, style_body))
            story.append(Spacer(1, 8))

        # 5. Strategic Problem & Content Gap Analysis
        story.append(Paragraph("STRATEGIC GAP & MARKET OPPORTUNITY", style_section_heading))
        strat_rows = [
            [
                Paragraph("<b>The Core Problem:</b>", style_body_bold),
                Paragraph(data.get("problem") or "Audience is actively searching but facing ambiguous information.", style_body)
            ],
            [
                Paragraph("<b>Audience Information Need:</b>", style_body_bold),
                Paragraph(data.get("audience_need") or "High demand for actionable, verified steps and guidance.", style_body)
            ],
            [
                Paragraph("<b>Content Gap in Current Media:</b>", style_body_bold),
                Paragraph(data.get("content_gap") or "Absence of a consolidated, comprehensive explainer addressing real questions.", style_body)
            ]
        ]
        strat_table = Table(strat_rows, colWidths=[160, 380])
        strat_table.setStyle(TableStyle([
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
            ('TOPPADDING', (0, 0), (-1, -1), 5),
            ('LINEBELOW', (0, 0), (-1, -1), 0.5, COLOR_BORDER),
        ]))
        story.append(strat_table)
        story.append(Spacer(1, 10))

        # Helper to parse lists/dicts safely
        def _parse_list(val: Any) -> List[Any]:
            if isinstance(val, str):
                try:
                    val = json.loads(val)
                except Exception:
                    val = [val]
            if isinstance(val, list):
                return val
            return []

        # 6. Key Strategic Talking Points & Narrative Pillars
        talking_points = _parse_list(data.get("key_talking_points"))
        if talking_points:
            story.append(Paragraph("KEY EDITORIAL TALKING POINTS & PILLARS", style_section_heading))
            tp_blocks = []
            for tp in talking_points:
                tp_blocks.append(Paragraph(f"• <b>{tp}</b>", style_bullet))
            story.append(KeepTogether(tp_blocks))
            story.append(Spacer(1, 8))

        # 7. Target Audience Profile & Friction
        story.append(Paragraph("TARGET AUDIENCE PROFILE & BEHAVIOR", style_section_heading))
        aud_label = data.get("audience_label") or "Identified Audience Segment"
        aud_desc = data.get("audience_description") or "Target persona identified through contextual search volume and civic interest."
        story.append(Paragraph(f"<b>Segment:</b> {aud_label}", style_body_bold))
        if aud_desc:
            story.append(Paragraph(f"<i>{aud_desc}</i>", style_body))
        story.append(Spacer(1, 4))

        needs_list = [str(x) for x in _parse_list(data.get("audience_needs") or data.get("needs")) if str(x).strip()]
        questions_list = [str(x) for x in _parse_list(data.get("audience_questions") or data.get("questions")) if str(x).strip()]
        concerns_list = [str(x) for x in _parse_list(data.get("target_audience_pain_points") or data.get("audience_concerns") or data.get("concerns")) if str(x).strip()]

        aud_blocks = []
        if needs_list:
            aud_blocks.append(Paragraph("<b>Primary Needs & Desires:</b>", style_body_bold))
            for item in needs_list[:4]:
                aud_blocks.append(Paragraph(f"• {item}", style_bullet))
            aud_blocks.append(Spacer(1, 3))
            
        if questions_list:
            aud_blocks.append(Paragraph("<b>Top Questions Being Asked:</b>", style_body_bold))
            for item in questions_list[:4]:
                aud_blocks.append(Paragraph(f"• <i>\"{item}\"</i>", style_bullet))
            aud_blocks.append(Spacer(1, 3))
            
        if concerns_list:
            aud_blocks.append(Paragraph("<b>Key Friction Points & User Hesitations:</b>", style_body_bold))
            for item in concerns_list[:4]:
                aud_blocks.append(Paragraph(f"• {item}", style_bullet))
            aud_blocks.append(Spacer(1, 3))

        if aud_blocks:
            story.append(KeepTogether(aud_blocks))
        story.append(Spacer(1, 10))

        # 8. Recommended Content Outline
        outline = _parse_list(data.get("recommended_outline"))
        if outline:
            story.append(Paragraph("RECOMMENDED CONTENT OUTLINE & STRUCTURE", style_section_heading))
            outline_rows = [
                [
                    Paragraph("<b>SECTION</b>", style_callout_label),
                    Paragraph("<b>CORE TAKEAWAY & MESSAGE</b>", style_callout_label),
                    Paragraph("<b>SUGGESTED VISUAL / ASSET</b>", style_callout_label)
                ]
            ]
            for sec in outline:
                if isinstance(sec, dict):
                    title_sec = sec.get("section_title") or "Section"
                    takeaway = sec.get("key_takeaway") or ""
                    visual = sec.get("suggested_visual_or_element") or "Explainer Graphic"
                    outline_rows.append([
                        Paragraph(f"<b>{title_sec}</b>", style_body_bold),
                        Paragraph(takeaway, style_body),
                        Paragraph(f"<i>{visual}</i>", ParagraphStyle("VisualNote", parent=style_body, fontSize=8.5, textColor=COLOR_ACCENT_BLUE))
                    ])
            if len(outline_rows) > 1:
                outline_table = Table(outline_rows, colWidths=[140, 260, 140])
                outline_table.setStyle(TableStyle([
                    ('BACKGROUND', (0, 0), (-1, 0), COLOR_BG_LIGHT),
                    ('LINEBELOW', (0, 0), (-1, -1), 0.5, COLOR_BORDER),
                    ('TOPPADDING', (0, 0), (-1, -1), 5),
                    ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
                    ('VALIGN', (0, 0), (-1, -1), 'TOP'),
                ]))
                story.append(KeepTogether([outline_table]))
                story.append(Spacer(1, 10))

        # 9. Hook Options
        hooks = _parse_list(data.get("hook_options"))
        if hooks:
            story.append(Paragraph("SCROLL-STOPPING HOOK OPTIONS", style_section_heading))
            hook_rows = [
                [
                    Paragraph("<b>HOOK TYPE</b>", style_callout_label),
                    Paragraph("<b>HEADLINE / OPENING HOOK</b>", style_callout_label),
                    Paragraph("<b>STRATEGIC RATIONALE</b>", style_callout_label)
                ]
            ]
            for h in hooks:
                if isinstance(h, dict):
                    htype = h.get("hook_type") or "Editorial Hook"
                    headline = h.get("headline") or ""
                    rationale = h.get("rationale") or ""
                    hook_rows.append([
                        Paragraph(f"<b>{htype}</b>", style_body_bold),
                        Paragraph(f"<i>\"{headline}\"</i>", ParagraphStyle("HookText", parent=style_body, fontName="Helvetica-Bold", textColor=COLOR_PRIMARY_DARK)),
                        Paragraph(rationale, style_body)
                    ])
            if len(hook_rows) > 1:
                hook_table = Table(hook_rows, colWidths=[130, 240, 170])
                hook_table.setStyle(TableStyle([
                    ('BACKGROUND', (0, 0), (-1, 0), COLOR_BG_CYAN),
                    ('LINEBELOW', (0, 0), (-1, -1), 0.5, COLOR_BORDER),
                    ('TOPPADDING', (0, 0), (-1, -1), 5),
                    ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
                    ('VALIGN', (0, 0), (-1, -1), 'TOP'),
                ]))
                story.append(KeepTogether([hook_table]))
                story.append(Spacer(1, 10))

        # 10. Editorial Action Plan & Studio Handoff
        action_box = [
            [
                Paragraph("<b>ACTIONABLE PRODUCTION BLUEPRINT</b>", style_callout_label)
            ],
            [
                Paragraph(
                    f"<b>1. Framing Hook:</b> Frame around solving the exact friction: <i>\"{data.get('problem', '')}\"</i>.<br/>"
                    f"<b>2. Content Structure:</b> Address all top audience questions directly with verifiable evidence.<br/>"
                    f"<b>3. Distribution Formats:</b> Prioritize <b>{data.get('recommended_format', 'Long-form guide')}</b> "
                    f"supplemented by modular infographic cards for social distribution.<br/>"
                    f"<b>4. Staged for Content Studio:</b> When loaded into Content Studio, this brief auto-generates high-converting multi-platform concepts, scripts, and visuals.",
                    style_body
                )
            ]
        ]
        action_table = Table(action_box, colWidths=[540])
        action_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, -1), COLOR_BG_EMERALD),
            ('BOX', (0, 0), (-1, -1), 1, colors.HexColor("#a7f3d0")),
            ('TOPPADDING', (0, 0), (-1, -1), 8),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
            ('LEFTPADDING', (0, 0), (-1, -1), 12),
            ('RIGHTPADDING', (0, 0), (-1, -1), 12),
        ]))
        story.append(KeepTogether([action_table]))
        
        # Build document with custom canvas page decorations
        doc.build(story, onFirstPage=_draw_page_decorations, onLaterPages=_draw_page_decorations)
        
        return buffer.getvalue()

