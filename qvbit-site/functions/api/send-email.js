export async function onRequestPost(context) {
  const { request, env } = context

  const apiKey = env.BREVO_API_KEY
  const fromEmail = env.QVB_CRM_FROM_EMAIL

  if (!apiKey || !fromEmail) {
    return json(
      {
        error:
          'Email sending is not configured. Add BREVO_API_KEY and QVB_CRM_FROM_EMAIL to the Cloudflare Pages environment variables.',
      },
      500
    )
  }

  let payload

  try {
    payload = await request.json()
  } catch {
    return json({ error: 'Invalid request body.' }, 400)
  }

  const to = String(payload?.to || '').trim()
  const subject = String(payload?.subject || '').trim()
  const text = String(payload?.text || '').trim()

  if (!to || !subject || !text) {
    return json(
      {
        error: 'Recipient, subject, and message are required.',
      },
      400
    )
  }

  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'api-key': apiKey,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      sender: {
        name: 'QVB I.T.',
        email: fromEmail,
      },
      replyTo: {
        name: 'QVB I.T.',
        email: fromEmail,
      },
      to: [{ email: to }],
      subject,
      textContent: text,
    }),
  })

  const result = await response.json().catch(() => ({}))

  if (!response.ok) {
    return json(
      {
        error:
          result?.message ||
          result?.code ||
          'Brevo could not send the email.',
      },
      response.status >= 400 && response.status < 600
        ? response.status
        : 502
    )
  }

  return json(
    {
      ok: true,
      messageId: result?.messageId || null,
    },
    200
  )
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
    },
  })
}
