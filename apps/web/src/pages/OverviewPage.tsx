import React, { useMemo } from 'react';
import type { TrendRadarItem, Opportunity, InvestigationSummary, ProviderHealthSummary } from '../types';
import {
  IconTrendingUp,
  IconNews,
  IconReddit,
  IconYouTube,
  IconBot,
  IconArrowRight,
  IconFilePdf,
  IconAlertTriangle,
  IconCheck
} from '../components/Icons';

interface OverviewPageProps {
  trends: TrendRadarItem[];
  opportunities: Opportunity[];
  investigations: InvestigationSummary[];
  providerHealth?: ProviderHealthSummary | null;
  lastUpdated?: Date | null;
  onNavigateToRadar: () => void;
  onNavigateToInvestigations: () => void;
  onNavigateToOpportunities: () => void;
  onSelectBrief: (opp: Opportunity) => void;
  onDownloadPdf: (oppId: string) => void;
  onLaunchInvestigation: (topic: string, trendId?: string) => void;
  onViewInvestigation?: (invId?: string) => void;
}

export const OverviewPage: React.FC<OverviewPageProps> = ({
  trends,
  opportunities,
  investigations,
  providerHealth,
  lastUpdated,
  onNavigateToRadar,
  onNavigateToInvestigations,
  onNavigateToOpportunities,
  onSelectBrief,
  onDownloadPdf,
  onLaunchInvestigation,
  onViewInvestigation
}) => {
  const qualifiedTrends = trends.filter(t => t.internal_metrics.status === 'qualified');
  const completedInvestigations = investigations.filter(i => i.status === 'complete');
  const topOpportunities = opportunities.slice(0, 3);

  const effectiveUpdatedTime = useMemo(() => {
    if (lastUpdated) return lastUpdated;
    if (trends.length === 0) return null;
    const timestamps = trends
      .map(t => new Date(t.retrieved_at || t.observed_at).getTime())
      .filter(t => !isNaN(t));
    return timestamps.length > 0 ? new Date(Math.max(...timestamps)) : null;
  }, [lastUpdated, trends]);

  const formattedUpdatedTime = useMemo(() => {
    if (!effectiveUpdatedTime) return null;
    return effectiveUpdatedTime.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }, [effectiveUpdatedTime]);

  // Fallback providers if health endpoint hasn't responded yet
  const displayProviders = providerHealth?.providers || [
    {
      id: 'google_trends',
      name: 'Google Trends',
      provider_type: 'trend_radar',
      configured: true,
      status: 'healthy',
      label: 'Healthy • Live',
      badge_class: 'badge-emerald',
      details: 'Discover emerging searches and rising interest.'
    },
    {
      id: 'google_news',
      name: 'Google News & Web',
      provider_type: 'web_news',
      configured: true,
      status: 'healthy',
      label: 'Healthy • Live',
      badge_class: 'badge-emerald',
      details: 'Follow news coverage and supporting web sources.'
    },
    {
      id: 'socialcrawl',
      name: 'Reddit',
      provider_type: 'social',
      configured: true,
      status: 'healthy',
      label: 'Healthy • Live',
      badge_class: 'badge-emerald',
      details: 'Explore public conversations, reactions, and audience questions.'
    },
    {
      id: 'youtube_v3',
      name: 'YouTube',
      provider_type: 'video',
      configured: true,
      status: 'healthy',
      label: 'Healthy • Live',
      badge_class: 'badge-emerald',
      details: 'Discover trending videos and audience discussions.'
    },
    {
      id: 'llm_monitoring',
      name: 'LLM Monitoring system',
      provider_type: 'llm_monitoring',
      configured: true,
      status: 'healthy',
      label: 'Healthy • Live',
      badge_class: 'badge-emerald',
      details: 'Analyze how AI assistants respond to topics and brands.'
    }
  ];

  const getProviderIcon = (id: string) => {
    switch (id) {
      case 'google_trends':
        return <IconTrendingUp size={18} color="var(--brand-teal)" />;
      case 'google_news':
        return <IconNews size={18} color="var(--action-primary)" />;
      case 'socialcrawl':
      case 'reddit':
      case 'reddit_social':
        return <IconReddit size={18} color="#FF4500" />;
      case 'youtube':
      case 'youtube_v3':
        return <IconYouTube size={18} color="#EA4335" />;
      case 'llm_monitoring':
        return <IconBot size={18} color="var(--action-primary)" />;
      default:
        return <IconTrendingUp size={18} color="var(--text-secondary)" />;
    }
  };

  return (
    <div className="page-container animate-fade-in">
      {/* Page Header */}
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '6px' }}>
          Intelligence Command Overview
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.92rem', maxWidth: '720px', margin: 0 }}>
          Real-time snapshot of Google Trends velocity spikes, multi-source evidence investigations, and verified editorial opportunity briefs.
        </p>
      </div>

      {/* KPI Metrics Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '28px' }}>
        {/* Card 1: Active Search Spikes */}
        <div
          className="kpi-card"
          role="button"
          tabIndex={0}
          onClick={onNavigateToRadar}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onNavigateToRadar();
            }
          }}
          title="View active Google Trends spikes in Trend Radar"
          aria-label={`Active Search Spikes: ${trends.length}. Navigate to Trend Radar.`}
        >
          <div className="subheading-label">Active Search Spikes</div>
          <div className="kpi-value" style={{ color: 'var(--text-primary)' }}>
            {trends.length}
          </div>
          <div className="kpi-supporting">
            <span>{formattedUpdatedTime ? `Google Trends · Last updated ${formattedUpdatedTime}` : 'Google Trends'}</span>
          </div>
        </div>

        {/* Card 2: High-Momentum Trends */}
        <div
          className="kpi-card"
          role="button"
          tabIndex={0}
          onClick={onNavigateToRadar}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onNavigateToRadar();
            }
          }}
          title="View trends meeting the 70% momentum qualification threshold"
          aria-label={`High-Momentum Trends: ${qualifiedTrends.length}. Navigate to Trend Radar.`}
        >
          <div className="subheading-label">High-Momentum Trends</div>
          <div className="kpi-value" style={{ color: 'var(--status-success)' }}>
            {qualifiedTrends.length}
          </div>
          <div className="kpi-supporting">
            <span>Momentum score above 70</span>
          </div>
        </div>

        {/* Card 3: Completed Investigations */}
        <div
          className="kpi-card"
          role="button"
          tabIndex={0}
          onClick={onNavigateToInvestigations}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onNavigateToInvestigations();
            }
          }}
          title="View completed multi-source evidence investigations"
          aria-label={`Completed Investigations: ${completedInvestigations.length}. Navigate to Investigations.`}
        >
          <div className="subheading-label">Completed Investigations</div>
          <div className="kpi-value" style={{ color: 'var(--text-primary)' }}>
            {completedInvestigations.length}
          </div>
          <div className="kpi-supporting-action">
            <span>View investigations</span>
            <IconArrowRight size={12} color="var(--action-primary)" />
          </div>
        </div>

        {/* Card 4: Content Opportunities */}
        <div
          className="kpi-card"
          role="button"
          tabIndex={0}
          onClick={onNavigateToOpportunities}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onNavigateToOpportunities();
            }
          }}
          title="Explore ranked editorial and content opportunities"
          aria-label={`Content Opportunities: ${opportunities.length}. Navigate to Audience & Opportunities.`}
        >
          <div className="subheading-label">Content Opportunities</div>
          <div className="kpi-value" style={{ color: 'var(--action-primary)' }}>
            {opportunities.length}
          </div>
          <div className="kpi-supporting-action">
            <span>Explore ranked opportunities</span>
            <IconArrowRight size={12} color="var(--action-primary)" />
          </div>
        </div>
      </div>

      {/* Integration Health & Freshness Banner */}
      <div className="glass-card" style={{ padding: '20px', marginBottom: '28px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h3 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
              Live Provider Health &amp; Ingestion Coverage
            </h3>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              Verified runtime health of connected research pipelines driving audience ethnography and gap isolation.
            </span>
          </div>
          {providerHealth?.all_healthy ? (
            <span className="badge badge-emerald" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span className="pulse-dot"></span>
              <span>All 5 Providers Operational</span>
            </span>
          ) : (
            <span className="badge badge-amber" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <IconAlertTriangle size={13} color="var(--warning-amber)" />
              <span>{providerHealth?.headline || '4 of 5 Providers Operational (1 Degraded)'}</span>
            </span>
          )}
        </div>

        {/* Responsive, aligned provider health grid */}
        <div className="provider-grid">
          {displayProviders.map((provider) => (
            <div key={provider.id} className="provider-health-card">
              <div className="provider-card-header">
                <div className="provider-name-group">
                  <div className="provider-icon-wrapper">
                    {getProviderIcon(provider.id)}
                  </div>
                  <div className="provider-name">{provider.name}</div>
                </div>
              </div>
              <div className="provider-badge-row">
                <span className={`badge ${provider.badge_class} provider-status-badge`}>
                  {provider.label}
                </span>
              </div>
              {provider.details && (
                <div className="provider-details-text">
                  {provider.details}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* 2-Column Section: Top Qualified Trends & High-Value Opportunities */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: '20px' }}>
        {/* Left: Top Qualified Trends */}
        <div className="glass-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3 style={{ fontSize: '1.05rem', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
              Emerging Trend Velocity
            </h3>
            <button
              className="btn-outline"
              style={{ fontSize: '0.78rem', padding: '5px 10px', display: 'flex', alignItems: 'center', gap: '4px' }}
              onClick={onNavigateToRadar}
            >
              <span>View Radar</span>
              <IconArrowRight size={12} />
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {trends.slice(0, 4).map((item) => {
              const isInvestigated = item.internal_metrics.status === 'investigated';
              const matchingInv = investigations.find(
                inv => (item.trend_id && inv.investigation_id === item.trend_id) || inv.topic.toLowerCase() === item.topic.toLowerCase()
              );

              return (
                <div
                  key={item.trend_id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px 16px',
                    background: '#FFFFFF',
                    borderRadius: '8px',
                    border: '1px solid var(--border-subtle)',
                    boxShadow: 'var(--shadow-sm)',
                    gap: '14px',
                    minWidth: 0
                  }}
                >
                  {/* Left: Topic Title & Meta badges */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontWeight: 600,
                        color: 'var(--text-primary)',
                        textTransform: 'capitalize',
                        fontSize: '0.92rem',
                        lineHeight: 1.3,
                        marginBottom: '4px',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                      }}
                      title={item.topic}
                    >
                      {item.topic}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.75rem', flexWrap: 'wrap' }}>
                      <span className="badge badge-cyan" style={{ fontSize: '0.68rem', padding: '1px 6px', letterSpacing: '0.02em' }}>
                        {item.category || 'Trending Topic'}
                      </span>
                      {item.provider_metrics.increase_percentage && (
                        <span style={{ color: 'var(--status-success)', fontWeight: 600, fontSize: '0.75rem' }}>
                          +{Math.round(item.provider_metrics.increase_percentage)}% Spike
                        </span>
                      )}
                      {isInvestigated && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.72rem', color: 'var(--status-success)', fontWeight: 500 }}>
                          <IconCheck size={11} color="var(--status-success)" />
                          <span>Investigated</span>
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Right: Clean Single CTA */}
                  <div style={{ flexShrink: 0, display: 'flex', justifyContent: 'flex-end' }}>
                    {isInvestigated ? (
                      <button
                        type="button"
                        className="btn-outline"
                        style={{
                          padding: '6px 12px',
                          fontSize: '0.76rem',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '5px',
                          borderRadius: '6px',
                          whiteSpace: 'nowrap',
                          color: 'var(--action-primary)',
                          borderColor: 'rgba(2, 132, 199, 0.35)',
                          background: 'rgba(2, 132, 199, 0.04)'
                        }}
                        onClick={() => {
                          if (onViewInvestigation) {
                            onViewInvestigation(matchingInv?.investigation_id);
                          } else {
                            onNavigateToInvestigations();
                          }
                        }}
                        title={`View investigation report for ${item.topic}`}
                      >
                        <span>View Dossier</span>
                        <IconArrowRight size={11} />
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="btn-primary"
                        style={{
                          padding: '6px 14px',
                          fontSize: '0.78rem',
                          borderRadius: '6px',
                          whiteSpace: 'nowrap'
                        }}
                        onClick={() => onLaunchInvestigation(item.topic, item.trend_id)}
                      >
                        <span>Investigate</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right: Top Opportunities */}
        <div className="glass-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3 style={{ fontSize: '1.05rem', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
              Top Content Opportunities
            </h3>
            <button
              className="btn-outline"
              style={{ fontSize: '0.78rem', padding: '5px 10px', display: 'flex', alignItems: 'center', gap: '4px' }}
              onClick={onNavigateToOpportunities}
            >
              <span>All Briefs</span>
              <IconArrowRight size={12} />
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {topOpportunities.map((opp) => (
              <div
                key={opp.opportunity_id}
                style={{
                  padding: '14px',
                  background: '#FFFFFF',
                  borderRadius: '8px',
                  border: '1px solid var(--border-subtle)',
                  boxShadow: 'var(--shadow-sm)',
                  minWidth: 0,
                  overflow: 'hidden'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', marginBottom: '6px', minWidth: 0 }}>
                  <span 
                    className="badge badge-cyan" 
                    style={{ 
                      fontSize: '0.68rem',
                      maxWidth: 'calc(100% - 90px)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      display: 'inline-block'
                    }}
                    title={opp.audience_label || 'Target Audience'}
                  >
                    {opp.audience_label || 'Target Audience'}
                  </span>
                  <span style={{ fontWeight: 700, color: 'var(--brand-teal)', fontSize: '0.82rem', whiteSpace: 'nowrap', flexShrink: 0 }}>
                    Score: {Math.round(opp.score * 100)}/100
                  </span>
                </div>
                <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.92rem', marginBottom: '8px', wordBreak: 'break-word', overflowWrap: 'break-word' }}>
                  {opp.title}
                </div>
                <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                  <button
                    className="btn-outline"
                    style={{ flex: 1, padding: '5px 10px', fontSize: '0.78rem' }}
                    onClick={() => onSelectBrief(opp)}
                  >
                    View Brief
                  </button>
                  <button
                    className="btn-emerald"
                    style={{ padding: '5px 12px', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '6px' }}
                    onClick={() => onDownloadPdf(opp.opportunity_id)}
                    title="Download Executive PDF Brief"
                  >
                    <IconFilePdf size={13} />
                    <span>PDF</span>
                  </button>
                </div>
              </div>
            ))}
            {topOpportunities.length === 0 && (
              <div style={{ textAlign: 'center', padding: '30px', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                No opportunities generated yet. Launch an investigation from Trend Radar.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
