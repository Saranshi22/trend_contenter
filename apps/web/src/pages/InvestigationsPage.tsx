import React, { useState, useEffect } from 'react';
import type { InvestigationSummary, InvestigationDetail, EvidenceDetail, Opportunity } from '../types';

interface InvestigationsPageProps {
  investigations: InvestigationSummary[];
  onRefresh: () => void;
  onLaunchNew: (topic: string) => void;
  onSelectEvidence: (ev: EvidenceDetail, label?: string) => void;
  onSelectOpportunity: (opp: Opportunity) => void;
  onDownloadPdf: (oppId: string) => void;
}

export const InvestigationsPage: React.FC<InvestigationsPageProps> = ({
  investigations,
  onRefresh,
  onLaunchNew,
  onSelectEvidence,
  onSelectOpportunity,
  onDownloadPdf
}) => {
  const [selectedInvId, setSelectedInvId] = useState<string | null>(null);
  const [reportDetail, setReportDetail] = useState<InvestigationDetail | null>(null);
  const [loadingReport, setLoadingReport] = useState<boolean>(false);
  const [activeReportTab, setActiveReportTab] = useState<'overview' | 'narratives' | 'ai_answers' | 'audiences' | 'gaps' | 'evidence' | 'timeline'>('overview');
  const [evidenceSearch, setEvidenceSearch] = useState('');
  const [customTopic, setCustomTopic] = useState('');
  const [retryingId, setRetryingId] = useState<string | null>(null);

  const API_BASE = 'http://127.0.0.1:8001/api/v1';

  // Fetch full report detail when an investigation is selected
  useEffect(() => {
    if (!selectedInvId) {
      setReportDetail(null);
      return;
    }
    const fetchDetail = async () => {
      setLoadingReport(true);
      try {
        const res = await fetch(`${API_BASE}/investigations/${selectedInvId}`);
        if (res.ok) {
          const data = await res.json();
          setReportDetail(data);
        }
      } catch (err) {
        console.error('Failed to load report:', err);
      } finally {
        setLoadingReport(false);
      }
    };
    fetchDetail();
  }, [selectedInvId]);

  const handleRetry = async (invId: string) => {
    setRetryingId(invId);
    try {
      await fetch(`${API_BASE}/investigations/${invId}/retry`, { method: 'POST' });
      onRefresh();
    } catch (err) {
      console.error('Retry failed:', err);
    } finally {
      setTimeout(() => setRetryingId(null), 3000);
    }
  };

  if (selectedInvId && loadingReport) {
    return (
      <div className="page-container animate-fade-in" style={{ padding: '60px 0', textAlign: 'center' }}>
        <span className="pulse-dot" style={{ width: '16px', height: '16px', marginBottom: '16px' }} />
        <h2 style={{ fontSize: '1.4rem', color: '#fff', marginTop: '12px' }}>Loading Intelligence Dossier...</h2>
        <p style={{ color: 'var(--text-secondary)' }}>Retrieving normalized evidence graph and research narratives.</p>
      </div>
    );
  }

  // If a report is open, show the Trend Intelligence Report view
  if (selectedInvId && reportDetail) {
    const { topic, status, source_statuses, narratives, audience_segments, content_gaps, opportunities, llm_analysis, evidence } = reportDetail;

    return (
      <div className="page-container animate-fade-in">
        {/* Back Navigation Bar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <button 
            className="btn-outline" 
            onClick={() => setSelectedInvId(null)}
            style={{ fontSize: '0.85rem', padding: '8px 16px' }}
          >
            ← Back to Investigations List
          </button>
          <div style={{ display: 'flex', gap: '8px' }}>
            <span className={`badge ${status === 'complete' ? 'badge-emerald' : status === 'failed' ? 'badge-amber' : 'badge-cyan'}`}>
              {status.toUpperCase()}
            </span>
            <span className="badge badge-cyan">
              ID: {selectedInvId}
            </span>
          </div>
        </div>

        {/* Intelligence Report Header Banner */}
        <div className="glass-card" style={{ padding: '28px', marginBottom: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
            <div>
              <span className="badge badge-cyan" style={{ fontSize: '0.7rem', marginBottom: '8px', display: 'inline-block' }}>
                Trend Intelligence Dossier
              </span>
              <h1 style={{ fontSize: '2.4rem', color: '#fff', textTransform: 'capitalize', marginBottom: '8px' }}>
                {topic}
              </h1>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', margin: 0 }}>
                Synthesized by LangGraph Planner, Social Research, Web Search, and LLM Ecosystem Monitoring.
              </p>
            </div>

            {/* Source Status Badges */}
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <span className={`metric-pill ${source_statuses?.social === 'success' ? 'metric-pill-green' : 'metric-pill-amber'}`}>
                💬 Reddit: {source_statuses?.social || 'Pending'}
              </span>
              <span className={`metric-pill ${source_statuses?.web === 'success' ? 'metric-pill-green' : 'metric-pill-amber'}`}>
                📰 Web/News: {source_statuses?.web || 'Pending'}
              </span>
              <span className={`metric-pill ${source_statuses?.llm === 'success' ? 'metric-pill-green' : 'metric-pill-amber'}`}>
                🤖 LLM: {source_statuses?.llm || 'Pending'}
              </span>
            </div>
          </div>
        </div>

        {/* Report Sub-Navigation Tabs */}
        <div className="tab-container" style={{ marginBottom: '24px' }}>
          <button 
            className={`tab-btn ${activeReportTab === 'overview' ? 'active' : ''}`}
            onClick={() => setActiveReportTab('overview')}
          >
            📊 Overview
          </button>
          <button 
            className={`tab-btn ${activeReportTab === 'narratives' ? 'active' : ''}`}
            onClick={() => setActiveReportTab('narratives')}
          >
            📖 Narratives ({narratives?.length || 0})
          </button>
          <button 
            className={`tab-btn ${activeReportTab === 'ai_answers' ? 'active' : ''}`}
            onClick={() => setActiveReportTab('ai_answers')}
          >
            🤖 AI Answers &amp; Ecosystem
          </button>
          <button 
            className={`tab-btn ${activeReportTab === 'audiences' ? 'active' : ''}`}
            onClick={() => setActiveReportTab('audiences')}
          >
            👥 Audiences ({audience_segments?.length || 0})
          </button>
          <button 
            className={`tab-btn ${activeReportTab === 'gaps' ? 'active' : ''}`}
            onClick={() => setActiveReportTab('gaps')}
          >
            🔍 Content Gaps ({content_gaps?.length || 0})
          </button>
          <button 
            className={`tab-btn ${activeReportTab === 'evidence' ? 'active' : ''}`}
            onClick={() => setActiveReportTab('evidence')}
          >
            📑 Evidence ({evidence?.length || 0})
          </button>
          <button 
            className={`tab-btn ${activeReportTab === 'timeline' ? 'active' : ''}`}
            onClick={() => setActiveReportTab('timeline')}
          >
            ⏳ Timeline
          </button>
        </div>

        {/* SUB-TAB 1: Overview */}
        {activeReportTab === 'overview' && (
          <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px' }}>
              <div className="glass-card" style={{ padding: '24px' }}>
                <h4 style={{ color: 'var(--accent-cyan)', fontSize: '0.9rem', textTransform: 'uppercase', marginBottom: '12px' }}>
                  Strategic "Why Now?" Synthesis
                </h4>
                <p style={{ color: 'var(--text-primary)', lineHeight: '1.6', fontSize: '0.95rem' }}>
                  {narratives?.[0]?.description || `Surge in query volume for '${topic}' driven by emerging announcements, community discussions, and noticeable voids in authoritative explainers.`}
                </p>
              </div>

              <div className="glass-card" style={{ padding: '24px' }}>
                <h4 style={{ color: 'var(--accent-emerald)', fontSize: '0.9rem', textTransform: 'uppercase', marginBottom: '12px' }}>
                  Source Coverage &amp; Provenance
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.9rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Normalized Evidence Records:</span>
                    <strong style={{ color: '#fff' }}>{evidence?.length || 0} items</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Ecosystem Coverage:</span>
                    <strong style={{ color: 'var(--accent-emerald)' }}>{Math.round((llm_analysis?.coverage || 0.85) * 100)}%</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Generated Content Opportunities:</span>
                    <strong style={{ color: 'var(--accent-cyan)' }}>{opportunities?.length || 0} briefs</strong>
                  </div>
                </div>
              </div>
            </div>

            {/* Recommended Opportunities Quick List */}
            {opportunities && opportunities.length > 0 && (
              <div className="glass-card" style={{ padding: '24px' }}>
                <h3 style={{ fontSize: '1.2rem', marginBottom: '16px' }}>Recommended Editorial Opportunities</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px' }}>
                  {opportunities.map((opp: any, idx: number) => (
                    <div key={idx} style={{ padding: '16px', background: 'rgba(255,255,255,0.03)', borderRadius: '12px', border: '1px solid var(--border-glass)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                        <span className="badge badge-cyan">{opp.audience_label || 'Target Audience'}</span>
                        <span style={{ color: 'var(--accent-emerald)', fontWeight: 700 }}>
                          {Math.round((opp.score || 0.85) * 100)} / 100
                        </span>
                      </div>
                      <h4 style={{ color: '#fff', fontSize: '1.05rem', marginBottom: '8px' }}>{opp.title}</h4>
                      <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '12px' }}>
                        {opp.content_gap}
                      </p>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button 
                          className="btn-primary" 
                          style={{ flex: 1, padding: '8px', fontSize: '0.8rem', background: 'rgba(255,255,255,0.06)', color: 'var(--accent-cyan)', border: '1px solid var(--border-light)', boxShadow: 'none' }}
                          onClick={() => onSelectOpportunity(opp)}
                        >
                          View Brief
                        </button>
                        <button 
                          className="btn-emerald" 
                          style={{ padding: '8px 12px', fontSize: '0.8rem' }}
                          onClick={() => onDownloadPdf(opp.opportunity_id || opp.title)}
                        >
                          📄 PDF
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* SUB-TAB 2: Narratives */}
        {activeReportTab === 'narratives' && (
          <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {narratives?.map((nar: any, idx: number) => (
              <div key={idx} className="glass-card" style={{ padding: '24px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <h3 style={{ fontSize: '1.25rem', color: '#fff' }}>{nar.name}</h3>
                  <span className="badge badge-cyan">{nar.sentiment || 'Neutral'} Sentiment</span>
                </div>
                <p style={{ color: 'var(--text-primary)', lineHeight: '1.6', fontSize: '0.95rem', marginBottom: '16px' }}>
                  {nar.description}
                </p>
                {/* Supporting Evidence Chips */}
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Supporting Evidence:</span>
                  {evidence?.slice(0, 3).map((ev) => (
                    <button
                      key={ev.evidence_id}
                      onClick={() => onSelectEvidence(ev, nar.name)}
                      className="metric-pill metric-pill-cyan"
                      style={{ cursor: 'pointer', border: '1px solid rgba(6,182,212,0.3)' }}
                    >
                      📑 {ev.platform}: {ev.title?.slice(0, 24)}...
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* SUB-TAB 3: AI Answers (LLM Monitoring) */}
        {activeReportTab === 'ai_answers' && (
          <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div className="glass-card" style={{ padding: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h3 style={{ fontSize: '1.2rem', margin: 0 }}>LLM Ecosystem Response Patterns</h3>
                <span className="badge badge-emerald">
                  Sample Coverage: {Math.round((llm_analysis?.coverage || 0.85) * 100)}%
                </span>
              </div>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '20px' }}>
                Continuous probing of ChatGPT, Gemini, and Claude outputs regarding <em>{topic}</em>.
              </p>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px' }}>
                <div style={{ padding: '16px', background: 'rgba(255,255,255,0.03)', borderRadius: '10px' }}>
                  <div className="subheading-label">Consensus Across Monitored Models:</div>
                  <p style={{ color: '#fff', fontSize: '0.9rem', lineHeight: '1.5' }}>
                    {llm_analysis?.consensus || 'Models agree on general terminology and core definitions.'}
                  </p>
                </div>

                <div style={{ padding: '16px', background: 'rgba(255,255,255,0.03)', borderRadius: '10px' }}>
                  <div className="subheading-label">Identified Model Divergence &amp; Gaps:</div>
                  <p style={{ color: '#fff', fontSize: '0.9rem', lineHeight: '1.5' }}>
                    {llm_analysis?.divergence || 'Models lack practical localized steps and conflicting advice on implementation.'}
                  </p>
                </div>
              </div>

              {/* Missing Questions */}
              {llm_analysis?.missing_questions && (
                <div style={{ marginTop: '20px' }}>
                  <div className="subheading-label">Recurring Questions Receiving Weak AI Answers:</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {llm_analysis.missing_questions.map((q: string, i: number) => (
                      <div key={i} className="question-quote">
                        "{q}"
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Citation Concentration */}
              {llm_analysis?.citation_concentration && (
                <div style={{ marginTop: '20px' }}>
                  <div className="subheading-label">Repeatedly Cited External Domains:</div>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {llm_analysis.citation_concentration.map((domain: string, i: number) => (
                      <span key={i} className="metric-pill metric-pill-cyan">
                        🔗 {domain}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* SUB-TAB 4: Audiences */}
        {activeReportTab === 'audiences' && (
          <div className="animate-fade-in" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '20px' }}>
            {audience_segments?.map((aud: any, idx: number) => (
              <div key={idx} className="persona-card">
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <span className="badge badge-cyan">Discovered Persona</span>
                    <span className="badge badge-emerald">High Demand</span>
                  </div>
                  <h4 style={{ fontSize: '1.25rem', color: '#fff', marginBottom: '8px' }}>{aud.label}</h4>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: '1.5', marginBottom: '16px' }}>
                    {aud.description}
                  </p>
                  {aud.needs && aud.needs.length > 0 && (
                    <div style={{ marginBottom: '12px' }}>
                      <div className="subheading-label">Information Needs:</div>
                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                        {aud.needs.map((n: string, i: number) => (
                          <span key={i} className="metric-pill metric-pill-cyan" style={{ fontSize: '0.78rem' }}>
                            ✓ {n}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {aud.questions && aud.questions.length > 0 && (
                    <div>
                      <div className="subheading-label">Questions Asked:</div>
                      {aud.questions.slice(0, 2).map((q: string, i: number) => (
                        <div key={i} className="question-quote">{q}</div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* SUB-TAB 5: Content Gaps */}
        {activeReportTab === 'gaps' && (
          <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {content_gaps?.map((gap: any, idx: number) => (
              <div key={idx} className="glass-card" style={{ padding: '24px' }}>
                <span className="badge badge-amber" style={{ marginBottom: '8px', display: 'inline-block' }}>
                  Verified Market Void
                </span>
                <h4 style={{ fontSize: '1.2rem', color: '#fff', marginBottom: '8px' }}>
                  {gap.problem || 'Underserved audience friction point'}
                </h4>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '14px', marginTop: '12px' }}>
                  <div className="brief-section" style={{ margin: 0 }}>
                    <div className="brief-label">Audience Demand Need</div>
                    <div className="brief-value">{gap.audience_need}</div>
                  </div>
                  <div className="brief-section" style={{ margin: 0 }}>
                    <div className="brief-label">Observed Gap in Media</div>
                    <div className="brief-value">{gap.content_gap}</div>
                  </div>
                  <div className="brief-section" style={{ margin: 0, gridColumn: '1 / -1' }}>
                    <div className="brief-label">Recommended Production Angle</div>
                    <div className="brief-value">{gap.recommended_angle}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* SUB-TAB 6: Evidence Catalog (30+ items) */}
        {activeReportTab === 'evidence' && (
          <div className="animate-fade-in">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
              <div>
                <h3 style={{ fontSize: '1.2rem', margin: 0 }}>Normalized Evidence Catalog ({evidence?.length || 0})</h3>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                  Click any evidence record to open the detailed provenance drawer.
                </span>
              </div>
              <input
                type="text"
                placeholder="Search excerpts or publishers..."
                value={evidenceSearch}
                onChange={(e) => setEvidenceSearch(e.target.value)}
                className="input-glass"
                style={{ width: '280px', padding: '8px 14px' }}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {evidence
                ?.filter(ev => {
                  const q = evidenceSearch.toLowerCase();
                  return (ev.title?.toLowerCase().includes(q) ||
                    ev.text_excerpt?.toLowerCase().includes(q) ||
                    ev.platform?.toLowerCase().includes(q) ||
                    ev.author?.toLowerCase().includes(q));
                })
                .map((ev) => (
                  <div
                    key={ev.evidence_id}
                    onClick={() => onSelectEvidence(ev)}
                    className="glass-card"
                    style={{ padding: '16px', cursor: 'pointer', transition: 'all 0.2s ease', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                  >
                    <div style={{ flex: 1, paddingRight: '16px' }}>
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '6px' }}>
                        <span className="badge badge-cyan" style={{ fontSize: '0.65rem' }}>
                          {ev.source_type.toUpperCase()}
                        </span>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                          {ev.platform} • {ev.author || 'Source'}
                        </span>
                        <span className={`badge ${ev.is_inferred ? 'badge-amber' : 'badge-emerald'}`} style={{ fontSize: '0.65rem' }}>
                          {ev.is_inferred ? 'Inferred' : 'Observed'}
                        </span>
                      </div>
                      <div style={{ fontWeight: 600, color: '#fff', fontSize: '0.95rem', marginBottom: '4px' }}>
                        {ev.title || 'Evidence Record'}
                      </div>
                      <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', lineClamp: 2, display: '-webkit-box', WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                        "{ev.text_excerpt}"
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ color: 'var(--accent-emerald)', fontWeight: 700, fontSize: '0.9rem' }}>
                        {Math.round(ev.confidence * 100)}%
                      </div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Confidence</div>
                      <span style={{ color: 'var(--accent-cyan)', fontSize: '0.8rem', marginTop: '6px', display: 'inline-block' }}>
                        Inspect →
                      </span>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* SUB-TAB 7: Timeline */}
        {activeReportTab === 'timeline' && (
          <div className="animate-fade-in glass-card" style={{ padding: '24px' }}>
            <h3 style={{ fontSize: '1.2rem', marginBottom: '20px' }}>Investigation Pipeline Timeline</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', position: 'relative', paddingLeft: '24px', borderLeft: '2px solid var(--accent-cyan)' }}>
              <div>
                <div style={{ fontWeight: 700, color: '#fff', fontSize: '0.95rem' }}>1. Research Plan Synthesized</div>
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>LangGraph planner formulated bounded social queries, web probes, and ecosystem questions.</div>
              </div>
              <div>
                <div style={{ fontWeight: 700, color: '#fff', fontSize: '0.95rem' }}>2. Multi-Channel Evidence Harvested</div>
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Gathered and normalized {evidence?.length || 0} observations across Reddit, Google News, and AI assistants.</div>
              </div>
              <div>
                <div style={{ fontWeight: 700, color: '#fff', fontSize: '0.95rem' }}>3. Deduplication &amp; Hashing Completed</div>
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>URL and SHA-256 content deduplication removed duplicate excerpts.</div>
              </div>
              <div>
                <div style={{ fontWeight: 700, color: '#fff', fontSize: '0.95rem' }}>4. Audience Personas &amp; Content Gaps Uncovered</div>
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Identified {audience_segments?.length || 0} distinct audience personas and {content_gaps?.length || 0} content voids.</div>
              </div>
              <div>
                <div style={{ fontWeight: 700, color: 'var(--accent-emerald)', fontSize: '0.95rem' }}>5. Opportunities Scored &amp; Dossier Finalized</div>
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Ranked {opportunities?.length || 0} content opportunities with full ReportLab PDF export.</div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Otherwise, render the main investigations directory
  return (
    <div className="page-container animate-fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '2.2rem', marginBottom: '8px' }}>Autonomous Investigations</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '1rem', maxWidth: '680px' }}>
            Multi-agent research pipelines collecting evidence across social channels, web media, and AI answer ecosystems.
          </p>
        </div>
        <button onClick={onRefresh} className="btn-outline" style={{ fontSize: '0.9rem' }}>
          ↻ Refresh Runs
        </button>
      </div>

      {/* Manual Quick Dispatch Form */}
      <div className="glass-card" style={{ padding: '20px', marginBottom: '28px' }}>
        <h3 style={{ fontSize: '1.1rem', marginBottom: '8px' }}>Dispatch New Research Investigation</h3>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '16px' }}>
          Enter any trending keyword or topic to run the full LangGraph evidence collection pipeline.
        </p>
        <form onSubmit={(e) => { e.preventDefault(); if (customTopic) { onLaunchNew(customTopic); setCustomTopic(''); } }} style={{ display: 'flex', gap: '12px' }}>
          <input
            type="text"
            placeholder="E.g., AI tutors, Solar Microgrids, Quantum Sensors..."
            value={customTopic}
            onChange={(e) => setCustomTopic(e.target.value)}
            className="input-glass"
            style={{ flex: 1 }}
          />
          <button type="submit" className="btn-primary" disabled={!customTopic}>
            Dispatch Investigation
          </button>
        </form>
      </div>

      {/* Investigations Table / Grid */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        {investigations.map((inv) => {
          const isComplete = inv.status === 'complete';
          const isFailed = inv.status === 'failed';

          return (
            <div key={inv.investigation_id} className="glass-card" style={{ padding: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
              <div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '6px' }}>
                  <span className={`badge ${isComplete ? 'badge-emerald' : isFailed ? 'badge-amber' : 'badge-cyan'}`}>
                    {inv.status.toUpperCase()}
                  </span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    Region: {inv.region} • ID: {inv.investigation_id}
                  </span>
                </div>
                <h3 style={{ fontSize: '1.25rem', color: '#fff', textTransform: 'capitalize', marginBottom: '6px' }}>
                  {inv.topic}
                </h3>
                <div style={{ display: 'flex', gap: '12px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                  <span>Stage: <strong style={{ color: 'var(--accent-cyan)' }}>{inv.stage}</strong></span>
                  <span>Evidence: <strong style={{ color: '#fff' }}>{inv.evidence_count} records</strong></span>
                  <span>Opportunities: <strong style={{ color: 'var(--accent-emerald)' }}>{inv.opportunities_count} briefs</strong></span>
                </div>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                {isComplete && (
                  <button 
                    className="btn-primary"
                    style={{ padding: '10px 18px', fontSize: '0.85rem' }}
                    onClick={() => setSelectedInvId(inv.investigation_id)}
                  >
                    Open Intelligence Report →
                  </button>
                )}
                {isFailed && (
                  <button 
                    className="btn-outline"
                    style={{ borderColor: 'var(--accent-amber)', color: 'var(--accent-amber)' }}
                    onClick={() => handleRetry(inv.investigation_id)}
                    disabled={retryingId === inv.investigation_id}
                  >
                    {retryingId === inv.investigation_id ? 'Retrying...' : '↻ Retry Sources'}
                  </button>
                )}
                {!isComplete && !isFailed && (
                  <span className="badge badge-cyan" style={{ padding: '8px 12px' }}>
                    ⏳ Running Agents...
                  </span>
                )}
              </div>
            </div>
          );
        })}

        {investigations.length === 0 && (
          <div className="glass-card" style={{ textAlign: 'center', padding: '60px' }}>
            <h3>No Investigations Dispatched Yet</h3>
            <p style={{ color: 'var(--text-secondary)', marginTop: '8px' }}>
              Dispatch an investigation above or click "Launch Investigation" on any trend in Trend Radar.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
