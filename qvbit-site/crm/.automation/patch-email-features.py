from pathlib import Path

path = Path('qvbit-site/crm/src/main.jsx')
text = path.read_text(encoding='utf-8')

if "./components/EmailAddressManager" not in text:
    text = text.replace(
        "import { supabase } from './supabase'\n",
        "import { supabase } from './supabase'\nimport EmailAddressManager from './components/EmailAddressManager'\nimport EmailAttachmentPicker from './components/EmailAttachmentPicker'\n",
        1,
    )

old = """  const [subject, setSubject] = useState('')\n  const [message, setMessage] = useState('')\n  const [sending, setSending] = useState(false)\n  const [error, setError] = useState('')\n  const [success, setSuccess] = useState('')\n"""
new = """  const [subject, setSubject] = useState('')\n  const [message, setMessage] = useState('')\n  const [attachments, setAttachments] = useState([])\n  const [emailOptions, setEmailOptions] = useState([])\n  const [selectedTo, setSelectedTo] = useState(String(to || '').trim())\n  const [sending, setSending] = useState(false)\n  const [error, setError] = useState('')\n  const [success, setSuccess] = useState('')\n\n  useEffect(() => {\n    let cancelled = false\n\n    async function loadEmailOptions() {\n      const fallback = String(to || '').trim()\n      if (!customerId) {\n        setEmailOptions(fallback ? [{ id: 'legacy', email: fallback, label: 'Primary', is_primary: true }] : [])\n        setSelectedTo(fallback)\n        return\n      }\n\n      const { data, error: emailError } = await supabase\n        .from('customer_emails')\n        .select('id, email, label, is_primary')\n        .eq('customer_id', customerId)\n        .order('is_primary', { ascending: false })\n        .order('created_at', { ascending: true })\n\n      if (cancelled) return\n\n      if (emailError) {\n        console.warn('QVB I.T. CRM: customer email addresses could not be loaded:', emailError.message)\n        const fallbackOptions = fallback ? [{ id: 'legacy', email: fallback, label: 'Primary', is_primary: true }] : []\n        setEmailOptions(fallbackOptions)\n        setSelectedTo(fallback)\n        return\n      }\n\n      const options = data?.length\n        ? data\n        : (fallback ? [{ id: 'legacy', email: fallback, label: 'Primary', is_primary: true }] : [])\n\n      setEmailOptions(options)\n      setSelectedTo((current) => options.some((item) => item.email === current) ? current : (options[0]?.email || ''))\n    }\n\n    loadEmailOptions()\n    return () => { cancelled = true }\n  }, [customerId, to])\n"""
if old not in text:
    raise SystemExit('EmailComposer state block not found')
text = text.replace(old, new, 1)

text = text.replace(
    "    const recipient = String(to || '').trim()\n",
    "    const recipient = String(selectedTo || to || '').trim()\n",
    1,
)

old_payload = """          to: recipient,\n          subject: cleanSubject,\n          text: cleanMessage,\n"""
new_payload = """          to: recipient,\n          subject: cleanSubject,\n          text: cleanMessage,\n          attachments: attachments.map(({ name, content, mimeType }) => ({ name, content, mimeType })),\n"""
if old_payload not in text:
    raise SystemExit('Email payload block not found')
text = text.replace(old_payload, new_payload, 1)

text = text.replace(
    "      setSubject('')\n      setMessage('')\n",
    "      setSubject('')\n      setMessage('')\n      setAttachments([])\n",
    1,
)

old_to = """        <label>\n          To\n          <input value={to || ''} readOnly />\n        </label>\n"""
new_to = """        <label>\n          To\n          {emailOptions.length > 1 ? (\n            <select value={selectedTo} onChange={(event) => setSelectedTo(event.target.value)} disabled={sending}>\n              {emailOptions.map((item) => (\n                <option key={item.id} value={item.email}>\n                  {item.email}{item.label ? ` · ${item.label}` : ''}{item.is_primary ? ' · Primary' : ''}\n                </option>\n              ))}\n            </select>\n          ) : (\n            <input value={selectedTo || to || ''} readOnly />\n          )}\n        </label>\n"""
if old_to not in text:
    raise SystemExit('Email To field not found')
text = text.replace(old_to, new_to, 1)

old_message_end = """        <label>\n          Message *\n          <textarea\n            value={message}\n            onChange={(event) => setMessage(event.target.value)}\n            rows={8}\n            placeholder=\"Type your message...\"\n            required\n          />\n        </label>\n\n        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>\n"""
new_message_end = """        <label>\n          Message *\n          <textarea\n            value={message}\n            onChange={(event) => setMessage(event.target.value)}\n            rows={8}\n            placeholder=\"Type your message...\"\n            required\n          />\n        </label>\n\n        <EmailAttachmentPicker\n          attachments={attachments}\n          onChange={setAttachments}\n          disabled={sending}\n        />\n\n        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>\n"""
if old_message_end not in text:
    raise SystemExit('Email message footer not found')
text = text.replace(old_message_end, new_message_end, 1)

old_button = """              disabled={!customer.email}\n              title={customer.email ? 'Send an email to this customer' : 'Add an email address to this customer first'}\n"""
new_button = """              title=\"Send an email to this customer\"\n"""
if old_button not in text:
    raise SystemExit('Customer email button block not found')
text = text.replace(old_button, new_button, 1)

anchor = """      {showEmailComposer && !editing && (\n"""
manager = """      {!editing && (\n        <EmailAddressManager\n          customerId={customerId}\n          legacyEmail={customer.email}\n          onPrimaryChange={(email) => setCustomer((current) => current ? { ...current, email } : current)}\n        />\n      )}\n\n"""
if manager.strip() not in text:
    if anchor not in text:
        raise SystemExit('Customer email composer anchor not found')
    text = text.replace(anchor, manager + anchor, 1)

path.write_text(text, encoding='utf-8')
print('CRM email feature patch applied')
