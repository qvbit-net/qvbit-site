import { useEffect, useMemo, useState } from 'react'
import { Search, RefreshCw, ShieldCheck } from 'lucide-react'
import { supabase } from '../supabase'

function formatDate(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString([], {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function formatAction(action) {
  return String(action || 'unknown')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function formatDetails(details) {
  if (!details || typeof details !== 'object') return '—'
  const entries = Object.entries(details)
  if (!entries.length) return '—'
  return entries
    .map(([key, value]) => `${formatAction(key)}: ${typeof value === 'object' ? JSON.stringify(value) : String(value)}`)
    .join(' • ')
}

export default function SettingsAuditLog() {
  const [entries, setEntries] = useState([])
  const [actors, setActors] = useState({})
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [actionFilter, setActionFilter] = useState('all')
  const [moduleFilter, setModuleFilter] = useState('all')

  async function loadAuditLog({ silent = false } = {}) {
    if (silent) setRefreshing(true)
    else setLoading(true)
    setError('')

    const [{ data, error: auditError }, { data: profiles }] = await Promise.all([
      supabase
        .from('crm_audit_log')
        .select('id, actor_id, action, module, record_id, details, created_at')
        .order('created_at', { ascending: false })
        .limit(500),
      supabase
        .from('user_profiles')
        .select('id, display_name, email'),
    ])

    if (auditError) {
      setError(auditError.message)
      setEntries([])
    } else {
      setEntries(data || [])
      const actorMap = {}
      for (const profile of profiles || []) {
        actorMap[profile.id] = profile.display_name || profile.email || profile.id
      }
      setActors(actorMap)
    }

    setLoading(false)
    setRefreshing(false)
  }

  useEffect(() => {
    loadAuditLog()
  }, [])

  const actions = useMemo(
    () => [...new Set(entries.map((entry) => entry.action).filter(Boolean))].sort(),
    [entries],
  )

  const modules = useMemo(
    () => [...new Set(entries.map((entry) => entry.module).filter(Boolean))].sort(),
    [entries],
  )

  const filteredEntries = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    return entries.filter((entry) => {
      if (actionFilter !== 'all' && entry.action !== actionFilter) return false
      if (moduleFilter !== 'all' && entry.module !== moduleFilter) return false
      if (!normalizedQuery) return true

      const actor = actors[entry.actor_id] || entry.actor_id || ''
      const searchable = [
        actor,
        entry.action,
        entry.module,
        entry.record_id,
        formatDetails(entry.details),
      ].join(' ').toLowerCase()

      return searchable.includes(normalizedQuery)
    })
  }, [entries, actors, query, actionFilter, moduleFilter])

  return (
    <section className="page-section">
      <div className="page-header">
        <div>
          <div className="eyebrow"><ShieldCheck size={14} /> Security</div>
          <h1>Audit Log</h1>
          <p className="muted">Review recorded CRM security and administrative changes.</p>
        </div>
        <button className="secondary-button" type="button" onClick={() => loadAuditLog({ silent: true })} disabled={loading || refreshing}>
          <RefreshCw size={16} />
          {refreshing ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      <div className="info-box">
        <strong>Owner only.</strong> Audit entries are protected by the database and are readable only by Owner / Super Admin accounts.
      </div>

      {error && <div className="error-box">{error}</div>}

      <div className="card">
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(240px, 1fr) 180px 180px', gap: '10px', marginBottom: '14px' }}>
          <label style={{ position: 'relative' }}>
            <span className="sr-only">Search audit log</span>
            <Search size={16} style={{ position: 'absolute', left: '11px', top: '12px', color: '#64748b' }} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search actor, action, module, record…"
              style={{ paddingLeft: '34px' }}
            />
          </label>
          <label>
            <span className="sr-only">Filter by action</span>
            <select value={actionFilter} onChange={(event) => setActionFilter(event.target.value)}>
              <option value="all">All actions</option>
              {actions.map((action) => <option key={action} value={action}>{formatAction(action)}</option>)}
            </select>
          </label>
          <label>
            <span className="sr-only">Filter by module</span>
            <select value={moduleFilter} onChange={(event) => setModuleFilter(event.target.value)}>
              <option value="all">All modules</option>
              {modules.map((module) => <option key={module} value={module}>{formatAction(module)}</option>)}
            </select>
          </label>
        </div>

        {loading ? (
          <p className="muted">Loading audit log…</p>
        ) : filteredEntries.length === 0 ? (
          <p className="muted">No audit entries match the current filters.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date / Time</th>
                  <th>Actor</th>
                  <th>Action</th>
                  <th>Module</th>
                  <th>Record</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {filteredEntries.map((entry) => (
                  <tr key={entry.id}>
                    <td>{formatDate(entry.created_at)}</td>
                    <td>{actors[entry.actor_id] || entry.actor_id || 'System'}</td>
                    <td><strong>{formatAction(entry.action)}</strong></td>
                    <td>{entry.module || '—'}</td>
                    <td>{entry.record_id || '—'}</td>
                    <td style={{ maxWidth: '520px' }}>{formatDetails(entry.details)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  )
}
