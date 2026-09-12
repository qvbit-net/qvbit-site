export async function onRequestPost(context) {
  try {
    const requestData = await context.request.json();

    // Fallbacks for variable names sent by frontend.
    const recipient = requestData.recipient || requestData.to;
    const recipientName = requestData.recipientName || recipient;
    const subject = requestData.subject || 'Notification from QVB I.T.';

    if (!recipient) {
      return new Response(JSON.stringify({ error: 'A recipient email address is required.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Extract body text safely.
    const rawContent = requestData.htmlContent || requestData.body || requestData.message || requestData.text || '';
    const formattedHtml = typeof rawContent === 'string' && rawContent.length > 0
      ? `<p>${rawContent.replace(/\n/g, '<br>')}</p>`
      : '<p></p>';

    const activityType = requestData.activityType || 'email_sent';
    const clientId = requestData.clientId || null;
    const senderEmail = context.env.QVB_CRM_FROM_EMAIL || 'billing@qvbit.net';

    // Optional Brevo attachments.
    // The frontend sends [{ name, content, mimeType }] where content is base64.
    // Keep a conservative request-level limit so oversized browser payloads do not
    // get forwarded to Brevo accidentally.
    const rawAttachments = Array.isArray(requestData.attachments) ? requestData.attachments : [];
    if (rawAttachments.length > 10) {
      return new Response(JSON.stringify({ error: 'You can attach up to 10 files per email.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const attachments = rawAttachments.map((attachment) => ({
      name: String(attachment?.name || 'attachment'),
      content: String(attachment?.content || ''),
      ...(attachment?.mimeType ? { type: String(attachment.mimeType) } : {}),
    })).filter((attachment) => attachment.content);

    const attachmentBytes = attachments.reduce((total, attachment) => {
      // Base64 is roughly 4/3 the original byte count.
      return total + Math.floor((attachment.content.length * 3) / 4);
    }, 0);

    const maxAttachmentBytes = 25 * 1024 * 1024;
    if (attachmentBytes > maxAttachmentBytes) {
      return new Response(JSON.stringify({ error: 'Email attachments must total 25 MB or less.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 1. Send Email via Brevo API.
    const brevoPayload = {
      sender: { name: 'QVB I.T.', email: senderEmail },
      to: [{ email: recipient, name: recipientName }],
      subject,
      htmlContent: formattedHtml,
    };

    if (attachments.length) {
      brevoPayload.attachment = attachments;
    }

    const brevoResponse = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'api-key': context.env.BREVO_API_KEY,
        'content-type': 'application/json',
      },
      body: JSON.stringify(brevoPayload),
    });

    if (!brevoResponse.ok) {
      const errorDetails = await brevoResponse.text();
      return new Response(
        JSON.stringify({ error: 'Brevo send failed', details: errorDetails }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 2. Log Activity to Supabase.
    try {
      const supabaseUrl = context.env.VITE_SUPABASE_URL;
      const supabaseKey = context.env.SUPABASE_SERVICE_ROLE_KEY || context.env.VITE_SUPABASE_PUBLISHABLE_KEY;

      if (supabaseUrl && supabaseKey) {
        await fetch(`${supabaseUrl}/rest/v1/activity_logs`, {
          method: 'POST',
          headers: {
            apikey: supabaseKey,
            Authorization: `Bearer ${supabaseKey}`,
            'Content-Type': 'application/json',
            Prefer: 'return=minimal',
          },
          body: JSON.stringify({
            client_id: clientId,
            activity_type: activityType,
            recipient,
            subject,
            details: `Email sent to ${recipient} with subject "${subject}"${attachments.length ? ` with ${attachments.length} attachment${attachments.length === 1 ? '' : 's'}` : ''}`,
          }),
        });
      }
    } catch (logErr) {
      console.error('Activity logging skipped:', logErr.message);
    }

    return new Response(
      JSON.stringify({ success: true, message: 'Email sent successfully' }),
      { headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
