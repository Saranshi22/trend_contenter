import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { WatchlistItem } from '../types';
import { API_BASE } from '../apiConfig';
import {
  IconPlus,
  IconClose,
  IconAlertTriangle,
  IconCheck
} from '../components/Icons';
import { Select } from '../components/Select';

export const WatchlistsPage: React.FC = () => {
  const [watchlists, setWatchlists] = useState<WatchlistItem[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [name, setName] = useState('');
  const [keywordsStr, setKeywordsStr] = useState('');
  const [region, setRegion] = useState('IN');
  const [minScore, setMinScore] = useState(0.70);
  const [autoInvestigate, setAutoInvestigate] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [evaluatingId, setEvaluatingId] = useState<string | null>(null);
  const [notificationMsg, setNotificationMsg] = useState<string | null>(null);

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

  const handleEvaluate = async (id: string) => {
    setEvaluatingId(id);
    setNotificationMsg(null);
    try {
      const res = await fetch(`${API_BASE}/watchlists/${id}/evaluate`, { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        if (data.triggered_count > 0) {
          const names = data.triggered_investigations.map((i: any) => i.topic).join(', ');
          setNotificationMsg(`Triggered ${data.triggered_count} autonomous research investigation(s) for "${names}"! Check the Investigations tab.`);
        } else if (data.already_investigated_count > 0) {
          const names = data.already_investigated.map((i: any) => i.topic).join(', ');
          setNotificationMsg(`Matching trend "${names}" has already been investigated! Open the Intelligence Report in the Investigations tab.`);
        } else {
          setNotificationMsg('Scan complete: no uninvestigated trends currently meet the score threshold for this watchlist.');
        }
      }
    } catch (err) {
      console.error('Failed to evaluate watchlist:', err);
    } finally {
      setEvaluatingId(null);
    }
  };

  useEffect(() => {
    fetchWatchlists();
  }, []);

  // Handle ESC key to close modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && showModal) {
        setShowModal(false);
        setErrorMsg(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showModal]);

  const handleOpenModal = () => {
    setName('');
    setKeywordsStr('');
    setRegion('IN');
    setMinScore(0.70);
    setAutoInvestigate(false);
    setErrorMsg(null);
    setShowModal(true);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setErrorMsg('Please enter a watchlist name.');
      return;
    }

    const keywords = keywordsStr.split(',').map(s => s.trim()).filter(Boolean);
    if (keywords.length === 0) {
      setErrorMsg('Please enter at least one target keyword.');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      const res = await fetch(`${API_BASE}/watchlists/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          keywords,
          region,
          min_qualification_score: minScore,
          auto_investigate: autoInvestigate
        })
      });

      if (res.ok) {
        setShowModal(false);
        setName('');
        setKeywordsStr('');
        fetchWatchlists();
      } else {
        const errData = await res.json().catch(() => ({}));
        setErrorMsg(errData.detail || 'Failed to create watchlist. Please try again.');
      }
    } catch (err) {
      console.error('Error creating watchlist:', err);
      setErrorMsg('Network error while creating watchlist.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`${API_BASE}/watchlists/${id}`, { method: 'DELETE' });
      if (res.ok) {
        fetchWatchlists();
      }
    } catch (err) {
      console.error('Failed to delete watchlist:', err);
    }
  };

  return (
    <div className="page-container animate-fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '6px' }}>
            Topic Watchlists
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.92rem', maxWidth: '680px', margin: 0 }}>
            Configure automated monitoring for strategic themes, custom keyword clusters, and threshold-based investigation triggers.
          </p>
        </div>
        <button 
          onClick={handleOpenModal} 
          className="btn-primary" 
          style={{ padding: '9px 18px', display: 'flex', alignItems: 'center', gap: '6px' }}
        >
          <IconPlus size={15} />
          <span>New Watchlist</span>
        </button>
      </div>

      {notificationMsg && (
        <div style={{ background: 'var(--action-subtle, #E8F0FE)', border: '1px solid #C2D7FA', color: 'var(--action-primary, #1A73E8)', padding: '12px 18px', borderRadius: '8px', marginBottom: '20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', fontSize: '0.88rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <IconCheck size={16} />
            <span>{notificationMsg}</span>
          </div>
          <button
            type="button"
            onClick={() => setNotificationMsg(null)}
            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px' }}
            title="Dismiss"
          >
            <IconClose size={14} />
          </button>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
        {watchlists.map((wl) => (
          <div key={wl.watchlist_id} className="glass-card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                <div>
                  <span className="badge badge-cyan" style={{ fontSize: '0.75rem', marginBottom: '6px', display: 'inline-block' }}>
                    Region: {wl.region}
                  </span>
                  <h3 style={{ fontSize: '1.25rem', color: 'var(--text-primary)', margin: 0, fontWeight: 600 }}>{wl.name}</h3>
                </div>
                <button
                  onClick={() => handleDelete(wl.watchlist_id)}
                  style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center' }}
                  title="Remove Watchlist"
                >
                  <IconClose size={15} />
                </button>
              </div>

              <div style={{ marginBottom: '16px' }}>
                <div className="subheading-label">Monitored Keywords:</div>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  {wl.keywords.map((kw, i) => (
                    <span key={i} className="metric-pill metric-pill-cyan" style={{ fontSize: '0.78rem' }}>
                      {kw}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border-subtle)', paddingTop: '16px', fontSize: '0.85rem', flexWrap: 'wrap', gap: '8px' }}>
              <span style={{ color: 'var(--text-secondary)' }}>
                Min Qual Score: <strong style={{ color: 'var(--status-success)' }}>{Math.round(wl.min_qualification_score * 100)}%</strong>
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span className={`badge ${wl.auto_investigate ? 'badge-emerald' : 'badge-amber'}`}>
                  {wl.auto_investigate ? 'Auto-Investigate Active' : 'Alert Only'}
                </span>
                {wl.auto_investigate && (
                  <button
                    type="button"
                    onClick={() => handleEvaluate(wl.watchlist_id)}
                    disabled={evaluatingId === wl.watchlist_id}
                    className="btn-outline"
                    style={{ fontSize: '0.72rem', padding: '3px 8px', borderRadius: '4px' }}
                    title="Scan current trends against this watchlist now"
                  >
                    {evaluatingId === wl.watchlist_id ? 'Scanning...' : 'Scan Now'}
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {watchlists.length === 0 && (
        <div className="glass-card" style={{ textAlign: 'center', padding: '60px' }}>
          <h3 style={{ color: 'var(--text-primary)' }}>No Watchlists Created</h3>
          <p style={{ color: 'var(--text-secondary)', marginTop: '8px', marginBottom: '20px' }}>
            Create a topic watchlist to automatically monitor specific keyword themes across Google Trends.
          </p>
          <button onClick={handleOpenModal} className="btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            <IconPlus size={15} />
            <span>Create First Watchlist</span>
          </button>
        </div>
      )}

      {/* Creation Modal rendered via Portal directly to body */}
      {showModal && createPortal(
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-card" style={{ maxWidth: '520px' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ fontSize: '1.35rem', color: 'var(--text-primary)', margin: 0, fontWeight: 700 }}>
                Create Topic Watchlist
              </h2>
              <button 
                type="button"
                onClick={() => setShowModal(false)} 
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center' }}
                title="Close"
              >
                <IconClose size={16} />
              </button>
            </div>

            {errorMsg && (
              <div style={{ background: 'var(--status-warning-bg, #FEF3C7)', border: '1px solid var(--status-warning-border, #FDE68A)', color: 'var(--status-warning, #D97706)', padding: '10px 14px', borderRadius: '8px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem' }}>
                <IconAlertTriangle size={16} />
                <span>{errorMsg}</span>
              </div>
            )}

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
                  autoFocus
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

              <div className="grid-2" style={{ gap: '14px' }}>
                <div>
                  <label className="subheading-label">Target Region</label>
                  <Select
                    value={region}
                    onChange={(e) => setRegion(e.target.value)}
                    aria-label="Select region"
                  >
                    <option value="IN">India (IN)</option>
                    <option value="US">United States (US)</option>
                    <option value="GB">United Kingdom (GB)</option>
                  </Select>
                </div>

                <div>
                  <label className="subheading-label">Threshold ({Math.round(minScore * 100)}%)</label>
                  <div style={{ display: 'flex', alignItems: 'center', height: '38px' }}>
                    <input
                      type="range"
                      min="0.5"
                      max="0.95"
                      step="0.05"
                      value={minScore}
                      onChange={(e) => setMinScore(parseFloat(e.target.value))}
                      style={{ width: '100%', accentColor: 'var(--action-primary)' }}
                    />
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', background: 'var(--surface-secondary, #F8FAFC)', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
                <input
                  type="checkbox"
                  id="auto_inv"
                  checked={autoInvestigate}
                  onChange={(e) => setAutoInvestigate(e.target.checked)}
                  style={{ accentColor: 'var(--action-primary)', width: '16px', height: '16px', cursor: 'pointer' }}
                />
                <label htmlFor="auto_inv" style={{ fontSize: '0.84rem', color: 'var(--text-primary)', cursor: 'pointer', userSelect: 'none' }}>
                  Automatically trigger research investigation when threshold is met
                </label>
              </div>

              <div style={{ display: 'flex', gap: '12px', marginTop: '10px' }}>
                <button 
                  type="submit" 
                  className="btn-primary" 
                  disabled={isSubmitting}
                  style={{ flex: 1, padding: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                >
                  <IconCheck size={15} />
                  <span>{isSubmitting ? 'Saving Watchlist...' : 'Save Watchlist'}</span>
                </button>
                <button 
                  type="button" 
                  className="btn-outline" 
                  onClick={() => setShowModal(false)}
                  style={{ padding: '10px 18px' }}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};
