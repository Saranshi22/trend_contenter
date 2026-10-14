import React from 'react';
import type { UserRole } from '../types';

export type NavPage = 
  | 'overview'
  | 'radar'
  | 'investigations'
  | 'audiences_opps'
  | 'studio'
  | 'watchlists'
  | 'admin';

interface SidebarProps {
  activePage: NavPage;
  onSelectPage: (page: NavPage) => void;
  currentRole: UserRole;
  onChangeRole: (role: UserRole) => void;
  investigationsCount?: number;
  opportunitiesCount?: number;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activePage,
  onSelectPage,
  currentRole,
  onChangeRole,
  investigationsCount = 0,
  opportunitiesCount = 0
}) => {
  const isAdmin = currentRole === 'workspace_admin';

  return (
    <aside className="app-sidebar">
      {/* Brand Header */}
      <div className="sidebar-brand">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '1.4rem' }}>⚡</span>
          <div>
            <div className="brand-title" style={{ fontSize: '1.25rem' }}>Trend Contenter</div>
            <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Intelligence Platform
            </div>
          </div>
        </div>
      </div>

      {/* Main Navigation Links */}
      <nav className="sidebar-nav">
        <div className="sidebar-section-label">Intelligence Navigation</div>
        
        <button
          className={`sidebar-link ${activePage === 'overview' ? 'active' : ''}`}
          onClick={() => onSelectPage('overview')}
        >
          <span className="sidebar-icon">📊</span>
          <span>Overview</span>
        </button>

        <button
          className={`sidebar-link ${activePage === 'radar' ? 'active' : ''}`}
          onClick={() => onSelectPage('radar')}
        >
          <span className="sidebar-icon">📡</span>
          <span>Trend Radar</span>
        </button>

        <button
          className={`sidebar-link ${activePage === 'investigations' ? 'active' : ''}`}
          onClick={() => onSelectPage('investigations')}
        >
          <span className="sidebar-icon">🔬</span>
          <span>Investigations</span>
          {investigationsCount > 0 && (
            <span className="sidebar-badge">{investigationsCount}</span>
          )}
        </button>

        <button
          className={`sidebar-link ${activePage === 'audiences_opps' ? 'active' : ''}`}
          onClick={() => onSelectPage('audiences_opps')}
        >
          <span className="sidebar-icon">💡</span>
          <span>Audience &amp; Opportunities</span>
          {opportunitiesCount > 0 && (
            <span className="sidebar-badge">{opportunitiesCount}</span>
          )}
        </button>

        <button
          className={`sidebar-link ${activePage === 'studio' ? 'active' : ''}`}
          onClick={() => onSelectPage('studio')}
        >
          <span className="sidebar-icon">🚀</span>
          <span>Content Studio</span>
        </button>

        <button
          className={`sidebar-link ${activePage === 'watchlists' ? 'active' : ''}`}
          onClick={() => onSelectPage('watchlists')}
        >
          <span className="sidebar-icon">👁️</span>
          <span>Watchlists</span>
        </button>

        {/* Administration Section (Role-aware: only visible to workspace_admin) */}
        {isAdmin && (
          <>
            <div className="sidebar-divider" />
            <div className="sidebar-section-label">Governance</div>
            <button
              className={`sidebar-link ${activePage === 'admin' ? 'active' : ''}`}
              onClick={() => onSelectPage('admin')}
            >
              <span className="sidebar-icon">⚙️</span>
              <span>Administration</span>
            </button>
          </>
        )}
      </nav>

      {/* Bottom Profile & Role Switcher */}
      <div className="sidebar-footer">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: 'rgba(6,182,212,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px' }}>
              👤
            </div>
            <div>
              <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#fff' }}>Workspace User</div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>workspace_dev</div>
            </div>
          </div>
          <span className="badge badge-emerald" style={{ fontSize: '0.65rem', padding: '2px 6px' }}>
            Active
          </span>
        </div>

        {/* Live Role Switcher (Simulate RBAC permissions) */}
        <div style={{ marginTop: '8px' }}>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
            Current Active Role:
          </div>
          <select
            value={currentRole}
            onChange={(e) => onChangeRole(e.target.value as UserRole)}
            className="input-glass"
            style={{ padding: '6px 10px', fontSize: '0.75rem', width: '100%', borderRadius: '8px' }}
          >
            <option value="workspace_admin" style={{ background: '#111827' }}>Workspace Admin (Full)</option>
            <option value="research_analyst" style={{ background: '#111827' }}>Research Analyst</option>
            <option value="content_creator" style={{ background: '#111827' }}>Content Creator</option>
            <option value="editor" style={{ background: '#111827' }}>Editor</option>
            <option value="viewer" style={{ background: '#111827' }}>Viewer (Read Only)</option>
          </select>
        </div>
      </div>
    </aside>
  );
};
