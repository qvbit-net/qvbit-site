import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BriefcaseBusiness, Plus, RefreshCw, Search } from 'lucide-react'
import { supabase } from '../supabase'

const STATUSES = ['planning','scheduled','in_progress','on_hold','completed','cancelled']
const emptyForm = { customer_id:'', site_id:'', opportunity_id:'', quote_id:'', name:'', description:'', status:'planning', start_date:'', target_date:'', estimated_revenue:'', estimated_cost:'', notes:'' }
const money = (v) => '$' + Number(v || 0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})
const label = (v) => String(v || '').replaceAll('_',' ').replace(/\b\w/g,c=>c.toUpperCase())

export default function Projects() {
  const navigate = useNavigate()
  const [projects,setProjects]=useState([]), [customers,setCustomers]=useState([]), [sites,setSites]=useState([])
  const [loading,setLoading]=useState(true), [error,setError]=useState(''), [search,setSearch]=useState(''), [status,setStatus]=useState('')
  const [showForm,setShowForm]=useState(false), [editing,setEditing]=useState(null), [form,setForm]=useState(emptyForm), [saving,setSaving]=useState(false)
  async function load(){
    setLoading(true); setError('')
    const [p,c,s]=await Promise.all([
      supabase.from('projects').select('*, customers(company_name), sites(site_name, city, state)').order('created_at',{ascending:false}),
      supabase.from('customers').select('id,company_name').order('company_name'),
      supabase.from('sites').select('id,customer_id,site_name,city,state').order('site_name')
    ])
    const first=[p,c,s].find(r=>r.error)?.error; if(first)setError(first.message)
    setProjects(p.data||[]); setCustomers(c.data||[]); setSites(s.data||[]); setLoading(false)
  }
  useEffect(()=>{load()},[])
  const filtered=useMemo(()=>{const q=search.trim().toLowerCase();return projects.filter(p=>{const hay=[p.project_number,p.name,p.customers?.company_name,p.sites?.site_name].join(' ').toLowerCase();return (!status||p.status===status)&&(!q||hay.includes(q))})},[projects,search,status])
  function openNew(){setEditing(null);setForm(emptyForm);setShowForm(true)}
  function openEdit(p){setEditing(p);setForm({...emptyForm,...p,estimated_revenue:p.estimated_revenue??'',estimated_cost:p.estimated_cost??'',start_date:p.start_date||'',target_date:p.target_date||''});setShowForm(true);window.scrollTo({top:0,behavior:'smooth'})}
  async function save(e){
    e.preventDefault();setSaving(true);setError('')
    const payload={customer_id:form.customer_id||null,site_id:form.site_id||null,opportunity_id:form.opportunity_id||null,quote_id:form.quote_id||null,name:form.name.trim(),description:form.description.trim()||null,status:form.status,start_date:form.start_date||null,target_date:form.target_date||null,estimated_revenue:Number(form.estimated_revenue||0),estimated_cost:Number(form.estimated_cost||0),notes:form.notes.trim()||null}
    const result=editing?await supabase.from('projects').update({...payload,updated_at:new Date().toISOString()}).eq('id',editing.id):await supabase.from('projects').insert(payload)
    if(result.error)setError(result.error.message);else{setShowForm(false);setEditing(null);await load()} setSaving(false)
  }
  async function remove(p){if(!window.confirm('Delete project ' + (p.project_number||p.name) + '? This cannot be undone.'))return;const {error:e}=await supabase.from('projects').delete().eq('id',p.id);if(e)setError(e.message);else load()}
  const customerSites=sites.filter(s=>s.customer_id===form.customer_id)
  return <div className="page-stack">
    <div className="page-header"><div><div className="eyebrow">Operations</div><h1>Projects</h1><p className="muted">Track infrastructure and network engineering projects from planning through completion.</p></div><div style={{display:'flex',gap:'8px'}}><button className="secondary-button" onClick={load}><RefreshCw size={16}/> Refresh</button><button className="primary-button" onClick={openNew}><Plus size={16}/> New project</button></div></div>
    {error&&<div className="error-box">{error}</div>}
    {showForm&&<section className="panel" style={{marginBottom:'18px'}}><div className="panel-header"><div><h2>{editing?'Edit project':'New project'}</h2><p>Create the project shell before linking jobs, quotes, and field work.</p></div></div><form className="stack-form" onSubmit={save}>
      <div className="form-grid-2"><label>Customer<select required value={form.customer_id} onChange={e=>setForm({...form,customer_id:e.target.value,site_id:''})}><option value="">Select customer</option>{customers.map(c=><option key={c.id} value={c.id}>{c.company_name}</option>)}</select></label><label>Site<select value={form.site_id} onChange={e=>setForm({...form,site_id:e.target.value})}><option value="">No site selected</option>{customerSites.map(s=><option key={s.id} value={s.id}>{s.site_name||'Site'}{s.city?' · '+s.city:''}</option>)}</select></label></div>
      <label>Project name<input required value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="Network refresh / infrastructure deployment"/></label>
      <div className="form-grid-3"><label>Status<select value={form.status} onChange={e=>setForm({...form,status:e.target.value})}>{STATUSES.map(s=><option key={s} value={s}>{label(s)}</option>)}</select></label><label>Start date<input type="date" value={form.start_date} onChange={e=>setForm({...form,start_date:e.target.value})}/></label><label>Target date<input type="date" value={form.target_date} onChange={e=>setForm({...form,target_date:e.target.value})}/></label></div>
      <div className="form-grid-2"><label>Estimated revenue<input type="number" min="0" step="0.01" value={form.estimated_revenue} onChange={e=>setForm({...form,estimated_revenue:e.target.value})}/></label><label>Estimated cost<input type="number" min="0" step="0.01" value={form.estimated_cost} onChange={e=>setForm({...form,estimated_cost:e.target.value})}/></label></div>
      <label>Description<textarea rows="4" value={form.description} onChange={e=>setForm({...form,description:e.target.value})}/></label><label>Notes<textarea rows="3" value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})}/></label>
      <div style={{display:'flex',justifyContent:'flex-end',gap:'8px'}}><button type="button" className="secondary-button" onClick={()=>setShowForm(false)}>Cancel</button><button className="primary-button" disabled={saving}>{saving?'Saving…':editing?'Save changes':'Create project'}</button></div>
    </form></section>}
    <section className="panel"><div className="toolbar"><div className="search-box"><Search size={16}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search projects…"/></div><select value={status} onChange={e=>setStatus(e.target.value)}><option value="">All statuses</option>{STATUSES.map(s=><option key={s} value={s}>{label(s)}</option>)}</select></div>
      {loading?<div className="loading-box">Loading projects…</div>:filtered.length===0?<div className="empty-state"><div className="empty-icon"><BriefcaseBusiness size={20}/></div><h3>No projects</h3><p>Create an infrastructure or network engineering project to start tracking delivery.</p></div>:<div className="table-wrap"><table><thead><tr><th>Project</th><th>Customer / Site</th><th>Status</th><th>Dates</th><th>Estimated</th><th></th></tr></thead><tbody>{filtered.map(p=><tr key={p.id}><td><button className="text-button" type="button" onClick={()=>navigate(`/crm/projects/${p.id}`)}><strong>{p.project_number||'Project'}</strong><span>{p.name}</span></button></td><td><strong>{p.customers?.company_name||'—'}</strong><span>{p.sites?.site_name||'No site'}</span></td><td><span className="status">{label(p.status)}</span></td><td>{p.start_date||'—'} → {p.target_date||'—'}</td><td><strong>{money(p.estimated_revenue)}</strong><span>Cost {money(p.estimated_cost)}</span></td><td><button className="text-button" onClick={()=>openEdit(p)}>Edit</button><button className="text-button danger" onClick={()=>remove(p)}>Delete</button></td></tr>)}</tbody></table></div>}
    </section>
  </div>
}
