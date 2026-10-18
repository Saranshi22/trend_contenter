import React, { useState, useMemo, useEffect, useRef } from 'react';
import type { TrendRadarItem, InvestigationSummary } from '../types';
import {
  IconRefresh,
  IconSearch,
  IconTrendingUp,
  IconCheck,
  IconClose,
  IconClock,
  IconInfo,
  IconArrowRight,
  IconAlertTriangle
} from '../components/Icons';
import { Select } from '../components/Select';

interface TrendRadarPageProps {
  trends: TrendRadarItem[];
  investigations?: InvestigationSummary[];
  region: string;
  lastUpdated?: Date | null;
  refreshError?: string | null;
  onClearRefreshError?: () => void;
  onRegionChange: (reg: string) => void;
  onPollTrends: () => void;
  onLaunchInvestigation: (topic: string, trendId?: string) => void;
  onViewInvestigation?: (invId?: string) => void;
  syncing: boolean;
  investigatingId: string | null;
}

interface FreshnessState {
  label: 'Fresh' | 'Recent' | 'Aging' | 'Stale' | 'Unknown';
  badgeClass: string;
  tooltip: string;
  relativeText: string;
}

function getFreshnessState(date: Date | string | null | undefined): FreshnessState {
  if (!date) {
    return {
      label: 'Unknown',
      badgeClass: 'badge-neutral',
      tooltip: 'No sync timestamp recorded',
      relativeText: 'Timestamp unavailable'
    };
  }

  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) {
    return {
      label: 'Unknown',
      badgeClass: 'badge-neutral',
      tooltip: 'Invalid timestamp format',
      relativeText: 'Timestamp unavailable'
    };
  }

  const now = new Date();
  const diffMinutes = Math.floor((now.getTime() - d.getTime()) / (1000 * 60));
  const diffSec = Math.floor((now.getTime() - d.getTime()) / 1000);

  let relativeText = 'Just now';
  if (diffSec >= 60 && diffSec < 3600) {
    relativeText = `${Math.floor(diffSec / 60)}m ago`;
  } else if (diffSec >= 3600 && diffSec < 86400) {
    relativeText = `${Math.floor(diffSec / 3600)}h ago`;
  } else if (diffSec >= 86400) {
    relativeText = `${Math.floor(diffSec / 86400)}d ago`;
  }

  const formattedDate = d.toLocaleString([], {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });

  if (diffMinutes < 30) {
    return {
      label: 'Fresh',
      badgeClass: 'badge-emerald',
      tooltip: `Verified fresh (${relativeText}) · Last retrieval: ${formattedDate}`,
      relativeText: `Updated ${relativeText}`
    };
  }

  if (diffMinutes < 180) {
    return {
      label: 'Recent',
      badgeClass: 'badge-cyan',
      tooltip: `Recent snapshot (${relativeText}) · Last retrieval: ${formattedDate}`,
      relativeText: `Updated ${relativeText}`
    };
  }

  if (diffMinutes < 1440) {
    return {
      label: 'Aging',
      badgeClass: 'badge-amber',
      tooltip: `Data is aging (${relativeText}) · Consider refreshing · Last retrieval: ${formattedDate}`,
      relativeText: `Updated ${relativeText}`
    };
  }

  return {
    label: 'Stale',
    badgeClass: 'badge-neutral',
    tooltip: `Data is stale (>24h old) · Last retrieval: ${formattedDate}`,
    relativeText: `Updated ${relativeText}`
  };
}

export const TrendRadarPage: React.FC<TrendRadarPageProps> = ({
  trends,
  investigations = [],
  region,
  lastUpdated,
  refreshError,
  onClearRefreshError,
  onRegionChange,
  onPollTrends,
  onLaunchInvestigation,
  onViewInvestigation,
  syncing,
  investigatingId
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedStage, setSelectedStage] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'score' | 'volume' | 'spike'>('score');
  const [activeInfoTrendId, setActiveInfoTrendId] = useState<string | null>(null);

  const popoverRef = useRef<HTMLDivElement | null>(null);

  // Close info popover when clicking outside or pressing Escape
  useEffect(() => {
    if (!activeInfoTrendId) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setActiveInfoTrendId(null);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setActiveInfoTrendId(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [activeInfoTrendId]);

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
    return Array.from(set).sort();
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

  const isFilterActive = searchQuery.trim() !== '' || selectedCategory !== 'all' || selectedStage !== 'all' || sortBy !== 'score' || region !== 'IN';

  const handleResetFilters = () => {
    setSearchQuery('');
    setSelectedCategory('all');
    setSelectedStage('all');
    setSortBy('score');
    if (region !== 'IN') {
      onRegionChange('IN');
    }
  };

  // Determine latest observation timestamp from dataset if explicit lastUpdated is absent
  const effectiveUpdatedTime = useMemo(() => {
    if (lastUpdated) return lastUpdated;
    if (trends.length === 0) return null;
    const timestamps = trends
      .map(t => new Date(t.retrieved_at || t.observed_at).getTime())
      .filter(t => !isNaN(t));
    return timestamps.length > 0 ? new Date(Math.max(...timestamps)) : null;
  }, [lastUpdated, trends]);

  // Derived freshness based on verified threshold policy
  const freshness = useMemo(() => {
    return getFreshnessState(effectiveUpdatedTime);
  }, [effectiveUpdatedTime]);

  return (
    <div className="page-container animate-fade-in">
      {/* Page Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '6px' }}>
            Google Trends Radar
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.92rem', maxWidth: '680px', margin: 0 }}>
            Real-time search breakout velocity and viral momentum qualification. Identify emerging editorial angles and dispatch autonomous research investigations.
          </p>
        </div>

        {/* Refresh & Freshness Control Group */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {/* Last Updated Timestamp & Freshness Indicator */}
            {effectiveUpdatedTime && (
              <div 
                style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}
                title={freshness.tooltip}
              >
                <IconClock size={13} color="var(--text-muted)" />
                <span>{freshness.relativeText}</span>
                <span className={`badge ${freshness.badgeClass}`} style={{ fontSize: '0.65rem', padding: '1px 6px' }}>
                  {freshness.label}
                </span>
              </div>
            )}

            <button 
              onClick={onPollTrends} 
              className="btn-primary" 
              disabled={syncing}
              aria-label="Refresh trends from provider"
              style={{ padding: '8px 16px', fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '8px', whiteSpace: 'nowrap' }}
            >
              <IconRefresh size={15} className={syncing ? 'spin-animation' : ''} />
              <span>{syncing ? 'Refreshing trends...' : 'Refresh trends'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Useful Error Alert (Preserving existing trends) */}
      {refreshError && (
        <div 
          className="glass-card" 
          style={{ 
            borderColor: 'var(--warning-amber)', 
            background: 'rgba(245, 158, 11, 0.08)', 
            padding: '12px 18px', 
            marginBottom: '20px', 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'space-between',
            gap: '12px'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <IconAlertTriangle size={18} color="var(--warning-amber)" />
            <span style={{ fontSize: '0.85rem', color: 'var(--text-primary)' }}>
              {refreshError}
            </span>
          </div>
          {onClearRefreshError && (
            <button
              onClick={onClearRefreshError}
              style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px' }}
              title="Dismiss error message"
            >
              <IconClose size={14} />
            </button>
          )}
        </div>
      )}

      {/* Filter & Controls Bar */}
      <div className="glass-card" style={{ padding: '14px 18px', marginBottom: '20px' }}>
        <div className="filter-bar-grid">
          {/* Search Query with Inside Clear Icon */}
          <div className="filter-field-group">
            <label htmlFor="filter-search-query" className="filter-field-label">Search Query</label>
            <div className="search-input-wrapper">
              <span className="search-input-icon">
                <IconSearch size={14} />
              </span>
              <input
                id="filter-search-query"
                type="text"
                placeholder="Filter topics or categories..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="input-glass"
              />
              {searchQuery && (
                <button
                  type="button"
                  className="search-clear-btn"
                  onClick={() => setSearchQuery('')}
                  aria-label="Clear search text"
                  title="Clear search"
                >
                  <IconClose size={13} />
                </button>
              )}
            </div>
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

        {/* Dynamic Filter Status Bar, Qualification Info & Reset Action */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '12px', paddingTop: '10px', borderTop: '1px solid var(--border-subtle)', flexWrap: 'wrap', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
              {isFilterActive ? (
                <span>Showing <strong>{filteredTrends.length}</strong> of <strong>{trends.length}</strong> trends</span>
              ) : (
                <span><strong>{trends.length}</strong> trends identified</span>
              )}
            </div>
            <span style={{ color: 'var(--border-strong)', fontSize: '0.8rem' }}>•</span>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              Qualification threshold: <strong style={{ color: 'var(--text-primary)' }}>Momentum ≥ 70</strong>
            </div>
          </div>

          {isFilterActive && (
            <button
              type="button"
              onClick={handleResetFilters}
              className="btn-outline"
              style={{ fontSize: '0.78rem', padding: '4px 12px', borderRadius: '6px' }}
            >
              Reset filters
            </button>
          )}
        </div>
      </div>

      {/* Grid of Trend Cards */}
      <div className="radar-grid">
        {filteredTrends.map((item) => {
          // Accurate matching with backend investigation records
          const matchingInv = investigations.find(inv => 
            (item.trend_id && inv.investigation_id === item.trend_id) ||
            inv.topic.toLowerCase() === item.topic.toLowerCase()
          );

          const isInvestigating = investigatingId === item.trend_id || 
            investigatingId === item.topic || 
            matchingInv?.status === 'running' || 
            matchingInv?.status === 'pending';

          const isInvestigated = item.internal_metrics.status === 'investigated' || 
            matchingInv?.status === 'complete';

          const isQualified = item.internal_metrics.status === 'qualified' || item.internal_metrics.qualification_score >= 0.70;
          const qualPct = Math.round(item.internal_metrics.qualification_score * 100);
          const stage = getTrendStage(item);
          const isInfoOpen = activeInfoTrendId === item.trend_id;

          return (
            <div key={item.trend_id} className="trend-card">
              <div>
                {/* 1. Header: Category, Trend Stage & Investigation Status Badges */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', gap: '8px', flexWrap: 'wrap' }}>
                  <span className="badge badge-cyan" style={{ fontSize: '0.72rem' }}>
                    {item.category || 'General'}
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span 
                      className={`badge ${
                        stage === 'Peak' ? 'badge-emerald' :
                        stage === 'Accelerating' ? 'badge-cyan' :
                        stage === 'Emerging' ? 'badge-blue' : 'badge-amber'
                      }`}
                      style={{ fontSize: '0.68rem' }}
                      title={`Growth stage: ${stage}`}
                    >
                      {stage}
                    </span>
                    <span 
                      className={`badge ${isInvestigated ? 'badge-emerald' : isQualified ? 'badge-cyan' : 'badge-neutral'}`} 
                      style={{ fontSize: '0.68rem' }}
                      title={`Pipeline status: ${isInvestigated ? 'Investigated' : isQualified ? 'Qualified' : 'Candidate'}`}
                    >
                      {isInvestigated ? 'INVESTIGATED' : isQualified ? 'QUALIFIED' : 'CANDIDATE'}
                    </span>
                  </div>
                </div>

                {/* 2. Topic Title */}
                <h3 style={{ fontSize: '1.15rem', fontWeight: 600, marginBottom: '12px', color: 'var(--text-primary)', textTransform: 'capitalize', lineHeight: 1.35 }}>
                  {item.topic}
                </h3>

                {/* 3. Search Volume and Momentum Score (Clean open layout without nested box) */}
                <div className="radar-card-metrics">
                  {/* Left: Volume & Spike */}
                  <div className="radar-card-metric-col">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                      {item.provider_metrics.search_volume !== null ? (
                        <span 
                          className="metric-pill metric-pill-cyan" 
                          title="Estimated Google Trends query volume threshold"
                        >
                          <IconSearch size={12} />
                          <span>{item.provider_metrics.search_volume.toLocaleString()}+ searches</span>
                        </span>
                      ) : (
                        <span 
                          className="metric-pill" 
                          title="Query volume is below provider reporting threshold"
                        >
                          Volume unlisted
                        </span>
                      )}

                      {item.provider_metrics.increase_percentage !== null ? (
                        <span 
                          className="metric-pill metric-pill-green" 
                          title="Relative search spike percentage over baseline window"
                        >
                          <IconTrendingUp size={12} />
                          <span>+{Math.round(item.provider_metrics.increase_percentage)}% Spike</span>
                        </span>
                      ) : (
                        <span 
                          className="metric-pill" 
                          title="Spike percentage is unlisted by provider"
                        >
                          Steady baseline
                        </span>
                      )}
                    </div>

                    {/* Comparison Baseline */}
                    <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                      {item.provider_metrics.start_timestamp && item.provider_metrics.end_timestamp
                        ? `${new Date(item.provider_metrics.start_timestamp).toLocaleDateString([], { month: 'short', day: 'numeric' })} – ${new Date(item.provider_metrics.end_timestamp).toLocaleDateString([], { month: 'short', day: 'numeric' })}`
                        : 'Google Trends · 24h baseline'}
                    </div>
                  </div>

                  {/* Right: Momentum Gauge & Score */}
                  <div className="radar-card-momentum-col">
                    <div className="score-display" style={{ '--score': qualPct } as React.CSSProperties} title={`Momentum score: ${qualPct}/100`}>
                      <div className="score-inner">{qualPct}</div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <span style={{ fontSize: '0.68rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                          Momentum
                        </span>
                        <button
                          type="button"
                          className="info-popover-trigger"
                          onClick={() => setActiveInfoTrendId(isInfoOpen ? null : item.trend_id)}
                          aria-label="View momentum scoring methodology"
                          title="Click to view momentum scoring breakdown"
                          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'inline-flex', alignItems: 'center', color: isInfoOpen ? 'var(--action-primary)' : 'var(--text-muted)' }}
                        >
                          <IconInfo size={13} />
                        </button>
                      </div>
                      <span style={{ fontSize: '0.75rem', fontWeight: 600, color: qualPct >= 70 ? 'var(--status-success)' : 'var(--text-secondary)' }}>
                        {qualPct}/100
                      </span>
                    </div>

                    {/* Explanatory Popover for Momentum Methodology */}
                    {isInfoOpen && (
                      <div ref={popoverRef} className="scoring-info-popover">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                          <strong style={{ fontSize: '0.82rem', color: 'var(--text-primary)' }}>
                            Editorial Momentum Index
                          </strong>
                          <button
                            type="button"
                            onClick={() => setActiveInfoTrendId(null)}
                            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '2px' }}
                            title="Close"
                          >
                            <IconClose size={13} />
                          </button>
                        </div>

                        <p style={{ margin: '0 0 8px 0', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                          Indicates viral breakout velocity. Scores ≥ 70 qualify for automated research.
                        </p>

                        <div style={{ background: 'var(--surface-secondary, #F8FAFC)', padding: '8px 10px', borderRadius: '6px', fontSize: '0.72rem', color: 'var(--text-secondary)', marginBottom: '8px', lineHeight: 1.5 }}>
                          <div>• <strong>35% Velocity:</strong> Search volume &amp; percentage spike factor</div>
                          <div>• <strong>25% Acceleration:</strong> Growth trajectory vs prior observation</div>
                          <div>• <strong>20% Novelty:</strong> Index freshness &amp; topic breakout newness</div>
                          <div>• <strong>10% Persistence:</strong> Sustained multi-interval search interest</div>
                          <div>• <strong>10% Source Density:</strong> Cross-platform signal coverage</div>
                        </div>

                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                          Formula: 0.35 Vel + 0.25 Acc + 0.20 Nov + 0.10 Persist + 0.10 Source
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* 4. Related breakdown terms (Clickable to Filter) */}
                {item.provider_metrics.trend_breakdown && item.provider_metrics.trend_breakdown.length > 0 && (
                  <div style={{ marginTop: '2px', marginBottom: '8px' }}>
                    <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', marginBottom: '5px', fontWeight: 500 }}>
                      Related Searches:
                    </div>
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                      {item.provider_metrics.trend_breakdown.slice(0, 3).map((term, i) => (
                        <button
                          key={i}
                          type="button"
                          className="related-search-chip"
                          onClick={() => setSearchQuery(term)}
                          title={`Click to filter trends by "${term}"`}
                        >
                          {term}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* 5. Card Action Area: Completed vs In Progress vs Not Yet Investigated */}
              <div className="radar-card-actions">
                {isInvestigated ? (
                  <div className="radar-action-group">
                    <span 
                      className="badge badge-emerald" 
                      style={{ 
                        fontSize: '0.75rem', 
                        padding: '5px 8px', 
                        display: 'inline-flex', 
                        alignItems: 'center', 
                        gap: '5px',
                        borderRadius: '6px',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      <IconCheck size={12} color="var(--status-success)" />
                      <span>Investigated</span>
                    </span>
                    <button 
                      type="button"
                      className="btn-outline" 
                      style={{ fontSize: '0.8rem', padding: '6px 12px', display: 'inline-flex', alignItems: 'center', gap: '5px', whiteSpace: 'nowrap' }}
                      onClick={() => onViewInvestigation ? onViewInvestigation(matchingInv?.investigation_id) : onLaunchInvestigation(item.topic, item.trend_id)}
                      title="Open existing investigation record"
                    >
                      <span>View investigation</span>
                      <IconArrowRight size={13} />
                    </button>
                  </div>
                ) : isInvestigating ? (
                  <div className="radar-action-group">
                    <span 
                      className="badge badge-cyan" 
                      style={{ 
                        fontSize: '0.75rem', 
                        padding: '5px 8px', 
                        display: 'inline-flex', 
                        alignItems: 'center', 
                        gap: '6px',
                        borderRadius: '6px',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      <span className="pulse-dot" />
                      <span>Investigating...</span>
                    </span>
                    <button 
                      type="button"
                      className="btn-outline" 
                      style={{ fontSize: '0.8rem', padding: '6px 12px', display: 'inline-flex', alignItems: 'center', gap: '5px', whiteSpace: 'nowrap' }}
                      onClick={() => onViewInvestigation ? onViewInvestigation(matchingInv?.investigation_id) : undefined}
                      title="View active research progress"
                    >
                      <span>View progress</span>
                      <IconArrowRight size={13} />
                    </button>
                  </div>
                ) : (
                  <button 
                    type="button"
                    className="btn-primary" 
                    style={{ width: '100%', fontSize: '0.85rem', padding: '8px 14px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', whiteSpace: 'nowrap' }}
                    onClick={() => onLaunchInvestigation(item.topic, item.trend_id)}
                    title="Launch autonomous multi-source research investigation"
                  >
                    <IconTrendingUp size={14} />
                    <span>Investigate trend</span>
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Helpful Empty State */}
      {filteredTrends.length === 0 && (
        <div className="glass-card" style={{ textAlign: 'center', padding: '50px 20px', marginTop: '10px' }}>
          <div style={{ display: 'inline-flex', padding: '14px', borderRadius: '50%', background: 'var(--surface-secondary)', color: 'var(--text-muted)', marginBottom: '14px' }}>
            <IconSearch size={28} />
          </div>
          <h3 style={{ fontSize: '1.15rem', color: 'var(--text-primary)', marginBottom: '8px', fontWeight: 600 }}>
            No Trends Found Matching Filters
          </h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', margin: '0 auto 18px auto', maxWidth: '440px' }}>
            {isFilterActive
              ? `No trending topics matched the selected category, stage, or search query "${searchQuery}".`
              : 'No trending topics currently returned for this region.'}
          </p>
          {isFilterActive && (
            <button
              type="button"
              onClick={handleResetFilters}
              className="btn-primary"
              style={{ padding: '8px 18px', fontSize: '0.85rem' }}
            >
              Reset filters
            </button>
          )}
        </div>
      )}
    </div>
  );
};
