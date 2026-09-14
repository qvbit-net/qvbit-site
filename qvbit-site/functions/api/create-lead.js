export async function onRequestPost(context) {
  try {
    const data = await context.request.json()
    const required = ['name', 'email', 'service_requested', 'message']
    for (const field of required) {
      if (!String(data[field] || '').trim()) {
        return new Response(JSON.stringify({ error: `${field} is required.` }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        })
      }
    }

    if (data._honey) {
      return new Response(JSON.stringify({ success: true }), {
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const url = context.env.VITE_SUPABASE_URL
    const key = context.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key) throw new Error('Lead service is not configured.')

    const response = await fetch(`${url}/rest/v1/leads?select=id,contact_name,company_name,email,service_requested,status`, {
      method: 'POST',
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify({
        contact_name: data.name,
        company_name: data.company || null,
        phone: data.phone || null,
        email: data.email,
        lead_source: 'Website - Request a Quote',
        site_address: data.site_address || null,
        city: data.city || null,
        state: data.state || null,
        zip: data.zip || null,
        service_requested: data.service_requested,
        number_of_drops: data.number_of_drops ? Number(data.number_of_drops) : null,
        estimated_value: data.estimated_value ? Number(data.estimated_value) : null,
        notes: data.message,
        status: 'new',
      }),
    })

    if (!response.ok) throw new Error(await response.text())

    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message || 'Could not create lead.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
