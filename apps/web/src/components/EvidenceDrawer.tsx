import React from 'react';
import type { EvidenceDetail } from '../types';
import {
  IconClose,
  IconEye,
  IconThumbsUp,
  IconMessageSquare,
  IconVideo,
  IconExternalLink,
  IconShield
} from './Icons';

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
            <span className="badge badge-cyan" style={{ fontSize: '0.72rem', marginBottom: '6px', display: 'inline-block' }}>
              Evidence Item • {evidence.source_type.toUpperCase()}
            </span>
            <h3 style={{ fontSize: '1.25rem', color: 'var(--text-primary)', margin: 0, fontWeight: 600 }}>
              {evidence.title || insightLabel || 'Evidence Record'}
            </h3>
          </div>
          <button onClick={onClose} className="drawer-close-btn" title="Close Drawer" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <IconClose size={16} />
          </button>
        </div>

        {/* Drawer Content */}
        <div className="drawer-body">
          {/* Linked Insight */}
          {insightLabel && (
            <div className="brief-section">
              <div className="brief-label">Supporting Insight / Claim</div>
              <div className="brief-value" style={{ fontWeight: 600, color: 'var(--brand-teal)' }}>
                "{insightLabel}"
              </div>
            </div>
          )}

          {/* YouTube Video Rich Preview Card */}
          {evidence.platform === 'youtube' && evidence.metadata?.retrieval_method === 'video_metadata' && (
            <div style={{ marginBottom: '20px', background: '#FFFFFF', borderRadius: '10px', padding: '16px', border: '1px solid var(--border-subtle)', boxShadow: 'var(--shadow-sm)' }}>
              {evidence.metadata?.thumbnail_url && (
                <div style={{ position: 'relative', width: '100%', maxHeight: '200px', overflow: 'hidden', borderRadius: '8px', marginBottom: '12px', background: 'var(--surface-secondary)' }}>
                  <img
                    src={evidence.metadata.thumbnail_url}
                    alt={evidence.title || 'YouTube Video Thumbnail'}
                    style={{ width: '100%', height: 'auto', display: 'block', objectFit: 'cover' }}
                  />
                  <div style={{ position: 'absolute', bottom: '8px', right: '8px', background: 'rgba(0,0,0,0.75)', color: '#fff', padding: '2px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600 }}>
                    {evidence.engagement?.duration ? evidence.engagement.duration.replace('PT', '').toLowerCase() : 'YouTube'}
                  </div>
                </div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', textAlign: 'center' }}>
                <div style={{ background: '#FFFFFF', padding: '10px 6px', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                    <IconEye size={12} />
                    <span>Views</span>
                  </div>
                  <div style={{ fontWeight: 700, color: 'var(--action-primary)', fontSize: '0.95rem', marginTop: '2px' }}>
                    {typeof evidence.engagement?.views === 'number' ? evidence.engagement.views.toLocaleString() : 'N/A'}
                  </div>
                </div>
                <div style={{ background: '#FFFFFF', padding: '10px 6px', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                    <IconThumbsUp size={12} />
                    <span>Likes</span>
                  </div>
                  <div style={{ fontWeight: 700, color: 'var(--status-success)', fontSize: '0.95rem', marginTop: '2px' }}>
                    {typeof evidence.engagement?.likes === 'number' ? evidence.engagement.likes.toLocaleString() : 'N/A'}
                  </div>
                </div>
                <div style={{ background: '#FFFFFF', padding: '10px 6px', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                    <IconMessageSquare size={12} />
                    <span>Comments</span>
                  </div>
                  <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '0.95rem', marginTop: '2px' }}>
                    {typeof evidence.engagement?.comments === 'number' ? evidence.engagement.comments.toLocaleString() : 'N/A'}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* YouTube Comment Rich Preview Card */}
          {evidence.platform === 'youtube' && evidence.metadata?.retrieval_method === 'comment_thread' && (
            <div style={{ marginBottom: '20px', background: '#FFFFFF', borderRadius: '10px', padding: '16px', border: '1px solid var(--border-subtle)', boxShadow: 'var(--shadow-sm)' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                Parent Video Discussion:
              </div>
              <div style={{ color: 'var(--action-primary)', fontWeight: 600, fontSize: '0.92rem', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <IconVideo size={14} color="var(--action-primary)" />
                <span>{evidence.metadata?.video_title || 'Video Thread'}</span>
              </div>
              <div style={{ display: 'flex', gap: '16px', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <IconThumbsUp size={12} />
                  <span><strong>{evidence.engagement?.likes || 0}</strong> likes</span>
                </span>
                {evidence.engagement?.replies ? (
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <IconMessageSquare size={12} />
                    <span><strong>{evidence.engagement.replies}</strong> replies</span>
                  </span>
                ) : null}
              </div>
            </div>
          )}

          {/* Metadata Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
            <div className="brief-section" style={{ margin: 0 }}>
              <div className="brief-label">Evidence Type</div>
              <div style={{ fontWeight: 600, color: 'var(--text-primary)', textTransform: 'capitalize' }}>
                {evidence.platform === 'youtube'
                  ? (evidence.metadata?.retrieval_method === 'comment_thread' ? 'YouTube Public Comment' : 'YouTube Video Metadata')
                  : `${evidence.source_type} (${evidence.platform})`}
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
              <div style={{ fontWeight: 700, color: 'var(--status-success)', fontSize: '1.1rem' }}>
                {Math.round(evidence.confidence * 100)}%
              </div>
            </div>
            <div className="brief-section" style={{ margin: 0 }}>
              <div className="brief-label">Author / Channel</div>
              <div style={{ color: 'var(--text-primary)', fontSize: '0.88rem', fontWeight: 500 }}>
                {evidence.metadata?.channel_title || evidence.author || 'Verified Source'}
              </div>
            </div>
          </div>

          {/* Excerpt */}
          <div className="brief-section">
            <div className="brief-label">
              {evidence.metadata?.retrieval_method === 'comment_thread' ? 'Viewer Comment Text' : 'Video Summary / Excerpt'}
            </div>
            <div className="brief-value" style={{ fontStyle: 'italic', background: '#FFFFFF', padding: '14px', borderRadius: '8px', borderLeft: '3px solid var(--action-primary)', color: 'var(--text-primary)', border: '1px solid var(--border-subtle)', boxShadow: 'var(--shadow-sm)' }}>
              "{evidence.text_excerpt || 'No raw excerpt recorded.'}"
            </div>
          </div>

          {/* Source Link */}
          {evidence.url && (
            <div className="brief-section">
              <div className="brief-label">Canonical Source URL</div>
              <div style={{ wordBreak: 'break-all' }}>
                <a 
                  href={evidence.url} 
                  target="_blank" 
                  rel="noreferrer" 
                  style={{ color: 'var(--action-primary)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.9rem', fontWeight: 500 }}
                >
                  <IconExternalLink size={14} />
                  <span>{evidence.platform === 'youtube' ? 'Watch on YouTube' : evidence.url}</span>
                </a>
              </div>
            </div>
          )}

          {/* Timestamps & Policy Compliance */}
          <div className="brief-section" style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            <div style={{ marginBottom: '4px' }}>
              <strong>Retrieved At:</strong> {evidence.retrieved_at ? new Date(evidence.retrieved_at).toLocaleString() : 'N/A'}
            </div>
            {evidence.published_at && (
              <div style={{ marginBottom: '4px' }}>
                <strong>Published At:</strong> {new Date(evidence.published_at).toLocaleString()}
              </div>
            )}
            <div style={{ marginBottom: '4px' }}>
              <strong>Evidence ID:</strong> <code style={{ color: 'var(--action-primary)', background: '#FFFFFF', border: '1px solid var(--border-subtle)', padding: '2px 6px', borderRadius: '4px' }}>{evidence.evidence_id}</code>
            </div>
            {evidence.platform === 'youtube' && (
              <div style={{ marginTop: '10px', fontSize: '0.74rem', color: 'var(--text-muted)', borderTop: '1px solid var(--border-subtle)', paddingTop: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <IconShield size={13} color="var(--text-muted)" />
                <span>YouTube API Services Compliant: Permitted metadata &amp; public comment extraction only. Subject to 30-day refresh policy.</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
