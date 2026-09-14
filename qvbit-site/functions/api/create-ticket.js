export async function onRequestPost(context) {
  try {
    const data = await context.request.json()
    const required = ['name', 'email', 'subject', 'message', 'issue_type', 'priority']
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
    if (!url || !key) throw new Error('Ticket service is not configured.')

    const normalizedPriority = data.priority.toLowerCase().startsWith('critical')
      ? 'critical'
      : data.priority.toLowerCase().startsWith('high')
        ? 'high'
        : data.priority.toLowerCase().startsWith('low')
          ? 'low'
          : 'normal'

    const response = await fetch(`${url}/rest/v1/tickets?select=id,ticket_number,subject,requester_name,requester_email`, {
      method: 'POST',
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify({
        requester_name: data.name,
        requester_email: data.email,
        requester_phone: data.phone || null,
        company_name: data.company || null,
        subject: data.subject,
        description: data.message,
        issue_type: data.issue_type,
        priority: normalizedPriority,
      }),
    })

    if (!response.ok) throw new Error(await response.text())

    const createdTickets = await response.json()
    const ticket = Array.isArray(createdTickets) ? createdTickets[0] : createdTickets
    const ticketReference = ticket?.ticket_number || ticket?.id || 'your support ticket'

    let leadCreated = false
    let leadError = null

    // A quote request uses the same support workflow, but also creates a CRM lead.
    if (data.request_type === 'quote') {
      try {
        const leadResponse = await fetch(`${url}/rest/v1/leads`, {
          method: 'POST',
          headers: {
            apikey: key,
            Authorization: `Bearer ${key}`,
            'Content-Type': 'application/json',
            Prefer: 'return=minimal',
          },
          body: JSON.stringify({
            contact_name: data.name,
            company_name: data.company || null,
            phone: data.phone || null,
            email: data.email,
            lead_source: 'Website - Request a Quote',
            service_requested: data.issue_type,
            notes: data.message,
            status: 'new',
          }),
        })

        if (!leadResponse.ok) {
          leadError = await leadResponse.text()
        } else {
          leadCreated = true
        }
      } catch (error) {
        leadError = error.message || 'Could not create the CRM lead.'
      }
    }

    // Send the requester one confirmation using the existing support email workflow.
    let confirmationSent = false
    try {
      const brevoKey = context.env.BREVO_API_KEY
      if (!brevoKey) throw new Error('BREVO_API_KEY is not configured.')

      const safe = (value) => String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\"/g, '&quot;')
        .replace(/'/g, '&#39;')

      const confirmationHtml = `
        <p>Hello ${safe(data.name)},</p>
        <p>We received your ${data.request_type === 'quote' ? 'quote request' : 'support request'} and created ticket <strong>${safe(ticketReference)}</strong>.</p>
        <p><strong>Subject:</strong> ${safe(data.subject)}<br>
        <strong>Issue type:</strong> ${safe(data.issue_type)}<br>
        <strong>Priority:</strong> ${safe(normalizedPriority)}</p>
        <p>Our team will review your request and follow up using this email address.</p>
        <p>Please keep this ticket reference for future correspondence.</p>
        <p>Thank you,<br>QVB I.T. Support</p>
      `

      const emailResponse = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'api-key': brevoKey,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          sender: { name: 'QVB I.T. Support', email: context.env.SUPPORT_FROM_EMAIL || 'support@qvbit.net' },
          to: [{ email: data.email, name: data.name }],
          subject: `${data.request_type === 'quote' ? 'Quote request received' : 'Support request received'} - ${ticketReference}`,
          htmlContent: confirmationHtml,
        }),
      })

      if (!emailResponse.ok) {
        console.error('Support confirmation email failed:', await emailResponse.text())
      } else {
        confirmationSent = true
      }
    } catch (emailError) {
      console.error('Support confirmation email skipped:', emailError.message)
    }

    return new Response(JSON.stringify({
      success: true,
      ticket_number: ticket?.ticket_number || null,
      confirmation_sent: confirmationSent,
      lead_created: leadCreated,
      lead_error: leadError,
    }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message || 'Could not create ticket.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
