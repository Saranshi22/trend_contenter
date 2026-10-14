import React from 'react';
import type { Opportunity } from '../types';

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
          <h1 style={{ fontSize: '2.2rem', margin: 0 }}>Content Studio Handoff Boundary</h1>
          <span className="badge badge-cyan">Phase 5 Integration</span>
        </div>
        <p style={{ color: 'var(--text-secondary)', fontSize: '1rem', maxWidth: '740px' }}>
          This page represents the agreed architectural hand-off boundary to your teammate's Content Studio workstream.
          Selected intelligence briefs are staged here with stable API contracts for full script generation and multimodal asset creation.
        </p>
      </div>

      {/* Integration Contract Card */}
      <div className="glass-card" style={{ padding: '24px', marginBottom: '32px' }}>
        <h3 style={{ fontSize: '1.2rem', color: '#fff', marginBottom: '12px' }}>
          Stable Opportunity API Contract
        </h3>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '16px' }}>
          The Content Studio pipeline consumes individual opportunity briefs via:
        </p>
        <div style={{ background: '#0a0e17', padding: '14px', borderRadius: '10px', fontFamily: 'monospace', fontSize: '0.85rem', color: 'var(--accent-cyan)', marginBottom: '16px', border: '1px solid var(--border-glass)' }}>
          GET http://127.0.0.1:8001/api/v1/opportunities/&#123;opportunity_id&#125;
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px', fontSize: '0.85rem' }}>
          <div className="metric-pill metric-pill-cyan">✓ Opportunity ID &amp; Investigation ID</div>
          <div className="metric-pill metric-pill-green">✓ Target Persona &amp; Information Needs</div>
          <div className="metric-pill metric-pill-cyan">✓ Recommended Angle &amp; Formats</div>
          <div className="metric-pill metric-pill-green">✓ Evidence Citations &amp; Provenance</div>
        </div>
      </div>

      {/* Handed-Off Queue List */}
      <div className="glass-card" style={{ padding: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <div>
            <h3 style={{ fontSize: '1.25rem', margin: 0 }}>Staged Opportunities for Generation ({selectedOpps.length})</h3>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              Opportunities marked as 'selected' via <code>POST /opportunities/&#123;id&#125;/select</code>.
            </span>
          </div>
          <span className="badge badge-emerald">Ready for Studio Pipeline</span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {selectedOpps.map((opp) => (
            <div key={opp.opportunity_id} style={{ padding: '18px', background: 'rgba(255,255,255,0.03)', borderRadius: '12px', border: '1px solid var(--border-glass)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '14px' }}>
              <div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '6px' }}>
                  <span className="badge badge-emerald">Selected</span>
                  <span className="badge badge-cyan">{opp.audience_label || 'Target Audience'}</span>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Format: {opp.recommended_format || 'In-Depth Guide'}</span>
                </div>
                <h4 style={{ color: '#fff', fontSize: '1.1rem', marginBottom: '4px' }}>{opp.title}</h4>
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{opp.recommended_angle}</div>
              </div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button 
                  className="btn-primary" 
                  style={{ padding: '8px 16px', fontSize: '0.85rem', background: 'rgba(255,255,255,0.06)', color: 'var(--accent-cyan)', border: '1px solid var(--border-light)', boxShadow: 'none' }}
                  onClick={() => onSelectBrief(opp)}
                >
                  View Full Brief
                </button>
                <button 
                  className="btn-emerald" 
                  style={{ padding: '8px 16px', fontSize: '0.85rem' }}
                  onClick={() => onDownloadPdf(opp.opportunity_id)}
                >
                  📄 Download PDF
                </button>
              </div>
            </div>
          ))}

          {selectedOpps.length === 0 && (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
              <p>No opportunities staged for Content Studio yet.</p>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                Open any brief in <strong>Audience &amp; Opportunities</strong> and click <strong>"🚀 Hand off to Content Generation (Phase 5)"</strong> to queue it here.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
