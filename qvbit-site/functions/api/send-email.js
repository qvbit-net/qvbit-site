export async function onRequestPost(context) {
  try {
    const requestData = await context.request.json();
    
    // Support flexible parameter names from front-end
    const recipient = requestData.recipient || requestData.to;
    const recipientName = requestData.recipientName || recipient;
    const subject = requestData.subject;
    const htmlContent = requestData.htmlContent || requestData.body || requestData.message;
    const activityType = requestData.activityType || 'email_sent';
    const clientId = requestData.clientId || null;

    const senderEmail = context.env.QVB_CRM_FROM_EMAIL || 'billing@qvbit.net';

    // 1. Send Email via Brevo API
    const brevoResponse = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'api-key': context.env.BREVO_API_KEY,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        sender: { name: 'QVB I.T.', email: senderEmail },
        to: [{ email: recipient, name: recipientName }],
        subject: subject,
        htmlContent: `<p>${htmlContent.replace(/\n/g, '<br>')}</p>`,
      }),
    });

    if (!brevoResponse.ok) {
      const errorDetails = await brevoResponse.text();
      console.error('Brevo Error:', errorDetails);
      return new Response(
        JSON.stringify({ error: 'Brevo send failed', details: errorDetails }), 
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 2. Log Activity to Supabase (Wrapped in try/catch so it won't break email delivery if logging fails)
    try {
      const supabaseUrl = context.env.VITE_SUPABASE_URL;
      const supabaseKey = context.env.SUPABASE_SERVICE_ROLE_KEY || context.env.VITE_SUPABASE_PUBLISHABLE_KEY;

      if (supabaseUrl && supabaseKey) {
        await fetch(`${supabaseUrl}/rest/v1/activity_logs`, {
          method: 'POST',
          headers: {
            'apikey': supabaseKey,
            'Authorization': `Bearer ${supabaseKey}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal',
          },
          body: JSON.stringify({
            client_id: clientId,
            activity_type: activityType,
            recipient: recipient,
            subject: subject,
            details: `Email sent to ${recipient} with subject "${subject}"`,
          }),
        });
      }
    } catch (logErr) {
      console.error('Activity logging skipped/failed:', logErr.message);
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
