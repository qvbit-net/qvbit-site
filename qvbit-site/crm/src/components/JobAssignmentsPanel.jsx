import React, { useEffect, useState } from 'react'
import { Plus, UserRound, X } from 'lucide-react'
import { supabase } from '../supabase'

const ROLES = [
  ['lead', 'Lead'],
  ['assigned', 'Assigned'],
  ['helper', 'Helper'],
  ['subcontractor', 'Subcontractor'],
]

function roleLabel(value) {
  return ROLES.find(([key]) => key === value)?.[1] || value || 'Assigned'
}

function money(value) {
  if (value == null) return '—'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(Number(value))
}

export default function JobAssignmentsPanel({ jobId }) {
  const [technicians, setTechnicians] = useState([])
  const [assignments, setAssignments] = useState([])
  const [selectedTechnician, setSelectedTechnician] = useState('')
  const [assignmentRole, setAssignmentRole] = useState('assigned')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function load() {
    setLoading(true)
    setError('')

    const [techResult, assignmentResult] = await Promise.all([
      supabase.from('technicians').select('id, display_name, role, hourly_cost, default_bill_rate, active').eq('active', true).order('display_name'),
      supabase.from('job_assignments').select('id, technician_id, assignment_role, status, notes, technicians(display_name, role, hourly_cost, default_bill_rate)').eq('job_id', jobId).order('created_at'),
    ])

    const firstError = [techResult, assignmentResult].find((result) => result.error)?.error
    if (firstError) setError(firstError.message)

    setTechnicians(techResult.data || [])
    setAssignments(assignmentResult.data || [])
    setLoading(false)
  }

  useEffect(() => { if (jobId) load() }, [jobId])

  const assignedIds = new Set(assignments.map((item) => item.technician_id))
  const available = technicians.filter((item) => !assignedIds.has(item.id))

  async function assign() {
    if (!selectedTechnician) {
      setError('Select a technician first.')
      return
    }

    setSaving(true)
    setError('')

    const { error: insertError } = await supabase.from('job_assignments').insert({
      job_id: jobId,
      technician_id: selectedTechnician,
      assignment_role: assignmentRole,
      status: 'assigned',
    })

    if (insertError) setError(insertError.message)
    else {
      setSelectedTechnician('')
      setAssignmentRole('assigned')
      await load()
    }

    setSaving(false)
  }

  async function remove(assignment) {
    setError('')
    const { error: deleteError } = await supabase.from('job_assignments').delete().eq('id', assignment.id)
    if (deleteError) setError(deleteError.message)
    else await load()
  }

  return (
    <section className="panel" style={{ marginBottom: '20px' }}>
      <div className="panel-header">
        <div>
          <h2>Assigned technicians</h2>
          <p>Assign field engineers and subcontractors to this job. Their labor rates can feed future job-cost reporting.</p>
        </div>
      </div>

      {error && <div className="error-box" style={{ marginBottom: '14px' }}>{error}</div>}

      <div className="form-grid-3" style={{ marginBottom: '16px' }}>
        <label>
          Technician
          <select value={selectedTechnician} onChange={(e) => setSelectedTechnician(e.target.value)} disabled={saving || loading}>
            <option value="">Select technician</option>
            {available.map((item) => <option key={item.id} value={item.id}>{item.display_name}</option>)}
          </select>
        </label>
        <label>
          Assignment role
          <select value={assignmentRole} onChange={(e) => setAssignmentRole(e.target.value)} disabled={saving}>
            {ROLES.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
        </label>
        <div style={{ display: 'flex', alignItems: 'end' }}>
          <button type="button" className="primary-button" onClick={assign} disabled={saving || loading || !selectedTechnician}><Plus size={16} /> {saving ? 'Assigning…' : 'Assign'}</button>
        </div>
      </div>

      {loading ? <div className="loading-box">Loading assignments…</div> : assignments.length === 0 ? (
        <div className="empty-state"><UserRound size={22} /><strong>No technicians assigned</strong><p>Add the people responsible for this job.</p></div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Technician</th><th>Role</th><th>Labor cost</th><th>Bill rate</th><th>Status</th><th></th></tr></thead>
            <tbody>{assignments.map((item) => (
              <tr key={item.id}>
                <td><strong>{item.technicians?.display_name || 'Technician'}</strong></td>
                <td>{roleLabel(item.assignment_role)}</td>
                <td>{money(item.technicians?.hourly_cost)} / hr</td>
                <td>{money(item.technicians?.default_bill_rate)} / hr</td>
                <td>{item.status || 'assigned'}</td>
                <td><button type="button" className="text-button danger" onClick={() => remove(item)}><X size={14} /> Remove</button></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </section>
  )
}
