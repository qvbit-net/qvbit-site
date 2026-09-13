import { useEffect, useState } from 'react'
import { Building2, RefreshCw } from 'lucide-react'
import { supabase } from '../supabase'

const money = (value) => `$${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const fmt = (value) => value ? new Date(value).toLocaleDateString() : '—'

export default function Customer360() {
  const [customers, setCustomers] = useState([])
  const [customerId, setCustomerId] = useState('')
  const [data, setData] = useState({ customer: null, contacts: [], emails: [], opportunities: [], quotes: [], jobs: [], invoices: [], tickets: [], activities: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function loadCustomers() {
    const { data: rows, error: queryError } = await supabase.from('customers').select('id, company_name, phone, email, website, billing_address, city, state, zip, notes').order('company_name')
    if (queryError) { setError(queryError.message); return }
    setCustomers(rows || [])
    if (!customerId && rows?.[0]?.id) setCustomerId(rows[0].id)
  }

  async function loadCustomer(id) {
    if (!id) return
    setLoading(true); setError('')
    const results = await Promise.all([
      supabase.from('customers').select('*').eq('id', id).maybeSingle(),
      supabase.from('contacts').select('*').eq('customer_id', id).order('created_at', { ascending: true }),
      supabase.from('customer_emails').select('*').eq('customer_id', id).order('is_primary', { ascending: false }),
      supabase.from('opportunities').select('*').eq('customer_id', id).order('created_at', { ascending: false }),
      supabase.from('quotes').select('id, quote_number, title, status, total, valid_until, created_at').eq('customer_id', id).order('created_at', { ascending: false }),
      supabase.from('jobs').select('id, job_number, title, status, scheduled_date, final_amount, estimated_amount, created_at').eq('customer_id', id).order('created_at', { ascending: false }),
      supabase.from('invoices').select('id, invoice_number, status, total, amount_paid, due_date, issue_date').eq('customer_id', id).order('issue_date', { ascending: false }),
      supabase.from('tickets').select('id, ticket_number, subject, status, priority, created_at, updated_at').eq('customer_id', id).order('updated_at', { ascending: false }),
      supabase.from('crm_activities').select('id, activity_type, subject, body, activity_date, created_at, created_by').eq('customer_id', id).order('activity_date', { ascending: false }).limit(100),
    ])
    const firstError = results.find(r => r.error)?.error
    if (firstError) setError(firstError.message)
    setData({ customer: results[0].data, contacts: results[1].data || [], emails: results[2].data || [], opportunities: results[3].data || [], quotes: results[4].data || [], jobs: results[5].data || [], invoices: results[6].data || [], tickets: results[7].data || [], activities: results[8].data || [] })
    setLoading(false)
  }

  useEffect(() => { loadCustomers() }, [])
  useEffect(() => { if (customerId) loadCustomer(customerId) }, [customerId])

  const outstanding = data.invoices.reduce((sum, i) => sum + Math.max(Number(i.total || 0) - Number(i.amount_paid || 0), 0), 0)
  const pipeline = data.opportunities.reduce((sum, o) => sum + Number(o.estimated_value || 0), 0)

  return <section className="page-section">
    <div className="page-header"><div><div className="eyebrow">Customer management</div><h1>Customer 360</h1><p className="muted">One view of customer contacts, sales, service, billing, and history.</p></div><button className="secondary-button" type="button" onClick={() => loadCustomer(customerId)} disabled={loading}><RefreshCw size={16}/> Refresh</button></div>
    {error && <div className="error-box">{error}</div>}
    <div className="card"><label>Customer<select value={customerId} onChange={e=>setCustomerId(e.target.value)}><option value="">Select customer</option>{customers.map(c=><option key={c.id} value={c.id}>{c.company_name}</option>)}</select></label></div>
    {data.customer && <>
      <div className="card"><div className="panel-header"><div><h2><Building2 size={18}/> {data.customer.company_name}</h2><p className="muted">{[data.customer.city,data.customer.state,data.customer.zip].filter(Boolean).join(', ') || 'No address on file'}</p></div></div><div className="detail-grid"><div><strong>Phone</strong><p>{data.customer.phone || '—'}</p></div><div><strong>Email</strong><p>{data.customer.email || '—'}</p></div><div><strong>Website</strong><p>{data.customer.website || '—'}</p></div><div><strong>Outstanding</strong><p>{money(outstanding)}</p></div><div><strong>Open pipeline</strong><p>{money(pipeline)}</p></div><div><strong>Tickets</strong><p>{data.tickets.length}</p></div></div></div>
      <div className="card"><h2>Contacts & Email Addresses</h2><div className="table-wrap"><table><thead><tr><th>Name</th><th>Contact</th><th>Role</th></tr></thead><tbody>{[...data.contacts.map(c=>({name:c.name || c.contact_name || 'Contact', contact:c.email || c.phone || '—', role:c.title || '—'})), ...data.emails.map(e=>({name:e.label || 'Email', contact:e.email, role:e.is_primary ? 'Primary email' : 'Additional email'}))].map((c,i)=><tr key={i}><td>{c.name}</td><td>{c.contact}</td><td>{c.role}</td></tr>)}</tbody></table></div></div>
      <div className="card"><h2>Sales & Service</h2><div className="table-wrap"><table><thead><tr><th>Type</th><th>Reference</th><th>Status</th><th>Value</th><th>Date</th></tr></thead><tbody>{[...data.opportunities.map(o=>({type:'Opportunity',ref:o.opportunity_number || o.title,status:o.stage,value:o.estimated_value,date:o.expected_close_date})), ...data.quotes.map(q=>({type:'Quote',ref:q.quote_number || q.title,status:q.status,value:q.total,date:q.valid_until || q.created_at})), ...data.jobs.map(j=>({type:'Job',ref:j.job_number || j.title,status:j.status,value:j.final_amount ?? j.estimated_amount,date:j.scheduled_date || j.created_at})), ...data.invoices.map(i=>({type:'Invoice',ref:i.invoice_number,status:i.status,value:i.total,date:i.due_date || i.issue_date})), ...data.tickets.map(t=>({type:'Ticket',ref:t.ticket_number,status:t.status,value:'—',date:t.updated_at || t.created_at}))].map((r,i)=><tr key={i}><td>{r.type}</td><td><strong>{r.ref}</strong></td><td>{String(r.status || '').replaceAll('_',' ')}</td><td>{r.value === '—' ? '—' : money(r.value)}</td><td>{fmt(r.date)}</td></tr>)}</tbody></table></div></div>
      <div className="card"><h2>Activity History</h2>{data.activities.length ? <div className="timeline">{data.activities.map(a=><div className="timeline-item" key={a.id}><strong>{a.subject}</strong><p>{a.body || '—'}</p><small>{fmt(a.activity_date)}{a.created_by ? ` · ${a.created_by}` : ''}</small></div>)}</div> : <p className="muted">No activity recorded for this customer.</p>}</div>
    </>}
  </section>
}
