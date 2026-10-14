import React from 'react';
import type { TrendRadarItem, Opportunity, InvestigationSummary } from '../types';

interface OverviewPageProps {
  trends: TrendRadarItem[];
  opportunities: Opportunity[];
  investigations: InvestigationSummary[];
  onNavigateToRadar: () => void;
  onNavigateToInvestigations: () => void;
  onNavigateToOpportunities: () => void;
  onSelectBrief: (opp: Opportunity) => void;
  onDownloadPdf: (oppId: string) => void;
  onLaunchInvestigation: (topic: string, trendId?: string) => void;
}

export const OverviewPage: React.FC<OverviewPageProps> = ({
  trends,
  opportunities,
  investigations,
  onNavigateToRadar,
  onNavigateToInvestigations,
  onNavigateToOpportunities,
  onSelectBrief,
  onDownloadPdf,
  onLaunchInvestigation
}) => {
  const qualifiedTrends = trends.filter(t => t.internal_metrics.status === 'qualified');
  const completedInvestigations = investigations.filter(i => i.status === 'complete');
  const topOpportunities = opportunities.slice(0, 3);

  return (
    <div className="page-container animate-fade-in">
      {/* Page Header */}
      <div style={{ marginBottom: '28px' }}>
        <h1 style={{ fontSize: '2.2rem', marginBottom: '8px' }}>Intelligence Command Overview</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '1rem', maxWidth: '720px' }}>
          Real-time snapshot of Google Trends velocity spikes, autonomous research workflows, and verified audience content opportunities.
        </p>
      </div>

      {/* KPI Metrics Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '18px', marginBottom: '32px' }}>
        <div className="glass-card" style={{ padding: '20px' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>
            Active Search Spikes
          </div>
          <div style={{ fontSize: '2rem', fontWeight: 800, color: '#fff', fontFamily: 'Outfit' }}>
            {trends.length}
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--accent-cyan)', marginTop: '4px' }}>
            📡 SerpApi Google Trends Live
          </div>
        </div>

        <div className="glass-card" style={{ padding: '20px' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>
            Qualified High Momentum
          </div>
          <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--accent-emerald)', fontFamily: 'Outfit' }}>
            {qualifiedTrends.length}
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
            Score Threshold &gt; 70%
          </div>
        </div>

        <div className="glass-card" style={{ padding: '20px', cursor: 'pointer' }} onClick={onNavigateToInvestigations}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>
            Completed Investigations
          </div>
          <div style={{ fontSize: '2rem', fontWeight: 800, color: '#fff', fontFamily: 'Outfit' }}>
            {completedInvestigations.length}
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--accent-cyan)', marginTop: '4px' }}>
            LangGraph Multi-Agent Workflows →
          </div>
        </div>

        <div className="glass-card" style={{ padding: '20px' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>
            Ranked Opportunities
          </div>
          <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--accent-emerald)', fontFamily: 'Outfit' }}>
            {opportunities.length}
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
            Ready for Content Studio
          </div>
        </div>
      </div>

      {/* Integration Health & Freshness Banner */}
      <div className="glass-card" style={{ padding: '20px', marginBottom: '32px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h3 style={{ fontSize: '1.1rem', margin: 0 }}>Channel Ingestion &amp; Evidence Coverage</h3>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              Provenance sources driving audience segmentation and opportunity qualification.
            </span>
          </div>
          <span className="badge badge-emerald" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span className="pulse-dot"></span> All 4 Providers Active
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
          <div className="metric-pill metric-pill-cyan" style={{ padding: '10px 14px', borderRadius: '10px', justifyContent: 'space-between' }}>
            <span>📡 Google Trends (SerpApi)</span>
            <span style={{ fontWeight: 700 }}>Active</span>
          </div>
          <div className="metric-pill metric-pill-green" style={{ padding: '10px 14px', borderRadius: '10px', justifyContent: 'space-between' }}>
            <span>📰 Google News &amp; Web</span>
            <span style={{ fontWeight: 700 }}>Active</span>
          </div>
          <div className="metric-pill metric-pill-cyan" style={{ padding: '10px 14px', borderRadius: '10px', justifyContent: 'space-between' }}>
            <span>💬 Reddit Social Research</span>
            <span style={{ fontWeight: 700 }}>Active</span>
          </div>
          <div className="metric-pill metric-pill-green" style={{ padding: '10px 14px', borderRadius: '10px', justifyContent: 'space-between' }}>
            <span>🤖 LLM Answer Monitoring</span>
            <span style={{ fontWeight: 700 }}>Active</span>
          </div>
        </div>
      </div>

      {/* 2-Column Section: Top Qualified Trends & High-Value Opportunities */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: '24px' }}>
        {/* Left: Top Qualified Trends */}
        <div className="glass-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3 style={{ fontSize: '1.2rem', margin: 0 }}>Emerging Trend Velocity</h3>
            <button className="btn-outline" style={{ fontSize: '0.8rem', padding: '6px 12px' }} onClick={onNavigateToRadar}>
              View Radar →
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {trends.slice(0, 4).map((item) => {
              const qualScore = Math.round(item.internal_metrics.qualification_score * 100);
              return (
                <div key={item.trend_id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', background: 'rgba(255,255,255,0.03)', borderRadius: '10px', border: '1px solid var(--border-glass)' }}>
                  <div>
                    <div style={{ fontWeight: 600, color: '#fff', textTransform: 'capitalize', fontSize: '0.95rem' }}>
                      {item.topic}
                    </div>
                    <div style={{ display: 'flex', gap: '8px', marginTop: '4px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      <span>{item.category || 'Trending'}</span>
                      {item.provider_metrics.increase_percentage && (
                        <span style={{ color: 'var(--accent-emerald)' }}>
                          +{Math.round(item.provider_metrics.increase_percentage)}% Spike
                        </span>
                      )}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontWeight: 700, fontSize: '0.9rem', color: qualScore >= 70 ? 'var(--accent-emerald)' : '#fff' }}>
                        {qualScore}%
                      </div>
                      <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Qual Score</div>
                    </div>
                    <button
                      className="btn-primary"
                      style={{ padding: '6px 12px', fontSize: '0.75rem' }}
                      onClick={() => onLaunchInvestigation(item.topic, item.trend_id)}
                      disabled={item.internal_metrics.status === 'investigated'}
                    >
                      {item.internal_metrics.status === 'investigated' ? 'Complete' : 'Investigate'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right: Top Opportunities */}
        <div className="glass-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3 style={{ fontSize: '1.2rem', margin: 0 }}>Top Content Opportunities</h3>
            <button className="btn-outline" style={{ fontSize: '0.8rem', padding: '6px 12px' }} onClick={onNavigateToOpportunities}>
              All Briefs →
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {topOpportunities.map((opp) => (
              <div key={opp.opportunity_id} style={{ padding: '14px', background: 'rgba(255,255,255,0.03)', borderRadius: '10px', border: '1px solid var(--border-glass)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
                  <span className="badge badge-cyan" style={{ fontSize: '0.7rem' }}>
                    {opp.audience_label || 'Target Audience'}
                  </span>
                  <span style={{ fontWeight: 700, color: 'var(--accent-emerald)', fontSize: '0.9rem' }}>
                    {Math.round(opp.score * 100)} / 100
                  </span>
                </div>
                <div style={{ fontWeight: 600, color: '#fff', fontSize: '0.95rem', marginBottom: '6px' }}>
                  {opp.title}
                </div>
                <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                  <button
                    className="btn-primary"
                    style={{ flex: 1, padding: '6px 10px', fontSize: '0.8rem', background: 'rgba(255,255,255,0.05)', color: 'var(--accent-cyan)', border: '1px solid var(--border-light)', boxShadow: 'none' }}
                    onClick={() => onSelectBrief(opp)}
                  >
                    View Brief
                  </button>
                  <button
                    className="btn-emerald"
                    style={{ padding: '6px 12px', fontSize: '0.8rem' }}
                    onClick={() => onDownloadPdf(opp.opportunity_id)}
                    title="Download Executive PDF Brief"
                  >
                    📄 PDF
                  </button>
                </div>
              </div>
            ))}
            {topOpportunities.length === 0 && (
              <div style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                No opportunities generated yet. Launch an investigation from Trend Radar.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
