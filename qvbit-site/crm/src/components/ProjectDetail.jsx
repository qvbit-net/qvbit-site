import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, BriefcaseBusiness, ExternalLink, Link2, Plus, RefreshCw, Unlink } from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../supabase'

const STATUSES = ['planning','scheduled','in_progress','on_hold','completed','cancelled']
const label = (v) => String(v || '').replaceAll('_',' ').replace(/\b\w/g, c => c.toUpperCase())
const money = (v) => new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:2}).format(Number(v || 0))
const date = (v) => {
  if (!v) return '—'
  const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})$/)
  const d = m ? new Date(Number(m[1]),Number(m[2])-1,Number(m[3])) : new Date(v)
  return Number.isNaN(d.getTime()) ? '—' : new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',year:'numeric'}).format(d)
}

export default function ProjectDetail() {
  const { projectId } = useParams()
  const navigate = useNavigate()
  const [project,setProject] = useState(null)
  const [jobs,setJobs] = useState([])
  const [availableJobs,setAvailableJobs] = useState([])
  const [timeEntries,setTimeEntries] = useState([])
  const [expenses,setExpenses] = useState([])
  const [invoices,setInvoices] = useState([])
  const [loading,setLoading] = useState(true)
  const [saving,setSaving] = useState(false)
  const [error,setError] = useState('')
  const [jobToLink,setJobToLink] = useState('')

  async function load() {
    setLoading(true)
    setError('')
    const projectResult = await supabase
      .from('projects')
      .select('*, customers(company_name), sites(site_name, city, state), quotes(quote_number, title, total, status), opportunities(opportunity_number, title, stage, estimated_value)')
      .eq('id', projectId)
      .single()

    if (projectResult.error) {
      setError(projectResult.error.message)
      setProject(null)
      setLoading(false)
      return
    }

    const currentProject = projectResult.data
    const [jobsResult, availableResult, invoiceResult] = await Promise.all([
      supabase
        .from('jobs')
        .select('id, project_id, job_number, title, status, scheduled_date, estimated_amount, final_amount, customer_id, site_id')
        .eq('project_id', projectId)
        .order('scheduled_date',{ascending:true,nullsFirst:false})
        .order('created_at',{ascending:false}),
      supabase
        .from('jobs')
        .select('id, job_number, title, status, scheduled_date, customer_id')
        .eq('customer_id', currentProject.customer_id)
        .is('project_id', null)
        .not('status','eq','cancelled')
        .order('created_at',{ascending:false})
        .limit(200),
      supabase
        .from('invoices')
        .select('id, invoice_number, job_id, status, total, amount_paid, issue_date, due_date')
        .eq('customer_id', currentProject.customer_id)
        .not('status','eq','void')
        .order('issue_date',{ascending:false}),
    ])

    const jobIds = (jobsResult.data || []).map(j => j.id)
    const [timeResult, expenseResult] = jobIds.length ? await Promise.all([
      supabase.from('job_time_entries').select('id, job_id, technician_name, hours, hourly_cost, work_date, notes').in('job_id',jobIds),
      supabase.from('expenses').select('id, job_id, vendor, category, description, amount, expense_date').in('job_id',jobIds),
    ]) : [{data:[],error:null},{data:[],error:null}]

    const firstError = [jobsResult,availableResult,invoiceResult,timeResult,expenseResult].find(r=>r.error)?.error
    if (firstError) setError(firstError.message)

    setProject(currentProject)
    setJobs(jobsResult.data || [])
    setAvailableJobs(availableResult.data || [])
    setInvoices(invoiceResult.data || [])
    setTimeEntries(timeResult.data || [])
    setExpenses(expenseResult.data || [])
    setLoading(false)
  }

  useEffect(()=>{ if (projectId) load() },[projectId])

  const jobIds = useMemo(()=>new Set(jobs.map(j=>j.id)),[jobs])
  const projectInvoices = useMemo(()=>invoices.filter(i=>jobIds.has(i.job_id)),[invoices,jobIds])
  const jobRevenue = useMemo(()=>jobs.reduce((sum,j)=>sum + Number(j.final_amount ?? j.estimated_amount ?? 0),0),[jobs])
  const billedRevenue = useMemo(()=>projectInvoices.reduce((sum,i)=>sum + Number(i.total || 0),0),[projectInvoices])
  const laborCost = useMemo(()=>timeEntries.reduce((sum,e)=>sum + Number(e.hours || 0) * Number(e.hourly_cost || 0),0),[timeEntries])
  const expenseCost = useMemo(()=>expenses.reduce((sum,e)=>sum + Number(e.amount || 0),0),[expenses])
  const actualCost = laborCost + expenseCost
  const realizedRevenue = billedRevenue || jobRevenue
  const grossProfit = realizedRevenue - actualCost
  const grossMargin = realizedRevenue > 0 ? (grossProfit / realizedRevenue) * 100 : null
  const estimatedProfit = Number(project?.estimated_revenue || 0) - Number(project?.estimated_cost || 0)

  async function updateProject(patch) {
    setSaving(true)
    setError('')
    const { error: updateError } = await supabase.from('projects').update({...patch,updated_at:new Date().toISOString()}).eq('id',projectId)
    if (updateError) setError(updateError.message)
    else await load()
    setSaving(false)
  }

  async function syncFinancials() {
    await updateProject({actual_revenue:realizedRevenue,actual_cost:actualCost})
  }

  async function linkJob() {
    if (!jobToLink) return
    setSaving(true)
    setError('')
    const { error: updateError } = await supabase.from('jobs').update({project_id:projectId,updated_at:new Date().toISOString()}).eq('id',jobToLink)
    if (updateError) setError(updateError.message)
    else setJobToLink('')
    await load()
    setSaving(false)
  }

  async function unlinkJob(job) {
    if (!window.confirm(`Remove ${job.job_number || 'this job'} from the project?`)) return
    setSaving(true)
    const { error: updateError } = await supabase.from('jobs').update({project_id:null,updated_at:new Date().toISOString()}).eq('id',job.id)
    if (updateError) setError(updateError.message)
    await load()
    setSaving(false)
  }

  if (loading) return <div className="loading-box">Loading project…</div>
  if (!project) return <div className="empty-state"><div className="empty-icon"><BriefcaseBusiness size={20}/></div><h3>Project not found</h3><p>{error || 'The requested project could not be loaded.'}</p><button className="secondary-button" onClick={()=>navigate('/crm/projects')}><ArrowLeft size={16}/> Back to projects</button></div>

  return <div className="page-stack">
    <div className="page-header">
      <div>
        <button className="text-button" type="button" onClick={()=>navigate('/crm/projects')}><ArrowLeft size={14}/> Projects</button>
        <div className="eyebrow" style={{marginTop:'8px'}}>Project {project.project_number || ''}</div>
        <h1>{project.name}</h1>
        <p className="muted">{project.customers?.company_name || 'Customer'}{project.sites?.site_name ? ` · ${project.sites.site_name}` : ''}</p>
      </div>
      <div style={{display:'flex',gap:'8px',flexWrap:'wrap'}}>
        <select value={project.status} onChange={e=>updateProject({status:e.target.value})} disabled={saving} aria-label="Project status">
          {STATUSES.map(s=><option key={s} value={s}>{label(s)}</option>)}
        </select>
        <button className="secondary-button" onClick={load} disabled={saving}><RefreshCw size={16}/> Refresh</button>
        <button className="primary-button" onClick={syncFinancials} disabled={saving}><RefreshCw size={16}/> Sync financials</button>
      </div>
    </div>

    {error && <div className="error-box page-error">{error}</div>}

    <div className="stat-grid">
      <div className="stat-card"><div><span>Estimated revenue</span><strong>{money(project.estimated_revenue)}</strong><small>{money(estimatedProfit)} estimated gross profit</small></div></div>
      <div className="stat-card"><div><span>Billed revenue</span><strong>{money(billedRevenue)}</strong><small>{projectInvoices.length} project invoices</small></div></div>
      <div className="stat-card"><div><span>Actual cost</span><strong>{money(actualCost)}</strong><small>Labor {money(laborCost)} · Expenses {money(expenseCost)}</small></div></div>
      <div className="stat-card"><div><span>Gross profit</span><strong>{money(grossProfit)}</strong><small>{grossMargin == null ? 'No revenue yet' : `${grossMargin.toFixed(1)}% gross margin`}</small></div></div>
    </div>

    <div className="dashboard-grid">
      <section className="panel">
        <div className="panel-header"><div><h2>Project overview</h2><p>Scope, schedule, and commercial links.</p></div></div>
        <div style={{padding:'20px',display:'grid',gap:'16px'}}>
          <div className="form-grid-3">
            <div><div className="eyebrow">Start</div><strong>{date(project.start_date)}</strong></div>
            <div><div className="eyebrow">Target</div><strong>{date(project.target_date)}</strong></div>
            <div><div className="eyebrow">Completed</div><strong>{date(project.completed_date)}</strong></div>
          </div>
          {project.description && <div><div className="eyebrow">Description</div><p className="muted" style={{whiteSpace:'pre-wrap'}}>{project.description}</p></div>}
          {project.notes && <div><div className="eyebrow">Notes</div><p className="muted" style={{whiteSpace:'pre-wrap'}}>{project.notes}</p></div>}
          <div style={{display:'flex',gap:'10px',flexWrap:'wrap'}}>
            {project.quotes?.quote_number && <button className="secondary-button" onClick={()=>navigate(`/crm/quotes/${project.quote_id}`)}><ExternalLink size={15}/> {project.quotes.quote_number}</button>}
            {project.opportunities?.opportunity_number && <button className="secondary-button" onClick={()=>navigate(`/crm/opportunities/${project.opportunity_id}`)}><ExternalLink size={15}/> {project.opportunities.opportunity_number}</button>}
            {project.customer_id && <button className="secondary-button" onClick={()=>navigate(`/crm/customers/${project.customer_id}`)}>Customer</button>}
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header"><div><h2>Link a job</h2><p>Attach an existing customer job to this project.</p></div></div>
        <div style={{padding:'20px'}}>
          <div className="form-grid-2">
            <label>Unlinked customer job<select value={jobToLink} onChange={e=>setJobToLink(e.target.value)} disabled={saving}><option value="">Select job</option>{availableJobs.map(j=><option key={j.id} value={j.id}>{j.job_number || 'Job'} · {j.title}</option>)}</select></label>
            <div style={{display:'flex',alignItems:'end'}}><button className="primary-button" onClick={linkJob} disabled={!jobToLink||saving}><Link2 size={16}/> Link job</button></div>
          </div>
        </div>
      </section>
    </div>

    <section className="panel">
      <div className="panel-header"><div><h2>Project jobs</h2><p>{jobs.length} linked jobs · {timeEntries.length} time entries · {expenses.length} expenses</p></div></div>
      {jobs.length===0 ? <div className="empty-state"><BriefcaseBusiness size={22}/><strong>No jobs linked</strong><p>Link an existing job above. Accepted project quotes can also create the first job automatically.</p></div> :
        <div className="table-wrap"><table><thead><tr><th>Job</th><th>Status</th><th>Schedule</th><th>Revenue</th><th>Cost</th><th>Margin</th><th></th></tr></thead><tbody>
          {jobs.map(job=>{
            const labor=timeEntries.filter(e=>e.job_id===job.id).reduce((s,e)=>s+Number(e.hours||0)*Number(e.hourly_cost||0),0)
            const exp=expenses.filter(e=>e.job_id===job.id).reduce((s,e)=>s+Number(e.amount||0),0)
            const revenue=Number(job.final_amount ?? job.estimated_amount ?? 0)
            const cost=labor+exp
            const profit=revenue-cost
            return <tr key={job.id}>
              <td><strong>{job.job_number||'Job'}</strong><span>{job.title}</span></td>
              <td><span className="status">{label(job.status)}</span></td>
              <td>{date(job.scheduled_date)}</td>
              <td>{money(revenue)}</td>
              <td>{money(cost)}</td>
              <td><strong>{money(profit)}</strong><span>{revenue>0 ? `${((profit/revenue)*100).toFixed(1)}%` : '—'}</span></td>
              <td><div style={{display:'flex',gap:'8px',justifyContent:'flex-end'}}><button className="text-button" onClick={()=>navigate(`/crm/jobs/${job.id}`)}>Open</button><button className="text-button danger" disabled={saving} onClick={()=>unlinkJob(job)}><Unlink size={14}/> Unlink</button></div></td>
            </tr>
          })}
        </tbody></table></div>}
    </section>

    <div className="dashboard-grid">
      <section className="panel">
        <div className="panel-header"><div><h2>Labor & expenses</h2><p>Actual project delivery cost from technician time and job expenses.</p></div></div>
        <div className="table-wrap"><table><thead><tr><th>Date</th><th>Technician / Vendor</th><th>Description</th><th>Cost</th></tr></thead><tbody>
          {timeEntries.map(e=><tr key={`t-${e.id}`}><td>{date(e.work_date)}</td><td>{e.technician_name||'Technician'}</td><td>{e.notes||'Labor'}</td><td>{money(Number(e.hours||0)*Number(e.hourly_cost||0))}</td></tr>)}
          {expenses.map(e=><tr key={`e-${e.id}`}><td>{date(e.expense_date)}</td><td>{e.vendor||'Expense'}</td><td>{e.description||e.category||'Job expense'}</td><td>{money(e.amount)}</td></tr>)}
          {!timeEntries.length&&!expenses.length&&<tr><td colSpan="4">No project costs recorded yet.</td></tr>}
        </tbody></table></div>
      </section>

      <section className="panel">
        <div className="panel-header"><div><h2>Invoices</h2><p>Billing connected to the project's jobs.</p></div></div>
        <div className="table-wrap"><table><thead><tr><th>Invoice</th><th>Status</th><th>Issued</th><th>Total</th><th>Paid</th></tr></thead><tbody>
          {projectInvoices.map(i=><tr key={i.id}><td><button className="text-button" onClick={()=>navigate(`/crm/invoices/${i.id}`)}>{i.invoice_number||'Invoice'}</button></td><td>{label(i.status)}</td><td>{date(i.issue_date)}</td><td>{money(i.total)}</td><td>{money(i.amount_paid)}</td></tr>)}
          {!projectInvoices.length&&<tr><td colSpan="5">No invoices are linked through project jobs yet.</td></tr>}
        </tbody></table></div>
      </section>
    </div>
  </div>
}
