import React, { useState, useEffect } from 'react';
import type { AdminUser, IntegrationInfo, WorkspaceConfig, AuditLogItem, UserRole } from '../types';
import { API_BASE } from '../apiConfig';
import {
  IconUsers,
  IconRadar,
  IconAdmin,
  IconShield,
  IconPlus
} from '../components/Icons';
import { Select } from '../components/Select';

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

  // Truthful provider health formatter
  const getProviderHealth = (status: string, maskedKey?: string) => {
    if (!maskedKey || maskedKey.includes('not_set') || maskedKey === '••••••••••••••••') {
      return { label: 'Not configured', badgeClass: 'badge-neutral' };
    }
    if (status === 'active' || status === 'healthy') {
      return { label: 'Healthy • Live', badgeClass: 'badge-emerald' };
    }
    if (status === 'degraded' || status === 'quota_exceeded') {
      return { label: 'Degraded', badgeClass: 'badge-amber' };
    }
    return { label: 'Unavailable', badgeClass: 'badge-amber' };
  };

  return (
    <div className="page-container animate-fade-in">
      <div style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Administration &amp; Governance</h1>
          <span className="badge badge-emerald">Admin Only</span>
        </div>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.92rem', maxWidth: '720px', margin: 0 }}>
          Manage workspace permissions, audit compliance logs, inspect integration channels, and configure scoring parameters.
        </p>
      </div>

      {statusMsg && (
        <div className="glass-card" style={{ padding: '12px 18px', marginBottom: '20px', borderColor: 'var(--action-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span className="pulse-dot" />
          <span style={{ color: 'var(--action-primary)', fontWeight: 600, fontSize: '0.88rem' }}>{statusMsg}</span>
        </div>
      )}

      {/* Admin Tabs */}
      <div className="tab-container" style={{ marginBottom: '28px' }}>
        <button
          className={`tab-btn ${activeTab === 'users' ? 'active' : ''}`}
          onClick={() => setActiveTab('users')}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
        >
          <IconUsers size={15} />
          <span>Users &amp; Roles ({users.length})</span>
        </button>
        <button
          className={`tab-btn ${activeTab === 'integrations' ? 'active' : ''}`}
          onClick={() => setActiveTab('integrations')}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
        >
          <IconRadar size={15} />
          <span>Channel Integrations ({integrations.length})</span>
        </button>
        <button
          className={`tab-btn ${activeTab === 'config' ? 'active' : ''}`}
          onClick={() => setActiveTab('config')}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
        >
          <IconAdmin size={15} />
          <span>Qualification Config</span>
        </button>
        <button
          className={`tab-btn ${activeTab === 'audit' ? 'active' : ''}`}
          onClick={() => { setActiveTab('audit'); fetchAudit(); }}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
        >
          <IconShield size={15} />
          <span>Compliance Audit Trail ({auditLogs.length})</span>
        </button>
      </div>

      {/* TAB 1: Users & Roles */}
      {activeTab === 'users' && (
        <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* Add User Form */}
          <div className="glass-card" style={{ padding: '24px' }}>
            <h3 style={{ fontSize: '1.15rem', marginBottom: '14px', color: 'var(--text-primary)', fontWeight: 600 }}>Invite / Provision User</h3>
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
                <Select
                  value={newUserRole}
                  onChange={(e) => setNewUserRole(e.target.value as UserRole)}
                  aria-label="Assigned Role"
                >
                  <option value="workspace_admin">Workspace Admin</option>
                  <option value="research_analyst">Research Analyst</option>
                  <option value="content_creator">Content Creator</option>
                  <option value="editor">Editor</option>
                  <option value="viewer">Viewer</option>
                </Select>
              </div>
              <div>
                <button type="submit" className="btn-primary" style={{ width: '100%', height: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                  <IconPlus size={14} />
                  <span>Add User</span>
                </button>
              </div>
            </form>
          </div>

          {/* Users Table */}
          <div className="glass-card" style={{ padding: '24px' }}>
            <h3 style={{ fontSize: '1.15rem', marginBottom: '16px', color: 'var(--text-primary)', fontWeight: 600 }}>Workspace Directory</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {users.map((u) => (
                <div key={u.user_id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 18px', background: '#FFFFFF', borderRadius: '10px', border: '1px solid var(--border-subtle)', boxShadow: 'var(--shadow-sm)' }}>
                  <div>
                    <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.95rem' }}>{u.full_name}</div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{u.email} • ID: {u.user_id}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <Select
                      sizeVariant="sm"
                      value={u.role}
                      onChange={(e) => handleUpdateRole(u.user_id, e.target.value as UserRole)}
                      containerStyle={{ width: 'auto' }}
                      aria-label={`Role for ${u.full_name}`}
                    >
                      <option value="workspace_admin">workspace_admin</option>
                      <option value="research_analyst">research_analyst</option>
                      <option value="content_creator">content_creator</option>
                      <option value="editor">editor</option>
                      <option value="viewer">viewer</option>
                    </Select>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: Integrations (Truthful Health & Masked Credentials) */}
      {activeTab === 'integrations' && (
        <div className="animate-fade-in" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
          {integrations.map((item) => {
            const health = getProviderHealth(item.status, item.masked_key);

            return (
              <div key={item.integration_id} className="glass-card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px' }}>
                    <h3 style={{ fontSize: '1.2rem', color: 'var(--text-primary)', margin: 0, fontWeight: 600 }}>{item.name}</h3>
                    <span className={`badge ${health.badgeClass}`}>
                      {health.label}
                    </span>
                  </div>
                  <div style={{ marginBottom: '16px' }}>
                    <div className="subheading-label">Credential Status:</div>
                    <div style={{ fontFamily: 'monospace', fontSize: '0.88rem', color: 'var(--action-primary)', background: '#FFFFFF', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border-subtle)', fontWeight: 600, boxShadow: 'var(--shadow-sm)' }}>
                      {item.masked_key}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '6px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <IconShield size={12} />
                      <span>Credentials securely masked per Section 38 compliance rule.</span>
                    </div>
                  </div>
                </div>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', borderTop: '1px solid var(--border-subtle)', paddingTop: '12px' }}>
                  <strong>Provider Type:</strong> {item.provider_type}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* TAB 3: Qualification Config */}
      {activeTab === 'config' && config && (
        <div className="animate-fade-in glass-card" style={{ padding: '28px', maxWidth: '640px' }}>
          <h3 style={{ fontSize: '1.25rem', marginBottom: '16px', color: 'var(--text-primary)', fontWeight: 600 }}>Scoring &amp; Pipeline Configuration</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div>
              <div className="subheading-label">
                Trend Qualification Threshold ({Math.round(config.trend_qualification_threshold * 100)}%)
              </div>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '12px' }}>
                Formula: 0.35 Vel + 0.25 Acc + 0.20 Nov. Trends scoring at or above this threshold trigger qualified status.
              </p>
              <input
                type="range"
                min="0.5"
                max="0.95"
                step="0.05"
                value={config.trend_qualification_threshold}
                onChange={(e) => handleUpdateConfig(parseFloat(e.target.value))}
                style={{ width: '100%', accentColor: 'var(--action-primary)' }}
              />
            </div>

            <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '16px' }}>
              <div className="subheading-label">Polling Interval</div>
              <div style={{ color: 'var(--text-primary)', fontSize: '0.95rem', fontWeight: 500 }}>{config.poll_interval_minutes} minutes</div>
            </div>

            <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '16px' }}>
              <div className="subheading-label">Default Region</div>
              <div style={{ color: 'var(--text-primary)', fontSize: '0.95rem', fontWeight: 500 }}>{config.default_region}</div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: Audit Trail */}
      {activeTab === 'audit' && (
        <div className="animate-fade-in glass-card" style={{ padding: '24px' }}>
          <h3 style={{ fontSize: '1.25rem', marginBottom: '16px', color: 'var(--text-primary)', fontWeight: 600 }}>Administrative Audit Trail</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {auditLogs.map((log) => (
              <div key={log.log_id} style={{ padding: '14px 18px', background: '#FFFFFF', borderRadius: '8px', border: '1px solid var(--border-subtle)', boxShadow: 'var(--shadow-sm)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem' }}>
                <div>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '4px' }}>
                    <span className="badge badge-cyan" style={{ fontSize: '0.65rem' }}>{log.action}</span>
                    <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{log.resource_type}: {log.resource_id}</span>
                  </div>
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>
                    Actor: {log.actor_user_id} • {new Date(log.timestamp).toLocaleString()}
                  </div>
                </div>
                {log.metadata && Object.keys(log.metadata).length > 0 && (
                  <span style={{ color: 'var(--text-secondary)', fontSize: '0.78rem', maxWidth: '320px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
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
