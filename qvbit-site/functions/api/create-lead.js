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
      return new Response(JSON.stringify({ success: true, confirmationSent: false }), {
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const url = context.env.VITE_SUPABASE_URL
    const key = context.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key) throw new Error('Lead service is not configured.')

    const leadPayload = {
      contact_name: String(data.name).trim(),
      company_name: String(data.company || '').trim() || null,
      phone: String(data.phone || '').trim() || null,
      email: String(data.email).trim(),
      lead_source: 'Website - Request a Quote',
      service_requested: String(data.service_requested).trim(),
      number_of_drops: data.number_of_drops !== undefined && data.number_of_drops !== ''
        ? Number(data.number_of_drops)
        : null,
      estimated_value: data.estimated_value !== undefined && data.estimated_value !== ''
        ? Number(data.estimated_value)
        : null,
      notes: String(data.message).trim(),
      status: 'new',
    }

    if (leadPayload.number_of_drops !== null && !Number.isInteger(leadPayload.number_of_drops)) {
      throw new Error('Number of drops must be a whole number.')
    }

    if (leadPayload.estimated_value !== null && !Number.isFinite(leadPayload.estimated_value)) {
      throw new Error('Estimated project value must be a valid number.')
    }

    const response = await fetch(`${url}/rest/v1/leads`, {
      method: 'POST',
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify(leadPayload),
    })

    if (!response.ok) {
      const detail = await response.text()
      console.error('Lead creation failed:', detail)
      throw new Error(`Could not create lead: ${detail}`)
    }

    const createdLead = await response.json()
    let confirmationSent = false
    const brevoKey = context.env.BREVO_API_KEY

    if (brevoKey) {
      const safe = (value) => String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\"/g, '&quot;')
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
          sender: { name: 'QVB I.T.', email: 'billing@qvbit.net' },
          to: [{ email: String(data.email).trim(), name: String(data.name).trim() }],
          subject: 'We received your QVB I.T. quote request',
          htmlContent: confirmationHtml,
        }),
      })

      if (emailResponse.ok) {
        confirmationSent = true
      } else {
        console.error('Quote confirmation email failed:', await emailResponse.text())
      }
    } else {
      console.error('BREVO_API_KEY is not configured; quote confirmation email was not sent.')
    }

    return new Response(JSON.stringify({
      success: true,
      lead_id: Array.isArray(createdLead) ? createdLead[0]?.id || null : createdLead?.id || null,
      confirmationSent,
    }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message || 'Could not create lead.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
