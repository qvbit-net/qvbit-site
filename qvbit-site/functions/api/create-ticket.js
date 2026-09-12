export async function onRequestPost(context) {
  try {
    const data = await context.request.json()
    const required = ['name', 'email', 'subject', 'message', 'issue_type', 'priority']
    for (const field of required) {
      if (!String(data[field] || '').trim()) return new Response(JSON.stringify({ error: `${field} is required.` }), { status: 400, headers: { 'Content-Type': 'application/json' } })
    }
    if (data._honey) return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json' } })
    const url = context.env.VITE_SUPABASE_URL
    const key = context.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key) throw new Error('Ticket service is not configured.')
    const response = await fetch(`${url}/rest/v1/tickets`, {
      method: 'POST',
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ requester_name: data.name, requester_email: data.email, requester_phone: data.phone || null, company_name: data.company || null, subject: data.subject, description: data.message, issue_type: data.issue_type, priority: data.priority.toLowerCase().startsWith('critical') ? 'critical' : data.priority.toLowerCase().startsWith('high') ? 'high' : data.priority.toLowerCase().startsWith('low') ? 'low' : 'normal' })
    })
    if (!response.ok) throw new Error(await response.text())
    return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json' } })
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message || 'Could not create ticket.' }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
}
