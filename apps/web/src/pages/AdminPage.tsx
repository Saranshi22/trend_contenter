import React, { useState, useEffect } from 'react';
import type { AdminUser, IntegrationInfo, WorkspaceConfig, AuditLogItem, UserRole } from '../types';

export const AdminPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'users' | 'integrations' | 'config' | 'audit'>('users');
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [integrations, setIntegrations] = useState<IntegrationInfo[]>([]);
  const [config, setConfig] = useState<WorkspaceConfig | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLogItem[]>([]);
  const [statusMsg, setStatusMsg] = useState('');

  // Form states
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserName, setNewUserName] = useState('');
  const [newUserRole, setNewUserRole] = useState<UserRole>('viewer');

  const API_BASE = 'http://127.0.0.1:8001/api/v1';

  const fetchUsers = async () => {
    try {
      const res = await fetch(`${API_BASE}/admin/users`);
      if (res.ok) setUsers(await res.json());
    } catch (err) {
      console.error('Failed to fetch users:', err);
    }
  };

  const fetchIntegrations = async () => {
    try {
      const res = await fetch(`${API_BASE}/admin/integrations`);
      if (res.ok) setIntegrations(await res.json());
    } catch (err) {
      console.error('Failed to fetch integrations:', err);
    }
  };

  const fetchConfig = async () => {
    try {
      const res = await fetch(`${API_BASE}/admin/config`);
      if (res.ok) setConfig(await res.json());
    } catch (err) {
      console.error('Failed to fetch config:', err);
    }
  };

  const fetchAudit = async () => {
    try {
      const res = await fetch(`${API_BASE}/admin/audit`);
      if (res.ok) setAuditLogs(await res.json());
    } catch (err) {
      console.error('Failed to fetch audit logs:', err);
    }
  };

  useEffect(() => {
    fetchUsers();
    fetchIntegrations();
    fetchConfig();
    fetchAudit();
  }, []);

  const handleUpdateRole = async (userId: string, newRole: UserRole) => {
    try {
      const res = await fetch(`${API_BASE}/admin/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: newRole })
      });
      if (res.ok) {
        setStatusMsg(`Updated role to ${newRole}`);
        fetchUsers();
        fetchAudit();
      }
    } catch (err) {
      console.error('Failed to update role:', err);
    } finally {
      setTimeout(() => setStatusMsg(''), 3000);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch(`${API_BASE}/admin/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: newUserEmail,
          full_name: newUserName,
          role: newUserRole
        })
      });
      if (res.ok) {
        setNewUserEmail('');
        setNewUserName('');
        setStatusMsg('User provisioned successfully.');
        fetchUsers();
        fetchAudit();
      }
    } catch (err) {
      console.error('Failed to create user:', err);
    } finally {
      setTimeout(() => setStatusMsg(''), 3000);
    }
  };

  const handleUpdateConfig = async (threshold: number) => {
    try {
      const res = await fetch(`${API_BASE}/admin/config`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trend_qualification_threshold: threshold })
      });
      if (res.ok) {
        setConfig(await res.json());
        setStatusMsg('Saved qualification parameters.');
        fetchAudit();
      }
    } catch (err) {
      console.error('Failed to save config:', err);
    } finally {
      setTimeout(() => setStatusMsg(''), 3000);
    }
  };

  return (
    <div className="page-container animate-fade-in">
      <div style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
          <h1 style={{ fontSize: '2.2rem', margin: 0 }}>Administration &amp; Governance</h1>
          <span className="badge badge-emerald">Admin Only</span>
        </div>
        <p style={{ color: 'var(--text-secondary)', fontSize: '1rem', maxWidth: '720px' }}>
          Manage workspace permissions, audit compliance logs, inspect integration channels, and configure scoring parameters.
        </p>
      </div>

      {statusMsg && (
        <div className="glass-card" style={{ padding: '12px 18px', marginBottom: '20px', borderColor: 'var(--accent-cyan)' }}>
          <span style={{ color: 'var(--accent-cyan)', fontWeight: 600 }}>⚡ {statusMsg}</span>
        </div>
      )}

      {/* Admin Tabs */}
      <div className="tab-container" style={{ marginBottom: '28px' }}>
        <button
          className={`tab-btn ${activeTab === 'users' ? 'active' : ''}`}
          onClick={() => setActiveTab('users')}
        >
          👥 Users &amp; Roles ({users.length})
        </button>
        <button
          className={`tab-btn ${activeTab === 'integrations' ? 'active' : ''}`}
          onClick={() => setActiveTab('integrations')}
        >
          🔌 Channel Integrations ({integrations.length})
        </button>
        <button
          className={`tab-btn ${activeTab === 'config' ? 'active' : ''}`}
          onClick={() => setActiveTab('config')}
        >
          ⚙️ Qualification Config
        </button>
        <button
          className={`tab-btn ${activeTab === 'audit' ? 'active' : ''}`}
          onClick={() => { setActiveTab('audit'); fetchAudit(); }}
        >
          📜 Compliance Audit Trail ({auditLogs.length})
        </button>
      </div>

      {/* TAB 1: Users & Roles */}
      {activeTab === 'users' && (
        <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* Add User Form */}
          <div className="glass-card" style={{ padding: '24px' }}>
            <h3 style={{ fontSize: '1.2rem', marginBottom: '14px' }}>Invite / Provision User</h3>
            <form onSubmit={handleCreateUser} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', alignItems: 'flex-end' }}>
              <div>
                <label className="subheading-label">Full Name</label>
                <input
                  type="text"
                  placeholder="Jane Doe"
                  value={newUserName}
                  onChange={(e) => setNewUserName(e.target.value)}
                  className="input-glass"
                  required
                />
              </div>
              <div>
                <label className="subheading-label">Email Address</label>
                <input
                  type="email"
                  placeholder="jane@company.com"
                  value={newUserEmail}
                  onChange={(e) => setNewUserEmail(e.target.value)}
                  className="input-glass"
                  required
                />
              </div>
              <div>
                <label className="subheading-label">Assigned Role</label>
                <select
                  value={newUserRole}
                  onChange={(e) => setNewUserRole(e.target.value as UserRole)}
                  className="input-glass"
                >
                  <option value="workspace_admin" style={{ background: '#111827' }}>Workspace Admin</option>
                  <option value="research_analyst" style={{ background: '#111827' }}>Research Analyst</option>
                  <option value="content_creator" style={{ background: '#111827' }}>Content Creator</option>
                  <option value="editor" style={{ background: '#111827' }}>Editor</option>
                  <option value="viewer" style={{ background: '#111827' }}>Viewer</option>
                </select>
              </div>
              <div>
                <button type="submit" className="btn-primary" style={{ width: '100%', height: '46px' }}>
                  + Add User
                </button>
              </div>
            </form>
          </div>

          {/* Users Table */}
          <div className="glass-card" style={{ padding: '24px' }}>
            <h3 style={{ fontSize: '1.2rem', marginBottom: '16px' }}>Workspace Directory</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {users.map((u) => (
                <div key={u.user_id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px', background: 'rgba(255,255,255,0.03)', borderRadius: '10px', border: '1px solid var(--border-glass)' }}>
                  <div>
                    <div style={{ fontWeight: 600, color: '#fff', fontSize: '0.95rem' }}>{u.full_name}</div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{u.email} • ID: {u.user_id}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <select
                      value={u.role}
                      onChange={(e) => handleUpdateRole(u.user_id, e.target.value as UserRole)}
                      className="input-glass"
                      style={{ padding: '6px 12px', fontSize: '0.8rem', width: 'auto' }}
                    >
                      <option value="workspace_admin" style={{ background: '#111827' }}>workspace_admin</option>
                      <option value="research_analyst" style={{ background: '#111827' }}>research_analyst</option>
                      <option value="content_creator" style={{ background: '#111827' }}>content_creator</option>
                      <option value="editor" style={{ background: '#111827' }}>editor</option>
                      <option value="viewer" style={{ background: '#111827' }}>viewer</option>
                    </select>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: Integrations (Masked Credentials) */}
      {activeTab === 'integrations' && (
        <div className="animate-fade-in" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
          {integrations.map((item) => (
            <div key={item.integration_id} className="glass-card" style={{ padding: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px' }}>
                <h3 style={{ fontSize: '1.2rem', color: '#fff', margin: 0 }}>{item.name}</h3>
                <span className={`badge ${item.status === 'active' ? 'badge-emerald' : 'badge-amber'}`}>
                  {item.status.toUpperCase()}
                </span>
              </div>
              <div style={{ marginBottom: '16px' }}>
                <div className="subheading-label">Credential Status:</div>
                <div style={{ fontFamily: 'monospace', fontSize: '0.9rem', color: 'var(--accent-cyan)', background: '#0a0e17', padding: '8px 12px', borderRadius: '6px' }}>
                  {item.masked_key}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                  🔒 Credentials securely masked per Section 38 compliance rule.
                </div>
              </div>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                <strong>Provider Type:</strong> {item.provider_type}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* TAB 3: Qualification Config */}
      {activeTab === 'config' && config && (
        <div className="animate-fade-in glass-card" style={{ padding: '28px', maxWidth: '640px' }}>
          <h3 style={{ fontSize: '1.25rem', marginBottom: '16px' }}>Scoring &amp; Pipeline Configuration</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div>
              <div className="subheading-label">
                Trend Qualification Threshold ({Math.round(config.trend_qualification_threshold * 100)}%)
              </div>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '10px' }}>
                Formula: 0.35 Vel + 0.25 Acc + 0.20 Nov. Trends scoring at or above this threshold trigger qualified status.
              </p>
              <input
                type="range"
                min="0.5"
                max="0.95"
                step="0.05"
                value={config.trend_qualification_threshold}
                onChange={(e) => handleUpdateConfig(parseFloat(e.target.value))}
                style={{ width: '100%', accentColor: 'var(--accent-cyan)' }}
              />
            </div>

            <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '16px' }}>
              <div className="subheading-label">Polling Interval</div>
              <div style={{ color: '#fff', fontSize: '0.95rem' }}>{config.poll_interval_minutes} minutes</div>
            </div>

            <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '16px' }}>
              <div className="subheading-label">Default Region</div>
              <div style={{ color: '#fff', fontSize: '0.95rem' }}>{config.default_region}</div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: Audit Trail */}
      {activeTab === 'audit' && (
        <div className="animate-fade-in glass-card" style={{ padding: '24px' }}>
          <h3 style={{ fontSize: '1.25rem', marginBottom: '16px' }}>Administrative Audit Trail</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {auditLogs.map((log) => (
              <div key={log.log_id} style={{ padding: '12px 16px', background: 'rgba(255,255,255,0.02)', borderRadius: '8px', border: '1px solid var(--border-glass)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem' }}>
                <div>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '4px' }}>
                    <span className="badge badge-cyan" style={{ fontSize: '0.65rem' }}>{log.action}</span>
                    <span style={{ color: '#fff', fontWeight: 600 }}>{log.resource_type}: {log.resource_id}</span>
                  </div>
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                    Actor: {log.actor_user_id} • {new Date(log.timestamp).toLocaleString()}
                  </div>
                </div>
                {log.metadata && Object.keys(log.metadata).length > 0 && (
                  <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', maxWidth: '280px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {JSON.stringify(log.metadata)}
                  </span>
                )}
              </div>
            ))}
            {auditLogs.length === 0 && (
              <div style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>
                No audit entries recorded yet.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
