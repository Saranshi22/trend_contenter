import React from 'react';
import type { Opportunity } from '../types';
import {
  IconCheck,
  IconFilePdf
} from '../components/Icons';

interface ContentStudioPageProps {
  opportunities: Opportunity[];
  onSelectBrief: (opp: Opportunity) => void;
  onDownloadPdf: (oppId: string) => void;
}

export const ContentStudioPage: React.FC<ContentStudioPageProps> = ({
  opportunities,
  onSelectBrief,
  onDownloadPdf
}) => {
  const selectedOpps = opportunities.filter(o => o.status === 'selected');

  return (
    <div className="page-container animate-fade-in">
      <div style={{ marginBottom: '28px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Content Studio Handoff Boundary</h1>
          <span className="badge badge-cyan">Phase 5 Integration</span>
        </div>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.92rem', maxWidth: '740px' }}>
          This page represents the agreed architectural hand-off boundary to your teammate's Content Studio workstream.
          Selected intelligence briefs are staged here with stable API contracts for full script generation and multimodal asset creation.
        </p>
      </div>

      {/* Integration Contract Card */}
      <div className="glass-card" style={{ padding: '24px', marginBottom: '28px' }}>
        <h3 style={{ fontSize: '1.15rem', color: 'var(--text-primary)', marginBottom: '10px', fontWeight: 600 }}>
          Stable Opportunity API Contract
        </h3>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', marginBottom: '16px' }}>
          The Content Studio pipeline consumes individual opportunity briefs via:
        </p>
        <div style={{ background: '#FFFFFF', padding: '12px 16px', borderRadius: '8px', fontFamily: 'monospace', fontSize: '0.85rem', color: 'var(--action-primary)', marginBottom: '16px', border: '1px solid var(--border-subtle)', fontWeight: 600, boxShadow: 'var(--shadow-sm)' }}>
          GET http://127.0.0.1:8001/api/v1/opportunities/&#123;opportunity_id&#125;
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px', fontSize: '0.82rem' }}>
          <div className="metric-pill metric-pill-cyan" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            <IconCheck size={12} />
            <span>Opportunity ID &amp; Investigation ID</span>
          </div>
          <div className="metric-pill metric-pill-green" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            <IconCheck size={12} />
            <span>Target Persona &amp; Information Needs</span>
          </div>
          <div className="metric-pill metric-pill-cyan" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            <IconCheck size={12} />
            <span>Recommended Angle &amp; Formats</span>
          </div>
          <div className="metric-pill metric-pill-green" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            <IconCheck size={12} />
            <span>Evidence Citations &amp; Provenance</span>
          </div>
        </div>
      </div>

      {/* Handed-Off Queue List */}
      <div className="glass-card" style={{ padding: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h3 style={{ fontSize: '1.2rem', margin: 0, color: 'var(--text-primary)', fontWeight: 600 }}>
              Staged Opportunities for Generation ({selectedOpps.length})
            </h3>
            <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
              Opportunities marked as 'selected' via <code>POST /opportunities/&#123;id&#125;/select</code>.
            </span>
          </div>
          <span className="badge badge-emerald">Ready for Studio Pipeline</span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {selectedOpps.map((opp) => (
            <div key={opp.opportunity_id} style={{ padding: '18px', background: '#FFFFFF', borderRadius: '10px', border: '1px solid var(--border-subtle)', boxShadow: 'var(--shadow-sm)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '14px' }}>
              <div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '6px' }}>
                  <span className="badge badge-emerald">Selected</span>
                  <span className="badge badge-cyan">{opp.audience_label || 'Target Audience'}</span>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Format: {opp.recommended_format || 'In-Depth Guide'}</span>
                </div>
                <h4 style={{ color: 'var(--text-primary)', fontSize: '1.1rem', marginBottom: '4px', fontWeight: 600 }}>{opp.title}</h4>
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{opp.recommended_angle}</div>
              </div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button 
                  className="btn-outline" 
                  style={{ padding: '8px 16px', fontSize: '0.85rem' }}
                  onClick={() => onSelectBrief(opp)}
                >
                  View Full Brief
                </button>
                <button 
                  className="btn-emerald" 
                  style={{ padding: '8px 16px', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '6px' }}
                  onClick={() => onDownloadPdf(opp.opportunity_id)}
                >
                  <IconFilePdf size={14} />
                  <span>Download PDF</span>
                </button>
              </div>
            </div>
          ))}

          {selectedOpps.length === 0 && (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
              <p>No opportunities staged for Content Studio yet.</p>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                Open any brief in <strong>Audience &amp; Opportunities</strong> and click <strong>"Stage for Content Studio"</strong> to queue it here.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
