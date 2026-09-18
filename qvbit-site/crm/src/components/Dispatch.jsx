import { useEffect, useMemo, useState } from 'react'
import { CalendarClock, Plus, RefreshCw, Truck } from 'lucide-react'
import { supabase } from '../supabase'
const label=v=>String(v||'').replaceAll('_',' ').replace(/\b\w/g,c=>c.toUpperCase())

export default function Dispatch(){
  const [jobs,setJobs]=useState([]),[techs,setTechs]=useState([]),[assignments,setAssignments]=useState([]),[loading,setLoading]=useState(true),[error,setError]=useState(''),[selected,setSelected]=useState(null),[techId,setTechId]=useState(''),[role,setRole]=useState('assigned'),[saving,setSaving]=useState(false),[dateFilter,setDateFilter]=useState(''),[techFilter,setTechFilter]=useState('')
  async function load(){
    setLoading(true);setError('')
    const [j,t,a]=await Promise.all([
      supabase.from('jobs').select('id,job_number,title,status,scheduled_date,scheduled_start,scheduled_end,customers(company_name),sites(site_name,city,state)').not('status','in','(completed,cancelled)').order('scheduled_date',{ascending:true,nullsFirst:false}).order('scheduled_start',{ascending:true,nullsFirst:true}),
      supabase.from('technicians').select('*').eq('active',true).order('display_name'),
      supabase.from('job_assignments').select('id,job_id,technician_id,assignment_role,status,technicians(display_name,role)').order('created_at')
    ])
    const first=[j,t,a].find(r=>r.error)?.error;if(first)setError(first.message);setJobs(j.data||[]);setTechs(t.data||[]);setAssignments(a.data||[]);setLoading(false)
  }
  useEffect(()=>{load()},[])
  const assigned=useMemo(()=>assignments.filter(a=>a.job_id===selected?.id),[assignments,selected])
  const visibleJobs=useMemo(()=>jobs.filter(job=>{
    const matchesDate=!dateFilter || job.scheduled_date===dateFilter
    const matchesTech=!techFilter || assignments.some(a=>a.job_id===job.id && a.technician_id===techFilter)
    return matchesDate && matchesTech
  }),[jobs,dateFilter,techFilter,assignments])
  async function assign(){if(!selected||!techId)return;setSaving(true);setError('');const {error:e}=await supabase.from('job_assignments').upsert({job_id:selected.id,technician_id:techId,assignment_role:role,status:'assigned',updated_at:new Date().toISOString()},{onConflict:'job_id,technician_id'});if(e)setError(e.message);else{setTechId('');await load()}setSaving(false)}
  async function remove(a){const {error:e}=await supabase.from('job_assignments').delete().eq('id',a.id);if(e)setError(e.message);else load()}
  return <div className="page-stack">
    <div className="page-header"><div><div className="eyebrow">Field service</div><h1>Dispatch</h1><p className="muted">Assign QVB I.T. technicians to scheduled field work and track the daily workload.</p></div><button className="secondary-button" onClick={load}><RefreshCw size={16}/> Refresh</button></div>
    {error&&<div className="error-box">{error}</div>}
    {selected&&<section className="panel" style={{marginBottom:'18px'}}><div className="panel-header"><div><h2>{selected.job_number||'Job'} · {selected.title}</h2><p>{selected.customers?.company_name||'Customer'} · {selected.scheduled_date||'Unscheduled'}{selected.scheduled_start?' · '+selected.scheduled_start.slice(0,5):''}</p></div><button className="secondary-button" onClick={()=>setSelected(null)}>Close</button></div>
      <div className="stack-form"><div className="form-grid-3"><label>Technician<select value={techId} onChange={e=>setTechId(e.target.value)}><option value="">Select technician</option>{techs.map(t=><option key={t.id} value={t.id}>{t.display_name} · {label(t.role)}</option>)}</select></label><label>Assignment role<select value={role} onChange={e=>setRole(e.target.value)}><option value="lead">Lead</option><option value="assigned">Assigned</option><option value="helper">Helper</option><option value="subcontractor">Subcontractor</option></select></label><div style={{display:'flex',alignItems:'end'}}><button className="primary-button" onClick={assign} disabled={saving||!techId}><Plus size={16}/> Assign</button></div></div>
      <div>{assigned.length?<div className="table-wrap"><table><thead><tr><th>Technician</th><th>Role</th><th>Status</th><th></th></tr></thead><tbody>{assigned.map(a=><tr key={a.id}><td><strong>{a.technicians?.display_name||'Technician'}</strong></td><td>{label(a.assignment_role)}</td><td>{label(a.status)}</td><td><button className="text-button danger" onClick={()=>remove(a)}>Remove</button></td></tr>)}</tbody></table></div>:<p className="muted">No technicians assigned yet.</p>}</div></div></section>}
    <section className="panel"><div className="panel-header"><div><h2>Scheduled field work</h2><p>Select a job to assign technicians.</p></div></div>
      <div className="toolbar">
        <div style={{display:'flex',gap:'10px',flexWrap:'wrap',width:'100%'}}>
          <label style={{minWidth:'180px'}}>Date<input type="date" value={dateFilter} onChange={e=>setDateFilter(e.target.value)} /></label>
          <label style={{minWidth:'220px'}}>Technician<select value={techFilter} onChange={e=>setTechFilter(e.target.value)}><option value="">All technicians</option>{techs.map(t=><option key={t.id} value={t.id}>{t.display_name}</option>)}</select></label>
          {(dateFilter||techFilter)&&<button className="secondary-button" type="button" onClick={()=>{setDateFilter('');setTechFilter('')}}>Clear filters</button>}
        </div>
      </div>
      {loading?<div className="loading-box">Loading dispatch board…</div>:visibleJobs.length===0?<div className="empty-state"><div className="empty-icon"><Truck size={20}/></div><h3>No open scheduled jobs</h3><p>Jobs that are pending, scheduled, in progress, or on hold will appear here.</p></div>:<div className="table-wrap"><table><thead><tr><th>Job</th><th>Customer / Site</th><th>Schedule</th><th>Status</th><th>Assigned</th><th></th></tr></thead><tbody>{visibleJobs.map(j=>{const count=assignments.filter(a=>a.job_id===j.id).length;return <tr key={j.id}><td><strong>{j.job_number||'Job'}</strong><span>{j.title}</span></td><td><strong>{j.customers?.company_name||'—'}</strong><span>{j.sites?.site_name||[j.sites?.city,j.sites?.state].filter(Boolean).join(', ')||'—'}</span></td><td><strong>{j.scheduled_date||'Unscheduled'}</strong><span>{j.scheduled_start?j.scheduled_start.slice(0,5):'Time TBD'}{j.scheduled_end?'–'+j.scheduled_end.slice(0,5):''}</span></td><td>{label(j.status)}</td><td>{count}</td><td><button className="text-button" onClick={()=>setSelected(j)}><CalendarClock size={14}/> Dispatch</button></td></tr>})}</tbody></table></div>}
    </section>
  </div>
}
