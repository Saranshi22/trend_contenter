import React, { useState } from 'react';
import type { Opportunity, AudienceSegment } from '../types';

interface AudienceOpportunitiesPageProps {
  opportunities: Opportunity[];
  audiences: AudienceSegment[];
  onSelectBrief: (opp: Opportunity) => void;
  onDownloadPdf: (oppId: string) => void;
  onRefresh: () => void;
  downloadingId: string | null;
}

export const AudienceOpportunitiesPage: React.FC<AudienceOpportunitiesPageProps> = ({
  opportunities,
  audiences,
  onSelectBrief,
  onDownloadPdf,
  onRefresh,
  downloadingId
}) => {
  const [activeTab, setActiveTab] = useState<'opportunities' | 'audiences'>('opportunities');

  return (
    <div className="page-container animate-fade-in">
      {/* Title */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '2.2rem', marginBottom: '8px' }}>Audience &amp; Opportunities</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '1rem', maxWidth: '720px' }}>
            Evidence-backed audience personas and ranked editorial briefs qualified by unmet demand, search acceleration, and media voids.
          </p>
        </div>
        <button onClick={onRefresh} className="btn-outline" style={{ fontSize: '0.85rem' }}>
          ↻ Refresh Data
        </button>
      </div>

      {/* Tabs */}
      <div className="tab-container" style={{ marginBottom: '28px' }}>
        <button
          className={`tab-btn ${activeTab === 'opportunities' ? 'active' : ''}`}
          onClick={() => setActiveTab('opportunities')}
        >
          💡 Content Opportunities ({opportunities.length})
        </button>
        <button
          className={`tab-btn ${activeTab === 'audiences' ? 'active' : ''}`}
          onClick={() => setActiveTab('audiences')}
        >
          👥 Audience Personas ({audiences.length})
        </button>
      </div>

      {/* TAB 1: Content Opportunities */}
      {activeTab === 'opportunities' && (
        <div className="animate-fade-in">
          <div className="grid-2">
            {opportunities.map((opp) => (
              <div key={opp.opportunity_id} className="glass-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                  <span className="badge badge-cyan">{opp.audience_label || `Audience: ${opp.segment_id}`}</span>
                  <div className="score-display" style={{ '--score': opp.score * 100 } as React.CSSProperties}>
                    <div className="score-inner">{Math.round(opp.score * 100)}</div>
                  </div>
                </div>

                <h4 style={{ fontSize: '1.25rem', marginBottom: '12px', color: '#fff' }}>{opp.title}</h4>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '20px', lineHeight: '1.5' }}>
                  {opp.content_gap || "A verified gap identified from trend evidence and unanswered audience questions."}
                </p>

                {/* Score breakdown tags */}
                {opp.score_breakdown && (
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '16px' }}>
                    {Object.entries(opp.score_breakdown).slice(0, 3).map(([k, v]) => (
                      <span key={k} className="metric-pill metric-pill-cyan" style={{ fontSize: '0.75rem', textTransform: 'capitalize' }}>
                        {k.replace(/_/g, ' ')}: {Math.round((v as number) * 100)}%
                      </span>
                    ))}
                  </div>
                )}

                {/* Action Row */}
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button 
                    className="btn-primary" 
                    style={{ flex: 1, background: 'rgba(255,255,255,0.06)', color: 'var(--accent-cyan)', border: '1px solid var(--border-light)', boxShadow: 'none', padding: '10px 14px', fontSize: '0.9rem' }}
                    onClick={() => onSelectBrief(opp)}
                  >
                    View Brief
                  </button>
                  <button 
                    className="btn-emerald" 
                    style={{ padding: '10px 16px', fontSize: '0.9rem' }}
                    onClick={() => onDownloadPdf(opp.opportunity_id)}
                    disabled={downloadingId === opp.opportunity_id}
                    title="Download Executive PDF Brief"
                  >
                    {downloadingId === opp.opportunity_id ? '⏳' : '📄 PDF'}
                  </button>
                </div>
              </div>
            ))}
          </div>

          {opportunities.length === 0 && (
            <div className="glass-card" style={{ textAlign: 'center', padding: '60px' }}>
              <p style={{ color: 'var(--text-muted)' }}>
                No opportunities generated yet. Launch an investigation from the <strong>Trend Radar</strong> page.
              </p>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: Audience Personas */}
      {activeTab === 'audiences' && (
        <div className="animate-fade-in">
          <div className="grid-2">
            {audiences.map((aud) => (
              <div key={aud.segment_id} className="persona-card">
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                    <span className="badge badge-cyan">Audience Persona</span>
                    <span className="badge badge-emerald">
                      {aud.opportunity_count} {aud.opportunity_count === 1 ? 'Opportunity' : 'Opportunities'} Linked
                    </span>
                  </div>

                  <h4 style={{ fontSize: '1.3rem', color: '#fff', marginBottom: '10px' }}>
                    {aud.label}
                  </h4>

                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.92rem', lineHeight: '1.5', marginBottom: '18px' }}>
                    {aud.description || 'Target persona analyzed through trend evidence and search behavior.'}
                  </p>

                  {/* Needs */}
                  {aud.needs && aud.needs.length > 0 && (
                    <div style={{ marginBottom: '16px' }}>
                      <div className="subheading-label">Core Information Needs:</div>
                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                        {aud.needs.map((need, idx) => (
                          <span key={idx} className="metric-pill metric-pill-cyan" style={{ fontSize: '0.78rem' }}>
                            ✓ {need}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Questions */}
                  {aud.questions && aud.questions.length > 0 && (
                    <div style={{ marginBottom: '16px' }}>
                      <div className="subheading-label">Key Questions They Ask:</div>
                      {aud.questions.slice(0, 3).map((q, idx) => (
                        <div key={idx} className="question-quote">
                          "{q}"
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Concerns */}
                  {aud.concerns && aud.concerns.length > 0 && (
                    <div style={{ marginBottom: '18px' }}>
                      <div className="subheading-label">Friction Points &amp; Concerns:</div>
                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                        {aud.concerns.map((c, idx) => (
                          <span key={idx} className="metric-pill metric-pill-amber" style={{ fontSize: '0.78rem' }}>
                            ⚠ {c}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '16px', marginTop: '12px' }}>
                  <button 
                    className="btn-outline" 
                    style={{ width: '100%', borderColor: 'rgba(6, 182, 212, 0.3)', color: 'var(--accent-cyan)' }}
                    onClick={() => setActiveTab('opportunities')}
                  >
                    View Linked Opportunities →
                  </button>
                </div>
              </div>
            ))}
          </div>

          {audiences.length === 0 && (
            <div className="glass-card" style={{ textAlign: 'center', padding: '60px' }}>
              <p style={{ color: 'var(--text-muted)' }}>
                No audience personas discovered yet. Launch an investigation from <strong>Trend Radar</strong>.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
