import React, { useEffect, useState } from 'react'
import { Pencil, Plus, Search, Trash2, UserRound, X } from 'lucide-react'
import { supabase } from '../supabase'

const ROLE_OPTIONS = [
  { value: 'technician', label: 'Technician' },
  { value: 'network_engineer', label: 'Network Engineer' },
  { value: 'field_engineer', label: 'Field Engineer' },
  { value: 'dispatcher', label: 'Dispatcher' },
  { value: 'subcontractor', label: 'Subcontractor' },
]

const emptyForm = {
  display_name: '',
  email: '',
  phone: '',
  role: 'technician',
  hourly_cost: '',
  default_bill_rate: '',
  active: true,
  notes: '',
}

function money(value) {
  if (value == null || value === '') return '—'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(Number(value))
}

function roleLabel(value) {
  return ROLE_OPTIONS.find((item) => item.value === value)?.label || value || 'Technician'
}

export default function Technicians() {
  const [technicians, setTechnicians] = useState([])
  const [form, setForm] = useState(emptyForm)
  const [editing, setEditing] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('active')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function load() {
    setLoading(true)
    setError('')
    const { data, error: loadError } = await supabase
      .from('technicians')
      .select('id, user_id, display_name, email, phone, role, hourly_cost, default_bill_rate, active, notes, created_at, updated_at')
      .order('active', { ascending: false })
      .order('display_name', { ascending: true })

    if (loadError) setError(loadError.message)
    setTechnicians(data || [])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  function openNew() {
    setEditing(null)
    setForm(emptyForm)
    setShowForm(true)
    setError('')
  }

  function openEdit(item) {
    setEditing(item)
    setForm({
      display_name: item.display_name || '',
      email: item.email || '',
      phone: item.phone || '',
      role: item.role || 'technician',
      hourly_cost: item.hourly_cost ?? '',
      default_bill_rate: item.default_bill_rate ?? '',
      active: item.active !== false,
      notes: item.notes || '',
    })
    setShowForm(true)
    setError('')
  }

  function closeForm() {
    setShowForm(false)
    setEditing(null)
    setForm(emptyForm)
  }

  function updateField(name, value) {
    setForm((current) => ({ ...current, [name]: value }))
  }

  async function save(event) {
    event.preventDefault()
    setError('')

    if (!form.display_name.trim()) {
      setError('Display name is required.')
      return
    }

    setSaving(true)

    const payload = {
      display_name: form.display_name.trim(),
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      role: form.role,
      hourly_cost: form.hourly_cost === '' ? null : Number(form.hourly_cost),
      default_bill_rate: form.default_bill_rate === '' ? null : Number(form.default_bill_rate),
      active: Boolean(form.active),
      notes: form.notes.trim() || null,
      updated_at: new Date().toISOString(),
    }

    const result = editing
      ? await supabase.from('technicians').update(payload).eq('id', editing.id)
      : await supabase.from('technicians').insert(payload)

    if (result.error) {
      setError(result.error.message)
      setSaving(false)
      return
    }

    closeForm()
    setSaving(false)
    await load()
  }

  async function toggleActive(item) {
    setError('')
    const { error: updateError } = await supabase
      .from('technicians')
      .update({ active: !item.active, updated_at: new Date().toISOString() })
      .eq('id', item.id)

    if (updateError) {
      setError(updateError.message)
      return
    }

    await load()
  }

  async function deleteTechnician(item) {
    if (!window.confirm(`Delete technician “${item.display_name}”? This is only appropriate if the technician has never been used in assignments.`)) return

    setError('')
    const { error: deleteError } = await supabase.from('technicians').delete().eq('id', item.id)

    if (deleteError) {
      setError(deleteError.message)
      return
    }

    await load()
  }

  const filtered = technicians.filter((item) => {
    const q = search.trim().toLowerCase()
    const matchesSearch = !q || [
      item.display_name,
      item.email,
      item.phone,
      item.role,
      item.notes,
    ].some((value) => String(value || '').toLowerCase().includes(q))

    const matchesStatus =
      statusFilter === 'all' ||
      (statusFilter === 'active' && item.active) ||
      (statusFilter === 'inactive' && !item.active)

    return matchesSearch && matchesStatus
  })

  const activeCount = technicians.filter((item) => item.active).length
  const inactiveCount = technicians.length - activeCount

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="eyebrow"><UserRound size={14} /> Field operations</div>
          <h1>Technicians</h1>
          <p>Manage the people and subcontractors available for field jobs, dispatch, and labor-cost tracking.</p>
        </div>
        <button type="button" className="primary-button" onClick={openNew}>
          <Plus size={16} /> New Technician
        </button>
      </div>

      {error && <div className="error-box page-error">{error}</div>}

      <div className="stat-grid" style={{ marginBottom: '20px' }}>
        <div className="stat-card"><span>Active</span><strong>{activeCount}</strong><small>Available for assignment</small></div>
        <div className="stat-card"><span>Inactive</span><strong>{inactiveCount}</strong><small>Not available for new jobs</small></div>
      </div>

      {showForm && (
        <section className="panel" style={{ marginBottom: '20px' }}>
          <div className="panel-header">
            <div>
              <h2>{editing ? 'Edit Technician' : 'New Technician'}</h2>
              <p>Set the role and labor rates used by dispatch and profitability.</p>
            </div>
            <button type="button" className="icon-button" onClick={closeForm} aria-label="Close"><X size={17} /></button>
          </div>

          <form onSubmit={save} className="stack-form">
            <div className="form-grid-3">
              <label>
                Display name
                <input value={form.display_name} onChange={(e) => updateField('display_name', e.target.value)} placeholder="John Smith" required />
              </label>
              <label>
                Email
                <input type="email" value={form.email} onChange={(e) => updateField('email', e.target.value)} placeholder="john@qvbit.net" />
              </label>
              <label>
                Phone
                <input value={form.phone} onChange={(e) => updateField('phone', e.target.value)} placeholder="(954) 555-0123" />
              </label>
            </div>

            <div className="form-grid-3">
              <label>
                Role
                <select value={form.role} onChange={(e) => updateField('role', e.target.value)}>
                  {ROLE_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                </select>
              </label>
              <label>
                Hourly cost
                <input type="number" min="0" step="0.01" value={form.hourly_cost} onChange={(e) => updateField('hourly_cost', e.target.value)} placeholder="0.00" />
              </label>
              <label>
                Default bill rate
                <input type="number" min="0" step="0.01" value={form.default_bill_rate} onChange={(e) => updateField('default_bill_rate', e.target.value)} placeholder="0.00" />
              </label>
            </div>

            <label>
              Notes
              <textarea value={form.notes} onChange={(e) => updateField('notes', e.target.value)} rows={3} placeholder="Certifications, specialties, coverage area, subcontractor details, etc." />
            </label>

            <label className="checkbox-row">
              <input type="checkbox" checked={form.active} onChange={(e) => updateField('active', e.target.checked)} />
              Active — available for new dispatch assignments
            </label>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', flexWrap: 'wrap' }}>
              <button type="button" className="secondary-button" onClick={closeForm}>Cancel</button>
              <button type="submit" className="primary-button" disabled={saving}>{saving ? 'Saving…' : editing ? 'Save Changes' : 'Create Technician'}</button>
            </div>
          </form>
        </section>
      )}

      <section className="panel">
        <div className="toolbar">
          <div className="search-box"><Search size={16} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search technicians…" /></div>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="active">Active only</option>
            <option value="inactive">Inactive only</option>
            <option value="all">All technicians</option>
          </select>
          <button type="button" className="secondary-button" onClick={load}>Refresh</button>
        </div>

        {loading ? (
          <div className="loading-box">Loading technicians…</div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <UserRound size={24} />
            <strong>No technicians found</strong>
            <p>Add your first technician or subcontractor to make the dispatch board usable.</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Technician</th>
                  <th>Role</th>
                  <th>Contact</th>
                  <th>Labor cost</th>
                  <th>Bill rate</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <strong>{item.display_name}</strong>
                      {item.notes && <div className="muted">{item.notes}</div>}
                    </td>
                    <td>{roleLabel(item.role)}</td>
                    <td>
                      {item.email || '—'}
                      {item.phone && <div className="muted">{item.phone}</div>}
                    </td>
                    <td>{money(item.hourly_cost)} / hr</td>
                    <td>{money(item.default_bill_rate)} / hr</td>
                    <td>{item.active ? 'Active' : 'Inactive'}</td>
                    <td>
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', flexWrap: 'wrap' }}>
                        <button type="button" className="text-button" onClick={() => openEdit(item)}><Pencil size={14} /> Edit</button>
                        <button type="button" className="text-button" onClick={() => toggleActive(item)}>{item.active ? 'Deactivate' : 'Activate'}</button>
                        <button type="button" className="text-button danger" onClick={() => deleteTechnician(item)}><Trash2 size={14} /> Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
