import React, { useState, useEffect } from 'react';
import type { WatchlistItem } from '../types';

export const WatchlistsPage: React.FC = () => {
  const [watchlists, setWatchlists] = useState<WatchlistItem[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [name, setName] = useState('');
  const [keywordsStr, setKeywordsStr] = useState('');
  const [minScore, setMinScore] = useState(0.70);
  const [autoInvestigate, setAutoInvestigate] = useState(false);

  const API_BASE = 'http://127.0.0.1:8001/api/v1';

  const fetchWatchlists = async () => {
    try {
      const res = await fetch(`${API_BASE}/watchlists/`);
      if (res.ok) {
        const data = await res.json();
        setWatchlists(data);
      }
    } catch (err) {
      console.error('Failed to load watchlists:', err);
    }
  };

  useEffect(() => {
    fetchWatchlists();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    const keywords = keywordsStr.split(',').map(s => s.trim()).filter(Boolean);
    try {
      const res = await fetch(`${API_BASE}/watchlists/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          keywords,
          region: 'IN',
          min_qualification_score: minScore,
          auto_investigate: autoInvestigate
        })
      });
      if (res.ok) {
        setShowModal(false);
        setName('');
        setKeywordsStr('');
        fetchWatchlists();
      }
    } catch (err) {
      console.error('Error creating watchlist:', err);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await fetch(`${API_BASE}/watchlists/${id}`, { method: 'DELETE' });
      fetchWatchlists();
    } catch (err) {
      console.error('Failed to delete watchlist:', err);
    }
  };

  return (
    <div className="page-container animate-fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '2.2rem', marginBottom: '8px' }}>Topic Watchlists</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '1rem', maxWidth: '680px' }}>
            Configure automated monitoring for strategic themes, custom keyword clusters, and threshold-based investigation triggers.
          </p>
        </div>
        <button onClick={() => setShowModal(true)} className="btn-primary" style={{ padding: '10px 20px' }}>
          + New Watchlist
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
        {watchlists.map((wl) => (
          <div key={wl.watchlist_id} className="glass-card" style={{ padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
              <div>
                <span className="badge badge-cyan" style={{ fontSize: '0.7rem', marginBottom: '6px', display: 'inline-block' }}>
                  Region: {wl.region}
                </span>
                <h3 style={{ fontSize: '1.25rem', color: '#fff', margin: 0 }}>{wl.name}</h3>
              </div>
              <button
                onClick={() => handleDelete(wl.watchlist_id)}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1.1rem' }}
                title="Remove Watchlist"
              >
                ✕
              </button>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <div className="subheading-label">Monitored Keywords:</div>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {wl.keywords.map((kw, i) => (
                  <span key={i} className="metric-pill metric-pill-cyan" style={{ fontSize: '0.75rem' }}>
                    {kw}
                  </span>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '14px', fontSize: '0.85rem' }}>
              <span style={{ color: 'var(--text-secondary)' }}>
                Min Qual Score: <strong style={{ color: 'var(--accent-emerald)' }}>{Math.round(wl.min_qualification_score * 100)}%</strong>
              </span>
              <span className={`badge ${wl.auto_investigate ? 'badge-emerald' : 'badge-amber'}`}>
                {wl.auto_investigate ? 'Auto-Investigate Active' : 'Alert Only'}
              </span>
            </div>
          </div>
        ))}
      </div>

      {watchlists.length === 0 && (
        <div className="glass-card" style={{ textAlign: 'center', padding: '60px' }}>
          <h3>No Watchlists Created</h3>
          <p style={{ color: 'var(--text-secondary)', marginTop: '8px', marginBottom: '20px' }}>
            Create a topic watchlist to automatically monitor specific keyword themes across Google Trends.
          </p>
          <button onClick={() => setShowModal(true)} className="btn-primary">
            Create First Watchlist
          </button>
        </div>
      )}

      {/* Creation Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-card" style={{ maxWidth: '520px' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ fontSize: '1.4rem', color: '#fff', margin: 0 }}>Create Topic Watchlist</h2>
              <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '1.4rem', cursor: 'pointer' }}>
                ✕
              </button>
            </div>

            <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label className="subheading-label">Watchlist Name</label>
                <input
                  type="text"
                  placeholder="E.g., AI & EdTech Infrastructure"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="input-glass"
                  required
                />
              </div>

              <div>
                <label className="subheading-label">Target Keywords (comma-separated)</label>
                <input
                  type="text"
                  placeholder="AI tutors, personalized learning, edtech grants"
                  value={keywordsStr}
                  onChange={(e) => setKeywordsStr(e.target.value)}
                  className="input-glass"
                  required
                />
              </div>

              <div>
                <label className="subheading-label">Qualification Threshold ({Math.round(minScore * 100)}%)</label>
                <input
                  type="range"
                  min="0.5"
                  max="0.95"
                  step="0.05"
                  value={minScore}
                  onChange={(e) => setMinScore(parseFloat(e.target.value))}
                  style={{ width: '100%', accentColor: 'var(--accent-cyan)' }}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input
                  type="checkbox"
                  id="auto_inv"
                  checked={autoInvestigate}
                  onChange={(e) => setAutoInvestigate(e.target.checked)}
                  style={{ accentColor: 'var(--accent-cyan)' }}
                />
                <label htmlFor="auto_inv" style={{ fontSize: '0.85rem', color: 'var(--text-primary)', cursor: 'pointer' }}>
                  Automatically trigger LangGraph investigation when threshold is met
                </label>
              </div>

              <div style={{ display: 'flex', gap: '12px', marginTop: '12px' }}>
                <button type="submit" className="btn-primary" style={{ flex: 1 }}>
                  Save Watchlist
                </button>
                <button type="button" className="btn-outline" onClick={() => setShowModal(false)}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
