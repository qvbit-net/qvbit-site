import React, { useEffect, useState } from 'react'
import { Mail, Pencil, Plus, Star, Trash2, X } from 'lucide-react'
import { supabase } from '../supabase'

const EMPTY_FORM = { email: '', label: 'Other', is_primary: false }

export default function EmailAddressManager({ customerId, legacyEmail = null, onPrimaryChange }) {
  const [emails, setEmails] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)

  async function loadEmails() {
    if (!customerId) return
    setLoading(true)
    setError('')

    const { data, error: loadError } = await supabase
      .from('customer_emails')
      .select('id, email, label, is_primary, created_at, updated_at')
      .eq('customer_id', customerId)
      .order('is_primary', { ascending: false })
      .order('created_at', { ascending: true })

    if (loadError) {
      setError(loadError.message)
      setEmails([])
    } else {
      setEmails(data || [])
    }

    setLoading(false)
  }

  useEffect(() => {
    loadEmails()
  }, [customerId])

  function startAdd() {
    setEditing('new')
    setForm({ ...EMPTY_FORM, is_primary: emails.length === 0 })
    setError('')
  }

  function startEdit(item) {
    setEditing(item.id)
    setForm({
      email: item.email || '',
      label: item.label || 'Other',
      is_primary: Boolean(item.is_primary),
    })
    setError('')
  }

  function closeEditor() {
    if (busy) return
    setEditing(null)
    setForm(EMPTY_FORM)
  }

  async function saveEmail(event) {
    event.preventDefault()
    const email = form.email.trim().toLowerCase()

    if (!email) {
      setError('Enter an email address.')
      return
    }

    setBusy(true)
    setError('')

    if (form.is_primary) {
      await supabase
        .from('customer_emails')
        .update({ is_primary: false })
        .eq('customer_id', customerId)
    }

    const payload = {
      customer_id: customerId,
      email,
      label: form.label.trim() || 'Other',
      is_primary: Boolean(form.is_primary),
    }

    const result = editing === 'new'
      ? await supabase.from('customer_emails').insert(payload)
      : await supabase.from('customer_emails').update({
          email: payload.email,
          label: payload.label,
          is_primary: payload.is_primary,
          updated_at: new Date().toISOString(),
        }).eq('id', editing)

    if (result.error) {
      setError(result.error.message)
      setBusy(false)
      return
    }

    if (payload.is_primary) {
      const { error: legacyError } = await supabase
        .from('customers')
        .update({ email: payload.email })
        .eq('id', customerId)

      if (legacyError) console.warn('Could not synchronize legacy customer email:', legacyError.message)
      onPrimaryChange?.(payload.email)
    }

    closeEditor()
    setBusy(false)
    await loadEmails()
  }

  async function makePrimary(item) {
    setBusy(true)
    setError('')

    await supabase
      .from('customer_emails')
      .update({ is_primary: false })
      .eq('customer_id', customerId)

    const { error: updateError } = await supabase
      .from('customer_emails')
      .update({ is_primary: true, updated_at: new Date().toISOString() })
      .eq('id', item.id)

    if (updateError) {
      setError(updateError.message)
    } else {
      await supabase.from('customers').update({ email: item.email }).eq('id', customerId)
      onPrimaryChange?.(item.email)
      await loadEmails()
    }

    setBusy(false)
  }

  async function deleteEmail(item) {
    if (!window.confirm(`Delete ${item.email}?`)) return

    setBusy(true)
    setError('')

    const { error: deleteError } = await supabase
      .from('customer_emails')
      .delete()
      .eq('id', item.id)

    if (deleteError) {
      setError(deleteError.message)
    } else {
      await loadEmails()
    }

    setBusy(false)
  }

  return (
    <section className="card" style={{ marginTop: '18px' }}>
      <div className="card-header">
        <div>
          <div className="eyebrow"><Mail size={14} /> Email addresses</div>
          <h3 style={{ marginBottom: '4px' }}>Customer email addresses</h3>
          <p className="muted" style={{ margin: 0 }}>Store multiple addresses and choose which one is primary.</p>
        </div>
        <button type="button" className="secondary-button" onClick={startAdd} disabled={busy}>
          <Plus size={16} /> Add email
        </button>
      </div>

      {error && <div className="error-box" style={{ marginTop: '12px' }}>{error}</div>}

      {loading ? (
        <p className="muted">Loading email addresses…</p>
      ) : emails.length === 0 ? (
        <div className="empty-state" style={{ marginTop: '14px' }}>
          {legacyEmail ? `The legacy customer email is ${legacyEmail}. Add it here if you want it managed as a named address.` : 'No additional email addresses have been saved yet.'}
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '8px', marginTop: '14px' }}>
          {emails.map((item) => (
            <div key={item.id} className="list-row" style={{ alignItems: 'center' }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <strong style={{ overflowWrap: 'anywhere' }}>{item.email}</strong>
                <div className="muted" style={{ fontSize: '12px', marginTop: '3px' }}>
                  {item.label || 'Other'}{item.is_primary ? ' · Primary' : ''}
                </div>
              </div>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                {!item.is_primary && (
                  <button type="button" className="icon-button" title="Make primary" onClick={() => makePrimary(item)} disabled={busy}>
                    <Star size={15} />
                  </button>
                )}
                <button type="button" className="icon-button" title="Edit" onClick={() => startEdit(item)} disabled={busy}>
                  <Pencil size={15} />
                </button>
                <button type="button" className="icon-button danger" title="Delete" onClick={() => deleteEmail(item)} disabled={busy}>
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <form onSubmit={saveEmail} className="stack-form" style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <strong>{editing === 'new' ? 'Add email address' : 'Edit email address'}</strong>
            <button type="button" className="icon-button" onClick={closeEditor} disabled={busy}><X size={16} /></button>
          </div>
          <label>
            Email address
            <input type="email" value={form.email} onChange={(e) => setForm((current) => ({ ...current, email: e.target.value }))} required autoFocus />
          </label>
          <label>
            Label
            <select value={form.label} onChange={(e) => setForm((current) => ({ ...current, label: e.target.value }))}>
              <option>Primary</option>
              <option>Work</option>
              <option>Billing</option>
              <option>Accounts Payable</option>
              <option>Personal</option>
              <option>Other</option>
            </select>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <input type="checkbox" checked={form.is_primary} onChange={(e) => setForm((current) => ({ ...current, is_primary: e.target.checked }))} />
            Make this the primary email
          </label>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button type="submit" className="primary-button" disabled={busy}>{busy ? 'Saving…' : 'Save email'}</button>
            <button type="button" className="secondary-button" onClick={closeEditor} disabled={busy}>Cancel</button>
          </div>
        </form>
      )}
    </section>
  )
}
