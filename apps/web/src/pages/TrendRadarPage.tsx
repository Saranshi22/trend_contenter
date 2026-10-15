import React, { useState, useMemo } from 'react';
import type { TrendRadarItem } from '../types';
import {
  IconRefresh,
  IconSearch,
  IconTrendingUp,
  IconCheck
} from '../components/Icons';
import { Select } from '../components/Select';

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
          <h1 style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '6px' }}>
            Google Trends Radar
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.92rem', maxWidth: '680px', margin: 0 }}>
            Live trending searches detected via SerpApi Google Trends. Qualify viral momentum and dispatch autonomous research investigations.
          </p>
        </div>
        <button 
          onClick={onPollTrends} 
          className="btn-primary" 
          disabled={syncing}
          style={{ padding: '9px 18px', fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '8px' }}
        >
          <IconRefresh size={15} />
          <span>{syncing ? 'Polling SerpApi...' : 'Poll SerpApi Now'}</span>
        </button>
      </div>

      {/* Filter & Controls Bar */}
      <div className="glass-card" style={{ padding: '16px 20px', marginBottom: '24px' }}>
        <div className="filter-bar-grid">
          {/* Search Query */}
          <div className="filter-field-group">
            <label htmlFor="filter-search-query" className="filter-field-label">Search Query</label>
            <input
              id="filter-search-query"
              type="text"
              placeholder="Filter topics..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="input-glass"
            />
          </div>

          {/* Region */}
          <div className="filter-field-group">
            <label htmlFor="filter-region" className="filter-field-label">Region</label>
            <Select
              id="filter-region"
              value={region}
              onChange={(e) => onRegionChange(e.target.value)}
              aria-label="Filter trends by region"
            >
              <option value="IN">India (IN)</option>
              <option value="US">United States (US)</option>
              <option value="GB">United Kingdom (GB)</option>
            </Select>
          </div>

          {/* Category */}
          <div className="filter-field-group">
            <label htmlFor="filter-category" className="filter-field-label">Category</label>
            <Select
              id="filter-category"
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              aria-label="Filter trends by category"
            >
              <option value="all">All Categories</option>
              {categories.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </Select>
          </div>

          {/* Trend Stage */}
          <div className="filter-field-group">
            <label htmlFor="filter-trend-stage" className="filter-field-label">Trend Stage</label>
            <Select
              id="filter-trend-stage"
              value={selectedStage}
              onChange={(e) => setSelectedStage(e.target.value)}
              aria-label="Filter trends by stage"
            >
              <option value="all">All Stages</option>
              <option value="New">New</option>
              <option value="Emerging">Emerging</option>
              <option value="Accelerating">Accelerating</option>
              <option value="Peak">Peak</option>
              <option value="Declining">Declining</option>
            </Select>
          </div>

          {/* Sort By */}
          <div className="filter-field-group">
            <label htmlFor="filter-sort-by" className="filter-field-label">Sort By</label>
            <Select
              id="filter-sort-by"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              aria-label="Sort trends"
            >
              <option value="score">Qualification Score</option>
              <option value="spike">Percentage Spike</option>
              <option value="volume">Search Volume</option>
            </Select>
          </div>
        </div>
      </div>

      {/* Grid of Trend Cards */}
      <div className="radar-grid">
        {filteredTrends.map((item) => {
          const isQualified = item.internal_metrics.status === 'qualified';
          const isInvestigating = investigatingId === item.trend_id || investigatingId === item.topic;
          const isInvestigated = item.internal_metrics.status === 'investigated';
          const qualPct = Math.round(item.internal_metrics.qualification_score * 100);
          const stage = getTrendStage(item);

          return (
            <div key={item.trend_id} className="trend-card">
              <div>
                {/* Header: Category & Stage */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <span className="badge badge-cyan" style={{ fontSize: '0.72rem' }}>
                    {item.category || 'Trending Topic'}
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span 
                      className={`badge ${
                        stage === 'Peak' ? 'badge-emerald' :
                        stage === 'Accelerating' ? 'badge-cyan' :
                        stage === 'Emerging' ? 'badge-blue' : 'badge-amber'
                      }`}
                      style={{ fontSize: '0.68rem' }}
                    >
                      {stage}
                    </span>
                    <span className={`badge ${isInvestigated ? 'badge-emerald' : isQualified ? 'badge-cyan' : 'badge-amber'}`} style={{ fontSize: '0.68rem' }}>
                      {item.internal_metrics.status.toUpperCase()}
                    </span>
                  </div>
                </div>

                {/* Topic Title */}
                <h3 style={{ fontSize: '1.15rem', fontWeight: 600, marginBottom: '12px', color: 'var(--text-primary)', textTransform: 'capitalize' }}>
                  {item.topic}
                </h3>

                {/* Provider Metrics (Clean White Surface) */}
                <div style={{ marginBottom: '14px', background: '#FFFFFF', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--border-subtle)', boxShadow: 'var(--shadow-sm)' }}>
                  <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', marginBottom: '6px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    Live Search Velocity
                  </div>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {item.provider_metrics.search_volume !== null && (
                      <span className="metric-pill metric-pill-cyan" style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                        <IconSearch size={12} />
                        <span>{item.provider_metrics.search_volume.toLocaleString()}+ searches</span>
                      </span>
                    )}
                    {item.provider_metrics.increase_percentage !== null && (
                      <span className="metric-pill metric-pill-green" style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                        <IconTrendingUp size={12} />
                        <span>+{Math.round(item.provider_metrics.increase_percentage)}% Spike</span>
                      </span>
                    )}
                  </div>
                </div>

                {/* Qualification Ring vs Weights */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                  <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                    <div>Momentum: <strong style={{ color: qualPct >= 70 ? 'var(--status-success)' : 'var(--text-primary)' }}>{qualPct}/100</strong></div>
                    <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                      0.35 Vel + 0.25 Acc + 0.20 Nov
                    </div>
                  </div>
                  <div className="score-display" style={{ '--score': qualPct } as React.CSSProperties}>
                    <div className="score-inner">{qualPct}</div>
                  </div>
                </div>

                {/* Related breakdown terms */}
                {item.provider_metrics.trend_breakdown && item.provider_metrics.trend_breakdown.length > 0 && (
                  <div style={{ marginBottom: '14px' }}>
                    <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', marginBottom: '5px', fontWeight: 500 }}>
                      Related Searches:
                    </div>
                    <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
                      {item.provider_metrics.trend_breakdown.slice(0, 3).map((term, i) => (
                        <span key={i} style={{ fontSize: '0.72rem', background: '#FFFFFF', border: '1px solid var(--border-subtle)', padding: '2px 7px', borderRadius: '4px', color: 'var(--text-secondary)' }}>
                          {term}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Card Action */}
              <div style={{ marginTop: '14px', borderTop: '1px solid var(--border-subtle)', paddingTop: '14px' }}>
                {isInvestigated ? (
                  <div 
                    className="badge badge-emerald" 
                    style={{ 
                      width: '100%', 
                      fontSize: '0.82rem', 
                      padding: '8px 12px', 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'center', 
                      gap: '6px',
                      borderRadius: '6px',
                      fontWeight: 500
                    }}
                  >
                    <IconCheck size={14} color="var(--status-success)" />
                    <span>Investigation Complete</span>
                  </div>
                ) : (
                  <button 
                    className="btn-primary" 
                    style={{ width: '100%', fontSize: '0.85rem', padding: '8px 12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                    onClick={() => onLaunchInvestigation(item.topic, item.trend_id)}
                    disabled={isInvestigating}
                  >
                    {isInvestigating ? (
                      <>
                        <span className="pulse-dot" />
                        <span>Agents Investigating...</span>
                      </>
                    ) : (
                      <>
                        <IconTrendingUp size={14} />
                        <span>Launch Investigation</span>
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {filteredTrends.length === 0 && (
        <div className="glass-card" style={{ textAlign: 'center', padding: '50px 20px' }}>
          <h3 style={{ fontSize: '1.1rem', color: 'var(--text-primary)', marginBottom: '6px' }}>
            No Trends Found Matching Filters
          </h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', margin: 0 }}>
            Try clearing search queries or switching the selected region.
          </p>
        </div>
      )}
    </div>
  );
};
