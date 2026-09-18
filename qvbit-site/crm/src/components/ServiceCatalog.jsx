import React, { useEffect, useMemo, useState } from 'react'
import { Package, Pencil, Plus, Search, X } from 'lucide-react'
import { supabase } from '../supabase'

const CATEGORIES = [
  ['field_services', 'Field Services'],
  ['network_engineering', 'Network Engineering'],
  ['managed_it', 'Managed IT'],
  ['partner_services', 'Partner Services'],
  ['hardware', 'Hardware'],
  ['other', 'Other'],
]

const BILLING_MODELS = [
  ['one_time', 'One-time'],
  ['recurring', 'Recurring'],
  ['project', 'Project'],
  ['usage', 'Usage'],
]

const UNITS = ['job', 'run', 'hour', 'day', 'each', 'user', 'device', 'site', 'month']

const emptyForm = {
  name: '',
  description: '',
  category: 'field_services',
  billing_model: 'one_time',
  unit: 'job',
  default_price: '',
  default_cost: '0',
  active: true,
}

function money(value) {
  if (value == null || value === '') return '—'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(Number(value))
}

function labelFor(options, value) {
  return options.find(([key]) => key === value)?.[1] || value || '—'
}

export default function ServiceCatalog() {
  const [services, setServices] = useState([])
  const [form, setForm] = useState(emptyForm)
  const [editing, setEditing] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [billingFilter, setBillingFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('active')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function load() {
    setLoading(true)
    setError('')
    const { data, error: loadError } = await supabase
      .from('services')
      .select('id, name, description, unit, default_price, default_cost, active, category, billing_model, created_at, updated_at')
      .order('active', { ascending: false })
      .order('category')
      .order('name')

    if (loadError) setError(loadError.message)
    setServices(data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  function openNew() {
    setEditing(null)
    setForm(emptyForm)
    setShowForm(true)
    setError('')
  }

  function openEdit(item) {
    setEditing(item)
    setForm({
      name: item.name || '',
      description: item.description || '',
      category: item.category || 'field_services',
      billing_model: item.billing_model || 'one_time',
      unit: item.unit || 'job',
      default_price: item.default_price ?? '',
      default_cost: item.default_cost ?? '0',
      active: item.active !== false,
    })
    setShowForm(true)
    setError('')
  }

  function closeForm() {
    setShowForm(false)
    setEditing(null)
    setForm(emptyForm)
  }

  function update(name, value) {
    setForm((current) => ({ ...current, [name]: value }))
  }

  async function save(event) {
    event.preventDefault()
    setError('')

    if (!form.name.trim()) {
      setError('Service name is required.')
      return
    }

    const price = form.default_price === '' ? null : Number(form.default_price)
    const cost = form.default_cost === '' ? 0 : Number(form.default_cost)

    if (price != null && (!Number.isFinite(price) || price < 0)) {
      setError('Default price must be a valid non-negative number.')
      return
    }
    if (!Number.isFinite(cost) || cost < 0) {
      setError('Default cost must be a valid non-negative number.')
      return
    }

    setSaving(true)

    const payload = {
      name: form.name.trim(),
      description: form.description.trim() || null,
      category: form.category,
      billing_model: form.billing_model,
      unit: form.unit,
      default_price: price,
      default_cost: cost,
      active: Boolean(form.active),
      updated_at: new Date().toISOString(),
    }

    const result = editing
      ? await supabase.from('services').update(payload).eq('id', editing.id)
      : await supabase.from('services').insert(payload)

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
      .from('services')
      .update({ active: !item.active, updated_at: new Date().toISOString() })
      .eq('id', item.id)

    if (updateError) setError(updateError.message)
    else await load()
  }

  const filtered = services.filter((item) => {
    const q = search.trim().toLowerCase()
    const matchesSearch = !q || [item.name, item.description, item.category, item.billing_model].some((value) => String(value || '').toLowerCase().includes(q))
    const matchesCategory = !categoryFilter || item.category === categoryFilter
    const matchesBilling = !billingFilter || item.billing_model === billingFilter
    const matchesStatus = statusFilter === 'all' || (statusFilter === 'active' && item.active) || (statusFilter === 'inactive' && !item.active)
    return matchesSearch && matchesCategory && matchesBilling && matchesStatus
  })

  const summary = useMemo(() => ({
    active: services.filter((item) => item.active).length,
    recurring: services.filter((item) => item.active && item.billing_model === 'recurring').length,
    project: services.filter((item) => item.active && item.billing_model === 'project').length,
    partner: services.filter((item) => item.active && item.category === 'partner_services').length,
  }), [services])

  const marginPreview = form.default_price !== '' && Number(form.default_price) > 0
    ? ((Number(form.default_price) - Number(form.default_cost || 0)) / Number(form.default_price)) * 100
    : null

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="eyebrow"><Package size={14} /> Catalog</div>
          <h1>Services</h1>
          <p>Build the QVB I.T. service catalog with billing models, default pricing, and default costs for quoting and profitability.</p>
        </div>
        <button type="button" className="primary-button" onClick={openNew}><Plus size={16} /> New Service</button>
      </div>

      {error && <div className="error-box page-error">{error}</div>}

      <div className="stat-grid" style={{ marginBottom: '20px' }}>
        <div className="stat-card"><span>Active services</span><strong>{summary.active}</strong><small>Available for quoting</small></div>
        <div className="stat-card"><span>Recurring</span><strong>{summary.recurring}</strong><small>Managed / recurring revenue</small></div>
        <div className="stat-card"><span>Projects</span><strong>{summary.project}</strong><small>Project-based services</small></div>
        <div className="stat-card"><span>Partner services</span><strong>{summary.partner}</strong><small>Subcontractor / partner work</small></div>
      </div>

      {showForm && (
        <section className="panel" style={{ marginBottom: '20px' }}>
          <div className="panel-header">
            <div>
              <h2>{editing ? 'Edit Service' : 'New Service'}</h2>
              <p>Default cost is used as the starting point for projected gross-margin calculations.</p>
            </div>
            <button type="button" className="icon-button" onClick={closeForm} aria-label="Close"><X size={17} /></button>
          </div>

          <form onSubmit={save} className="stack-form">
            <div className="form-grid-2">
              <label>Service name<input value={form.name} onChange={(e) => update('name', e.target.value)} placeholder="Remote Hands" required /></label>
              <label>Unit<select value={form.unit} onChange={(e) => update('unit', e.target.value)}>{UNITS.map((item) => <option key={item} value={item}>per {item}</option>)}</select></label>
            </div>

            <label>Description<textarea rows={3} value={form.description} onChange={(e) => update('description', e.target.value)} placeholder="What is included in this service?" /></label>

            <div className="form-grid-3">
              <label>Category<select value={form.category} onChange={(e) => update('category', e.target.value)}>{CATEGORIES.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
              <label>Billing model<select value={form.billing_model} onChange={(e) => update('billing_model', e.target.value)}>{BILLING_MODELS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
              <label>Default price<input type="number" min="0" step="0.01" value={form.default_price} onChange={(e) => update('default_price', e.target.value)} placeholder="0.00" /></label>
            </div>

            <div className="form-grid-2">
              <label>Default cost<input type="number" min="0" step="0.01" value={form.default_cost} onChange={(e) => update('default_cost', e.target.value)} placeholder="0.00" /></label>
              <div>
                <span className="field-label">Projected gross margin</span>
                <div className="info-box" style={{ marginTop: '6px' }}>
                  {marginPreview == null ? 'Enter a price to preview margin.' : `${marginPreview.toFixed(1)}% · ${money(Number(form.default_price) - Number(form.default_cost || 0))} gross profit per unit`}
                </div>
              </div>
            </div>

            <label className="checkbox-row"><input type="checkbox" checked={form.active} onChange={(e) => update('active', e.target.checked)} /> Active — available for new quotes</label>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', flexWrap: 'wrap' }}>
              <button type="button" className="secondary-button" onClick={closeForm}>Cancel</button>
              <button type="submit" className="primary-button" disabled={saving}>{saving ? 'Saving…' : editing ? 'Save Changes' : 'Create Service'}</button>
            </div>
          </form>
        </section>
      )}

      <section className="panel">
        <div className="toolbar">
          <div className="search-box"><Search size={16} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search services…" /></div>
          <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}><option value="">All categories</option>{CATEGORIES.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>
          <select value={billingFilter} onChange={(e) => setBillingFilter(e.target.value)}><option value="">All billing models</option>{BILLING_MODELS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}><option value="active">Active only</option><option value="inactive">Inactive only</option><option value="all">All services</option></select>
          <button type="button" className="secondary-button" onClick={load}>Refresh</button>
        </div>

        {loading ? <div className="loading-box">Loading services…</div> : filtered.length === 0 ? (
          <div className="empty-state"><Package size={24} /><strong>No services found</strong><p>Create the catalog items you will use in quotes and recurring contracts.</p></div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Service</th><th>Category</th><th>Billing</th><th>Price</th><th>Cost</th><th>Margin</th><th>Status</th><th></th></tr></thead>
              <tbody>{filtered.map((item) => {
                const margin = item.default_price > 0 ? ((Number(item.default_price) - Number(item.default_cost || 0)) / Number(item.default_price)) * 100 : null
                return <tr key={item.id}>
                  <td><strong>{item.name}</strong><div className="muted">{item.description || 'No description'}</div><div className="muted">per {item.unit}</div></td>
                  <td>{labelFor(CATEGORIES, item.category)}</td>
                  <td>{labelFor(BILLING_MODELS, item.billing_model)}</td>
                  <td>{money(item.default_price)}</td>
                  <td>{money(item.default_cost)}</td>
                  <td>{margin == null ? '—' : `${margin.toFixed(1)}%`}</td>
                  <td>{item.active ? 'Active' : 'Inactive'}</td>
                  <td><div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', flexWrap: 'wrap' }}><button type="button" className="text-button" onClick={() => openEdit(item)}><Pencil size={14} /> Edit</button><button type="button" className="text-button" onClick={() => toggleActive(item)}>{item.active ? 'Deactivate' : 'Activate'}</button></div></td>
                </tr>
              })}</tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
