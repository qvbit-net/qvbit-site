import { useEffect, useState } from 'react'
import { supabase } from '../supabase'

const roles = [
  { value: 'owner', label: 'Owner / Super Admin', description: 'Full access, including user management and deletion.' },
  { value: 'admin', label: 'Admin', description: 'Read, create, and edit across the CRM, including financial data. No deletion or user management.' },
  { value: 'manager', label: 'Manager', description: 'Operational oversight with restricted administrative access.' },
  { value: 'technician', label: 'Technician', description: 'Jobs, tickets, services, and assigned operational work.' },
  { value: 'billing', label: 'Billing', description: 'Quotes, invoices, payments, and financial workflows.' },
  { value: 'read_only', label: 'Read Only', description: 'View-only access to permitted CRM information.' },
]

export default function SettingsUsers() {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState('')

  async function loadUsers() {
    setLoading(true)
    setError('')
    const { data, error: loadError } = await supabase
      .from('user_profiles')
      .select('id, email, full_name, role, is_active, created_at')
      .order('created_at', { ascending: true })
    if (loadError) setError(loadError.message)
    setUsers(data || [])
    setLoading(false)
  }

  useEffect(() => { loadUsers() }, [])

  async function updateUser(id, changes) {
    setSaving(id)
    setError('')
    const { error: updateError } = await supabase.from('user_profiles').update(changes).eq('id', id)
    if (updateError) setError(updateError.message)
    else setUsers((current) => current.map((user) => user.id === id ? { ...user, ...changes } : user))
    setSaving('')
  }

  return (
    <section className="page-section">
      <div className="page-header">
        <div><div className="eyebrow">Settings</div><h1>Users & Permissions</h1><p className="muted">Manage CRM access using role-based permissions.</p></div>
      </div>
      <div className="info-box"><strong>Security policy:</strong> Only Owner / Super Admin accounts may manage users or permanently delete records. New users should remain Read Only until assigned a role.</div>
      {error && <div className="error-box">{error}</div>}
      <div className="card"><h2>Team members</h2>{loading ? <p className="muted">Loading users…</p> : users.length === 0 ? <p className="muted">No user profiles found.</p> : <div className="table-wrap"><table><thead><tr><th>User</th><th>Role</th><th>Status</th><th>Actions</th></tr></thead><tbody>{users.map((user) => <tr key={user.id}><td><strong>{user.full_name || user.email || 'Unnamed user'}</strong><div className="muted">{user.email || 'No email recorded'}</div></td><td><select value={user.role || 'read_only'} disabled={saving === user.id} onChange={(event) => updateUser(user.id, { role: event.target.value })}>{roles.map((role) => <option key={role.value} value={role.value}>{role.label}</option>)}</select></td><td><span className={user.is_active === false ? 'status-badge danger' : 'status-badge success'}>{user.is_active === false ? 'Disabled' : 'Active'}</span></td><td><button className="secondary-button" disabled={saving === user.id} onClick={() => updateUser(user.id, { is_active: user.is_active === false })}>{user.is_active === false ? 'Enable' : 'Disable'}</button></td></tr>)}</tbody></table></div>}</div>
      <div className="card"><h2>Role reference</h2><div className="stack-list">{roles.map((role) => <div className="list-row" key={role.value}><strong>{role.label}</strong><span className="muted">{role.description}</span></div>)}</div></div>
    </section>
  )
}
