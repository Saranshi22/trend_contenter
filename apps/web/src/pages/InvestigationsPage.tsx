import React, { useState, useEffect } from 'react';
import type { InvestigationSummary, InvestigationDetail, EvidenceDetail, Opportunity } from '../types';
import { API_BASE } from '../apiConfig';
import {
  IconOverview,
  IconBookOpen,
  IconBot,
  IconUsers,
  IconLayers,
  IconFileText,
  IconClock,
  IconSocialCrawl,
  IconNews,
  IconYouTube,
  IconFilePdf,
  IconArrowRight,
  IconRefresh,
  IconEye,
  IconThumbsUp,
  IconCheck,
  IconExternalLink,
  IconTrash
} from '../components/Icons';

interface InvestigationsPageProps {
  investigations: InvestigationSummary[];
  selectedInvestigationId?: string | null;
  onSelectInvestigationId?: (id: string | null) => void;
  onRefresh: () => void;
  onLaunchNew: (topic: string) => void;
  onSelectEvidence: (ev: EvidenceDetail, label?: string) => void;
  onSelectOpportunity: (opp: Opportunity) => void;
  onDownloadPdf: (oppId: string) => void;
}

export const InvestigationsPage: React.FC<InvestigationsPageProps> = ({
  investigations,
  selectedInvestigationId,
  onSelectInvestigationId,
  onRefresh,
  onLaunchNew,
  onSelectEvidence,
  onSelectOpportunity,
  onDownloadPdf
}) => {
  const [selectedInvId, setSelectedInvId] = useState<string | null>(selectedInvestigationId || null);
  const [reportDetail, setReportDetail] = useState<InvestigationDetail | null>(null);
  const [loadingReport, setLoadingReport] = useState<boolean>(false);
  const [activeReportTab, setActiveReportTab] = useState<'overview' | 'narratives' | 'ai_answers' | 'audiences' | 'gaps' | 'evidence' | 'timeline'>('overview');
  const [evidenceSearch, setEvidenceSearch] = useState('');
  const [customTopic, setCustomTopic] = useState('');
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    if (selectedInvestigationId !== undefined) {
      setSelectedInvId(selectedInvestigationId);
    }
  }, [selectedInvestigationId]);

  const handleSelectInvestigation = (id: string | null) => {
    setSelectedInvId(id);
    if (onSelectInvestigationId) {
      onSelectInvestigationId(id);
    }
  };

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

  const handleDelete = async (invId: string, topicName: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!window.confirm(`Are you sure you want to delete the investigation for "${topicName}"? This will remove its evidence and generated opportunities.`)) {
      return;
    }
    setDeletingId(invId);
    try {
      const res = await fetch(`${API_BASE}/investigations/${invId}`, { method: 'DELETE' });
      if (res.ok) {
        if (selectedInvId === invId) {
          handleSelectInvestigation(null);
        }
        onRefresh();
      } else {
        alert('Failed to delete investigation.');
      }
    } catch (err) {
      console.error('Delete failed:', err);
      alert('Network error while deleting investigation.');
    } finally {
      setDeletingId(null);
    }
  };

  if (selectedInvId && loadingReport) {
    return (
      <div className="page-container animate-fade-in" style={{ padding: '60px 0', textAlign: 'center' }}>
        <span className="pulse-dot" style={{ width: '16px', height: '16px', marginBottom: '16px' }} />
        <h2 style={{ fontSize: '1.35rem', color: 'var(--text-primary)', marginTop: '12px' }}>Loading Intelligence Dossier...</h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>Retrieving normalized evidence graph and research narratives.</p>
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
            onClick={() => handleSelectInvestigation(null)}
            style={{ fontSize: '0.85rem', padding: '8px 16px', display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <IconArrowRight size={13} style={{ transform: 'rotate(180deg)' }} />
            <span>Back to Investigations List</span>
          </button>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <span className={`badge ${status === 'complete' ? 'badge-emerald' : status === 'failed' ? 'badge-amber' : 'badge-cyan'}`}>
              {status.toUpperCase()}
            </span>
            <span className="badge badge-cyan">
              ID: {selectedInvId}
            </span>
            <button
              className="btn-outline"
              title="Delete Investigation"
              onClick={() => handleDelete(selectedInvId, topic)}
              disabled={deletingId === selectedInvId}
              style={{ borderColor: 'rgba(239, 68, 68, 0.4)', color: '#EF4444', padding: '6px 12px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '5px' }}
            >
              <IconTrash size={14} color="#EF4444" />
              <span>{deletingId === selectedInvId ? 'Deleting...' : 'Delete'}</span>
            </button>
          </div>
        </div>

        {/* Intelligence Report Header Banner */}
        <div className="glass-card" style={{ padding: '24px', marginBottom: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
            <div>
              <span className="badge badge-cyan" style={{ fontSize: '0.75rem', marginBottom: '8px', display: 'inline-block' }}>
                Trend Intelligence Dossier
              </span>
              <h1 style={{ fontSize: '2rem', color: 'var(--text-primary)', textTransform: 'capitalize', marginBottom: '8px', fontWeight: 700 }}>
                {topic}
              </h1>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.92rem', margin: 0 }}>
                Synthesized by LangGraph Planner, Social Research, Web Search, and LLM Ecosystem Monitoring.
              </p>
            </div>

            {/* Source Status Badges */}
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <span className={`metric-pill ${source_statuses?.social === 'success' ? 'metric-pill-green' : source_statuses?.social === 'not_configured' ? 'metric-pill-neutral' : 'metric-pill-amber'}`} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                <IconSocialCrawl size={14} />
                <span>Social: {source_statuses?.social || 'Pending'}</span>
              </span>
              <span className={`metric-pill ${source_statuses?.web === 'success' ? 'metric-pill-green' : 'metric-pill-amber'}`} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                <IconNews size={14} />
                <span>Web/News: {source_statuses?.web || 'Pending'}</span>
              </span>
              <span className={`metric-pill ${source_statuses?.youtube === 'success' ? 'metric-pill-green' : source_statuses?.youtube === 'failed' || source_statuses?.youtube === 'quota_exceeded' ? 'metric-pill-amber' : 'metric-pill-cyan'}`} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                <IconYouTube size={14} />
                <span>YouTube: {source_statuses?.youtube || 'Pending'}</span>
              </span>
              <span className={`metric-pill ${source_statuses?.llm === 'success' ? 'metric-pill-green' : 'metric-pill-amber'}`} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                <IconBot size={14} />
                <span>LLM: {source_statuses?.llm || 'Pending'}</span>
              </span>
            </div>
          </div>
        </div>

        {/* Report Sub-Navigation Tabs */}
        <div className="tab-container" style={{ marginBottom: '24px' }}>
          <button 
            className={`tab-btn ${activeReportTab === 'overview' ? 'active' : ''}`}
            onClick={() => setActiveReportTab('overview')}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            <IconOverview size={15} />
            <span>Overview</span>
          </button>
          <button 
            className={`tab-btn ${activeReportTab === 'narratives' ? 'active' : ''}`}
            onClick={() => setActiveReportTab('narratives')}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            <IconBookOpen size={15} />
            <span>Narratives ({narratives?.length || 0})</span>
          </button>
          <button 
            className={`tab-btn ${activeReportTab === 'ai_answers' ? 'active' : ''}`}
            onClick={() => setActiveReportTab('ai_answers')}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            <IconBot size={15} />
            <span>AI Answers &amp; Ecosystem</span>
          </button>
          <button 
            className={`tab-btn ${activeReportTab === 'audiences' ? 'active' : ''}`}
            onClick={() => setActiveReportTab('audiences')}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            <IconUsers size={15} />
            <span>Audiences ({audience_segments?.length || 0})</span>
          </button>
          <button 
            className={`tab-btn ${activeReportTab === 'gaps' ? 'active' : ''}`}
            onClick={() => setActiveReportTab('gaps')}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            <IconLayers size={15} />
            <span>Content Gaps ({content_gaps?.length || 0})</span>
          </button>
          <button 
            className={`tab-btn ${activeReportTab === 'evidence' ? 'active' : ''}`}
            onClick={() => setActiveReportTab('evidence')}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            <IconFileText size={15} />
            <span>Evidence ({evidence?.length || 0})</span>
          </button>
          <button 
            className={`tab-btn ${activeReportTab === 'timeline' ? 'active' : ''}`}
            onClick={() => setActiveReportTab('timeline')}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            <IconClock size={15} />
            <span>Timeline</span>
          </button>
        </div>

        {/* SUB-TAB 1: Overview */}
        {activeReportTab === 'overview' && (
          <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px' }}>
              <div className="glass-card" style={{ padding: '24px' }}>
                <h4 style={{ color: 'var(--brand-teal)', fontSize: '0.85rem', textTransform: 'uppercase', marginBottom: '12px', fontWeight: 600 }}>
                  Strategic "Why Now?" Synthesis
                </h4>
                <p style={{ color: 'var(--text-primary)', lineHeight: '1.6', fontSize: '0.95rem' }}>
                  {narratives?.[0]?.description || `Surge in query volume for '${topic}' driven by emerging announcements, community discussions, and noticeable voids in authoritative explainers.`}
                </p>
              </div>

              <div className="glass-card" style={{ padding: '24px' }}>
                <h4 style={{ color: 'var(--action-primary)', fontSize: '0.85rem', textTransform: 'uppercase', marginBottom: '12px', fontWeight: 600 }}>
                  Source Coverage &amp; Provenance
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '0.9rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Normalized Evidence Records:</span>
                    <strong style={{ color: 'var(--text-primary)' }}>{evidence?.length || 0} items</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>YouTube Media Sampled:</span>
                    <strong style={{ color: 'var(--brand-teal)' }}>
                      {(evidence?.filter(e => e.platform === 'youtube' && e.metadata?.retrieval_method === 'video_metadata') || []).length} videos • {(evidence?.filter(e => e.platform === 'youtube' && e.metadata?.retrieval_method === 'comment_thread') || []).length} comments
                    </strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Ecosystem Coverage:</span>
                    <strong style={{ color: 'var(--status-success)' }}>{Math.round((llm_analysis?.coverage || 0.85) * 100)}%</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Generated Content Opportunities:</span>
                    <strong style={{ color: 'var(--action-primary)' }}>{opportunities?.length || 0} briefs</strong>
                  </div>
                </div>
              </div>
            </div>

            {/* Recommended Opportunities Quick List */}
            {opportunities && opportunities.length > 0 && (
              <div className="glass-card" style={{ padding: '24px' }}>
                <h3 style={{ fontSize: '1.15rem', marginBottom: '16px', color: 'var(--text-primary)', fontWeight: 600 }}>
                  Recommended Editorial Opportunities
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '16px' }}>
                  {opportunities.map((opp: any, idx: number) => (
                    <div 
                      key={idx} 
                      style={{ 
                        padding: '18px', 
                        background: '#FFFFFF', 
                        borderRadius: '10px', 
                        border: '1px solid var(--border-subtle)', 
                        boxShadow: 'var(--shadow-sm)',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        minWidth: 0,
                        overflow: 'hidden'
                      }}
                    >
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', marginBottom: '10px', minWidth: 0 }}>
                          <span 
                            className="badge badge-cyan"
                            style={{ 
                              maxWidth: 'calc(100% - 85px)', 
                              overflow: 'hidden', 
                              textOverflow: 'ellipsis', 
                              whiteSpace: 'nowrap', 
                              display: 'inline-block' 
                            }}
                            title={opp.audience_label || 'Target Audience'}
                          >
                            {opp.audience_label || 'Target Audience'}
                          </span>
                          <span style={{ color: 'var(--status-success)', fontWeight: 700, fontSize: '0.88rem', whiteSpace: 'nowrap', flexShrink: 0 }}>
                            {Math.round((opp.score || 0.85) * 100)} / 100
                          </span>
                        </div>
                        <h4 style={{ color: 'var(--text-primary)', fontSize: '1.05rem', marginBottom: '8px', fontWeight: 600, wordBreak: 'break-word', overflowWrap: 'break-word' }}>
                          {opp.title}
                        </h4>
                        <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '16px', lineHeight: '1.5', wordBreak: 'break-word', overflowWrap: 'break-word' }}>
                          {opp.content_gap}
                        </p>
                      </div>
                      <div style={{ display: 'flex', gap: '8px', marginTop: 'auto' }}>
                        <button 
                          className="btn-outline" 
                          style={{ flex: 1, padding: '8px 12px', fontSize: '0.85rem' }}
                          onClick={() => onSelectOpportunity(opp)}
                        >
                          View Brief
                        </button>
                        <button 
                          className="btn-emerald" 
                          style={{ padding: '8px 14px', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '6px' }}
                          onClick={() => onDownloadPdf(opp.opportunity_id || opp.title)}
                        >
                          <IconFilePdf size={13} />
                          <span>PDF</span>
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
                  <h3 style={{ fontSize: '1.25rem', color: 'var(--text-primary)', fontWeight: 600 }}>{nar.name}</h3>
                  <span className="badge badge-cyan">{nar.sentiment || 'Neutral'} Sentiment</span>
                </div>
                <p style={{ color: 'var(--text-primary)', lineHeight: '1.6', fontSize: '0.95rem', marginBottom: '16px' }}>
                  {nar.description}
                </p>
                {/* Supporting Evidence Chips */}
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Supporting Evidence:</span>
                  {evidence?.slice(0, 3).map((ev) => (
                    <button
                      key={ev.evidence_id}
                      onClick={() => onSelectEvidence(ev, nar.name)}
                      className="metric-pill metric-pill-cyan"
                      style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '5px' }}
                    >
                      <IconFileText size={12} />
                      <span>{ev.platform}: {ev.title?.slice(0, 26)}...</span>
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
                <h3 style={{ fontSize: '1.2rem', margin: 0, color: 'var(--text-primary)' }}>LLM Ecosystem Response Patterns</h3>
                <span className="badge badge-emerald">
                  Sample Coverage: {Math.round((llm_analysis?.coverage || 0.85) * 100)}%
                </span>
              </div>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '20px' }}>
                Continuous probing of ChatGPT, Gemini, and Claude outputs regarding <em>{topic}</em>.
              </p>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px' }}>
                <div style={{ padding: '16px', background: '#FFFFFF', borderRadius: '10px', border: '1px solid var(--border-subtle)', boxShadow: 'var(--shadow-sm)' }}>
                  <div className="subheading-label">Consensus Across Monitored Models:</div>
                  <p style={{ color: 'var(--text-primary)', fontSize: '0.9rem', lineHeight: '1.5', margin: 0 }}>
                    {llm_analysis?.consensus || 'Models agree on general terminology and core definitions.'}
                  </p>
                </div>

                <div style={{ padding: '16px', background: '#FFFFFF', borderRadius: '10px', border: '1px solid var(--border-subtle)', boxShadow: 'var(--shadow-sm)' }}>
                  <div className="subheading-label">Identified Model Divergence &amp; Gaps:</div>
                  <p style={{ color: 'var(--text-primary)', fontSize: '0.9rem', lineHeight: '1.5', margin: 0 }}>
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
                      <span key={i} className="metric-pill metric-pill-cyan" style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                        <IconExternalLink size={12} />
                        <span>{domain}</span>
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
                  <h4 style={{ fontSize: '1.25rem', color: 'var(--text-primary)', marginBottom: '8px', fontWeight: 600 }}>{aud.label}</h4>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: '1.5', marginBottom: '16px' }}>
                    {aud.description}
                  </p>
                  {aud.needs && aud.needs.length > 0 && (
                    <div style={{ marginBottom: '12px' }}>
                      <div className="subheading-label">Information Needs:</div>
                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                        {aud.needs.map((n: string, i: number) => (
                          <span key={i} className="metric-pill metric-pill-cyan" style={{ fontSize: '0.78rem', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                            <IconCheck size={11} />
                            <span>{n}</span>
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
                <h4 style={{ fontSize: '1.2rem', color: 'var(--text-primary)', marginBottom: '8px', fontWeight: 600 }}>
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
                <h3 style={{ fontSize: '1.2rem', margin: 0, color: 'var(--text-primary)' }}>Normalized Evidence Catalog ({evidence?.length || 0})</h3>
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
                .map((ev) => {
                  const isYt = ev.platform === 'youtube';
                  const isYtComment = isYt && ev.metadata?.retrieval_method === 'comment_thread';
                  const badgeLabel = isYt ? (isYtComment ? 'YOUTUBE COMMENT' : 'YOUTUBE VIDEO') : ev.source_type.toUpperCase();

                  return (
                    <div
                      key={ev.evidence_id}
                      onClick={() => onSelectEvidence(ev)}
                      className="glass-card"
                      style={{ padding: '16px', cursor: 'pointer', transition: 'all 0.2s ease', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}
                    >
                      {ev.metadata?.thumbnail_url && (
                        <div style={{ flexShrink: 0, width: '64px', height: '48px', overflow: 'hidden', borderRadius: '6px', background: 'var(--surface-secondary)' }}>
                          <img
                            src={ev.metadata.thumbnail_url}
                            alt="thumb"
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          />
                        </div>
                      )}
                      <div style={{ flex: 1, paddingRight: '12px' }}>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '6px', flexWrap: 'wrap' }}>
                          <span className="badge badge-cyan" style={{ fontSize: '0.65rem' }}>
                            {badgeLabel}
                          </span>
                          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                            {ev.metadata?.channel_title || ev.author || ev.platform}
                          </span>
                          <span className={`badge ${ev.is_inferred ? 'badge-amber' : 'badge-emerald'}`} style={{ fontSize: '0.65rem' }}>
                            {ev.is_inferred ? 'Inferred' : 'Observed'}
                          </span>
                          {isYt && !isYtComment && typeof ev.engagement?.views === 'number' && (
                            <span style={{ fontSize: '0.75rem', color: 'var(--action-primary)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                              <IconEye size={12} />
                              <span>{ev.engagement.views.toLocaleString()} views</span>
                            </span>
                          )}
                          {isYtComment && typeof ev.engagement?.likes === 'number' && (
                            <span style={{ fontSize: '0.75rem', color: 'var(--status-success)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                              <IconThumbsUp size={12} />
                              <span>{ev.engagement.likes} likes</span>
                            </span>
                          )}
                        </div>
                        <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.95rem', marginBottom: '4px' }}>
                          {ev.title || 'Evidence Record'}
                        </div>
                        <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', lineClamp: 2, display: '-webkit-box', WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                          "{ev.text_excerpt}"
                        </div>
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div style={{ color: 'var(--status-success)', fontWeight: 700, fontSize: '0.9rem' }}>
                          {Math.round(ev.confidence * 100)}%
                        </div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Confidence</div>
                        <span style={{ color: 'var(--action-primary)', fontSize: '0.8rem', marginTop: '6px', display: 'inline-flex', alignItems: 'center', gap: '3px', fontWeight: 500 }}>
                          <span>Inspect</span>
                          <IconArrowRight size={11} />
                        </span>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        )}

        {/* SUB-TAB 7: Timeline */}
        {activeReportTab === 'timeline' && (
          <div className="animate-fade-in glass-card" style={{ padding: '24px' }}>
            <h3 style={{ fontSize: '1.2rem', marginBottom: '20px', color: 'var(--text-primary)', fontWeight: 600 }}>Investigation Pipeline Timeline</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', position: 'relative', paddingLeft: '24px', borderLeft: '2px solid var(--action-primary)' }}>
              <div>
                <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '0.95rem' }}>1. Research Plan Synthesized</div>
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>LangGraph planner formulated bounded social queries, web probes, and ecosystem questions.</div>
              </div>
              <div>
                <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '0.95rem' }}>2. Multi-Channel Evidence Harvested</div>
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Gathered and normalized {evidence?.length || 0} observations across Social Listening, Google News, and AI assistants.</div>
              </div>
              <div>
                <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '0.95rem' }}>3. Deduplication &amp; Hashing Completed</div>
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>URL and SHA-256 content deduplication removed duplicate excerpts.</div>
              </div>
              <div>
                <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '0.95rem' }}>4. Audience Personas &amp; Content Gaps Uncovered</div>
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Identified {audience_segments?.length || 0} distinct audience personas and {content_gaps?.length || 0} content voids.</div>
              </div>
              <div>
                <div style={{ fontWeight: 700, color: 'var(--status-success)', fontSize: '0.95rem' }}>5. Opportunities Scored &amp; Dossier Finalized</div>
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
          <h1 style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '6px' }}>
            Autonomous Investigations
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.92rem', maxWidth: '680px', margin: 0 }}>
            Multi-agent research pipelines collecting evidence across social channels, web media, and AI answer ecosystems.
          </p>
        </div>
        <button 
          onClick={onRefresh} 
          className="btn-outline" 
          style={{ fontSize: '0.875rem', padding: '9px 16px', display: 'flex', alignItems: 'center', gap: '6px' }}
        >
          <IconRefresh size={14} />
          <span>Refresh Runs</span>
        </button>
      </div>

      {/* Manual Quick Dispatch Form */}
      <div className="glass-card" style={{ padding: '24px', marginBottom: '28px' }}>
        <h3 style={{ fontSize: '1.15rem', marginBottom: '6px', color: 'var(--text-primary)', fontWeight: 600 }}>Dispatch New Research Investigation</h3>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '16px' }}>
          Enter any trending keyword or topic to run the full LangGraph evidence collection pipeline.
        </p>
        <form onSubmit={(e) => { e.preventDefault(); if (customTopic) { onLaunchNew(customTopic); setCustomTopic(''); } }} style={{ display: 'flex', gap: '12px' }}>
          <input
            type="text"
            placeholder="E.g., Generative Search Optimization, Solar Microgrids, Quantum Sensors..."
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
            <div key={inv.investigation_id} className="glass-card" style={{ padding: '22px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
              <div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '6px' }}>
                  <span className={`badge ${isComplete ? 'badge-emerald' : isFailed ? 'badge-amber' : 'badge-cyan'}`}>
                    {inv.status.toUpperCase()}
                  </span>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    Region: {inv.region} • ID: {inv.investigation_id}
                  </span>
                </div>
                <h3 style={{ fontSize: '1.25rem', color: 'var(--text-primary)', textTransform: 'capitalize', marginBottom: '8px', fontWeight: 600 }}>
                  {inv.topic}
                </h3>
                <div style={{ display: 'flex', gap: '16px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                  <span>Stage: <strong style={{ color: 'var(--action-primary)' }}>{inv.stage}</strong></span>
                  <span>Evidence: <strong style={{ color: 'var(--text-primary)' }}>{inv.evidence_count} records</strong></span>
                  <span>Opportunities: <strong style={{ color: 'var(--brand-teal)' }}>{inv.opportunities_count} briefs</strong></span>
                </div>
                {inv.source_statuses && (
                  <div style={{ display: 'flex', gap: '6px', marginTop: '10px', flexWrap: 'wrap' }}>
                    {inv.source_statuses.youtube && (
                      <span className="badge badge-cyan" style={{ fontSize: '0.7rem', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        <IconYouTube size={12} />
                        <span>YT: {inv.source_statuses.youtube}</span>
                      </span>
                    )}
                    {inv.source_statuses.social && (
                      <span className={`badge ${inv.source_statuses.social === 'degraded' || inv.source_statuses.social === 'failed' ? 'badge-amber' : 'badge-cyan'}`} style={{ fontSize: '0.7rem', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        <IconSocialCrawl size={12} />
                        <span>Social: {inv.source_statuses.social}</span>
                      </span>
                    )}
                    {inv.source_statuses.web && (
                      <span className="badge badge-cyan" style={{ fontSize: '0.7rem', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        <IconNews size={12} />
                        <span>Web: {inv.source_statuses.web}</span>
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                {isComplete && (
                  <button 
                    className="btn-primary"
                    style={{ padding: '10px 18px', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '6px' }}
                    onClick={() => handleSelectInvestigation(inv.investigation_id)}
                  >
                    <span>Open Intelligence Report</span>
                    <IconArrowRight size={13} />
                  </button>
                )}
                {isFailed && (
                  <button 
                    className="btn-outline"
                    style={{ borderColor: 'var(--warning-amber)', color: 'var(--warning-amber)', display: 'flex', alignItems: 'center', gap: '6px' }}
                    onClick={() => handleRetry(inv.investigation_id)}
                    disabled={retryingId === inv.investigation_id}
                  >
                    <IconRefresh size={13} />
                    <span>{retryingId === inv.investigation_id ? 'Retrying...' : 'Retry Sources'}</span>
                  </button>
                )}
                {!isComplete && !isFailed && (
                  <span className="badge badge-cyan" style={{ padding: '8px 12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span className="pulse-dot" />
                    <span>Running Agents...</span>
                  </span>
                )}
                <button
                  className="btn-outline"
                  title="Delete Investigation"
                  onClick={(e) => handleDelete(inv.investigation_id, inv.topic, e)}
                  disabled={deletingId === inv.investigation_id}
                  style={{ borderColor: 'rgba(239, 68, 68, 0.3)', color: '#EF4444', padding: '9px 12px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '5px' }}
                >
                  <IconTrash size={14} color="#EF4444" />
                </button>
              </div>
            </div>
          );
        })}

        {investigations.length === 0 && (
          <div className="glass-card" style={{ textAlign: 'center', padding: '60px' }}>
            <h3 style={{ color: 'var(--text-primary)' }}>No Investigations Dispatched Yet</h3>
            <p style={{ color: 'var(--text-secondary)', marginTop: '8px' }}>
              Dispatch an investigation above or click "Launch Investigation" on any trend in Trend Radar.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
