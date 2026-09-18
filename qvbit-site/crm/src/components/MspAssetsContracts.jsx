import { useEffect, useState } from 'react'
import { Box, FileText, Plus, RefreshCw, Trash2, Pencil, X } from 'lucide-react'
import { supabase } from '../supabase'
import GovernmentContractingPanel from './GovernmentContractingPanel'

const emptyAsset = { customer_id: '', site_id: '', asset_name: '', asset_type: '', manufacturer: '', model: '', serial_number: '', asset_tag: '', installed_date: '', warranty_until: '', location: '', status: 'active', notes: '' }
const emptyContract = { customer_id: '', service_id: '', name: '', status: 'active', billing_interval: 'monthly', recurring_amount: '', start_date: '', end_date: '', next_billing_date: '', auto_renew: true, notes: '' }
const emptyContractItem = { service_id: '', description: '', quantity: '1', unit_price: '', unit_cost: '0' }
const money = (v) => `$${Number(v || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export default function MspAssetsContracts() {
  const [customers, setCustomers] = useState([])
  const [services, setServices] = useState([])
  const [assets, setAssets] = useState([])
  const [contracts, setContracts] = useState([])
  const [assetForm, setAssetForm] = useState(emptyAsset)
  const [contractForm, setContractForm] = useState(emptyContract)
  const [assetOpen, setAssetOpen] = useState(false)
  const [contractOpen, setContractOpen] = useState(false)
  const [editingAsset, setEditingAsset] = useState(null)
  const [editingContract, setEditingContract] = useState(null)
  const [contractItems, setContractItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [isOwner, setIsOwner] = useState(false)

  async function load() {
    setLoading(true)
    setError('')
    const [{ data: customerData, error: customerError }, { data: serviceData, error: serviceError }, { data: assetData, error: assetError }, { data: contractData, error: contractError }, { data: authUser }] = await Promise.all([
      supabase.from('customers').select('id, company_name').order('company_name'),
      supabase.from('services').select('id, name').order('name'),
      supabase.from('customer_assets').select('id, customer_id, site_id, asset_name, asset_type, manufacturer, model, serial_number, asset_tag, installed_date, warranty_until, location, status, notes, created_at, updated_at, customers(company_name)').order('created_at', { ascending: false }).limit(250),
      supabase.from('service_contracts').select('id, customer_id, service_id, contract_number, name, status, billing_interval, recurring_amount, start_date, end_date, next_billing_date, auto_renew, notes, created_at, updated_at, customers(company_name), services(name)').order('created_at', { ascending: false }).limit(250),
      supabase.auth.getUser(),
    ])
    if (customerError) setError(customerError.message)
    else setCustomers(customerData || [])
    if (serviceError) setError((current) => current || serviceError.message)
    else setServices(serviceData || [])
    if (assetError) setError((current) => current || assetError.message)
    else setAssets(assetData || [])
    if (contractError) setError((current) => current || contractError.message)
    else setContracts(contractData || [])
    const userId = authUser?.user?.id
    if (userId) {
      const { data: profile } = await supabase.from('user_profiles').select('role, is_active').eq('id', userId).maybeSingle()
      setIsOwner(profile?.role === 'owner' && profile?.is_active !== false)
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  function openAsset(asset = null) {
    setError(''); setMessage(''); setEditingAsset(asset?.id || null)
    setAssetForm(asset ? { ...emptyAsset, ...asset } : emptyAsset)
    setAssetOpen(true)
  }
  async function openContract(contract = null) {
    setError(''); setMessage(''); setEditingContract(contract?.id || null)
    setContractForm(contract ? { ...emptyContract, ...contract, recurring_amount: contract.recurring_amount ?? '' } : emptyContract)
    if (contract?.id) {
      const { data, error: itemError } = await supabase.from('service_contract_items').select('id, service_id, description, quantity, unit_price, unit_cost').eq('contract_id', contract.id).order('created_at')
      if (itemError) setError(itemError.message)
      setContractItems(data || [])
    } else {
      setContractItems([])
    }
    setContractOpen(true)
  }

  async function saveAsset(event) {
    event.preventDefault(); setSaving('asset'); setError(''); setMessage('')
    const payload = { ...assetForm, site_id: assetForm.site_id || null, installed_date: assetForm.installed_date || null, warranty_until: assetForm.warranty_until || null, asset_type: assetForm.asset_type || null, manufacturer: assetForm.manufacturer || null, model: assetForm.model || null, serial_number: assetForm.serial_number || null, asset_tag: assetForm.asset_tag || null, location: assetForm.location || null, notes: assetForm.notes || null }
    const result = editingAsset ? await supabase.from('customer_assets').update(payload).eq('id', editingAsset) : await supabase.from('customer_assets').insert(payload)
    if (result.error) setError(result.error.message)
    else { setMessage(editingAsset ? 'Asset updated.' : 'Asset added.'); setAssetOpen(false); await load() }
    setSaving('')
  }

  async function saveContract(event) {
    event.preventDefault(); setSaving('contract'); setError(''); setMessage('')
    const itemTotal = contractItems.reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.unit_price || 0), 0)
    let payload = { ...contractForm, service_id: contractForm.service_id || null, recurring_amount: contractItems.length ? itemTotal : Number(contractForm.recurring_amount || 0), end_date: contractForm.end_date || null, next_billing_date: contractForm.next_billing_date || null, start_date: contractForm.start_date || null }
    if (!editingContract) {
      const { data: number, error: numberError } = await supabase.rpc('next_service_contract_number')
      if (numberError) { setError(numberError.message); setSaving(''); return }
      payload.contract_number = number
    }
    const result = editingContract
      ? await supabase.from('service_contracts').update(payload).eq('id', editingContract)
      : await supabase.from('service_contracts').insert(payload).select('id').single()

    if (result.error) {
      setError(result.error.message)
      setSaving('')
      return
    }

    const contractId = editingContract || result.data?.id
    const cleanItems = contractItems
      .filter((item) => item.description.trim())
      .map((item) => ({
        contract_id: contractId,
        service_id: item.service_id || null,
        description: item.description.trim(),
        quantity: Number(item.quantity || 0),
        unit_price: Number(item.unit_price || 0),
        unit_cost: Number(item.unit_cost || 0),
      }))

    if (contractId) {
      const { error: deleteItemsError } = await supabase.from('service_contract_items').delete().eq('contract_id', contractId)
      if (deleteItemsError) {
        setError(deleteItemsError.message)
        setSaving('')
        return
      }

      if (cleanItems.length) {
        const { error: itemInsertError } = await supabase.from('service_contract_items').insert(cleanItems)
        if (itemInsertError) {
          setError(itemInsertError.message)
          setSaving('')
          return
        }
      }
    }

    setMessage(editingContract ? 'Service contract updated.' : 'Service contract created.')
    setContractOpen(false)
    setContractItems([])
    await load()
    setSaving('')
  }

  async function remove(table, id, label) {
    if (!isOwner) return
    if (!window.confirm(`Delete ${label}? This cannot be undone.`)) return
    setSaving(`delete:${id}`); setError(''); setMessage('')
    const { error: deleteError } = await supabase.from(table).delete().eq('id', id)
    if (deleteError) setError(deleteError.message)
    else { setMessage(`${label} deleted.`); await load() }
    setSaving('')
  }

  return <section className="page-section">
    <GovernmentContractingPanel />
    <div className="page-header"><div><div className="eyebrow">MSP operations</div><h1>Assets & Service Contracts</h1><p className="muted">Track customer equipment, warranties, and recurring managed services.</p></div><button className="secondary-button" type="button" onClick={load} disabled={loading}><RefreshCw size={16} /> {loading ? 'Refreshing…' : 'Refresh'}</button></div>
    {error && <div className="error-box">{error}</div>}{message && <div className="info-box">{message}</div>}

    <div className="card"><div className="panel-header"><div><h2><Box size={18}/> Customer Assets</h2><p>Equipment and infrastructure associated with customers.</p></div><button className="primary-button" type="button" onClick={() => openAsset()}><Plus size={16}/> Add Asset</button></div>
      {loading ? <p className="muted">Loading…</p> : assets.length === 0 ? <p className="muted">No customer assets recorded.</p> : <div className="table-wrap"><table><thead><tr><th>Asset</th><th>Customer</th><th>Manufacturer / Model</th><th>Serial / Tag</th><th>Warranty</th><th>Status</th><th></th></tr></thead><tbody>{assets.map(a => <tr key={a.id}><td><strong>{a.asset_name}</strong><div className="muted">{a.asset_type || 'Equipment'}{a.location ? ` • ${a.location}` : ''}</div></td><td>{a.customers?.company_name || '—'}</td><td>{[a.manufacturer,a.model].filter(Boolean).join(' / ') || '—'}</td><td>{a.serial_number || '—'}<div className="muted">{a.asset_tag || ''}</div></td><td>{a.warranty_until || '—'}</td><td>{a.status}</td><td><div className="action-row"><button className="secondary-button" type="button" onClick={() => openAsset(a)}><Pencil size={15}/> Edit</button>{isOwner && <button className="secondary-button danger-button" type="button" disabled={saving===`delete:${a.id}`} onClick={() => remove('customer_assets', a.id, a.asset_name)}><Trash2 size={15}/> Delete</button>}</div></td></tr>)}</tbody></table></div>}
    </div>

    <div className="card"><div className="panel-header"><div><h2><FileText size={18}/> Service Contracts</h2><p>Recurring service commitments and billing schedules.</p></div><button className="primary-button" type="button" onClick={() => openContract()}><Plus size={16}/> Add Contract</button></div>
      {loading ? <p className="muted">Loading…</p> : contracts.length === 0 ? <p className="muted">No service contracts recorded.</p> : <div className="table-wrap"><table><thead><tr><th>Contract</th><th>Customer</th><th>Service</th><th>Billing</th><th>Amount</th><th>Next Billing</th><th>Status</th><th></th></tr></thead><tbody>{contracts.map(c => <tr key={c.id}><td><strong>{c.contract_number}</strong><div className="muted">{c.name}</div></td><td>{c.customers?.company_name || '—'}</td><td>{c.services?.name || '—'}</td><td>{c.billing_interval}</td><td>{money(c.recurring_amount)}</td><td>{c.next_billing_date || '—'}</td><td>{c.status}</td><td><div className="action-row"><button className="secondary-button" type="button" onClick={() => openContract(c)}><Pencil size={15}/> Edit</button>{isOwner && <button className="secondary-button danger-button" type="button" disabled={saving===`delete:${c.id}`} onClick={() => remove('service_contracts', c.id, c.contract_number)}><Trash2 size={15}/> Delete</button>}</div></td></tr>)}</tbody></table></div>}
    </div>

    {assetOpen && <div className="card"><div className="panel-header"><div><h2>{editingAsset ? 'Edit Asset' : 'Add Customer Asset'}</h2></div><button className="secondary-button" type="button" onClick={() => setAssetOpen(false)}><X size={16}/> Close</button></div><form className="stack-form" onSubmit={saveAsset}><label>Customer<select required value={assetForm.customer_id} onChange={e=>setAssetForm({...assetForm,customer_id:e.target.value})}><option value="">Select customer</option>{customers.map(c=><option key={c.id} value={c.id}>{c.company_name}</option>)}</select></label><label>Asset name<input required value={assetForm.asset_name} onChange={e=>setAssetForm({...assetForm,asset_name:e.target.value})} placeholder="Firewall, laptop, switch…"/></label><label>Asset type<input value={assetForm.asset_type} onChange={e=>setAssetForm({...assetForm,asset_type:e.target.value})}/></label><div className="form-grid"><label>Manufacturer<input value={assetForm.manufacturer} onChange={e=>setAssetForm({...assetForm,manufacturer:e.target.value})}/></label><label>Model<input value={assetForm.model} onChange={e=>setAssetForm({...assetForm,model:e.target.value})}/></label><label>Serial number<input value={assetForm.serial_number} onChange={e=>setAssetForm({...assetForm,serial_number:e.target.value})}/></label><label>Asset tag<input value={assetForm.asset_tag} onChange={e=>setAssetForm({...assetForm,asset_tag:e.target.value})}/></label><label>Installed date<input type="date" value={assetForm.installed_date || ''} onChange={e=>setAssetForm({...assetForm,installed_date:e.target.value})}/></label><label>Warranty until<input type="date" value={assetForm.warranty_until || ''} onChange={e=>setAssetForm({...assetForm,warranty_until:e.target.value})}/></label><label>Location<input value={assetForm.location} onChange={e=>setAssetForm({...assetForm,location:e.target.value})}/></label><label>Status<select value={assetForm.status} onChange={e=>setAssetForm({...assetForm,status:e.target.value})}><option value="active">Active</option><option value="maintenance">Maintenance</option><option value="retired">Retired</option><option value="lost">Lost</option></select></label></div><label>Notes<textarea rows="4" value={assetForm.notes} onChange={e=>setAssetForm({...assetForm,notes:e.target.value})}/></label><div style={{display:'flex',justifyContent:'flex-end',gap:'10px'}}><button className="secondary-button" type="button" onClick={()=>setAssetOpen(false)}>Cancel</button><button className="primary-button" type="submit" disabled={saving==='asset'}>{saving==='asset'?'Saving…':editingAsset?'Save Asset':'Add Asset'}</button></div></form></div>}

    {contractOpen && <div className="card"><div className="panel-header"><div><h2>{editingContract ? `Edit Contract ${editingContract ? '' : ''}` : 'Add Service Contract'}</h2></div><button className="secondary-button" type="button" onClick={()=>setContractOpen(false)}><X size={16}/> Close</button></div><form className="stack-form" onSubmit={saveContract}><label>Customer<select required value={contractForm.customer_id} onChange={e=>setContractForm({...contractForm,customer_id:e.target.value})}><option value="">Select customer</option>{customers.map(c=><option key={c.id} value={c.id}>{c.company_name}</option>)}</select></label><label>Contract name<input required value={contractForm.name} onChange={e=>setContractForm({...contractForm,name:e.target.value})} placeholder="Managed IT Services"/></label><label>Service<select value={contractForm.service_id || ''} onChange={e=>setContractForm({...contractForm,service_id:e.target.value})}><option value="">Select service (optional)</option>{services.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>

<div className="card" style={{ padding: '14px', margin: '4px 0 8px' }}>
  <div className="panel-header">
    <div><h3>Contract line items</h3><p className="muted">Build recurring services from the catalog. The total is used as the contract recurring amount.</p></div>
    <button className="secondary-button" type="button" onClick={() => setContractItems([...contractItems, { ...emptyContractItem }])}><Plus size={15}/> Add item</button>
  </div>
  {contractItems.length === 0 ? <p className="muted">No line items. You can still use the single recurring amount above.</p> : <div className="table-wrap"><table><thead><tr><th>Service</th><th>Description</th><th>Qty</th><th>Unit price</th><th>Unit cost</th><th></th></tr></thead><tbody>{contractItems.map((item,index) => <tr key={item.id || index}>
    <td><select value={item.service_id || ''} onChange={e => { const service=services.find(s=>s.id===e.target.value); const next=[...contractItems]; next[index]={...item,service_id:e.target.value,description:service?.name || item.description,unit_price:service?.default_price ?? item.unit_price,unit_cost:service?.default_cost ?? item.unit_cost}; setContractItems(next) }}><option value="">Custom</option>{services.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></td>
    <td><input value={item.description || ''} onChange={e=>{const next=[...contractItems];next[index]={...item,description:e.target.value};setContractItems(next)}} /></td>
    <td><input type="number" min="0" step="0.01" value={item.quantity ?? '1'} onChange={e=>{const next=[...contractItems];next[index]={...item,quantity:e.target.value};setContractItems(next)}} /></td>
    <td><input type="number" min="0" step="0.01" value={item.unit_price ?? ''} onChange={e=>{const next=[...contractItems];next[index]={...item,unit_price:e.target.value};setContractItems(next)}} /></td>
    <td><input type="number" min="0" step="0.01" value={item.unit_cost ?? '0'} onChange={e=>{const next=[...contractItems];next[index]={...item,unit_cost:e.target.value};setContractItems(next)}} /></td>
    <td><button className="text-button danger" type="button" onClick={()=>setContractItems(contractItems.filter((_,i)=>i!==index))}><Trash2 size={14}/> Remove</button></td>
  </tr>)}</tbody></table></div>}
  <div style={{display:'flex',justifyContent:'flex-end',marginTop:'12px'}}><strong>Line-item recurring total: {money(contractItems.reduce((sum,item)=>sum + Number(item.quantity||0)*Number(item.unit_price||0),0))}</strong></div>
</div><div className="form-grid"><label>Status<select value={contractForm.status} onChange={e=>setContractForm({...contractForm,status:e.target.value})}><option value="draft">Draft</option><option value="active">Active</option><option value="paused">Paused</option><option value="expired">Expired</option><option value="cancelled">Cancelled</option></select></label><label>Billing interval<select value={contractForm.billing_interval} onChange={e=>setContractForm({...contractForm,billing_interval:e.target.value})}><option value="monthly">Monthly</option><option value="quarterly">Quarterly</option><option value="semi_annual">Semi-annual</option><option value="annual">Annual</option><option value="one_time">One-time</option></select></label><label>Recurring amount<input type="number" min="0" step="0.01" value={contractForm.recurring_amount} onChange={e=>setContractForm({...contractForm,recurring_amount:e.target.value})}/></label><label>Start date<input type="date" value={contractForm.start_date || ''} onChange={e=>setContractForm({...contractForm,start_date:e.target.value})}/></label><label>End date<input type="date" value={contractForm.end_date || ''} onChange={e=>setContractForm({...contractForm,end_date:e.target.value})}/></label><label>Next billing date<input type="date" value={contractForm.next_billing_date || ''} onChange={e=>setContractForm({...contractForm,next_billing_date:e.target.value})}/></label><label>Auto renew<select value={contractForm.auto_renew ? 'yes' : 'no'} onChange={e=>setContractForm({...contractForm,auto_renew:e.target.value==='yes'})}><option value="yes">Yes</option><option value="no">No</option></select></label></div><label>Notes<textarea rows="4" value={contractForm.notes} onChange={e=>setContractForm({...contractForm,notes:e.target.value})}/></label><div style={{display:'flex',justifyContent:'flex-end',gap:'10px'}}><button className="secondary-button" type="button" onClick={()=>setContractOpen(false)}>Cancel</button><button className="primary-button" type="submit" disabled={saving==='contract'}>{saving==='contract'?'Saving…':editingContract?'Save Contract':'Create Contract'}</button></div></form></div>}
  </section>
}
