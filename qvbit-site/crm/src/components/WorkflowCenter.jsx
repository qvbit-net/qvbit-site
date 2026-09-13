import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, CheckCircle2, CircleDollarSign, FileText, RefreshCw, BriefcaseBusiness } from 'lucide-react'
import { supabase } from '../supabase'

const money = (value) => `$${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export default function WorkflowCenter() {
  const [quotes, setQuotes] = useState([])
  const [invoices, setInvoices] = useState([])
  const [loading, setLoading] = useState(true)
  const [working, setWorking] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [paymentFor, setPaymentFor] = useState(null)
  const [paymentAmount, setPaymentAmount] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('other')
  const [paymentReference, setPaymentReference] = useState('')

  async function load() {
    setLoading(true)
    setError('')
    const [{ data: quoteData, error: quoteError }, { data: invoiceData, error: invoiceError }] = await Promise.all([
      supabase.from('quotes').select('id, quote_number, customer_id, title, status, total, customers(company_name)').order('created_at', { ascending: false }).limit(100),
      supabase.from('invoices').select('id, invoice_number, customer_id, job_id, status, total, amount_paid, customers(company_name)').order('created_at', { ascending: false }).limit(100),
    ])
    if (quoteError) setError(quoteError.message)
    if (invoiceError) setError((current) => current || invoiceError.message)
    setQuotes(quoteData || [])
    setInvoices(invoiceData || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const acceptedQuotes = useMemo(() => quotes.filter((q) => !['declined', 'expired'].includes(q.status)), [quotes])

  async function convert(quote, createInvoice) {
    setWorking(`${quote.id}:${createInvoice ? 'invoice' : 'job'}`)
    setError('')
    setMessage('')
    const { data, error: rpcError } = await supabase.rpc('convert_quote_to_job_and_invoice', {
      p_quote_id: quote.id,
      p_create_invoice: createInvoice,
    })
    if (rpcError) {
      setError(rpcError.message)
    } else {
      const jobText = data?.job_number ? ` Job ${data.job_number} is ready.` : ''
      const invoiceText = data?.invoice_number ? ` Invoice ${data.invoice_number} was created.` : ''
      setMessage(`Quote ${quote.quote_number || ''} was accepted.${jobText}${invoiceText}`)
      await load()
    }
    setWorking('')
  }

  async function recordPayment(event) {
    event.preventDefault()
    if (!paymentFor) return
    const amount = Number(paymentAmount)
    if (!Number.isFinite(amount) || amount <= 0) { setError('Enter a valid payment amount.'); return }
    if (amount > Math.max(Number(paymentFor.total || 0) - Number(paymentFor.amount_paid || 0), 0) + 0.01) {
      setError('Payment cannot exceed the remaining balance.')
      return
    }
    setWorking(`payment:${paymentFor.id}`)
    setError('')
    const { error: paymentError } = await supabase.from('invoice_payments').insert({
      invoice_id: paymentFor.id,
      amount,
      payment_method: paymentMethod,
      reference_number: paymentReference.trim() || null,
    })
    if (paymentError) {
      setError(paymentError.message)
    } else {
      setMessage(`Payment of ${money(amount)} recorded for ${paymentFor.invoice_number || 'invoice'}.`)
      setPaymentFor(null)
      setPaymentAmount('')
      setPaymentReference('')
      await load()
    }
    setWorking('')
  }

  return (
    <section className="page-section">
      <div className="page-header">
        <div>
          <div className="eyebrow">Business workflow</div>
          <h1>Sales → Job → Invoice → Payment</h1>
          <p className="muted">Move accepted work through the revenue workflow without recreating customer and line-item data.</p>
        </div>
        <button className="secondary-button" type="button" onClick={load} disabled={loading}>
          <RefreshCw size={16} /> {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {error && <div className="error-box">{error}</div>}
      {message && <div className="info-box">{message}</div>}

      <div className="card">
        <div className="panel-header">
          <div><h2><FileText size={18} /> Quotes</h2><p>Accept a quote and create its operational record.</p></div>
        </div>
        {loading ? <p className="muted">Loading…</p> : acceptedQuotes.length === 0 ? <p className="muted">No quotes available.</p> : (
          <div className="table-wrap"><table><thead><tr><th>Quote</th><th>Customer</th><th>Status</th><th>Total</th><th>Workflow</th></tr></thead><tbody>
            {acceptedQuotes.map((quote) => {
              const jobWorking = working === `${quote.id}:job`
              const invoiceWorking = working === `${quote.id}:invoice`
              return <tr key={quote.id}>
                <td><strong>{quote.quote_number || 'Unnumbered'}</strong><div className="muted">{quote.title}</div></td>
                <td>{quote.customers?.company_name || '—'}</td>
                <td>{quote.status}</td>
                <td>{money(quote.total)}</td>
                <td><div className="action-row">
                  <button className="secondary-button" type="button" disabled={working || quote.status === 'accepted'} onClick={() => convert(quote, false)}>
                    <BriefcaseBusiness size={15} /> {jobWorking ? 'Creating…' : 'Accept & Create Job'}
                  </button>
                  <button className="primary-button" type="button" disabled={working} onClick={() => convert(quote, true)}>
                    <ArrowRight size={15} /> {invoiceWorking ? 'Creating…' : 'Create Job + Invoice'}
                  </button>
                </div></td>
              </tr>
            })}
          </tbody></table></div>
        )}
      </div>

      <div className="card">
        <div className="panel-header">
          <div><h2><CircleDollarSign size={18} /> Recent invoices</h2><p>Record payments and keep invoice balances current.</p></div>
        </div>
        {loading ? <p className="muted">Loading…</p> : invoices.length === 0 ? <p className="muted">No invoices available.</p> : (
          <div className="table-wrap"><table><thead><tr><th>Invoice</th><th>Customer</th><th>Status</th><th>Total</th><th>Balance</th><th /></tr></thead><tbody>
            {invoices.map((invoice) => {
              const balance = Math.max(Number(invoice.total || 0) - Number(invoice.amount_paid || 0), 0)
              return <tr key={invoice.id}>
                <td><strong>{invoice.invoice_number || 'Unnumbered'}</strong></td>
                <td>{invoice.customers?.company_name || '—'}</td>
                <td>{invoice.status}</td>
                <td>{money(invoice.total)}</td>
                <td>{money(balance)}</td>
                <td>{balance > 0 && <button className="secondary-button" type="button" disabled={working} onClick={() => { setPaymentFor(invoice); setPaymentAmount(balance.toFixed(2)); setError('') }}><CircleDollarSign size={15} /> Record Payment</button>}{balance <= 0 && <span className="status-badge success"><CheckCircle2 size={13} /> Paid</span>}</td>
              </tr>
            })}
          </tbody></table></div>
        )}
      </div>

      {paymentFor && <div className="card">
        <div className="panel-header"><div><h2>Record payment</h2><p>{paymentFor.invoice_number || 'Invoice'} — remaining balance {money(Math.max(Number(paymentFor.total || 0) - Number(paymentFor.amount_paid || 0), 0))}</p></div></div>
        <form className="stack-form" onSubmit={recordPayment}>
          <label>Amount<input type="number" min="0.01" step="0.01" value={paymentAmount} onChange={(e) => setPaymentAmount(e.target.value)} required /></label>
          <label>Payment method<select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}><option value="cash">Cash</option><option value="check">Check</option><option value="card">Card</option><option value="ach">ACH</option><option value="bank_transfer">Bank transfer</option><option value="other">Other</option></select></label>
          <label>Reference number<input value={paymentReference} onChange={(e) => setPaymentReference(e.target.value)} placeholder="Optional check / transaction reference" maxLength={120} /></label>
          <div style={{ display:'flex', gap:'10px', justifyContent:'flex-end' }}><button className="secondary-button" type="button" onClick={() => setPaymentFor(null)}>Cancel</button><button className="primary-button" type="submit" disabled={working === `payment:${paymentFor.id}`}>{working === `payment:${paymentFor.id}` ? 'Saving…' : 'Record Payment'}</button></div>
        </form>
      </div>}
    </section>
  )
}
