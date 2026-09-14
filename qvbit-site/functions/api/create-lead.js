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

    const leadPayload = {
      contact_name: String(data.name).trim(),
      company_name: data.company || null,
      phone: data.phone || null,
      email: String(data.email).trim(),
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
    }

    const response = await fetch(`${url}/rest/v1/leads?select=id,contact_name,company_name,email,service_requested,status`, {
      method: 'POST',
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify(leadPayload),
    })

    if (!response.ok) throw new Error(await response.text())

    let confirmationSent = false
    const brevoKey = context.env.BREVO_API_KEY
    const senderEmail = context.env.QVB_CRM_FROM_EMAIL || 'billing@qvbit.net'

    if (brevoKey) {
      const safe = (value) => String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')

      const confirmationHtml = `
        <p>Hello ${safe(data.name)},</p>
        <p>Thank you for contacting QVB I.T. Your quote request has been received.</p>
        <p><strong>Service requested:</strong> ${safe(data.service_requested)}</p>
        <p>Our team will review your project details and follow up using the contact information you provided.</p>
        <p>If your request is urgent, please call <strong>561-907-8248</strong>.</p>
        <p>Thank you,<br>QVB I.T.<br><a href="https://qvbit.net">qvbit.net</a></p>
      `

      const emailResponse = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'api-key': brevoKey,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          sender: { name: 'QVB I.T.', email: senderEmail },
          to: [{ email: String(data.email).trim(), name: String(data.name).trim() }],
          subject: 'We received your QVB I.T. quote request',
          htmlContent: confirmationHtml,
        }),
      })

      confirmationSent = emailResponse.ok
      if (!confirmationSent) console.error('Quote confirmation email failed:', await emailResponse.text())
    } else {
      console.error('BREVO_API_KEY is not configured; quote confirmation email was not sent.')
    }

    return new Response(JSON.stringify({ success: true, confirmationSent }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message || 'Could not create lead.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
