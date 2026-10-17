import React from 'react';
import type { UserRole } from '../types';
import {
  IconOverview,
  IconRadar,
  IconInvestigations,
  IconOpportunities,
  IconStudio,
  IconWatchlists,
  IconAdmin,
  IconUser
} from './Icons';
import { Select } from './Select';

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
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            width: '32px',
            height: '32px',
            borderRadius: '8px',
            background: '#FEF7E0',
            border: '1px solid #FEEFC3',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '1.1rem',
            color: 'var(--brand-yellow)',
            flexShrink: 0
          }}>
            ⚡
          </div>
          <div>
            <div className="brand-title">Trend Contenter</div>
            <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', fontWeight: 500, letterSpacing: '0.04em' }}>
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
          <span className="sidebar-icon">
            <IconOverview size={18} />
          </span>
          <span>Overview</span>
        </button>

        <button
          className={`sidebar-link ${activePage === 'radar' ? 'active' : ''}`}
          onClick={() => onSelectPage('radar')}
        >
          <span className="sidebar-icon">
            <IconRadar size={18} />
          </span>
          <span>Trend Radar</span>
        </button>

        <button
          className={`sidebar-link ${activePage === 'investigations' ? 'active' : ''}`}
          onClick={() => onSelectPage('investigations')}
        >
          <span className="sidebar-icon">
            <IconInvestigations size={18} />
          </span>
          <span>Investigations</span>
          {investigationsCount > 0 && (
            <span className="sidebar-badge">{investigationsCount}</span>
          )}
        </button>

        <button
          className={`sidebar-link ${activePage === 'audiences_opps' ? 'active' : ''}`}
          onClick={() => onSelectPage('audiences_opps')}
        >
          <span className="sidebar-icon">
            <IconOpportunities size={18} />
          </span>
          <span>Audience &amp; Opportunities</span>
          {opportunitiesCount > 0 && (
            <span className="sidebar-badge">{opportunitiesCount}</span>
          )}
        </button>

        <button
          className={`sidebar-link ${activePage === 'studio' ? 'active' : ''}`}
          onClick={() => onSelectPage('studio')}
        >
          <span className="sidebar-icon">
            <IconStudio size={18} />
          </span>
          <span>Content Studio</span>
        </button>

        <button
          className={`sidebar-link ${activePage === 'watchlists' ? 'active' : ''}`}
          onClick={() => onSelectPage('watchlists')}
        >
          <span className="sidebar-icon">
            <IconWatchlists size={18} />
          </span>
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
              <span className="sidebar-icon">
                <IconAdmin size={18} />
              </span>
              <span>Administration</span>
            </button>
          </>
        )}
      </nav>

      {/* Bottom Profile & Role Switcher */}
      <div className="sidebar-footer">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{
              width: '28px',
              height: '28px',
              borderRadius: '50%',
              background: 'var(--action-subtle)',
              color: 'var(--action-primary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0
            }}>
              <IconUser size={15} />
            </div>
            <div>
              <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)' }}>Workspace User</div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>workspace_dev</div>
            </div>
          </div>
          <span className="badge badge-emerald" style={{ fontSize: '0.65rem', padding: '2px 6px' }}>
            Active
          </span>
        </div>

        {/* Live Role Switcher (Simulate RBAC permissions) */}
        <div>
          <div style={{ fontSize: '0.68rem', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '4px' }}>
            Current Active Role
          </div>
          <Select
            value={currentRole}
            onChange={(e) => onChangeRole(e.target.value as UserRole)}
            sizeVariant="sm"
            aria-label="Current Active Role"
          >
            <option value="workspace_admin">Workspace Admin (Full)</option>
            <option value="research_analyst">Research Analyst</option>
            <option value="content_creator">Content Creator</option>
            <option value="editor">Editor</option>
            <option value="viewer">Viewer (Read Only)</option>
          </Select>
        </div>
      </div>
    </aside>
  );
};

