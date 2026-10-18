import React, { useState } from 'react';
import type { Opportunity, AudienceSegment } from '../types';
import {
  IconOpportunities,
  IconUsers,
  IconRefresh,
  IconFilePdf,
  IconCheck,
  IconAlertTriangle,
  IconArrowRight
} from '../components/Icons';

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
          <h1 style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '6px' }}>
            Audience &amp; Opportunities
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.92rem', maxWidth: '720px', margin: 0 }}>
            Evidence-backed audience personas and ranked editorial briefs qualified by unmet demand, search acceleration, and media voids.
          </p>
        </div>
        <button 
          onClick={onRefresh} 
          className="btn-outline" 
          style={{ fontSize: '0.875rem', padding: '9px 16px', display: 'flex', alignItems: 'center', gap: '6px' }}
        >
          <IconRefresh size={14} />
          <span>Refresh Data</span>
        </button>
      </div>

      {/* Tabs */}
      <div className="tab-container" style={{ marginBottom: '28px' }}>
        <button
          className={`tab-btn ${activeTab === 'opportunities' ? 'active' : ''}`}
          onClick={() => setActiveTab('opportunities')}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
        >
          <IconOpportunities size={15} />
          <span>Content Opportunities ({opportunities.length})</span>
        </button>
        <button
          className={`tab-btn ${activeTab === 'audiences' ? 'active' : ''}`}
          onClick={() => setActiveTab('audiences')}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
        >
          <IconUsers size={15} />
          <span>Audience Personas ({audiences.length})</span>
        </button>
      </div>

      {/* TAB 1: Content Opportunities */}
      {activeTab === 'opportunities' && (
        <div className="animate-fade-in">
          <div className="grid-2">
            {opportunities.map((opp) => (
              <div key={opp.opportunity_id} className="glass-card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px', marginBottom: '16px', minWidth: 0 }}>
                    <span 
                      className="badge badge-cyan"
                      style={{ 
                        maxWidth: 'calc(100% - 70px)', 
                        overflow: 'hidden', 
                        textOverflow: 'ellipsis', 
                        whiteSpace: 'nowrap',
                        display: 'inline-block' 
                      }}
                      title={opp.audience_label || `Audience: ${opp.segment_id}`}
                    >
                      {opp.audience_label || `Audience: ${opp.segment_id}`}
                    </span>
                    <div className="score-display" style={{ '--score': opp.score * 100, flexShrink: 0 } as React.CSSProperties}>
                      <div className="score-inner">{Math.round(opp.score * 100)}</div>
                    </div>
                  </div>

                  <h4 style={{ fontSize: '1.25rem', marginBottom: '12px', color: 'var(--text-primary)', fontWeight: 600 }}>{opp.title}</h4>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '20px', lineHeight: '1.5' }}>
                    {opp.content_gap || "A verified gap identified from trend evidence and unanswered audience questions."}
                  </p>

                  {/* Score breakdown tags */}
                  {opp.score_breakdown && (
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '20px' }}>
                      {Object.entries(opp.score_breakdown).slice(0, 3).map(([k, v]) => (
                        <span key={k} className="metric-pill metric-pill-cyan" style={{ fontSize: '0.75rem', textTransform: 'capitalize' }}>
                          {k.replace(/_/g, ' ')}: {Math.round((v as number) * 100)}%
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Action Row */}
                <div style={{ display: 'flex', gap: '10px', paddingTop: '16px', borderTop: '1px solid var(--border-subtle)' }}>
                  <button 
                    className="btn-outline" 
                    style={{ flex: 1, padding: '10px 14px', fontSize: '0.9rem' }}
                    onClick={() => onSelectBrief(opp)}
                  >
                    View Brief
                  </button>
                  <button 
                    className="btn-emerald" 
                    style={{ padding: '10px 16px', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '6px' }}
                    onClick={() => onDownloadPdf(opp.opportunity_id)}
                    disabled={downloadingId === opp.opportunity_id}
                    title="Download Executive PDF Brief"
                  >
                    <IconFilePdf size={14} />
                    <span>{downloadingId === opp.opportunity_id ? 'Downloading...' : 'PDF'}</span>
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
              <div key={aud.segment_id} className="persona-card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                    <span className="badge badge-cyan">Audience Persona</span>
                    <span className="badge badge-emerald">
                      {aud.opportunity_count} {aud.opportunity_count === 1 ? 'Opportunity' : 'Opportunities'} Linked
                    </span>
                  </div>

                  <h4 style={{ fontSize: '1.3rem', color: 'var(--text-primary)', marginBottom: '10px', fontWeight: 600 }}>
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
                          <span key={idx} className="metric-pill metric-pill-cyan" style={{ fontSize: '0.78rem', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                            <IconCheck size={11} />
                            <span>{need}</span>
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
                          <span key={idx} className="metric-pill metric-pill-amber" style={{ fontSize: '0.78rem', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                            <IconAlertTriangle size={11} />
                            <span>{c}</span>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '16px', marginTop: '16px' }}>
                  <button 
                    className="btn-outline" 
                    style={{ width: '100%', color: 'var(--action-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                    onClick={() => setActiveTab('opportunities')}
                  >
                    <span>View Linked Opportunities</span>
                    <IconArrowRight size={13} />
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
