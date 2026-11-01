"use client";
import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import './super-admin.css';
import ImportModal from '../../components/ImportModal';

export default function SuperAdminPage() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState(null);
  const [activeTab, setActiveTab] = useState('overview'); // 'overview' or 'admins'

  // Computed only on the client, after mount — never during server-side
  // render. This avoids the hydration mismatch that happens when
  // toLocaleDateString() picks a different locale format on the Node.js
  // server (e.g. 8/28/2026) than in the visitor's browser (e.g.
  // 28/08/2026), which forces React to discard and re-render the whole
  // tree client-side (the "Recoverable Error" / broken-UI flash).
  const [todayLabel, setTodayLabel] = useState('');
  useEffect(() => {
    setTodayLabel(new Date().toLocaleDateString('en-GB'));
  }, []);

  // Overview Stats
  const [stats, setStats] = useState({
    totalAdmins: 0,
    activeAdmins: 0,
    trialAdmins: 0,
    totalStudents: 0,
    totalBookings: 0,
    totalRevenue: 0,
    studentsByAdmin: []
  });

  // Admin management
  const [adminsList, setAdminsList] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Modals state
  const [adminModalOpen, setAdminModalOpen] = useState(false);
  const [editingAdminId, setEditingAdminId] = useState(null);
  const [admName, setAdmName] = useState('');
  const [admAcademy, setAdmAcademy] = useState('');
  const [admEmail, setAdmEmail] = useState('');
  const [admPassword, setAdmPassword] = useState('');
  const [admPlan, setAdmPlan] = useState('FREE');
  const [admStatus, setAdmStatus] = useState('TRIAL');

  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importTarget, setImportTarget] = useState({ id: '', name: '' });

  const [resetModalOpen, setResetModalOpen] = useState(false);
  const [resetTargetId, setResetTargetId] = useState('');
  const [resetTargetName, setResetTargetName] = useState('');
  const [resetNewPw, setResetNewPw] = useState('');

  // Toast
  const [toastMsg, setToastMsg] = useState('');
  const [toastBg, setToastBg] = useState('#7c3aed');
  const [toastShow, setToastShow] = useState(false);

  const showToast = (msg, bg = '#7c3aed') => {
    setToastMsg(msg);
    setToastBg(bg);
    setToastShow(true);
    setTimeout(() => setToastShow(false), 2800);
  };

  const getHeaders = () => {
    const token = localStorage.getItem('ams_token');
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    };
  };

  useEffect(() => {
    const token = localStorage.getItem('ams_token');
    const user = JSON.parse(localStorage.getItem('ams_user') || 'null');
    if (!token || !user || user.role !== 'SUPER_ADMIN') {
      router.replace('/login');
    } else {
      setCurrentUser(user);
      loadAll();
    }
  }, []);

  const loadAll = async () => {
    await Promise.all([loadOverview(), loadAdmins()]);
  };

  const loadOverview = async () => {
    try {
      const res = await fetch('/api/admins/stats/overview', { headers: getHeaders() });
      if (res.status === 401) {
        logout();
        return;
      }
      const data = await res.json();
      if (res.ok) {
        setStats(data);
      } else {
        showToast(data.error || 'Failed to load stats', '#ef4444');
      }
    } catch (err) {
      showToast('Error loading overview', '#ef4444');
    }
  };

  const loadAdmins = async () => {
    try {
      const res = await fetch('/api/admins', { headers: getHeaders() });
      const data = await res.json();
      if (res.ok) {
        setAdminsList(data);
      }
    } catch (err) {
      showToast('Error loading admins list', '#ef4444');
    }
  };

  const handleCreateAdmin = () => {
    setEditingAdminId(null);
    setAdmName('');
    setAdmAcademy('');
    setAdmEmail('');
    setAdmPassword('');
    setAdmPlan('FREE');
    setAdmStatus('TRIAL');
    setAdminModalOpen(true);
  };

  const handleEditAdmin = (admin) => {
    setEditingAdminId(admin._id);
    setAdmName(admin.name || '');
    setAdmAcademy(admin.academyName || '');
    setAdmEmail(admin.email || '');
    setAdmPlan(admin.subscriptionPlan || 'FREE');
    setAdmStatus(admin.subscriptionStatus || 'TRIAL');
    setAdminModalOpen(true);
  };

  const saveAdmin = async (e) => {
    e.preventDefault();
    if (!admName || !admEmail) {
      showToast('Name and email are required', '#ef4444');
      return;
    }
    if (!editingAdminId && (!admPassword || admPassword.length < 6)) {
      showToast('Password must be at least 6 characters', '#ef4444');
      return;
    }

    const payload = {
      name: admName,
      academyName: admAcademy,
      email: admEmail,
      subscriptionPlan: admPlan,
      subscriptionStatus: admStatus
    };
    if (!editingAdminId) {
      payload.password = admPassword;
    }

    const url = editingAdminId ? `/api/admins/${editingAdminId}` : '/api/admins';
    const method = editingAdminId ? 'PUT' : 'POST';

    try {
      const res = await fetch(url, {
        method,
        headers: getHeaders(),
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (res.ok) {
        showToast(editingAdminId ? 'Admin updated!' : 'Admin created!', '#00a876');
        setAdminModalOpen(false);
        loadAll();
      } else {
        showToast(data.error || 'Failed to save admin', '#ef4444');
      }
    } catch (err) {
      showToast('Server communication error', '#ef4444');
    }
  };

  const toggleActive = async (id, currentlyActive) => {
    try {
      const res = await fetch(`/api/admins/${id}`, {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify({ isActive: !currentlyActive })
      });
      if (res.ok) {
        showToast(currentlyActive ? 'Admin disabled.' : 'Admin enabled.', '#00a876');
        loadAll();
      }
    } catch (err) {
      showToast('Error modifying status', '#ef4444');
    }
  };

  const deleteAdmin = async (id, name) => {
    if (!confirm(`Delete admin "${name}"?\n\nThis removes their account. Their data will be orphaned (not deleted).`)) return;
    try {
      const res = await fetch(`/api/admins/${id}`, {
        method: 'DELETE',
        headers: getHeaders()
      });
      if (res.ok) {
        showToast('Admin deleted.', '#ff6b35');
        loadAll();
      }
    } catch (err) {
      showToast('Error deleting admin', '#ef4444');
    }
  };

  const openImport = (id, name) => {
    setImportTarget({ id, name });
    setImportModalOpen(true);
  };

  const openResetPw = (id, name) => {
    setResetTargetId(id);
    setResetTargetName(name);
    setResetNewPw('');
    setResetModalOpen(true);
  };

  const confirmResetPassword = async (e) => {
    e.preventDefault();
    if (!resetNewPw || resetNewPw.length < 6) {
      showToast('Password must be at least 6 characters', '#ef4444');
      return;
    }
    try {
      const res = await fetch(`/api/admins/${resetTargetId}/reset-password`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ newPassword: resetNewPw })
      });
      if (res.ok) {
        showToast('Password reset successfully!', '#00a876');
        setResetModalOpen(false);
      } else {
        const data = await res.json();
        showToast(data.error || 'Failed to reset password', '#ef4444');
      }
    } catch (err) {
      showToast('Error resetting password', '#ef4444');
    }
  };

  const logout = () => {
    localStorage.removeItem('ams_token');
    localStorage.removeItem('ams_user');
    router.replace('/login');
  };

  // Client filtering
  const filteredAdmins = adminsList.filter(a => {
    const search = searchQuery.toLowerCase();
    const matchSearch = !search ||
      (a.name || '').toLowerCase().includes(search) ||
      (a.email || '').toLowerCase().includes(search) ||
      (a.academyName || '').toLowerCase().includes(search);
    const matchStatus = !statusFilter || a.subscriptionStatus === statusFilter;
    return matchSearch && matchStatus;
  });

  const planColors = { FREE: '#8aa0bc', BASIC: '#1a56db', PRO: '#7c3aed', ENTERPRISE: '#ff6b35' };

  return (
    <div className="super-admin-body">
      {/* Sidebar */}
      <div className="sidebar">
        <div className="logo-area">
          <div className="logo">AMS</div>
          <div className="logo-badge">Super Admin</div>
        </div>
        <nav>
          <div className={`nav-item ${activeTab === 'overview' ? 'active' : ''}`} onClick={() => setActiveTab('overview')}>
            <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
            Overview
          </div>
          <div className={`nav-item ${activeTab === 'admins' ? 'active' : ''}`} onClick={() => setActiveTab('admins')}>
            <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
            Manage Admins
          </div>
        </nav>
        <div className="sidebar-footer">
          {currentUser && (
            <div className="user-chip">
              <div className="user-avatar">SA</div>
              <div>
                <div style={{ fontWeight: 700, color: '#e2eaf4', fontSize: '12px' }}>{currentUser.name || 'Super Admin'}</div>
                <div style={{ fontSize: '11px' }}>{currentUser.email || '—'}</div>
              </div>
            </div>
          )}
          <div className="logout-btn" onClick={logout}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
            Log Out
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="main">
        {activeTab === 'overview' && (
          <div>
            <div className="page-title">Platform Overview</div>
            <div className="page-sub">Platform statistics as of {todayLabel}</div>
            <div className="stats-grid">
              <div className="stat-card purple">
                <div className="stat-num">{stats.totalAdmins}</div>
                <div className="stat-label">Total Admins</div>
              </div>
              <div className="stat-card green">
                <div className="stat-num">{stats.activeAdmins}</div>
                <div className="stat-label">Active</div>
              </div>
              <div className="stat-card blue">
                <div className="stat-num">{stats.trialAdmins}</div>
                <div className="stat-label">Trial</div>
              </div>
              <div className="stat-card orange">
                <div className="stat-num">{stats.totalStudents}</div>
                <div className="stat-label">Total Students</div>
              </div>
              <div className="stat-card teal">
                <div className="stat-num">{stats.totalBookings}</div>
                <div className="stat-label">Total Bookings</div>
              </div>
            </div>

            <div className="section">
              <div className="section-title">Top Academies by Student Count</div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Academy</th>
                      <th>Admin</th>
                      <th>Email</th>
                      <th>Students</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.studentsByAdmin && stats.studentsByAdmin.length > 0 ? (
                      stats.studentsByAdmin.map((a, i) => (
                        <tr key={a._id || i}>
                          <td style={{ color: '#8aa0bc' }}>{i + 1}</td>
                          <td><strong style={{ color: '#e2eaf4' }}>{a.academyName || '—'}</strong></td>
                          <td>{a.adminName || '—'}</td>
                          <td style={{ color: '#8aa0bc' }}>{a.email || '—'}</td>
                          <td style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: '22px', color: '#7c3aed' }}>{a.count}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan="5" style={{ textAlign: 'center', color: '#8aa0bc', padding: '24px' }}>No data yet</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'admins' && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <div>
                <div className="page-title">Manage Admins</div>
                <div className="page-sub">All club / academy accounts</div>
              </div>
              <button className="btn btn-primary" onClick={handleCreateAdmin}>+ New Admin</button>
            </div>

            <div className="controls">
              <input
                type="search"
                placeholder="Search by name, email, academy…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ width: '240px' }}
              />
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                <option value="">All Statuses</option>
                <option value="ACTIVE">Active</option>
                <option value="TRIAL">Trial</option>
                <option value="SUSPENDED">Suspended</option>
                <option value="CANCELLED">Cancelled</option>
              </select>
            </div>

            <div className="section">
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Name</th>
                      <th>Academy</th>
                      <th>Email</th>
                      <th>Plan</th>
                      <th>Status</th>
                      <th>Joined</th>
                      <th>State</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAdmins.length > 0 ? (
                      filteredAdmins.map((a, i) => (
                        <tr key={a._id}>
                          <td style={{ color: '#8aa0bc' }}>{i + 1}</td>
                          <td><strong style={{ color: '#e2eaf4' }}>{a.name}</strong></td>
                          <td>{a.academyName || '—'}</td>
                          <td style={{ color: '#8aa0bc', fontSize: '12px' }}>{a.email}</td>
                          <td>
                            <span style={{ color: planColors[a.subscriptionPlan] || '#8aa0bc', fontWeight: 700, fontSize: '12px' }}>
                              {a.subscriptionPlan || 'FREE'}
                            </span>
                          </td>
                          <td>
                            <span className={`badge badge-${(a.subscriptionStatus || 'trial').toLowerCase()}`}>
                              {a.subscriptionStatus || 'TRIAL'}
                            </span>
                          </td>
                          <td style={{ color: '#8aa0bc', fontSize: '12px' }}>{new Date(a.createdAt).toLocaleDateString('en-GB')}</td>
                          <td>
                            {/* An account that's inactive AND has never logged in is a fresh
                                self-registration awaiting approval, not one an admin disabled.
                                lastLogin is null until their first successful login. */}
                            <span className={`badge ${a.isActive ? 'badge-active' : 'badge-inactive'}`}>
                              {a.isActive ? 'Active' : (a.lastLogin ? 'Disabled' : 'Pending Approval')}
                            </span>
                          </td>
                          <td>
                            <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
                              <button className="btn btn-secondary btn-sm" onClick={() => handleEditAdmin(a)}>Edit</button>
                              <button className="btn btn-secondary btn-sm" onClick={() => openImport(a._id, a.academyName || a.name)}>Import</button>
                              <button className="btn btn-secondary btn-sm" onClick={() => openResetPw(a._id, a.name)}>Reset PW</button>
                              <button className="btn btn-secondary btn-sm" onClick={() => toggleActive(a._id, a.isActive)}>
                                {a.isActive ? 'Disable' : (a.lastLogin ? 'Enable' : 'Approve')}
                              </button>
                              <button className="btn btn-danger btn-sm" onClick={() => deleteAdmin(a._id, a.name)}>Delete</button>
                            </div>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan="9" style={{ textAlign: 'center', color: '#8aa0bc', padding: '32px' }}>No admins found</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Admin Modal */}
      {adminModalOpen && (
        <div className="modal-overlay" onClick={() => setAdminModalOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>{editingAdminId ? 'Edit Admin' : 'New Admin Account'}</h3>
            <form onSubmit={saveAdmin}>
              <div className="form-group">
                <label>Admin Name</label>
                <input type="text" value={admName} onChange={(e) => setAdmName(e.target.value)} required />
              </div>
              <div className="form-group">
                <label>Academy Name</label>
                <input type="text" value={admAcademy} onChange={(e) => setAdmAcademy(e.target.value)} />
              </div>
              <div className="form-group">
                <label>Email Address</label>
                <input type="email" value={admEmail} onChange={(e) => setAdmEmail(e.target.value)} required />
              </div>
              {!editingAdminId && (
                <div className="form-group">
                  <label>Password</label>
                  <input type="password" value={admPassword} onChange={(e) => setAdmPassword(e.target.value)} placeholder="Min 6 characters" />
                </div>
              )}
              <div className="form-group">
                <label>Subscription Plan</label>
                <select value={admPlan} onChange={(e) => setAdmPlan(e.target.value)}>
                  <option value="FREE">FREE</option>
                  <option value="BASIC">BASIC</option>
                  <option value="PRO">PRO</option>
                  <option value="ENTERPRISE">ENTERPRISE</option>
                </select>
              </div>
              <div className="form-group">
                <label>Subscription Status</label>
                <select value={admStatus} onChange={(e) => setAdmStatus(e.target.value)}>
                  <option value="TRIAL">TRIAL</option>
                  <option value="ACTIVE">ACTIVE</option>
                  <option value="SUSPENDED">SUSPENDED</option>
                  <option value="CANCELLED">CANCELLED</option>
                </select>
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setAdminModalOpen(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">{editingAdminId ? 'Save Changes' : 'Create Admin'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Import Excel / CSV Modal */}
      <ImportModal
        open={importModalOpen}
        onClose={() => setImportModalOpen(false)}
        getHeaders={getHeaders}
        onToast={showToast}
        onImported={loadAll}
        tenantId={importTarget.id}
        tenantName={importTarget.name}
      />

      {/* Reset PW Modal */}
      {resetModalOpen && (
        <div className="modal-overlay" onClick={() => setResetModalOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Reset Password for <span style={{ color: '#7c3aed' }}>{resetTargetName}</span></h3>
            <form onSubmit={confirmResetPassword}>
              <div className="form-group">
                <label>New Password</label>
                <input
                  type="password"
                  placeholder="Min 6 characters"
                  value={resetNewPw}
                  onChange={(e) => setResetNewPw(e.target.value)}
                  required
                />
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setResetModalOpen(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Change Password</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Toast Alert */}
      <div id="toast" className={toastShow ? 'show' : ''} style={{ background: toastBg }}>
        {toastMsg}
      </div>
    </div>
  );
}