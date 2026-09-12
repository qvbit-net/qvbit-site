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
  const [success, setSuccess] = useState('')
  const [saving, setSaving] = useState('')
  const [isOwner, setIsOwner] = useState(false)
  const [currentUserId, setCurrentUserId] = useState('')
  const [inviteOpen, setInviteOpen] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteName, setInviteName] = useState('')
  const [inviting, setInviting] = useState(false)

  async function loadUsers() {
    setLoading(true)
    setError('')

    const { data: currentUser } = await supabase.auth.getUser()
    const currentUserIdValue = currentUser?.user?.id
    setCurrentUserId(currentUserIdValue || '')

    const { data: profile, error: profileError } = await supabase
      .from('user_profiles')
      .select('role, is_active')
      .eq('id', currentUserIdValue)
      .maybeSingle()

    if (profileError) {
      setError(profileError.message)
      setLoading(false)
      return
    }

    const owner = profile?.role === 'owner' && profile?.is_active !== false
    setIsOwner(owner)

    if (!owner) {
      setError('Only Owner / Super Admin accounts may manage users.')
      setLoading(false)
      return
    }

    const { data, error: loadError } = await supabase
      .from('user_profiles')
      .select('id, display_name, role, is_active, created_at')
      .order('created_at', { ascending: true })

    if (loadError) setError(loadError.message)
    setUsers(data || [])
    setLoading(false)
  }

  useEffect(() => { loadUsers() }, [])

  async function updateUser(id, changes) {
    if (!isOwner || id === currentUserId) return
    setSaving(id)
    setError('')
    setSuccess('')
    const { error: updateError } = await supabase.from('user_profiles').update(changes).eq('id', id)
    if (updateError) setError(updateError.message)
    else {
      setUsers((current) => current.map((user) => user.id === id ? { ...user, ...changes } : user))
      setSuccess('User permissions updated.')
    }
    setSaving('')
  }

  async function inviteUser(event) {
    event.preventDefault()
    if (!isOwner || inviting) return

    setInviting(true)
    setError('')
    setSuccess('')

    const email = inviteEmail.trim().toLowerCase()
    const displayName = inviteName.trim()

    const { data, error: inviteError } = await supabase.functions.invoke('invite-user', {
      body: {
        email,
        display_name: displayName,
      },
    })

    if (inviteError) {
      let message = inviteError.message || 'Unable to send the invitation.'
      if (inviteError.context) {
        try {
          const payload = await inviteError.context.json()
          if (payload?.error) message = payload.error
        } catch {
          // Keep the default error message when the response is not JSON.
        }
      }
      setError(message)
    } else if (data?.success) {
      setSuccess(data.message || `Invitation sent to ${email}.`)
      setInviteEmail('')
      setInviteName('')
      setInviteOpen(false)
      await loadUsers()
    }

    setInviting(false)
  }

  return (
    <section className="page-section">
      <div className="page-header">
        <div><div className="eyebrow">Settings</div><h1>Users & Permissions</h1><p className="muted">Manage CRM access using role-based permissions.</p></div>
        {isOwner && <button className="primary-button" onClick={() => { setInviteOpen((current) => !current); setError(''); setSuccess('') }}>
          {inviteOpen ? 'Cancel' : 'Add User'}
        </button>}
      </div>

      <div className="info-box"><strong>Security policy:</strong> Only Owner / Super Admin accounts may manage users, assign roles, disable accounts, or permanently delete records. New users are invited as Read Only until you assign another role.</div>
      {error && <div className="error-box">{error}</div>}
      {success && <div className="info-box">{success}</div>}

      {isOwner && inviteOpen && <div className="card">
        <h2>Invite team member</h2>
        <p className="muted">Send a secure Supabase invitation. The new account will start as Read Only.</p>
        <form className="stack-form" onSubmit={inviteUser}>
          <label>
            Name
            <input value={inviteName} onChange={(event) => setInviteName(event.target.value)} placeholder="Employee name" maxLength={120} />
          </label>
          <label>
            Email address
            <input type="email" value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} placeholder="employee@qvbit.net" required maxLength={320} />
          </label>
          <button className="primary-button" type="submit" disabled={inviting || !inviteEmail.trim()}>
            {inviting ? 'Sending invitation…' : 'Send Invitation'}
          </button>
        </form>
      </div>}

      {isOwner && <>
        <div className="card"><h2>Team members</h2>{loading ? <p className="muted">Loading users…</p> : users.length === 0 ? <p className="muted">No user profiles found.</p> : <div className="table-wrap"><table><thead><tr><th>User</th><th>Role</th><th>Status</th><th>Actions</th></tr></thead><tbody>{users.map((user) => { const isSelf = user.id === currentUserId; return <tr key={user.id}><td><strong>{user.display_name || 'Unnamed user'}</strong><div className="muted">{isSelf ? 'Current account' : user.id}</div></td><td><select value={user.role || 'read_only'} disabled={saving === user.id || isSelf} onChange={(event) => updateUser(user.id, { role: event.target.value })}>{roles.map((role) => <option key={role.value} value={role.value}>{role.label}</option>)}</select></td><td><span className={user.is_active === false ? 'status-badge danger' : 'status-badge success'}>{user.is_active === false ? 'Disabled' : 'Active'}</span></td><td>{isSelf ? <span className="muted">Current account</span> : <button className="secondary-button" disabled={saving === user.id} onClick={() => updateUser(user.id, { is_active: user.is_active === false })}>{user.is_active === false ? 'Enable' : 'Disable'}</button>}</td></tr> })}</tbody></table></div>}</div>
        <div className="card"><h2>Role reference</h2><div className="stack-list">{roles.map((role) => <div className="list-row" key={role.value}><strong>{role.label}</strong><span className="muted">{role.description}</span></div>)}</div></div>
      </>}
    </section>
  )
}
