import React, { useState, useMemo } from 'react';
import type { TrendRadarItem } from '../types';

interface TrendRadarPageProps {
  trends: TrendRadarItem[];
  region: string;
  onRegionChange: (reg: string) => void;
  onPollTrends: () => void;
  onLaunchInvestigation: (topic: string, trendId?: string) => void;
  syncing: boolean;
  investigatingId: string | null;
}

export const TrendRadarPage: React.FC<TrendRadarPageProps> = ({
  trends,
  region,
  onRegionChange,
  onPollTrends,
  onLaunchInvestigation,
  syncing,
  investigatingId
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedStage, setSelectedStage] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'score' | 'volume' | 'spike'>('score');

  // Compute trend stages deterministically from metrics
  const getTrendStage = (item: TrendRadarItem): 'New' | 'Emerging' | 'Accelerating' | 'Peak' | 'Declining' => {
    const spike = item.provider_metrics.increase_percentage || 0;
    const vol = item.provider_metrics.search_volume || 0;
    const qual = item.internal_metrics.qualification_score || 0;

    if (qual >= 0.85 && vol >= 10000) return 'Peak';
    if (spike >= 200 || qual >= 0.70) return 'Accelerating';
    if (spike >= 50 || vol >= 1000) return 'Emerging';
    if (spike < 0) return 'Declining';
    return 'New';
  };

  const categories = useMemo(() => {
    const set = new Set<string>();
    trends.forEach(t => {
      if (t.category) set.add(t.category);
    });
    return Array.from(set);
  }, [trends]);

  const filteredTrends = useMemo(() => {
    return trends
      .filter(item => {
        const matchesSearch = item.topic.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (item.category && item.category.toLowerCase().includes(searchQuery.toLowerCase()));
        const matchesCategory = selectedCategory === 'all' || item.category === selectedCategory;
        const stage = getTrendStage(item);
        const matchesStage = selectedStage === 'all' || stage === selectedStage;
        return matchesSearch && matchesCategory && matchesStage;
      })
      .sort((a, b) => {
        if (sortBy === 'score') {
          return b.internal_metrics.qualification_score - a.internal_metrics.qualification_score;
        }
        if (sortBy === 'volume') {
          return (b.provider_metrics.search_volume || 0) - (a.provider_metrics.search_volume || 0);
        }
        if (sortBy === 'spike') {
          return (b.provider_metrics.increase_percentage || 0) - (a.provider_metrics.increase_percentage || 0);
        }
        return 0;
      });
  }, [trends, searchQuery, selectedCategory, selectedStage, sortBy]);

  return (
    <div className="page-container animate-fade-in">
      {/* Page Title */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '2.2rem', marginBottom: '8px' }}>Google Trends Radar</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '1rem', maxWidth: '680px' }}>
            Live trending searches detected via SerpApi Google Trends. Qualify viral momentum and trigger autonomous research investigations.
          </p>
        </div>
        <button 
          onClick={onPollTrends} 
          className="btn-primary" 
          disabled={syncing}
          style={{ padding: '12px 24px', fontSize: '0.95rem' }}
        >
          {syncing ? '↻ Polling SerpApi...' : '↻ Poll SerpApi Now'}
        </button>
      </div>

      {/* Filter & Controls Bar */}
      <div className="glass-card" style={{ padding: '20px', marginBottom: '28px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px', alignItems: 'center' }}>
          {/* Search */}
          <div>
            <div className="subheading-label">Search Query</div>
            <input
              type="text"
              placeholder="Filter topics..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="input-glass"
              style={{ padding: '8px 12px', fontSize: '0.9rem' }}
            />
          </div>

          {/* Region */}
          <div>
            <div className="subheading-label">Region</div>
            <select
              value={region}
              onChange={(e) => onRegionChange(e.target.value)}
              className="input-glass"
              style={{ padding: '8px 12px', fontSize: '0.9rem' }}
            >
              <option value="IN" style={{ background: '#111827' }}>India (IN)</option>
              <option value="US" style={{ background: '#111827' }}>United States (US)</option>
              <option value="GB" style={{ background: '#111827' }}>United Kingdom (GB)</option>
            </select>
          </div>

          {/* Category */}
          <div>
            <div className="subheading-label">Category</div>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="input-glass"
              style={{ padding: '8px 12px', fontSize: '0.9rem' }}
            >
              <option value="all" style={{ background: '#111827' }}>All Categories</option>
              {categories.map(c => (
                <option key={c} value={c} style={{ background: '#111827' }}>{c}</option>
              ))}
            </select>
          </div>

          {/* Trend Stage */}
          <div>
            <div className="subheading-label">Trend Stage</div>
            <select
              value={selectedStage}
              onChange={(e) => setSelectedStage(e.target.value)}
              className="input-glass"
              style={{ padding: '8px 12px', fontSize: '0.9rem' }}
            >
              <option value="all" style={{ background: '#111827' }}>All Stages</option>
              <option value="New" style={{ background: '#111827' }}>New</option>
              <option value="Emerging" style={{ background: '#111827' }}>Emerging</option>
              <option value="Accelerating" style={{ background: '#111827' }}>Accelerating</option>
              <option value="Peak" style={{ background: '#111827' }}>Peak</option>
              <option value="Declining" style={{ background: '#111827' }}>Declining</option>
            </select>
          </div>

          {/* Sort By */}
          <div>
            <div className="subheading-label">Sort By</div>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="input-glass"
              style={{ padding: '8px 12px', fontSize: '0.9rem' }}
            >
              <option value="score" style={{ background: '#111827' }}>Qualification Score</option>
              <option value="spike" style={{ background: '#111827' }}>Percentage Spike</option>
              <option value="volume" style={{ background: '#111827' }}>Search Volume</option>
            </select>
          </div>
        </div>
      </div>

      {/* Grid of Trend Cards */}
      <div className="radar-grid">
        {filteredTrends.map((item) => {
          const isQualified = item.internal_metrics.status === 'qualified';
          const isInvestigating = investigatingId === item.trend_id;
          const isInvestigated = item.internal_metrics.status === 'investigated';
          const qualPct = Math.round(item.internal_metrics.qualification_score * 100);
          const stage = getTrendStage(item);

          return (
            <div key={item.trend_id} className="trend-card">
              <div>
                {/* Header: Category & Stage */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <span className="badge badge-cyan" style={{ fontSize: '0.75rem' }}>
                    {item.category || 'Trending Topic'}
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span 
                      className={`badge ${
                        stage === 'Peak' ? 'badge-emerald' :
                        stage === 'Accelerating' ? 'badge-cyan' :
                        stage === 'Emerging' ? 'badge-blue' : 'badge-amber'
                      }`}
                      style={{ fontSize: '0.7rem' }}
                    >
                      {stage}
                    </span>
                    <span className={`badge ${isInvestigated ? 'badge-emerald' : isQualified ? 'badge-cyan' : 'badge-amber'}`} style={{ fontSize: '0.7rem' }}>
                      {item.internal_metrics.status.toUpperCase()}
                    </span>
                  </div>
                </div>

                {/* Topic Title */}
                <h3 style={{ fontSize: '1.25rem', marginBottom: '14px', color: '#fff', textTransform: 'capitalize' }}>
                  {item.topic}
                </h3>

                {/* Provider Metrics */}
                <div style={{ marginBottom: '16px', background: 'rgba(255,255,255,0.02)', padding: '12px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.05)' }}>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    SerpApi Live Metrics
                  </div>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {item.provider_metrics.search_volume !== null && (
                      <span className="metric-pill metric-pill-cyan">
                        🔍 {item.provider_metrics.search_volume.toLocaleString()}+ searches
                      </span>
                    )}
                    {item.provider_metrics.increase_percentage !== null && (
                      <span className="metric-pill metric-pill-green">
                        ↗ +{Math.round(item.provider_metrics.increase_percentage)}% Spike
                      </span>
                    )}
                  </div>
                </div>

                {/* Qualification Ring vs Weights */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                    <div>Qualification: <strong style={{ color: qualPct >= 70 ? 'var(--accent-emerald)' : '#fff' }}>{qualPct}/100</strong></div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                      0.35 Vel + 0.25 Acc + 0.20 Nov
                    </div>
                  </div>
                  <div className="score-display" style={{ '--score': qualPct } as React.CSSProperties}>
                    <div className="score-inner">{qualPct}</div>
                  </div>
                </div>

                {/* Related breakdown terms */}
                {item.provider_metrics.trend_breakdown && item.provider_metrics.trend_breakdown.length > 0 && (
                  <div style={{ marginBottom: '16px' }}>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '6px' }}>
                      Related Searches:
                    </div>
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                      {item.provider_metrics.trend_breakdown.slice(0, 3).map((term, i) => (
                        <span key={i} style={{ fontSize: '0.75rem', background: 'rgba(255,255,255,0.05)', padding: '2px 8px', borderRadius: '4px', color: 'var(--text-secondary)' }}>
                          {term}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Card Action */}
              <div style={{ marginTop: '16px', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '16px' }}>
                <button 
                  className="btn-primary" 
                  style={{ width: '100%', fontSize: '0.9rem', padding: '10px' }}
                  onClick={() => onLaunchInvestigation(item.topic, item.trend_id)}
                  disabled={isInvestigating || isInvestigated}
                >
                  {isInvestigated ? '✓ Investigation Complete' : isInvestigating ? 'Agents Investigating...' : '⚡ Launch Investigation'}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {filteredTrends.length === 0 && (
        <div className="glass-card" style={{ textAlign: 'center', padding: '60px' }}>
          <h3>No Trends Found Matching Filters</h3>
          <p style={{ color: 'var(--text-secondary)', marginTop: '8px' }}>
            Try clearing search queries or switching the selected region.
          </p>
        </div>
      )}
    </div>
  );
};
