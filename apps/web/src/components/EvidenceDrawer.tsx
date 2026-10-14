import React from 'react';
import type { EvidenceDetail } from '../types';

interface EvidenceDrawerProps {
  evidence: EvidenceDetail | null;
  insightLabel?: string;
  onClose: () => void;
}

export const EvidenceDrawer: React.FC<EvidenceDrawerProps> = ({ evidence, insightLabel, onClose }) => {
  if (!evidence) return null;

  return (
    <div className="drawer-overlay" onClick={onClose}>
      <div className="drawer-panel" onClick={(e) => e.stopPropagation()}>
        {/* Drawer Header */}
        <div className="drawer-header">
          <div>
            <span className="badge badge-cyan" style={{ fontSize: '0.7rem', marginBottom: '6px', display: 'inline-block' }}>
              Evidence Item • {evidence.source_type.toUpperCase()}
            </span>
            <h3 style={{ fontSize: '1.25rem', color: '#fff', margin: 0 }}>
              {evidence.title || insightLabel || 'Evidence Record'}
            </h3>
          </div>
          <button onClick={onClose} className="drawer-close-btn" title="Close Drawer">
            ✕
          </button>
        </div>

        {/* Drawer Content */}
        <div className="drawer-body">
          {/* Linked Insight */}
          {insightLabel && (
            <div className="brief-section">
              <div className="brief-label">Supporting Insight / Claim</div>
              <div className="brief-value" style={{ fontWeight: 600, color: 'var(--accent-cyan)' }}>
                "{insightLabel}"
              </div>
            </div>
          )}

          {/* Metadata Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
            <div className="brief-section" style={{ margin: 0 }}>
              <div className="brief-label">Evidence Type</div>
              <div style={{ fontWeight: 700, color: '#fff', textTransform: 'capitalize' }}>
                {evidence.source_type} ({evidence.platform})
              </div>
            </div>
            <div className="brief-section" style={{ margin: 0 }}>
              <div className="brief-label">Provenance Status</div>
              <div>
                <span className={`badge ${evidence.is_inferred ? 'badge-amber' : 'badge-emerald'}`}>
                  {evidence.is_inferred ? 'Inferred Synthesis' : 'Directly Observed'}
                </span>
              </div>
            </div>
            <div className="brief-section" style={{ margin: 0 }}>
              <div className="brief-label">Confidence Score</div>
              <div style={{ fontWeight: 700, color: 'var(--accent-emerald)', fontSize: '1.1rem' }}>
                {Math.round(evidence.confidence * 100)}%
              </div>
            </div>
            <div className="brief-section" style={{ margin: 0 }}>
              <div className="brief-label">Author / Source</div>
              <div style={{ color: 'var(--text-primary)', fontSize: '0.85rem' }}>
                {evidence.author || 'Verified Source'}
              </div>
            </div>
          </div>

          {/* Excerpt */}
          <div className="brief-section">
            <div className="brief-label">Relevant Excerpt</div>
            <div className="brief-value" style={{ fontStyle: 'italic', background: 'rgba(0,0,0,0.2)', padding: '12px', borderRadius: '8px', borderLeft: '3px solid var(--accent-cyan)' }}>
              "{evidence.text_excerpt || 'No raw excerpt recorded.'}"
            </div>
          </div>

          {/* Source Link */}
          {evidence.url && (
            <div className="brief-section">
              <div className="brief-label">Original Source URL</div>
              <div style={{ wordBreak: 'break-all' }}>
                <a 
                  href={evidence.url} 
                  target="_blank" 
                  rel="noreferrer" 
                  style={{ color: 'var(--accent-cyan)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.9rem' }}
                >
                  🔗 {evidence.url}
                </a>
              </div>
            </div>
          )}

          {/* Timestamps & Hash */}
          <div className="brief-section" style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            <div style={{ marginBottom: '4px' }}>
              <strong>Retrieved At:</strong> {evidence.retrieved_at ? new Date(evidence.retrieved_at).toLocaleString() : 'N/A'}
            </div>
            <div>
              <strong>Evidence ID:</strong> <code style={{ color: 'var(--accent-cyan)' }}>{evidence.evidence_id}</code>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
