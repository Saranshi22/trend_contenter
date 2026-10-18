import { useState, useEffect } from 'react';
import './index.css';

import type {
  TrendRadarItem,
  Opportunity,
  AudienceSegment,
  InvestigationSummary,
  EvidenceDetail,
  UserRole,
  ProviderHealthSummary
} from './types';

import { Sidebar } from './components/Sidebar';
import type { NavPage } from './components/Sidebar';
import { EvidenceDrawer } from './components/EvidenceDrawer';
import {
  IconFilePdf,
  IconClose,
  IconCheck,
  IconSparkles,
  IconLightning,
  IconInfo
} from './components/Icons';

import { OverviewPage } from './pages/OverviewPage';
import { TrendRadarPage } from './pages/TrendRadarPage';
import { InvestigationsPage } from './pages/InvestigationsPage';
import { AudienceOpportunitiesPage } from './pages/AudienceOpportunitiesPage';
import { ContentStudioPage } from './pages/ContentStudioPage';
import { WatchlistsPage } from './pages/WatchlistsPage';
import { AdminPage } from './pages/AdminPage';

import { API_BASE } from './apiConfig';

function ScoreTooltip({ title, text, align = 'center' }: { title?: string; text: string; align?: 'center' | 'left' | 'right' }) {
  const alignClass = align === 'right' ? 'tooltip-align-right' : align === 'left' ? 'tooltip-align-left' : '';
  return (
    <span className="tooltip-wrapper" tabIndex={0} role="tooltip" aria-label={text} style={{ marginLeft: '4px' }}>
      <span className="tooltip-icon-btn">
        <IconInfo size={13} />
      </span>
      <span className={`tooltip-content ${alignClass}`}>
        {title && <strong style={{ display: 'block', marginBottom: '3px', color: '#38BDF8', fontWeight: 600 }}>{title}</strong>}
        <span>{text}</span>
      </span>
    </span>
  );
}

export function App() {
  // Navigation & Role
  const [activePage, setActivePage] = useState<NavPage>('overview');
  const [currentRole, setCurrentRole] = useState<UserRole>('workspace_admin');

  // Shared Core Data
  const [region, setRegion] = useState<string>('IN');
  const [trends, setTrends] = useState<TrendRadarItem[]>([]);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [audiences, setAudiences] = useState<AudienceSegment[]>([]);
  const [investigations, setInvestigations] = useState<InvestigationSummary[]>([]);
  const [providerHealth, setProviderHealth] = useState<ProviderHealthSummary | null>(null);

  // Async States
  const [syncing, setSyncing] = useState<boolean>(false);
  const [investigatingId, setInvestigatingId] = useState<string | null>(null);
  const [downloadingPdfId, setDownloadingPdfId] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string>('');
  const [lastTrendsUpdated, setLastTrendsUpdated] = useState<Date | null>(() => new Date());
  const [trendsRefreshError, setTrendsRefreshError] = useState<string | null>(null);
  const [selectedInvestigationId, setSelectedInvestigationId] = useState<string | null>(null);

  // Modals & Drawers
  const [selectedBrief, setSelectedBrief] = useState<Opportunity | null>(null);
  const [stagedOpportunityId, setStagedOpportunityId] = useState<string | null>(null);
  const [selectedEvidence, setSelectedEvidence] = useState<{
    item: EvidenceDetail;
    label?: string;
  } | null>(null);

  // 1. Fetch Radar Trends
  const fetchTrends = async (selectedRegion = region) => {
    try {
      const res = await fetch(`${API_BASE}/trends/?region=${selectedRegion}`);
      if (res.ok) {
        const data = await res.json();
        setTrends(data);
        setLastTrendsUpdated(new Date());
        setTrendsRefreshError(null);
      }
    } catch (err) {
      console.error('Failed to load trends:', err);
    }
  };

  // 2. Fetch Opportunities
  const fetchOpportunities = async () => {
    try {
      const res = await fetch(`${API_BASE}/opportunities/`);
      if (res.ok) {
        const data = await res.json();
        setOpportunities(data);
      }
    } catch (err) {
      console.error('Failed to load opportunities:', err);
    }
  };

  // 3. Fetch Audiences
  const fetchAudiences = async () => {
    try {
      const res = await fetch(`${API_BASE}/audiences/`);
      if (res.ok) {
        const data = await res.json();
        setAudiences(data);
      }
    } catch (err) {
      console.error('Failed to load audiences:', err);
    }
  };

  // 4. Fetch Investigations List
  const fetchInvestigations = async () => {
    try {
      const res = await fetch(`${API_BASE}/investigations/`);
      if (res.ok) {
        const data = await res.json();
        setInvestigations(data);
      }
    } catch (err) {
      console.error('Failed to load investigations:', err);
    }
  };

  // 5. Fetch Truthful Runtime Provider Health
  const fetchProviderHealth = async () => {
    try {
      const res = await fetch(`${API_BASE}/trends/provider-health`);
      if (res.ok) {
        const data = await res.json();
        setProviderHealth(data);
      }
    } catch (err) {
      console.error('Failed to load provider health:', err);
    }
  };

  // Initial Load
  useEffect(() => {
    fetchTrends(region);
    fetchOpportunities();
    fetchAudiences();
    fetchInvestigations();
    fetchProviderHealth();
  }, [region]);

  // Auto-poll active investigations until complete
  useEffect(() => {
    const hasActive = investigations.some(
      (inv) => inv.status === 'running' || inv.status === 'pending'
    );
    if (!hasActive) return;

    const timer = setInterval(() => {
      fetchInvestigations();
      fetchOpportunities();
      fetchAudiences();
    }, 2500);

    return () => clearInterval(timer);
  }, [investigations]);

  // Handle Region Change
  const handleRegionChange = (newRegion: string) => {
    setRegion(newRegion);
    fetchTrends(newRegion);
  };

  // Refreshing Trends
  const handlePollTrends = async () => {
    setSyncing(true);
    setTrendsRefreshError(null);
    setStatusMsg(`Refreshing trending searches for region=${region}...`);
    try {
      const res = await fetch(`${API_BASE}/trends/poll?region=${region}&limit=20`, {
        method: 'POST'
      });
      if (res.ok) {
        const data = await res.json();
        if (data.trends && Array.isArray(data.trends) && data.trends.length > 0) {
          setTrends(data.trends);
        } else {
          await fetchTrends(region);
        }
        setLastTrendsUpdated(new Date());
        setTrendsRefreshError(null);
        setStatusMsg(`Successfully refreshed ${data.total_fetched || 20} trending topics (${data.qualified_count || 0} qualified for investigation).`);
      } else {
        const errText = `Refresh returned status ${res.status}. Preserving previously cached trends.`;
        setTrendsRefreshError(errText);
        setStatusMsg(errText);
      }
    } catch (err) {
      const errText = 'Network error communicating with trends API. Preserving previously cached trends.';
      setTrendsRefreshError(errText);
      setStatusMsg(errText);
      console.error(err);
    } finally {
      setSyncing(false);
      setTimeout(() => setStatusMsg(''), 6000);
    }
  };

  // View Existing Investigation
  const handleViewInvestigation = (invId?: string) => {
    if (invId) {
      setSelectedInvestigationId(invId);
    }
    setActivePage('investigations');
  };

  // Launch New Investigation
  const handleLaunchInvestigation = async (topic: string, trendId?: string) => {
    if (!topic.trim()) return;
    setInvestigatingId(topic);
    setStatusMsg(`Dispatching autonomous research graph for: "${topic}"...`);
    try {
      const payload: { topic: string; trend_id?: string; related_topics?: string[] } = { topic };
      if (trendId) payload.trend_id = trendId;

      // Find trend in trends state to pass related_topics (trend_breakdown)
      const matchingTrend = trends.find(t => (trendId && t.trend_id === trendId) || t.topic.toLowerCase() === topic.toLowerCase());
      if (matchingTrend && matchingTrend.provider_metrics?.trend_breakdown && matchingTrend.provider_metrics.trend_breakdown.length > 0) {
        payload.related_topics = matchingTrend.provider_metrics.trend_breakdown;
      }

      const res = await fetch(`${API_BASE}/investigations/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        const data = await res.json();
        setStatusMsg(`Investigation queued (ID: ${data.investigation_id}). LangGraph agents researching...`);
        // Refresh and switch to investigations page to monitor progress
        await fetchInvestigations();
        setActivePage('investigations');
      } else {
        const errData = await res.json();
        setStatusMsg(`Failed to launch investigation: ${errData.detail || 'Server error'}`);
      }
    } catch (err) {
      setStatusMsg('Network error starting investigation.');
      console.error(err);
    } finally {
      setInvestigatingId(null);
      setTimeout(() => setStatusMsg(''), 6000);
    }
  };

  // Download PDF Brief
  const handleDownloadPdf = async (oppId: string) => {
    setDownloadingPdfId(oppId);
    try {
      const res = await fetch(`${API_BASE}/opportunities/${oppId}/brief/pdf`);
      if (!res.ok) {
        alert('Failed to generate PDF brief. Please verify opportunity status.');
        return;
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `opportunity_brief_${oppId.slice(0, 8)}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Download error:', err);
      alert('Error downloading PDF.');
    } finally {
      setDownloadingPdfId(null);
    }
  };

  // Stage Opportunity to Content Studio
  const handleStageToStudio = async (oppId: string) => {
    try {
      const res = await fetch(`${API_BASE}/opportunities/${oppId}/select`, {
        method: 'POST'
      });
      if (res.ok) {
        const updated = await res.json();
        // Update local opportunities list
        setOpportunities(prev =>
          prev.map(o => (o.opportunity_id === oppId ? { ...o, status: updated.status } : o))
        );
        if (selectedBrief && selectedBrief.opportunity_id === oppId) {
          setSelectedBrief({ ...selectedBrief, status: updated.status });
        }
        setStatusMsg(`Opportunity staged to Content Studio pipeline.`);
        setTimeout(() => setStatusMsg(''), 4000);
      }
    } catch (err) {
      console.error('Failed to select opportunity:', err);
    }
    // Navigate immediately to studio with the staged opportunity
    setSelectedBrief(null);
    setStagedOpportunityId(oppId);
    setActivePage('studio');
  };

  return (
    <div className="app-layout">
      {/* Persistent Left Sidebar */}
      <Sidebar
        activePage={activePage}
        onSelectPage={setActivePage}
        currentRole={currentRole}
        onChangeRole={setCurrentRole}
        investigationsCount={investigations.length}
        opportunitiesCount={opportunities.length}
      />

      {/* Main Viewport Content Area */}
      <main className="main-viewport">
        {/* Global Notification Banner */}
        {statusMsg && (
          <div
            style={{
              background: 'var(--action-subtle)',
              border: '1px solid #D2E3FC',
              color: 'var(--action-primary)',
              padding: '10px 16px',
              borderRadius: '8px',
              marginBottom: '20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: '0.875rem',
              fontWeight: 500,
              boxShadow: 'var(--shadow-sm)',
              animation: 'fadeIn 0.15s ease-out'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className="pulse-dot" />
              <span>{statusMsg}</span>
            </div>
            <button
              onClick={() => setStatusMsg('')}
              style={{ background: 'none', border: 'none', color: 'var(--action-primary)', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '4px' }}
              title="Dismiss"
            >
              <IconClose size={14} />
            </button>
          </div>
        )}

        {/* View Switcher based on activePage */}
        {activePage === 'overview' && (
          <OverviewPage
            trends={trends}
            opportunities={opportunities}
            investigations={investigations}
            providerHealth={providerHealth}
            lastUpdated={lastTrendsUpdated}
            onNavigateToRadar={() => setActivePage('radar')}
            onNavigateToInvestigations={() => setActivePage('investigations')}
            onNavigateToOpportunities={() => setActivePage('audiences_opps')}
            onSelectBrief={setSelectedBrief}
            onDownloadPdf={handleDownloadPdf}
            onLaunchInvestigation={handleLaunchInvestigation}
            onViewInvestigation={handleViewInvestigation}
          />
        )}

        {activePage === 'radar' && (
          <TrendRadarPage
            trends={trends}
            investigations={investigations}
            region={region}
            lastUpdated={lastTrendsUpdated}
            refreshError={trendsRefreshError}
            onClearRefreshError={() => setTrendsRefreshError(null)}
            onRegionChange={handleRegionChange}
            onPollTrends={handlePollTrends}
            onLaunchInvestigation={handleLaunchInvestigation}
            onViewInvestigation={handleViewInvestigation}
            syncing={syncing}
            investigatingId={investigatingId}
          />
        )}

        {activePage === 'investigations' && (
          <InvestigationsPage
            investigations={investigations}
            selectedInvestigationId={selectedInvestigationId}
            onSelectInvestigationId={setSelectedInvestigationId}
            onRefresh={fetchInvestigations}
            onLaunchNew={(topic) => handleLaunchInvestigation(topic)}
            onSelectEvidence={(ev, label) => setSelectedEvidence({ item: ev, label })}
            onSelectOpportunity={(opp) => setSelectedBrief(opp)}
            onDownloadPdf={handleDownloadPdf}
          />
        )}

        {activePage === 'audiences_opps' && (
          <AudienceOpportunitiesPage
            opportunities={opportunities}
            audiences={audiences}
            onSelectBrief={setSelectedBrief}
            onDownloadPdf={handleDownloadPdf}
            onRefresh={() => {
              fetchOpportunities();
              fetchAudiences();
            }}
            downloadingId={downloadingPdfId}
          />
        )}

        <div style={{ display: activePage === 'studio' ? 'block' : 'none' }}>
          <ContentStudioPage
            opportunities={opportunities}
            onSelectBrief={setSelectedBrief}
            onDownloadPdf={handleDownloadPdf}
            stagedOpportunityId={stagedOpportunityId}
            onClearStagedOpportunity={() => setStagedOpportunityId(null)}
          />
        </div>

        {activePage === 'watchlists' && <WatchlistsPage />}

        {activePage === 'admin' && <AdminPage />}
      </main>

      {/* Slideout Evidence Drawer */}
      <EvidenceDrawer
        evidence={selectedEvidence?.item || null}
        insightLabel={selectedEvidence?.label}
        onClose={() => setSelectedEvidence(null)}
      />

      {/* Opportunity Brief Modal */}
      {selectedBrief && (
        <div className="modal-overlay" onClick={() => setSelectedBrief(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                  <span className="badge badge-cyan">Content Opportunity Brief</span>
                  <span className="badge badge-emerald">Score: {Math.round(selectedBrief.score * 100)}/100</span>
                  {selectedBrief.status && (
                    <span className={`badge ${selectedBrief.status === 'selected' ? 'badge-emerald' : 'badge-blue'}`}>
                      {selectedBrief.status.toUpperCase()}
                    </span>
                  )}
                </div>
                <h2 style={{ fontSize: '1.45rem', color: 'var(--text-primary)', margin: 0, fontWeight: 700 }}>
                  {selectedBrief.title}
                </h2>
              </div>
              <button
                className="btn-outline"
                style={{ padding: '6px 10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                onClick={() => setSelectedBrief(null)}
                title="Close modal"
              >
                <IconClose size={16} />
              </button>
            </div>

            {/* Strategic Background & Rationale */}
            {selectedBrief.strategic_rationale && (
              <div className="brief-section" style={{ borderLeft: '3px solid var(--accent-blue)', background: 'var(--surface-primary)' }}>
                <div className="brief-label">Strategic Context &amp; Market Catalyst</div>
                <div className="brief-value" style={{ lineHeight: 1.6 }}>
                  {selectedBrief.strategic_rationale}
                </div>
              </div>
            )}

            {/* Target Audience & Need */}
            <div className="grid-2" style={{ marginBottom: '16px' }}>
              <div className="brief-section" style={{ margin: 0 }}>
                <div className="brief-label">Target Audience Persona</div>
                <div className="brief-value" style={{ fontWeight: 600 }}>
                  {selectedBrief.audience_label || 'Qualified Demographic Cluster'}
                </div>
                {selectedBrief.audience_description && (
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: '6px', margin: 0 }}>
                    {selectedBrief.audience_description}
                  </p>
                )}
                {selectedBrief.target_audience_pain_points && selectedBrief.target_audience_pain_points.length > 0 && (
                  <div style={{ marginTop: '10px', borderTop: '1px solid var(--border-subtle)', paddingTop: '8px' }}>
                    <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '4px' }}>
                      Key User Frictions
                    </div>
                    <ul style={{ margin: 0, paddingLeft: '16px', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                      {selectedBrief.target_audience_pain_points.map((pt, i) => (
                        <li key={i} style={{ marginBottom: '2px' }}>{pt}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              <div className="brief-section" style={{ margin: 0 }}>
                <div className="brief-label">Target Information Need</div>
                <div className="brief-value">
                  {selectedBrief.audience_need || 'Core knowledge gap demanding verified clarity.'}
                </div>
              </div>
            </div>

            {/* Content Gap & Recommended Angle */}
            <div className="brief-section">
              <div className="brief-label">Detected Competitor / Media Content Void</div>
              <div className="brief-value">
                {selectedBrief.content_gap || selectedBrief.problem || 'Superficial media coverage has failed to address this specific user friction point.'}
              </div>
            </div>

            <div className="brief-section">
              <div className="brief-label">Recommended Editorial Angle &amp; Strategy</div>
              <div className="brief-value" style={{ color: 'var(--brand-teal)' }}>
                {selectedBrief.recommended_angle || 'Create structured explanatory breakdown with step-by-step guidance.'}
              </div>
            </div>

            {/* Key Editorial Talking Points */}
            {selectedBrief.key_talking_points && selectedBrief.key_talking_points.length > 0 && (
              <div className="brief-section">
                <div className="brief-label">Key Editorial Talking Points &amp; Pillars</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '6px' }}>
                  {selectedBrief.key_talking_points.map((tp, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', fontSize: '0.88rem' }}>
                      <span style={{ color: 'var(--brand-teal)', fontWeight: 700 }}>•</span>
                      <span style={{ color: 'var(--text-primary)' }}>{tp}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Recommended Content Outline */}
            {selectedBrief.recommended_outline && selectedBrief.recommended_outline.length > 0 && (
              <div className="brief-section">
                <div className="brief-label">Recommended Content Structure &amp; Outline</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}>
                  {selectedBrief.recommended_outline.map((sec, i) => (
                    <div key={i} style={{ padding: '8px 12px', background: 'var(--surface-primary)', border: '1px solid var(--border-subtle)', borderRadius: '6px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px', flexWrap: 'wrap', gap: '4px' }}>
                        <span style={{ fontWeight: 600, fontSize: '0.88rem', color: 'var(--text-primary)' }}>{sec.section_title}</span>
                        {sec.suggested_visual_or_element && (
                          <span style={{ fontSize: '0.75rem', color: 'var(--accent-blue)', background: 'var(--accent-blue-subtle)', padding: '2px 6px', borderRadius: '4px' }}>
                            {sec.suggested_visual_or_element}
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>{sec.key_takeaway}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Scroll-Stopping Hooks */}
            {selectedBrief.hook_options && selectedBrief.hook_options.length > 0 && (
              <div className="brief-section">
                <div className="brief-label">Scroll-Stopping Hook Options</div>
                <div className="grid-2" style={{ gap: '8px', marginTop: '6px' }}>
                  {selectedBrief.hook_options.map((h, i) => (
                    <div key={i} style={{ padding: '8px 12px', background: 'var(--surface-primary)', border: '1px solid var(--border-subtle)', borderRadius: '6px' }}>
                      <span className="badge badge-cyan" style={{ fontSize: '0.7rem', padding: '1px 6px', marginBottom: '4px', display: 'inline-block' }}>
                        {h.hook_type}
                      </span>
                      <div style={{ fontWeight: 600, fontSize: '0.86rem', color: 'var(--text-primary)', margin: '3px 0' }}>
                        "{h.headline}"
                      </div>
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{h.rationale}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Format & Score Components */}
            <div className="grid-2" style={{ marginBottom: '16px' }}>
              <div className="brief-section" style={{ margin: 0 }}>
                <div className="brief-label">Recommended Formats</div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '4px' }}>
                  <span className="metric-pill metric-pill-cyan" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                    <IconSparkles size={14} />
                    <span>{selectedBrief.recommended_format || 'Visual Campaign Suite'}</span>
                  </span>
                  {selectedBrief.supported_formats && selectedBrief.supported_formats.map((fmt, i) => (
                    <span key={i} className="metric-pill metric-pill-green">
                      {fmt}
                    </span>
                  ))}
                </div>
              </div>

              <div className="brief-section" style={{ margin: 0 }}>
                <div className="brief-label" style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <span>Deterministic Score Breakdown</span>
                  <ScoreTooltip
                    title="Deterministic Scoring Formula"
                    text="Composite opportunity score: 30% Search Velocity + 30% Content Void/Gap + 20% Community Urgency + 10% Freshness + 10% Cross-Source Corroboration."
                    align="right"
                  />
                </div>
                {selectedBrief.score_breakdown ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.82rem', marginTop: '6px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Search Velocity:</span>
                      <span style={{ fontWeight: 600, display: 'inline-flex', alignItems: 'center' }}>
                        <span>{Math.round((selectedBrief.score_breakdown.demand_volume || selectedBrief.score_breakdown.trend_momentum || 0) * 100)}%</span>
                        <ScoreTooltip
                          title="Search Velocity"
                          text="Measures real-time search volume acceleration, keyword growth rate, and query density across Google Trends, Google News, and YouTube."
                          align="right"
                        />
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Content Void / Gap:</span>
                      <span style={{ fontWeight: 600, display: 'inline-flex', alignItems: 'center' }}>
                        <span>{Math.round((selectedBrief.score_breakdown.competition_gap || selectedBrief.score_breakdown.content_gap || 0) * 100)}%</span>
                        <ScoreTooltip
                          title="Content Void / Gap"
                          text="Quantifies the deficit in current media. Higher score indicates existing articles and videos are superficial, outdated, or absent, leaving a high-value void."
                          align="right"
                        />
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Community Urgency:</span>
                      <span style={{ fontWeight: 600, display: 'inline-flex', alignItems: 'center' }}>
                        <span>{Math.round((selectedBrief.score_breakdown.audience_fit || selectedBrief.score_breakdown.audience_demand || 0) * 100)}%</span>
                        <ScoreTooltip
                          title="Community Urgency"
                          text="Measures the intensity of audience friction, unresolved user questions, and readiness to engage, derived from viewer comments and community discussions."
                          align="right"
                        />
                      </span>
                    </div>
                  </div>
                ) : (
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Weighted multi-factor score</div>
                )}
              </div>
            </div>

            {/* Modal Footer Controls */}
            <div style={{ display: 'flex', gap: '12px', marginTop: '24px', flexWrap: 'wrap' }}>
              <button
                className="btn-emerald"
                style={{ flex: 1, minWidth: '200px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                onClick={() => handleDownloadPdf(selectedBrief.opportunity_id)}
                disabled={downloadingPdfId === selectedBrief.opportunity_id}
              >
                <IconFilePdf size={16} />
                <span>{downloadingPdfId === selectedBrief.opportunity_id ? 'Downloading PDF...' : 'Download PDF Brief'}</span>
              </button>

              <button
                className="btn-primary"
                style={{ flex: 1, minWidth: '200px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                onClick={() => handleStageToStudio(selectedBrief.opportunity_id)}
              >
                {selectedBrief.status === 'selected' ? (
                  <>
                    <IconCheck size={16} />
                    <span>Staged to Content Studio</span>
                  </>
                ) : (
                  <>
                    <IconLightning size={16} />
                    <span>Stage for Content Studio</span>
                  </>
                )}
              </button>

              <button className="btn-outline" onClick={() => setSelectedBrief(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
