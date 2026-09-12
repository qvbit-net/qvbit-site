import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabase'
import EmailAttachmentPicker from './EmailAttachmentPicker'

const STATUSES = ['open', 'in_progress', 'waiting_on_customer', 'resolved', 'closed']
const PRIORITIES = ['critical', 'high', 'normal', 'low']

function label(value) {
  return String(value || '').replaceAll('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

const SECTIONS = [
  { key: 'new', title: 'New tickets', statuses: ['open'] },
  { key: 'progress', title: 'In progress', statuses: ['in_progress', 'waiting_on_customer'] },
  { key: 'completed', title: 'Completed', statuses: ['resolved', 'closed'] },
]

export default function Ticketing() {
  const [tickets, setTickets] = useState([])
  const [selected, setSelected] = useState(null)
  const [notes, setNotes] = useState([])
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [showNew, setShowNew] = useState(false)
  const [collapsedSections, setCollapsedSections] = useState({ completed: true })
  const [draft, setDraft] = useState({ subject: '', description: '', requester_name: '', requester_email: '', requester_phone: '', issue_type: '', priority: 'normal' })
  const [note, setNote] = useState('')
  const [reply, setReply] = useState({ subject: '', body: '' })
  const [attachments, setAttachments] = useState([])
  const [busy, setBusy] = useState(false)

  async function loadTickets() {
    setLoading(true); setError('')
    const { data, error: queryError } = await supabase.from('tickets').select('*').order('updated_at', { ascending: false })
    if (queryError) setError(queryError.message)
    setTickets(data || [])
    setLoading(false)
  }

  async function loadDetail(ticket) {
    if (selected?.id === ticket.id) {
      setSelected(null)
      return
    }
    setSelected(ticket)
    setReply({ subject: `Re: ${ticket.subject}`, body: '' })
    const [n, m] = await Promise.all([
      supabase.from('ticket_notes').select('*').eq('ticket_id', ticket.id).order('created_at', { ascending: false }),
      supabase.from('ticket_messages').select('*').eq('ticket_id', ticket.id).order('created_at', { ascending: false }),
    ])
    setNotes(n.data || []); setMessages(m.data || [])
  }

  useEffect(() => { loadTickets() }, [])

  const visible = useMemo(() => tickets.filter((t) => (filter === 'all' || t.status === filter) && `${t.ticket_number} ${t.subject} ${t.requester_name} ${t.requester_email}`.toLowerCase().includes(search.toLowerCase())), [tickets, filter, search])

  async function createTicket(event) {
    event.preventDefault(); setBusy(true); setError('')
    const { data, error: insertError } = await supabase.from('tickets').insert(draft).select().single()
    if (insertError) setError(insertError.message)
    else {
      setShowNew(false)
      setDraft({ subject: '', description: '', requester_name: '', requester_email: '', requester_phone: '', issue_type: '', priority: 'normal' })
      await loadTickets()
      if (data) loadDetail(data)
    }
    setBusy(false)
  }

  async function updateStatus(status) {
    if (!selected) return
    const { data, error: updateError } = await supabase.from('tickets').update({ status, updated_at: new Date().toISOString(), resolved_at: status === 'resolved' || status === 'closed' ? new Date().toISOString() : null }).eq('id', selected.id).select().single()
    if (updateError) setError(updateError.message)
    else { setSelected(data); await loadTickets() }
  }

  async function addNote(event) {
    event.preventDefault(); if (!note.trim() || !selected) return
    const { error: noteError } = await supabase.from('ticket_notes').insert({ ticket_id: selected.id, note: note.trim() })
    if (noteError) setError(noteError.message)
    else { setNote(''); loadDetail(selected); setSelected(selected) }
  }

  async function sendReply(event) {
    event.preventDefault(); if (!selected || !selected.requester_email || !reply.body.trim()) return
    setBusy(true); setError('')
    try {
      const response = await fetch('/api/send-email', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ recipient: selected.requester_email, recipientName: selected.requester_name || selected.requester_email, subject: reply.subject || `Re: ${selected.subject}`, message: reply.body, attachments, activityType: 'ticket_email_sent', clientId: selected.customer_id || null }) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Email could not be sent.')
      const { error: logError } = await supabase.from('ticket_messages').insert({ ticket_id: selected.id, direction: 'outbound', recipient: selected.requester_email, subject: reply.subject, body: reply.body, attachment_count: attachments.length })
      if (logError) throw logError
      setReply({ subject: `Re: ${selected.subject}`, body: '' }); setAttachments([]); await loadDetail(selected); await updateStatus('waiting_on_customer')
    } catch (sendError) { setError(sendError.message) }
    setBusy(false)
  }

  function renderTicketRow(ticket) {
    const isOpen = selected?.id === ticket.id
    return (
      <div key={ticket.id} className={`ticket-list-item ${isOpen ? 'expanded' : ''}`}>
        <button type="button" className={`list-row ${isOpen ? 'active' : ''}`} onClick={() => loadDetail(ticket)} aria-expanded={isOpen}>
          <span><strong>#{ticket.ticket_number} · {ticket.subject}</strong><small>{ticket.requester_name || ticket.requester_email || 'Internal ticket'} · {label(ticket.status)}</small></span>
          <span className="ticket-row-end"><span className={`status-badge ${ticket.priority}`}>{label(ticket.priority)}</span><span aria-hidden="true">{isOpen ? '−' : '+'}</span></span>
        </button>
      </div>
    )
  }

  return <div className="page-stack">
    <div className="page-header"><div><div className="eyebrow">Service desk</div><h1>Tickets</h1><p className="muted">Create, track, document, and respond to support issues.</p></div><button className="primary-button" onClick={() => setShowNew(true)}>New ticket</button></div>
    {error && <div className="error-box">{error}</div>}
    <div className="two-column-layout" style={{ gridTemplateColumns: selected ? 'minmax(260px, 0.8fr) minmax(0, 1.5fr)' : '1fr' }}>
      <section className="panel-card">
        <div className="toolbar"><input placeholder="Search tickets…" value={search} onChange={(e) => setSearch(e.target.value)} /><select value={filter} onChange={(e) => setFilter(e.target.value)}><option value="all">All statuses</option>{STATUSES.map((s) => <option key={s} value={s}>{label(s)}</option>)}</select></div>
        {loading ? <p className="muted">Loading tickets…</p> : visible.length === 0 ? <p className="muted">No tickets found.</p> : <div className="ticket-sections">
          {SECTIONS.map((section) => {
            const sectionTickets = visible.filter((ticket) => section.statuses.includes(ticket.status))
            const collapsed = collapsedSections[section.key]
            return <section className="ticket-section" key={section.key}>
              <button type="button" className="ticket-section-header" onClick={() => setCollapsedSections((current) => ({ ...current, [section.key]: !current[section.key] }))} aria-expanded={!collapsed}>
                <span><strong>{section.title}</strong><span className="muted">{sectionTickets.length}</span></span><span aria-hidden="true">{collapsed ? '+' : '−'}</span>
              </button>
              {!collapsed && (sectionTickets.length ? <div className="list-stack">{sectionTickets.map(renderTicketRow)}</div> : <p className="muted ticket-empty">No tickets in this section.</p>)}
            </section>
          })}
        </div>}
      </section>
      {selected && <section className="panel-card"><div className="page-header compact"><div><div className="eyebrow">Ticket #{selected.ticket_number}</div><h2>{selected.subject}</h2><p className="muted">{selected.requester_name} {selected.requester_email ? `· ${selected.requester_email}` : ''}</p></div><select value={selected.status} onChange={(e) => updateStatus(e.target.value)}>{STATUSES.map((s) => <option key={s} value={s}>{label(s)}</option>)}</select></div><div className="detail-grid"><div><strong>Priority</strong><p>{label(selected.priority)}</p></div><div><strong>Issue type</strong><p>{selected.issue_type || '—'}</p></div></div><div className="ticket-description">{selected.description || 'No description provided.'}</div><hr /><h3>Internal notes</h3><form onSubmit={addNote} className="inline-form"><textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add an internal note…" required /><button className="secondary-button">Add note</button></form><div className="timeline">{notes.map((n) => <div className="timeline-item" key={n.id}><strong>Note</strong><p>{n.note}</p><small>{new Date(n.created_at).toLocaleString()}</small></div>)}</div><hr /><h3>Email response</h3><form onSubmit={sendReply} className="stack-form"><input value={reply.subject} onChange={(e) => setReply({ ...reply, subject: e.target.value })} placeholder="Subject" required /><textarea value={reply.body} onChange={(e) => setReply({ ...reply, body: e.target.value })} placeholder="Write a response…" required /><EmailAttachmentPicker attachments={attachments} onChange={setAttachments} /><button className="primary-button" disabled={busy || !selected.requester_email}>{busy ? 'Sending…' : 'Send email response'}</button></form><div className="timeline">{messages.map((m) => <div className="timeline-item" key={m.id}><strong>{label(m.direction)} email</strong><p>{m.body}</p><small>{new Date(m.created_at).toLocaleString()}</small></div>)}</div></section>}
    </div>
    {showNew && <div className="modal-backdrop"><section className="modal-card"><div className="page-header compact"><h2>New ticket</h2><button className="secondary-button" type="button" onClick={() => setShowNew(false)}>Close</button></div><form onSubmit={createTicket} className="stack-form"><input placeholder="Subject" value={draft.subject} onChange={(e) => setDraft({ ...draft, subject: e.target.value })} required /><textarea placeholder="Describe the issue" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} /><div className="form-grid"><input placeholder="Requester name" value={draft.requester_name} onChange={(e) => setDraft({ ...draft, requester_name: e.target.value })} /><input type="email" placeholder="Requester email" value={draft.requester_email} onChange={(e) => setDraft({ ...draft, requester_email: e.target.value })} /><input placeholder="Phone" value={draft.requester_phone} onChange={(e) => setDraft({ ...draft, requester_phone: e.target.value })} /><input placeholder="Issue type" value={draft.issue_type} onChange={(e) => setDraft({ ...draft, issue_type: e.target.value })} /></div><label>Priority<select value={draft.priority} onChange={(e) => setDraft({ ...draft, priority: e.target.value })}>{PRIORITIES.map((p) => <option key={p} value={p}>{label(p)}</option>)}</select></label><button className="primary-button" disabled={busy}>{busy ? 'Creating…' : 'Create ticket'}</button></form></section></div>}
  </div>
}
