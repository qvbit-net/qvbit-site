import { useEffect, useMemo, useState } from 'react'
import { Award, Building2, CalendarClock, CheckCircle2, FileText, Globe, Plus, RefreshCw, ShieldCheck, Target, Trash2, X } from 'lucide-react'
import { supabase } from '../supabase'

const emptyOpp = {
  opportunity_number: '', title: '', source: 'SAM.gov', pursuit_type: 'prime', agency: '', prime_contractor_id: '',
  solicitation_url: '', set_aside: 'SDVOSB', naics_code: '', contract_type: '', place_of_performance: '', estimated_value: '',
  posted_date: '', response_deadline: '', site_visit_date: '', status: 'new', probability: 0, next_action: '', next_action_date: '', description: '', notes: '',
}
const emptyPrime = { company_name: '', website: '', poc_name: '', poc_email: '', poc_phone: '', relationship_status: 'prospect', notes: '' }
const emptyCompliance = { name: '', category: 'general', status: 'active', due_date: '', owner_name: '', reference_url: '', notes: '' }
const emptyContract = { contract_number: '', title: '', pursuit_type: 'subcontract', agency: '', prime_contractor_id: '', award_date: '', start_date: '', end_date: '', contract_value: '', funded_amount: '', status: 'active', notes: '' }
const money = (v) => `$${Number(v || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const dateOnly = (v) => v ? String(v).slice(0, 10) : ''

function Stat({ label, value, icon: Icon }) {
  return <div className="stat-card"><div className="stat-card-icon"><Icon size={18} /></div><div><div className="stat-card-label">{label}</div><div className="stat-card-value">{value}</div></div></div>
}

export default function GovernmentContractingPanel() {
  const [profile, setProfile] = useState(null)
  const [opportunities, setOpportunities] = useState([])
  const [primes, setPrimes] = useState([])
  const [compliance, setCompliance] = useState([])
  const [contracts, setContracts] = useState([])
  const [tab, setTab] = useState('overview')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [canEdit, setCanEdit] = useState(false)
  const [isOwner, setIsOwner] = useState(false)
  const [oppForm, setOppForm] = useState(emptyOpp)
  const [primeForm, setPrimeForm] = useState(emptyPrime)
  const [complianceForm, setComplianceForm] = useState(emptyCompliance)
  const [contractForm, setContractForm] = useState(emptyContract)
  const [profileForm, setProfileForm] = useState({})
  const [editingOpp, setEditingOpp] = useState(null)
  const [editingPrime, setEditingPrime] = useState(null)
  const [editingCompliance, setEditingCompliance] = useState(null)
  const [editingContract, setEditingContract] = useState(null)
  const [showOpp, setShowOpp] = useState(false)
  const [showPrime, setShowPrime] = useState(false)
  const [showCompliance, setShowCompliance] = useState(false)
  const [showContract, setShowContract] = useState(false)
  const [showProfile, setShowProfile] = useState(false)

  async function load() {
    setLoading(true); setError('');
    const [profileResult, oppResult, primeResult, complianceResult, contractResult, userResult] = await Promise.all([
      supabase.from('gov_contracting_profile').select('*').eq('id', true).maybeSingle(),
      supabase.from('gov_opportunities').select('*, gov_prime_contractors(company_name)').order('response_deadline', { ascending: true, nullsFirst: false }).limit(500),
      supabase.from('gov_prime_contractors').select('*').order('company_name').limit(250),
      supabase.from('gov_compliance_items').select('*').order('due_date', { ascending: true, nullsFirst: false }).limit(250),
      supabase.from('gov_contracts').select('*, gov_prime_contractors(company_name)').order('start_date', { ascending: false, nullsFirst: false }).limit(250),
      supabase.auth.getUser(),
    ])
    const firstError = [profileResult, oppResult, primeResult, complianceResult, contractResult].find(r => r.error)
    if (firstError) setError(firstError.error.message)
    setProfile(profileResult.data || null)
    setProfileForm(profileResult.data || {})
    setOpportunities(oppResult.data || [])
    setPrimes(primeResult.data || [])
    setCompliance(complianceResult.data || [])
    setContracts(contractResult.data || [])

    const userId = userResult.data?.user?.id
    if (userId) {
      const { data: p } = await supabase.from('user_profiles').select('role, is_active').eq('id', userId).maybeSingle()
      const active = p?.is_active !== false
      setIsOwner(p?.role === 'owner' && active)
      setCanEdit(active && ['owner', 'admin'].includes(p?.role))
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const metrics = useMemo(() => {
    const active = opportunities.filter(o => !['lost', 'no_bid', 'closed'].includes(o.status))
    const pipeline = active.reduce((sum, o) => sum + Number(o.estimated_value || 0) * (Number(o.probability || 0) / 100), 0)
    const dueSoon = compliance.filter(c => c.due_date && new Date(`${c.due_date}T23:59:59`) <= new Date(Date.now() + 45 * 86400000) && c.status !== 'expired').length
    const openBids = opportunities.filter(o => ['qualified', 'bidding', 'submitted'].includes(o.status)).length
    return { pipeline, dueSoon, openBids, awarded: contracts.filter(c => ['draft', 'active', 'on_hold'].includes(c.status)).length }
  }, [opportunities, compliance, contracts])

  function notifyOk(text) { setMessage(text); setError(''); setTimeout(() => setMessage(''), 3500) }
  function clearForms() { setEditingOpp(null); setEditingPrime(null); setEditingCompliance(null); setEditingContract(null) }

  async function saveProfile(e) {
    e.preventDefault(); if (!canEdit) return
    setSaving('profile'); setError('')
    const payload = { ...profileForm, id: true, certification_approval_date: profileForm.certification_approval_date || null, certification_expiration_date: profileForm.certification_expiration_date || null, sam_expiration_date: profileForm.sam_expiration_date || null, last_verified_at: profileForm.last_verified_at || null }
    const { error: saveError } = await supabase.from('gov_contracting_profile').upsert(payload, { onConflict: 'id' })
    if (saveError) setError(saveError.message); else { notifyOk('Government contracting profile saved.'); setShowProfile(false); await load() }
    setSaving('')
  }

  async function saveOpp(e) {
    e.preventDefault(); if (!canEdit) return
    setSaving('opp'); setError('')
    const payload = { ...oppForm, prime_contractor_id: oppForm.prime_contractor_id || null, estimated_value: Number(oppForm.estimated_value || 0), probability: Number(oppForm.probability || 0), posted_date: oppForm.posted_date || null, response_deadline: oppForm.response_deadline || null, site_visit_date: oppForm.site_visit_date || null, next_action_date: oppForm.next_action_date || null }
    const result = editingOpp ? await supabase.from('gov_opportunities').update(payload).eq('id', editingOpp) : await supabase.from('gov_opportunities').insert(payload)
    if (result.error) setError(result.error.message); else { notifyOk(editingOpp ? 'Opportunity updated.' : 'Opportunity added.'); setShowOpp(false); setOppForm(emptyOpp); clearForms(); await load() }
    setSaving('')
  }

  async function savePrime(e) {
    e.preventDefault(); if (!canEdit) return
    setSaving('prime'); setError('')
    const payload = { ...primeForm }
    const result = editingPrime ? await supabase.from('gov_prime_contractors').update(payload).eq('id', editingPrime) : await supabase.from('gov_prime_contractors').insert(payload)
    if (result.error) setError(result.error.message); else { notifyOk(editingPrime ? 'Prime contractor updated.' : 'Prime contractor added.'); setShowPrime(false); setPrimeForm(emptyPrime); clearForms(); await load() }
    setSaving('')
  }

  async function saveCompliance(e) {
    e.preventDefault(); if (!canEdit) return
    setSaving('compliance'); setError('')
    const payload = { ...complianceForm, due_date: complianceForm.due_date || null }
    const result = editingCompliance ? await supabase.from('gov_compliance_items').update(payload).eq('id', editingCompliance) : await supabase.from('gov_compliance_items').insert(payload)
    if (result.error) setError(result.error.message); else { notifyOk(editingCompliance ? 'Compliance item updated.' : 'Compliance item added.'); setShowCompliance(false); setComplianceForm(emptyCompliance); clearForms(); await load() }
    setSaving('')
  }

  async function saveContract(e) {
    e.preventDefault(); if (!canEdit) return
    setSaving('contract'); setError('')
    const payload = { ...contractForm, prime_contractor_id: contractForm.prime_contractor_id || null, award_date: contractForm.award_date || null, start_date: contractForm.start_date || null, end_date: contractForm.end_date || null, contract_value: Number(contractForm.contract_value || 0), funded_amount: Number(contractForm.funded_amount || 0) }
    const result = editingContract ? await supabase.from('gov_contracts').update(payload).eq('id', editingContract) : await supabase.from('gov_contracts').insert(payload)
    if (result.error) setError(result.error.message); else { notifyOk(editingContract ? 'Contract updated.' : 'Contract added.'); setShowContract(false); setContractForm(emptyContract); clearForms(); await load() }
    setSaving('')
  }

  async function remove(table, id, label) {
    if (!isOwner) return
    if (!window.confirm(`Delete ${label}? This cannot be undone.`)) return
    setSaving(`delete:${id}`)
    const { error: deleteError } = await supabase.from(table).delete().eq('id', id)
    if (deleteError) setError(deleteError.message); else { notifyOk(`${label} deleted.`); await load() }
    setSaving('')
  }

  function startOpp(item) { setEditingOpp(item.id); setOppForm({ ...emptyOpp, ...item, prime_contractor_id: item.prime_contractor_id || '', posted_date: dateOnly(item.posted_date), response_deadline: item.response_deadline ? String(item.response_deadline).slice(0,16) : '', site_visit_date: item.site_visit_date ? String(item.site_visit_date).slice(0,16) : '', next_action_date: dateOnly(item.next_action_date) }); setShowOpp(true) }
  function startPrime(item) { setEditingPrime(item.id); setPrimeForm({ ...emptyPrime, ...item }); setShowPrime(true) }
  function startCompliance(item) { setEditingCompliance(item.id); setComplianceForm({ ...emptyCompliance, ...item, due_date: dateOnly(item.due_date) }); setShowCompliance(true) }
  function startContract(item) { setEditingContract(item.id); setContractForm({ ...emptyContract, ...item, prime_contractor_id: item.prime_contractor_id || '', award_date: dateOnly(item.award_date), start_date: dateOnly(item.start_date), end_date: dateOnly(item.end_date) }); setShowContract(true) }

  const tabButton = (key, label) => <button type="button" className={tab === key ? 'primary-button' : 'secondary-button'} onClick={() => setTab(key)}>{label}</button>

  return <section className="page-section">
    <div className="page-header">
      <div><div className="eyebrow"><ShieldCheck size={14}/> Federal contracting</div><h1>Government Contracting</h1><p className="muted">Track SDVOSB readiness, federal opportunities, prime relationships, bids, awards, and compliance.</p></div>
      <button className="secondary-button" type="button" onClick={load} disabled={loading}><RefreshCw size={16}/> {loading ? 'Refreshing…' : 'Refresh'}</button>
    </div>
    {error && <div className="error-box">{error}</div>}{message && <div className="info-box">{message}</div>}

    <div className="card">
      <div className="panel-header"><div><h2><Award size={18}/> QVB I.T. Federal Profile</h2><p>Keep the contracting identity and registration checkpoints in one place.</p></div>{canEdit && <button className="primary-button" type="button" onClick={() => setShowProfile(v => !v)}><PencilIcon/> Edit Profile</button>}</div>
      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))' }}>
        <Stat label="SDVOSB" value={profile?.certification_status === 'active' ? 'Certified' : (profile?.certification_status || '—')} icon={ShieldCheck}/>
        <Stat label="SAM.gov" value={profile?.sam_status === 'active' ? 'Active' : (profile?.sam_status || '—')} icon={Globe}/>
        <Stat label="Open bids" value={metrics.openBids} icon={Target}/>
        <Stat label="Weighted pipeline" value={money(metrics.pipeline)} icon={FileText}/>
        <Stat label="Compliance due" value={metrics.dueSoon} icon={CalendarClock}/>
        <Stat label="Active awards" value={metrics.awarded} icon={CheckCircle2}/>
      </div>
      <div className="detail-grid" style={{ marginTop: 16 }}><div><strong>Legal entity</strong><span>{profile?.legal_name || '—'}</span></div><div><strong>DBA</strong><span>{profile?.dba || '—'}</span></div><div><strong>UEI</strong><span>{profile?.uei || '—'}</span></div><div><strong>CAGE</strong><span>{profile?.cage_code || '—'}</span></div><div><strong>Certification approved</strong><span>{dateOnly(profile?.certification_approval_date) || '—'}</span></div><div><strong>Certification expiry</strong><span>{dateOnly(profile?.certification_expiration_date) || 'Verify / enter'}</span></div></div>
    </div>

    <div className="action-row" style={{ margin: '14px 0' }}><span>{tabButton('overview','Overview')}</span><span>{tabButton('opportunities',`Opportunities (${opportunities.length})`)}</span><span>{tabButton('primes',`Prime Contractors (${primes.length})`)}</span><span>{tabButton('contracts',`Contracts (${contracts.length})`)}</span><span>{tabButton('compliance',`Compliance (${compliance.length})`)}</span></div>

    {tab === 'overview' && <div className="form-grid">
      <div className="card"><div className="panel-header"><div><h2><Target size={18}/> Pursuit workflow</h2><p>Discovery → qualification → bid → award → execution.</p></div></div><div className="stack-list"><div><strong>1. Discover</strong><span>Capture SAM.gov, SUBNet, agency, and prime opportunities.</span></div><div><strong>2. Qualify</strong><span>Check NAICS, set-aside, place of performance, schedule, and capacity.</span></div><div><strong>3. Bid</strong><span>Track deadline, site visit, bid status, probability, and next action.</span></div><div><strong>4. Award</strong><span>Record prime/subcontract award and connect the work back to operations.</span></div></div></div>
      <div className="card"><div className="panel-header"><div><h2><Building2 size={18}/> Subcontracting focus</h2><p>Prime relationships become a reusable business-development asset.</p></div></div><p className="muted">Use Prime Contractors to track general contractors and federal primes, points of contact, websites, and relationship status. The opportunity record then ties a specific solicitation to that relationship.</p><div className="info-box">Compliance guardrail: do not assume an opportunity can be heavily subcontracted. The applicable solicitation, NAICS, contract type, clause, and “similarly situated” rules must be checked before bidding.</div></div>
    </div>}

    {tab === 'opportunities' && <div className="card"><div className="panel-header"><div><h2><Target size={18}/> Federal Opportunities</h2><p>One record per solicitation or subcontracting lead.</p></div>{canEdit && <button className="primary-button" type="button" onClick={() => { setEditingOpp(null); setOppForm(emptyOpp); setShowOpp(true) }}><Plus size={16}/> Add Opportunity</button>}</div>
      {loading ? <p className="muted">Loading…</p> : opportunities.length === 0 ? <p className="muted">No government opportunities recorded yet.</p> : <div className="table-wrap"><table><thead><tr><th>Opportunity</th><th>Type</th><th>Agency / Prime</th><th>Set-aside</th><th>Deadline</th><th>Value</th><th>Status</th><th></th></tr></thead><tbody>{opportunities.map(o => <tr key={o.id}><td><strong>{o.title}</strong><div className="muted">{o.opportunity_number || 'No solicitation number'} • {o.source}</div></td><td>{o.pursuit_type}</td><td>{o.agency || o.gov_prime_contractors?.company_name || '—'}</td><td>{o.set_aside || '—'}{o.naics_code ? <div className="muted">NAICS {o.naics_code}</div> : null}</td><td>{o.response_deadline ? new Date(o.response_deadline).toLocaleString() : '—'}</td><td>{money(o.estimated_value)}</td><td>{o.status}</td><td><div className="action-row"><button className="secondary-button" type="button" onClick={() => startOpp(o)} disabled={!canEdit}>Edit</button>{isOwner && <button className="secondary-button danger-button" type="button" disabled={saving===`delete:${o.id}`} onClick={() => remove('gov_opportunities',o.id,o.title)}><Trash2 size={15}/> Delete</button>}</div></td></tr>)}</tbody></table></div>}
    </div>}

    {tab === 'primes' && <div className="card"><div className="panel-header"><div><h2><Building2 size={18}/> Prime Contractors</h2><p>Track prime firms you can pursue subcontract work with.</p></div>{canEdit && <button className="primary-button" type="button" onClick={() => { setEditingPrime(null); setPrimeForm(emptyPrime); setShowPrime(true) }}><Plus size={16}/> Add Prime</button>}</div>{primes.length === 0 ? <p className="muted">No prime contractors recorded yet.</p> : <div className="table-wrap"><table><thead><tr><th>Company</th><th>Contact</th><th>Relationship</th><th>Website</th><th></th></tr></thead><tbody>{primes.map(p=><tr key={p.id}><td><strong>{p.company_name}</strong><div className="muted">{p.notes || ''}</div></td><td>{p.poc_name || '—'}<div className="muted">{p.poc_email || p.poc_phone || ''}</div></td><td>{p.relationship_status}</td><td>{p.website ? <a href={p.website} target="_blank" rel="noreferrer">Open</a> : '—'}</td><td><div className="action-row"><button className="secondary-button" type="button" onClick={()=>startPrime(p)} disabled={!canEdit}>Edit</button>{isOwner&&<button className="secondary-button danger-button" type="button" onClick={()=>remove('gov_prime_contractors',p.id,p.company_name)}><Trash2 size={15}/> Delete</button>}</div></td></tr>)}</tbody></table></div>}</div>}

    {tab === 'contracts' && <div className="card"><div className="panel-header"><div><h2><CheckCircle2 size={18}/> Government Contracts</h2><p>Track awarded prime or subcontract work separately from operational jobs.</p></div>{canEdit && <button className="primary-button" type="button" onClick={() => { setEditingContract(null); setContractForm(emptyContract); setShowContract(true) }}><Plus size={16}/> Add Award</button>}</div>{contracts.length === 0 ? <p className="muted">No government awards recorded yet.</p> : <div className="table-wrap"><table><thead><tr><th>Contract</th><th>Type</th><th>Prime</th><th>Dates</th><th>Value</th><th>Funded</th><th>Status</th><th></th></tr></thead><tbody>{contracts.map(c=><tr key={c.id}><td><strong>{c.contract_number || 'No number'}</strong><div className="muted">{c.title}</div></td><td>{c.pursuit_type}</td><td>{c.gov_prime_contractors?.company_name || c.agency || '—'}</td><td>{dateOnly(c.start_date) || '—'} → {dateOnly(c.end_date) || '—'}</td><td>{money(c.contract_value)}</td><td>{money(c.funded_amount)}</td><td>{c.status}</td><td><div className="action-row"><button className="secondary-button" type="button" onClick={()=>startContract(c)} disabled={!canEdit}>Edit</button>{isOwner&&<button className="secondary-button danger-button" type="button" onClick={()=>remove('gov_contracts',c.id,c.contract_number||c.title)}><Trash2 size={15}/> Delete</button>}</div></td></tr>)}</tbody></table></div>}</div>}

    {tab === 'compliance' && <div className="card"><div className="panel-header"><div><h2><ShieldCheck size={18}/> Compliance Checkpoints</h2><p>Store recurring government-contracting readiness items and their due dates.</p></div>{canEdit && <button className="primary-button" type="button" onClick={() => { setEditingCompliance(null); setComplianceForm(emptyCompliance); setShowCompliance(true) }}><Plus size={16}/> Add Checkpoint</button>}</div>{compliance.length === 0 ? <p className="muted">No compliance checkpoints recorded.</p> : <div className="table-wrap"><table><thead><tr><th>Checkpoint</th><th>Category</th><th>Status</th><th>Due</th><th>Owner</th><th></th></tr></thead><tbody>{compliance.map(c=><tr key={c.id}><td><strong>{c.name}</strong><div className="muted">{c.notes || ''}</div></td><td>{c.category}</td><td>{c.status}</td><td>{dateOnly(c.due_date) || '—'}</td><td>{c.owner_name || '—'}</td><td><div className="action-row"><button className="secondary-button" type="button" onClick={()=>startCompliance(c)} disabled={!canEdit}>Edit</button>{isOwner&&<button className="secondary-button danger-button" type="button" onClick={()=>remove('gov_compliance_items',c.id,c.name)}><Trash2 size={15}/> Delete</button>}</div></td></tr>)}</tbody></table></div>}</div>}

    {showProfile && <FormCard title="Edit Government Contracting Profile" onClose={() => setShowProfile(false)}><form className="stack-form" onSubmit={saveProfile}><div className="form-grid"><label>Legal entity<input value={profileForm.legal_name || ''} onChange={e=>setProfileForm({...profileForm,legal_name:e.target.value})}/></label><label>DBA<input value={profileForm.dba || ''} onChange={e=>setProfileForm({...profileForm,dba:e.target.value})}/></label><label>Certification status<select value={profileForm.certification_status || ''} onChange={e=>setProfileForm({...profileForm,certification_status:e.target.value})}><option value="active">Active</option><option value="pending">Pending</option><option value="expired">Expired</option></select></label><label>Certification approval<input type="date" value={dateOnly(profileForm.certification_approval_date)} onChange={e=>setProfileForm({...profileForm,certification_approval_date:e.target.value})}/></label><label>Certification expiration<input type="date" value={dateOnly(profileForm.certification_expiration_date)} onChange={e=>setProfileForm({...profileForm,certification_expiration_date:e.target.value})}/></label><label>SAM status<select value={profileForm.sam_status || ''} onChange={e=>setProfileForm({...profileForm,sam_status:e.target.value})}><option value="active">Active</option><option value="inactive">Inactive</option><option value="expired">Expired</option></select></label><label>SAM expiration<input type="date" value={dateOnly(profileForm.sam_expiration_date)} onChange={e=>setProfileForm({...profileForm,sam_expiration_date:e.target.value})}/></label><label>UEI<input value={profileForm.uei || ''} onChange={e=>setProfileForm({...profileForm,uei:e.target.value})}/></label><label>CAGE code<input value={profileForm.cage_code || ''} onChange={e=>setProfileForm({...profileForm,cage_code:e.target.value})}/></label><label>Primary NAICS<input value={profileForm.primary_naics || ''} onChange={e=>setProfileForm({...profileForm,primary_naics:e.target.value})}/></label><label>Capabilities URL<input value={profileForm.capabilities_statement_url || ''} onChange={e=>setProfileForm({...profileForm,capabilities_statement_url:e.target.value})}/></label><label>Last verified<input type="datetime-local" value={profileForm.last_verified_at ? String(profileForm.last_verified_at).slice(0,16) : ''} onChange={e=>setProfileForm({...profileForm,last_verified_at:e.target.value || null})}/></label></div><label>Notes<textarea rows="4" value={profileForm.notes || ''} onChange={e=>setProfileForm({...profileForm,notes:e.target.value})}/></label><FormActions busy={saving==='profile'} /></form></FormCard>}

    {showOpp && <FormCard title={editingOpp ? 'Edit Opportunity' : 'Add Government Opportunity'} onClose={() => setShowOpp(false)}><form className="stack-form" onSubmit={saveOpp}><div className="form-grid"><label>Title<input required value={oppForm.title} onChange={e=>setOppForm({...oppForm,title:e.target.value})}/></label><label>Solicitation number<input value={oppForm.opportunity_number} onChange={e=>setOppForm({...oppForm,opportunity_number:e.target.value})}/></label><label>Source<select value={oppForm.source} onChange={e=>setOppForm({...oppForm,source:e.target.value})}><option>SAM.gov</option><option>SUBNet</option><option>agency</option><option>prime</option><option>other</option></select></label><label>Pursuit type<select value={oppForm.pursuit_type} onChange={e=>setOppForm({...oppForm,pursuit_type:e.target.value})}><option value="prime">Prime</option><option value="subcontract">Subcontract</option></select></label><label>Agency<input value={oppForm.agency} onChange={e=>setOppForm({...oppForm,agency:e.target.value})}/></label><label>Prime contractor<select value={oppForm.prime_contractor_id} onChange={e=>setOppForm({...oppForm,prime_contractor_id:e.target.value})}><option value="">None</option>{primes.map(p=><option key={p.id} value={p.id}>{p.company_name}</option>)}</select></label><label>Set-aside<input value={oppForm.set_aside} onChange={e=>setOppForm({...oppForm,set_aside:e.target.value})}/></label><label>NAICS<input value={oppForm.naics_code} onChange={e=>setOppForm({...oppForm,naics_code:e.target.value})}/></label><label>Contract type<input value={oppForm.contract_type} onChange={e=>setOppForm({...oppForm,contract_type:e.target.value})}/></label><label>Estimated value<input type="number" min="0" step="0.01" value={oppForm.estimated_value} onChange={e=>setOppForm({...oppForm,estimated_value:e.target.value})}/></label><label>Posted date<input type="date" value={oppForm.posted_date} onChange={e=>setOppForm({...oppForm,posted_date:e.target.value})}/></label><label>Response deadline<input type="datetime-local" value={oppForm.response_deadline} onChange={e=>setOppForm({...oppForm,response_deadline:e.target.value})}/></label><label>Site visit<input type="datetime-local" value={oppForm.site_visit_date} onChange={e=>setOppForm({...oppForm,site_visit_date:e.target.value})}/></label><label>Status<select value={oppForm.status} onChange={e=>setOppForm({...oppForm,status:e.target.value})}><option>new</option><option>reviewing</option><option>qualified</option><option>bidding</option><option>submitted</option><option>won</option><option>lost</option><option>no_bid</option><option>closed</option></select></label><label>Probability %<input type="number" min="0" max="100" value={oppForm.probability} onChange={e=>setOppForm({...oppForm,probability:e.target.value})}/></label><label>Next action<input value={oppForm.next_action} onChange={e=>setOppForm({...oppForm,next_action:e.target.value})}/></label><label>Next action date<input type="date" value={oppForm.next_action_date} onChange={e=>setOppForm({...oppForm,next_action_date:e.target.value})}/></label><label>Solicitation URL<input value={oppForm.solicitation_url} onChange={e=>setOppForm({...oppForm,solicitation_url:e.target.value})}/></label><label>Place of performance<input value={oppForm.place_of_performance} onChange={e=>setOppForm({...oppForm,place_of_performance:e.target.value})}/></label></div><label>Description<textarea rows="4" value={oppForm.description} onChange={e=>setOppForm({...oppForm,description:e.target.value})}/></label><label>Notes<textarea rows="4" value={oppForm.notes} onChange={e=>setOppForm({...oppForm,notes:e.target.value})}/></label><FormActions busy={saving==='opp'} /></form></FormCard>}

    {showPrime && <FormCard title={editingPrime ? 'Edit Prime Contractor' : 'Add Prime Contractor'} onClose={() => setShowPrime(false)}><form className="stack-form" onSubmit={savePrime}><div className="form-grid"><label>Company name<input required value={primeForm.company_name} onChange={e=>setPrimeForm({...primeForm,company_name:e.target.value})}/></label><label>Website<input value={primeForm.website} onChange={e=>setPrimeForm({...primeForm,website:e.target.value})}/></label><label>POC name<input value={primeForm.poc_name} onChange={e=>setPrimeForm({...primeForm,poc_name:e.target.value})}/></label><label>POC email<input type="email" value={primeForm.poc_email} onChange={e=>setPrimeForm({...primeForm,poc_email:e.target.value})}/></label><label>POC phone<input value={primeForm.poc_phone} onChange={e=>setPrimeForm({...primeForm,poc_phone:e.target.value})}/></label><label>Relationship<select value={primeForm.relationship_status} onChange={e=>setPrimeForm({...primeForm,relationship_status:e.target.value})}><option value="prospect">Prospect</option><option value="active">Active</option><option value="preferred">Preferred</option><option value="inactive">Inactive</option></select></label></div><label>Notes<textarea rows="4" value={primeForm.notes} onChange={e=>setPrimeForm({...primeForm,notes:e.target.value})}/></label><FormActions busy={saving==='prime'} /></form></FormCard>}

    {showCompliance && <FormCard title={editingCompliance ? 'Edit Compliance Checkpoint' : 'Add Compliance Checkpoint'} onClose={() => setShowCompliance(false)}><form className="stack-form" onSubmit={saveCompliance}><div className="form-grid"><label>Name<input required value={complianceForm.name} onChange={e=>setComplianceForm({...complianceForm,name:e.target.value})}/></label><label>Category<select value={complianceForm.category} onChange={e=>setComplianceForm({...complianceForm,category:e.target.value})}><option value="certification">Certification</option><option value="registration">Registration</option><option value="insurance">Insurance</option><option value="bonding">Bonding</option><option value="contract">Contract</option><option value="safety">Safety</option><option value="general">General</option><option value="other">Other</option></select></label><label>Status<select value={complianceForm.status} onChange={e=>setComplianceForm({...complianceForm,status:e.target.value})}><option>active</option><option>due_soon</option><option>expired</option><option>not_applicable</option></select></label><label>Due date<input type="date" value={complianceForm.due_date} onChange={e=>setComplianceForm({...complianceForm,due_date:e.target.value})}/></label><label>Owner<input value={complianceForm.owner_name} onChange={e=>setComplianceForm({...complianceForm,owner_name:e.target.value})}/></label><label>Reference URL<input value={complianceForm.reference_url} onChange={e=>setComplianceForm({...complianceForm,reference_url:e.target.value})}/></label></div><label>Notes<textarea rows="4" value={complianceForm.notes} onChange={e=>setComplianceForm({...complianceForm,notes:e.target.value})}/></label><FormActions busy={saving==='compliance'} /></form></FormCard>}

    {showContract && <FormCard title={editingContract ? 'Edit Government Award' : 'Add Government Award'} onClose={() => setShowContract(false)}><form className="stack-form" onSubmit={saveContract}><div className="form-grid"><label>Contract number<input value={contractForm.contract_number} onChange={e=>setContractForm({...contractForm,contract_number:e.target.value})}/></label><label>Title<input required value={contractForm.title} onChange={e=>setContractForm({...contractForm,title:e.target.value})}/></label><label>Type<select value={contractForm.pursuit_type} onChange={e=>setContractForm({...contractForm,pursuit_type:e.target.value})}><option value="prime">Prime</option><option value="subcontract">Subcontract</option></select></label><label>Agency<input value={contractForm.agency} onChange={e=>setContractForm({...contractForm,agency:e.target.value})}/></label><label>Prime contractor<select value={contractForm.prime_contractor_id} onChange={e=>setContractForm({...contractForm,prime_contractor_id:e.target.value})}><option value="">None</option>{primes.map(p=><option key={p.id} value={p.id}>{p.company_name}</option>)}</select></label><label>Award date<input type="date" value={contractForm.award_date} onChange={e=>setContractForm({...contractForm,award_date:e.target.value})}/></label><label>Start date<input type="date" value={contractForm.start_date} onChange={e=>setContractForm({...contractForm,start_date:e.target.value})}/></label><label>End date<input type="date" value={contractForm.end_date} onChange={e=>setContractForm({...contractForm,end_date:e.target.value})}/></label><label>Contract value<input type="number" min="0" step="0.01" value={contractForm.contract_value} onChange={e=>setContractForm({...contractForm,contract_value:e.target.value})}/></label><label>Funded amount<input type="number" min="0" step="0.01" value={contractForm.funded_amount} onChange={e=>setContractForm({...contractForm,funded_amount:e.target.value})}/></label><label>Status<select value={contractForm.status} onChange={e=>setContractForm({...contractForm,status:e.target.value})}><option>draft</option><option>active</option><option>on_hold</option><option>completed</option><option>terminated</option></select></label></div><label>Notes<textarea rows="4" value={contractForm.notes} onChange={e=>setContractForm({...contractForm,notes:e.target.value})}/></label><FormActions busy={saving==='contract'} /></form></FormCard>}
  </section>
}

function FormCard({ title, onClose, children }) {
  return <div className="card" style={{ marginTop: 16 }}><div className="panel-header"><div><h2>{title}</h2></div><button className="secondary-button" type="button" onClick={onClose}><X size={16}/> Close</button></div>{children}</div>
}
function FormActions({ busy }) { return <div style={{ display:'flex', justifyContent:'flex-end', gap:10 }}><button className="primary-button" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button></div> }
function PencilIcon() { return <span style={{ display:'inline-flex' }}>✎</span> }
