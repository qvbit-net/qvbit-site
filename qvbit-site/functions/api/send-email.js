export async function onRequestPost(context) {
  try {
    const requestData = await context.request.json();
    const { recipient, recipientName, subject, htmlContent, activityType, clientId } = requestData;

    // 1. Send Email via Brevo API
    const brevoResponse = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'api-key': context.env.BREVO_API_KEY,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        sender: { name: 'QVB I.T.', email: 'contact@qvbit.net' },
        to: [{ email: recipient, name: recipientName || recipient }],
        subject: subject,
        htmlContent: htmlContent,
      }),
    });

    if (!brevoResponse.ok) {
      const errorText = await brevoResponse.text();
      return new Response(JSON.stringify({ error: 'Brevo send failed', details: errorText }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 2. Log Activity to Supabase
    const supabaseUrl = context.env.SUPABASE_URL;
    const supabaseKey = context.env.SUPABASE_SERVICE_ROLE_KEY;

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
          client_id: clientId || null,
          activity_type: activityType || 'email_sent',
          recipient: recipient,
          subject: subject,
          details: `Email sent to ${recipient} with subject "${subject}"`,
        }),
      });
    }

    return new Response(
      JSON.stringify({ success: true, message: 'Email sent and logged successfully' }),
      { headers: { 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
