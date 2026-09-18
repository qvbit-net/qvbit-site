import React, { Component, useEffect, useRef, useState } from 'react'
import ReactDOM from 'react-dom/client'
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from 'react-router-dom'

import {
  BriefcaseBusiness,
  Building2,
  ChevronRight,
  CircleDollarSign,
  FileText,
  CalendarClock,
  Timer,
  ReceiptText,
  ArrowUpRight,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  Users,
  X,
  Trash2,
  Pencil,
  ArrowLeft,
  Mail,
  Phone,
  Globe,
  MapPin,
  StickyNote,
  Printer,
  CreditCard,
  Paperclip,
  Download,
  FileUp,
  ShoppingCart,
  Truck,
  CheckCircle2,
  PlusCircle,
  Activity,
  MessageSquare,
  CalendarDays,
  Target,
} from 'lucide-react'

import { supabase } from './supabase'
import EmailAddressManager from './components/EmailAddressManager'
import EmailAttachmentPicker from './components/EmailAttachmentPicker'
import Ticketing from './components/Ticketing'
import SettingsUsers from './components/SettingsUsers'
import SettingsAuditLog from './components/SettingsAuditLog'
import WorkflowCenter from './components/WorkflowCenter'
import MspAssetsContracts from './components/MspAssetsContracts'
import Customer360 from './components/Customer360'
import Projects from './components/Projects'
import Dispatch from './components/Dispatch'
import Technicians from './components/Technicians'
import ServiceCatalog from './components/ServiceCatalog'
import JobAssignmentsPanel from './components/JobAssignmentsPanel'
import PermissionRouterGuard from './components/PermissionRouterGuard'
import AccessEnforcer from './components/AccessEnforcer'
import './styles.css'


/* =========================================================
   LOCAL DATE / TIME HELPERS
========================================================= */

// Use the browser's local calendar date for date-only database fields.
// toISOString() is UTC and can move the displayed date backward/forward
// around midnight for U.S. users.
function localDateKey(value) {
  const parsed = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(parsed.getTime())) return ''
  const pad = (number) => String(number).padStart(2, '0')
  return `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())}`
}

function localTodayInputValue() {
  return localDateKey(new Date())
}

function localNowIso() {
  // Store an absolute instant. PostgreSQL timestamptz will retain the instant
  // and the UI formatter will display it back in the user's local timezone.
  return new Date().toISOString()
}

/* =========================================================
   AUTOMATIC CRM ACTIVITY LOGGING
========================================================= */

async function logCrmActivity({
  customer_id = null,
  lead_id = null,
  job_id = null,
  quote_id = null,
  invoice_id = null,
  purchase_order_id = null,
  opportunity_id = null,
  activity_type = 'system',
  subject,
  body = null,
  activity_date = localNowIso(),
}) {
  if (!subject) return

  try {
    const { data: userResult } = await supabase.auth.getUser()
    const createdBy = userResult?.user?.email || userResult?.user?.id || null

    const { error } = await supabase.from('crm_activities').insert({
      customer_id,
      lead_id,
      job_id,
      quote_id,
      invoice_id,
      purchase_order_id,
      opportunity_id,
      activity_type,
      subject,
      body,
      activity_date,
      created_by: createdBy,
    })

    if (error) {
      console.warn('QVB I.T. CRM: automatic activity could not be logged:', error.message)
    }
  } catch (error) {
    console.warn('QVB I.T. CRM: automatic activity could not be logged:', error)
  }
}


/* =========================================================
   ACTIVITY DATA ACCESS
========================================================= */

const CRM_ACTIVITY_FULL_SELECT = 'id, customer_id, lead_id, job_id, quote_id, invoice_id, purchase_order_id, activity_type, subject, body, activity_date, created_at, created_by, follow_up_status, priority, due_date, assigned_to, completed_at, jobs(job_number, title), quotes(quote_number, title), invoices(invoice_number), purchase_orders(po_number, vendor)'

async function fetchCrmActivities({
  select = CRM_ACTIVITY_FULL_SELECT,
  customerId = null,
  opportunityId = null,
  activityType = null,
  openFollowUpsOnly = false,
  orderColumn = 'activity_date',
  ascending = false,
  limit = 500,
} = {}) {
  let query = supabase.from('crm_activities').select(select)

  if (customerId) query = query.eq('customer_id', customerId)
  if (opportunityId) query = query.eq('opportunity_id', opportunityId)
  if (activityType) query = query.eq('activity_type', activityType)
  if (openFollowUpsOnly) {
    query = query.not('follow_up_status', 'in', '(completed,cancelled)')
  }

  const result = await query.order(orderColumn, { ascending, nullsFirst: false }).limit(limit)

  // If PostgREST's schema cache is temporarily behind the database migration,
  // retry with the original activity columns. This prevents an otherwise
  // healthy Activity Timeline from appearing empty.
  if (result.error && select.includes('follow_up_status')) {
    let fallback = supabase
      .from('crm_activities')
      .select('id, customer_id, lead_id, job_id, quote_id, invoice_id, purchase_order_id, activity_type, subject, body, activity_date, created_at, created_by, jobs(job_number, title), quotes(quote_number, title), invoices(invoice_number), purchase_orders(po_number, vendor)')

    if (customerId) fallback = fallback.eq('customer_id', customerId)
    if (opportunityId) fallback = fallback.eq('opportunity_id', opportunityId)
    if (activityType) fallback = fallback.eq('activity_type', activityType)

    const fallbackResult = await fallback
      .order(orderColumn === 'due_date' ? 'activity_date' : orderColumn, { ascending, nullsFirst: false })
      .limit(limit)

    if (!fallbackResult.error) {
      return {
        data: (fallbackResult.data || []).map((item) => ({
          ...item,
          follow_up_status: item.activity_type === 'follow_up' ? 'open' : 'completed',
          priority: 'normal',
          due_date: null,
          assigned_to: null,
          completed_at: null,
        })),
        error: null,
      }
    }
  }

  return result
}

/* =========================================================
   NAVIGATION
========================================================= */

const CRM_UI_MODULES = {
  '/crm/': 'dashboard',
  '/crm/leads': 'leads',
  '/crm/opportunities': 'opportunities',
  '/crm/customers': 'customers',
  '/crm/quotes': 'quotes',
  '/crm/jobs': 'jobs',
  '/crm/invoices': 'invoices',
  '/crm/accounts-receivable': 'accounts_receivable',
  '/crm/expenses': 'expenses',
  '/crm/inventory': 'inventory',
  '/crm/services': 'services',
  '/crm/tickets': 'tickets',
  '/crm/reports': 'profitability',
  '/crm/time-tracking': 'time_tracking',
  '/crm/calendar': 'calendar',
  '/crm/documents': 'documents',
  '/crm/purchase-orders': 'purchase_orders',
  '/crm/activity': 'activity',
  '/crm/follow-ups': 'follow_ups',
  '/crm/workflow': 'quotes',
  '/crm/assets-contracts': 'services',
  '/crm/customer-360': 'customers',
  '/crm/projects': 'projects',
  '/crm/dispatch': 'dispatch',
  '/crm/technicians': 'technicians',
}

function canAccessPath(pathname, permissions, isOwner) {
  if (isOwner) return true
  if (pathname === '/crm/settings' || pathname.startsWith('/crm/settings/')) return false
  if (pathname.startsWith('/crm/leads/')) return permissions.leads?.can_view === true
  if (pathname.startsWith('/crm/opportunities/')) return permissions.opportunities?.can_view === true
  if (pathname.startsWith('/crm/customers/')) return permissions.customers?.can_view === true
  if (pathname.startsWith('/crm/quotes/')) return permissions.quotes?.can_view === true
  if (pathname.startsWith('/crm/jobs/')) return permissions.jobs?.can_view === true
  if (pathname.startsWith('/crm/invoices/')) return permissions.invoices?.can_view === true
  const module = CRM_UI_MODULES[pathname]
  if (!module) return true
  return permissions[module]?.can_view === true
}

const navItems = [
  {
    to: '/crm/',
    label: 'Dashboard',
    icon: LayoutDashboard,
    end: true,
  },
  {
    to: '/crm/leads',
    label: 'Leads',
    icon: Users,
  },
  {
    to: '/crm/opportunities',
    label: 'Opportunities',
    icon: Target,
  },
  {
    to: '/crm/customers',
    label: 'Customers',
    icon: Building2,
  },
  {
    to: '/crm/quotes',
    label: 'Quotes',
    icon: FileText,
  },
  {
    to: '/crm/jobs',
    label: 'Jobs',
    icon: BriefcaseBusiness,
  },
  {
    to: '/crm/dispatch',
    label: 'Dispatch',
    icon: Truck,
  },
  {
    to: '/crm/projects',
    label: 'Projects',
    icon: BriefcaseBusiness,
  },
  {
    to: '/crm/technicians',
    label: 'Technicians',
    icon: Users,
  },
  {
    to: '/crm/invoices',
    label: 'Invoices',
    icon: ReceiptText,
  },
  {
    to: '/crm/accounts-receivable',
    label: 'Accounts Receivable',
    icon: CircleDollarSign,
  },
  {
    to: '/crm/expenses',
    label: 'Expenses',
    icon: CreditCard,
  },
  {
    to: '/crm/inventory',
    label: 'Inventory',
    icon: Package,
  },
  {
    to: '/crm/services',
    label: 'Services',
    icon: Package,
  },
  {
    to: '/crm/tickets',
    label: 'Tickets',
    icon: MessageSquare,
  },
  {
    to: '/crm/reports',
    label: 'Profitability',
    icon: ArrowUpRight,
  },
  {
    to: '/crm/time-tracking',
    label: 'Time Tracking',
    icon: Timer,
  },
  {
    to: '/crm/calendar',
    label: 'Calendar',
    icon: CalendarClock,
  },
  {
    to: '/crm/documents',
    label: 'Documents',
    icon: Paperclip,
  },
  {
    to: '/crm/purchase-orders',
    label: 'Purchase Orders',
    icon: ShoppingCart,
  },
  {
    to: '/crm/workflow',
    label: 'Sales Workflow',
    icon: ArrowUpRight,
  },
  {
    to: '/crm/assets-contracts',
    label: 'Government Contracting',
    icon: Package,
  },
  {
    to: '/crm/customer-360',
    label: 'Customer 360',
    icon: Building2,
  },
  {
    to: '/crm/activity',
    label: 'Activity',
    icon: Activity,
  },
  {
    to: '/crm/follow-ups',
    label: 'Follow-ups',
    icon: CheckCircle2,
  },
]


/* =========================================================
   APP ERROR BOUNDARY
========================================================= */

class CrmErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, info) {
    console.error('QVB I.T. CRM render error:', error, info)
  }

  handleReload = () => {
    window.location.reload()
  }

  render() {
    if (!this.state.hasError) return this.props.children

    const message = this.state.error?.message || 'An unexpected application error occurred.'

    return (
      <main className="login-page" style={{ padding: '32px' }}>
        <section className="login-card" style={{ maxWidth: '620px' }}>
          <div className="eyebrow"><ShieldCheck size={14} /> CRM safety screen</div>
          <h1>Something went wrong</h1>
          <p className="muted">The CRM hit an unexpected error instead of showing a blank page. Your saved database data was not deleted by this screen.</p>
          <div className="error-box" style={{ marginBottom: '18px', overflowWrap: 'anywhere' }}>
            {message}
          </div>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <button type="button" className="primary-button" onClick={this.handleReload}>Reload CRM</button>
            <button type="button" className="secondary-button" onClick={() => window.location.assign('/crm/login')}>Return to login</button>
          </div>
        </section>
      </main>
    )
  }
}

/* =========================================================
   APP
========================================================= */

function App() {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true

    supabase.auth.getSession().then(({ data, error }) => {
      if (!mounted) return
      if (error) {
        console.error('QVB I.T. CRM session check failed:', error)
      }
      setSession(data?.session || null)
      setLoading(false)
    }).catch((error) => {
      if (!mounted) return
      console.error('QVB I.T. CRM session check failed:', error)
      setSession(null)
      setLoading(false)
    })

    const {
      data: listener,
    } = supabase.auth.onAuthStateChange(
      (_event, nextSession) => {
        setSession(nextSession)
      }
    )

    return () => {
      mounted = false
      listener.subscription.unsubscribe()
    }
  }, [])

  if (loading) {
    return (
      <div className="loading-screen">
        Loading QVB I.T. CRM…
      </div>
    )
  }

  return (
    <CrmErrorBoundary>
      <Routes>
      <Route
        path="/crm/login"
        element={
          session ? (
            <Navigate to="/crm/" replace />
          ) : (
            <Login />
          )
        }
      />

      <Route
        path="/crm/set-password"
        element={<SetPassword />}
      />

      <Route
        path="/crm/*"
        element={
          session ? (
            <Shell session={session} />
          ) : (
            <Navigate to="/crm/login" replace />
          )
        }
      />

      <Route
        path="*"
        element={<Navigate to="/crm/" replace />}
      />
      </Routes>
    </CrmErrorBoundary>
  )
}


/* =========================================================
   SET PASSWORD
========================================================= */

function SetPassword() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [checkingSession, setCheckingSession] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    let mounted = true
    supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (!mounted) return
      if (sessionError) setError(sessionError.message)
      else if (!data?.session) setError('This invitation link is invalid or has expired. Please ask the Owner to send a new invitation.')
      else setEmail(data.session.user?.email || '')
      setCheckingSession(false)
    }).catch(() => {
      if (!mounted) return
      setError('Unable to verify the invitation. Please request a new invitation.')
      setCheckingSession(false)
    })
    return () => { mounted = false }
  }, [])

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    if (password.length < 8) { setError('Your password must be at least 8 characters long.'); return }
    if (password !== confirmPassword) { setError('The passwords do not match.'); return }
    setBusy(true)
    const { error: updateError } = await supabase.auth.updateUser({ password })
    if (updateError) { setError(updateError.message); setBusy(false); return }
    setSuccess(true)
    setBusy(false)
    setTimeout(() => navigate('/crm/', { replace: true }), 900)
  }

  return (
    <main className="login-page">
      <section className="login-card">
        <div className="brand-mark"><img src="/crm/images/qvb-it-logo.JPG" alt="QVB I.T." /></div>
        <div className="eyebrow"><ShieldCheck size={14} /> Secure account setup</div>
        <h1>Create your password</h1>
        {checkingSession ? (
          <p className="muted">Verifying your invitation…</p>
        ) : error && !success ? (
          <>
            <div className="error-box" style={{ marginTop: '20px' }}>{error}</div>
            <button type="button" className="secondary-button full" style={{ marginTop: '16px' }} onClick={() => navigate('/crm/login', { replace: true })}>Return to login</button>
          </>
        ) : success ? (
          <div className="info-box" style={{ marginTop: '20px' }}>Password created successfully. Taking you into the CRM…</div>
        ) : (
          <>
            <p className="muted">Set the password you will use to sign in to QVB I.T. CRM.</p>
            <p className="muted" style={{ marginTop: '8px', fontSize: '12px' }}>{email}</p>
            <form onSubmit={handleSubmit} className="stack-form">
              <label>New password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" minLength={8} required /></label>
              <label>Confirm password<input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" minLength={8} required /></label>
              {error && <div className="error-box">{error}</div>}
              <button className="primary-button full" disabled={busy}>{busy ? 'Saving password…' : 'Create Password'}</button>
            </form>
          </>
        )}
      </section>
    </main>
  )
}


/* =========================================================
   LOGIN
========================================================= */

function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()

    setBusy(true)
    setError('')

    const {
      error: authError,
    } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (authError) {
      setError(authError.message)
    }

    setBusy(false)
  }

  return (
    <main className="login-page">
      <section className="login-card">

        <div className="brand-mark">
          <img
            src="/crm/images/qvb-it-logo.JPG"
            alt="QVB I.T."
          />
        </div>

        <div className="eyebrow">
          <ShieldCheck size={14} />
          Private business portal
        </div>

        <h1>QVB I.T. CRM</h1>

        <p className="muted">
          Sign in to manage leads, customers, quotes and jobs.
        </p>

        <form
          onSubmit={handleSubmit}
          className="stack-form"
        >
          <label>
            Email

            <input
              type="email"
              value={email}
              onChange={(e) =>
                setEmail(e.target.value)
              }
              autoComplete="username"
              required
            />
          </label>

          <label>
            Password

            <input
              type="password"
              value={password}
              onChange={(e) =>
                setPassword(e.target.value)
              }
              autoComplete="current-password"
              required
            />
          </label>

          {error && (
            <div className="error-box">
              {error}
            </div>
          )}

          <button
            className="primary-button full"
            disabled={busy}
          >
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className="login-foot">
          Access is protected by Supabase Authentication.
        </p>

      </section>
    </main>
  )
}


/* =========================================================
   GLOBAL SEARCH
========================================================= */

function GlobalSearch() {
  const navigate = useNavigate()
  const searchRef = useRef(null)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [busy, setBusy] = useState(false)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const term = query.trim()

    if (term.length < 2) {
      setResults([])
      setBusy(false)
      return
    }

    let cancelled = false
    const timer = setTimeout(async () => {
      setBusy(true)

      const pattern = `%${term}%`
      const searches = await Promise.all([
        supabase
          .from('customers')
          .select('id, company_name, email, phone')
          .or(`company_name.ilike.${pattern},email.ilike.${pattern},phone.ilike.${pattern}`)
          .limit(8),
        supabase
          .from('leads')
          .select('id, contact_name, company_name, email, phone')
          .or(`contact_name.ilike.${pattern},company_name.ilike.${pattern},email.ilike.${pattern},phone.ilike.${pattern}`)
          .limit(8),
        supabase
          .from('opportunities')
          .select('id, opportunity_number, title, stage, estimated_value')
          .or(`opportunity_number.ilike.${pattern},title.ilike.${pattern}`)
          .limit(8),
        supabase
          .from('quotes')
          .select('id, quote_number, title, status, total')
          .or(`quote_number.ilike.${pattern},title.ilike.${pattern}`)
          .limit(8),
        supabase
          .from('jobs')
          .select('id, job_number, title, status')
          .or(`job_number.ilike.${pattern},title.ilike.${pattern}`)
          .limit(8),
        supabase
          .from('invoices')
          .select('id, invoice_number, status, total')
          .ilike('invoice_number', pattern)
          .limit(8),
        supabase
          .from('crm_documents')
          .select('id, file_name, category, customer_id, job_id')
          .or(`file_name.ilike.${pattern},category.ilike.${pattern}`)
          .limit(8),
        supabase
          .from('purchase_orders')
          .select('id, po_number, vendor, status')
          .or(`po_number.ilike.${pattern},vendor.ilike.${pattern}`)
          .limit(8),
      ])

      if (cancelled) return

      const nextResults = []

      for (const item of searches[0].data || []) {
        nextResults.push({
          type: 'Customer',
          title: item.company_name || 'Customer',
          subtitle: item.email || item.phone || 'Customer account',
          path: `/crm/customers/${item.id}`,
        })
      }

      for (const item of searches[1].data || []) {
        nextResults.push({
          type: 'Lead',
          title: item.company_name || item.contact_name || 'Lead',
          subtitle: item.contact_name || item.email || item.phone || 'Lead',
          path: `/crm/leads/${item.id}`,
        })
      }

      for (const item of searches[2].data || []) {
        nextResults.push({
          type: 'Opportunity',
          title: item.title || 'Opportunity',
          subtitle: `${item.opportunity_number || 'Opportunity'} · ${item.stage || 'new'}${item.estimated_value != null ? ` · ${money(item.estimated_value)}` : ''}`,
          path: `/crm/opportunities/${item.id}`,
        })
      }

      for (const item of searches[3].data || []) {
        nextResults.push({
          type: 'Quote',
          title: item.title || 'Quote',
          subtitle: `${item.quote_number || 'Quote'} · ${item.status || 'draft'}${item.total != null ? ` · ${money(item.total)}` : ''}`,
          path: `/crm/quotes/${item.id}`,
        })
      }

      for (const item of searches[4].data || []) {
        nextResults.push({
          type: 'Job',
          title: item.title || 'Job',
          subtitle: `${item.job_number || 'Job'} · ${item.status || 'scheduled'}`,
          path: `/crm/jobs/${item.id}`,
        })
      }

      for (const item of searches[5].data || []) {
        nextResults.push({
          type: 'Invoice',
          title: item.invoice_number || 'Invoice',
          subtitle: `${item.status || 'draft'}${item.total != null ? ` · ${money(item.total)}` : ''}`,
          path: `/crm/invoices/${item.id}`,
        })
      }

      for (const item of searches[6].data || []) {
        nextResults.push({
          type: 'Document',
          title: item.file_name || 'Document',
          subtitle: item.category || 'General document',
          path: item.customer_id
            ? `/crm/customers/${item.customer_id}`
            : item.job_id
              ? `/crm/jobs/${item.job_id}`
              : '/crm/documents',
        })
      }

      for (const item of searches[7].data || []) {
        nextResults.push({
          type: 'Purchase Order',
          title: item.po_number || item.vendor || 'Purchase Order',
          subtitle: `${item.vendor || 'Vendor'} · ${item.status || 'draft'}`,
          path: '/crm/purchase-orders',
        })
      }

      setResults(nextResults.slice(0, 30))
      setBusy(false)
    }, 250)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [query])

  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) {
        event.preventDefault()
        searchRef.current?.focus()
        setOpen(true)
      }

      if (event.key === 'Escape') {
        setOpen(false)
        searchRef.current?.blur()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  function openResult(path) {
    setOpen(false)
    setQuery('')
    setResults([])
    navigate(path)
  }

  return (
    <div style={{ position: 'relative', width: '450px', minWidth: '320px', maxWidth: '450px', flex: '0 0 450px' }}>
      <div className="search-box" style={{ width: '100%', boxSizing: 'border-box' }}>
        <Search size={17} />
        <input
          ref={searchRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          placeholder="Search customers, leads, quotes, jobs, invoices…"
          aria-label="Global search"
        />
        {query && (
          <button
            type="button"
            onClick={() => {
              setQuery('')
              setResults([])
              searchRef.current?.focus()
            }}
            style={{ border: 0, background: 'transparent', cursor: 'pointer', padding: '2px' }}
            aria-label="Clear search"
          >
            <X size={15} />
          </button>
        )}
      </div>

      {open && query.trim().length >= 2 && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            left: 0,
            right: 0,
            zIndex: 1000,
            background: '#fff',
            border: '1px solid #d8dee8',
            borderRadius: '12px',
            boxShadow: '0 14px 35px rgba(15, 23, 42, 0.16)',
            overflow: 'hidden',
            maxHeight: '420px',
            overflowY: 'auto',
          }}
        >
          {busy ? (
            <div style={{ padding: '16px', color: '#64748b' }}>Searching…</div>
          ) : results.length === 0 ? (
            <div style={{ padding: '16px', color: '#64748b' }}>No matching records found.</div>
          ) : (
            results.map((result, index) => (
              <button
                key={`${result.type}-${result.path}-${index}`}
                type="button"
                onClick={() => openResult(result.path)}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  padding: '11px 14px',
                  border: 0,
                  borderBottom: index === results.length - 1 ? 0 : '1px solid #eef1f5',
                  background: '#fff',
                  cursor: 'pointer',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                  <strong style={{ color: '#0f172a' }}>{result.title}</strong>
                  <span style={{ fontSize: '12px', color: '#64748b', whiteSpace: 'nowrap' }}>{result.type}</span>
                </div>
                <div style={{ fontSize: '12px', color: '#64748b', marginTop: '3px' }}>{result.subtitle}</div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}


/* =========================================================
   EMAIL COMPOSER
========================================================= */

function EmailComposer({
  to,
  customerId = null,
  leadId = null,
  quoteId = null,
  invoiceId = null,
  jobId = null,
  onSent,
  onCancel,
}) {
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [attachments, setAttachments] = useState([])
  const [emailOptions, setEmailOptions] = useState([])
  const [selectedTo, setSelectedTo] = useState(String(to || '').trim())
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => {
    let cancelled = false

    async function loadEmailOptions() {
      const fallback = String(to || '').trim()
      if (!customerId) {
        setEmailOptions(fallback ? [{ id: 'legacy', email: fallback, label: 'Primary', is_primary: true }] : [])
        setSelectedTo(fallback)
        return
      }

      const { data, error: emailError } = await supabase
        .from('customer_emails')
        .select('id, email, label, is_primary')
        .eq('customer_id', customerId)
        .order('is_primary', { ascending: false })
        .order('created_at', { ascending: true })

      if (cancelled) return

      if (emailError) {
        console.warn('QVB I.T. CRM: customer email addresses could not be loaded:', emailError.message)
        const fallbackOptions = fallback ? [{ id: 'legacy', email: fallback, label: 'Primary', is_primary: true }] : []
        setEmailOptions(fallbackOptions)
        setSelectedTo(fallback)
        return
      }

      const options = data?.length
        ? data
        : (fallback ? [{ id: 'legacy', email: fallback, label: 'Primary', is_primary: true }] : [])

      setEmailOptions(options)
      setSelectedTo((current) => options.some((item) => item.email === current) ? current : (options[0]?.email || ''))
    }

    loadEmailOptions()
    return () => { cancelled = true }
  }, [customerId, to])

  async function sendEmail(event) {
    event.preventDefault()
    setError('')
    setSuccess('')

    const recipient = String(selectedTo || to || '').trim()
    const cleanSubject = subject.trim()
    const cleanMessage = message.trim()

    if (!recipient) {
      setError('This customer does not have an email address.')
      return
    }

    if (!cleanSubject) {
      setError('Subject is required.')
      return
    }

    if (!cleanMessage) {
      setError('Message is required.')
      return
    }

    setSending(true)

    try {
      const response = await fetch('/api/send-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          to: recipient,
          subject: cleanSubject,
          text: cleanMessage,
          attachments: attachments.map(({ name, content, mimeType }) => ({ name, content, mimeType })),
        }),
      })

      const result = await response.json().catch(() => ({}))

      if (!response.ok) {
        throw new Error(result?.error || 'The email could not be sent.')
      }

      await logCrmActivity({
        customer_id: customerId,
        lead_id: leadId,
        job_id: jobId,
        quote_id: quoteId,
        invoice_id: invoiceId,
        activity_type: 'email_sent',
        subject: `Email sent: ${cleanSubject}`,
        body: `Email sent to ${recipient}.\n\n${cleanMessage}`,
        activity_date: localNowIso(),
      })

      setSuccess(`Email sent to ${recipient}.`)
      setSubject('')
      setMessage('')
      setAttachments([])

      if (onSent) await onSent(result)
    } catch (sendError) {
      setError(sendError?.message || 'The email could not be sent.')
    } finally {
      setSending(false)
    }
  }

  return (
    <section className="panel" style={{ marginBottom: '18px' }}>
      <div className="panel-header">
        <div>
          <h2>Send Email</h2>
          <p>Send a message through QVB I.T.'s Brevo account.</p>
        </div>
      </div>

      {error && (
        <div className="error-box" style={{ marginBottom: '14px' }}>
          {error}
        </div>
      )}

      {success && (
        <div className="alert" style={{ marginBottom: '14px' }}>
          {success}
        </div>
      )}

      <form onSubmit={sendEmail} className="stack-form">
        <label>
          To
          <input
            type="email"
            value={selectedTo}
            onChange={(event) => setSelectedTo(event.target.value)}
            placeholder="Email address"
            list="crm-email-options"
            disabled={sending}
            required
          />
          {emailOptions.length > 0 && (
            <datalist id="crm-email-options">
              {emailOptions.map((item) => (
                <option key={item.id} value={item.email}>
                  {item.label || (item.is_primary ? 'Primary' : '')}
                </option>
              ))}
            </datalist>
          )}
        </label>

        <label>
          Subject *
          <input
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
            placeholder="Subject"
            required
          />
        </label>

        <label>
          Message *
          <textarea
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            rows={8}
            placeholder="Type your message..."
            required
          />
        </label>

        <EmailAttachmentPicker
          attachments={attachments}
          onChange={setAttachments}
          disabled={sending}
        />

        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          {onCancel && (
            <button
              className="secondary-button"
              type="button"
              onClick={onCancel}
              disabled={sending}
            >
              Cancel
            </button>
          )}

          <button className="primary-button" type="submit" disabled={sending}>
            <Mail size={16} />
            {sending ? 'Sending…' : 'Send Email'}
          </button>
        </div>
      </form>
    </section>
  )
}



/* =========================================================
   MAIN SHELL
========================================================= */

function Shell({ session }) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [permissions, setPermissions] = useState({})
  const [isOwner, setIsOwner] = useState(false)
  const [roleReady, setRoleReady] = useState(false)

  const navigate = useNavigate()

  useEffect(() => {
    let mounted = true

    async function loadAccess() {
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('role, is_active')
        .eq('id', session.user.id)
        .maybeSingle()

      const role = profile?.is_active === false ? 'read_only' : (profile?.role || 'read_only')
      const owner = role === 'owner'
      let nextPermissions = {}

      if (!owner) {
        const { data } = await supabase
          .from('crm_permissions')
          .select('module, can_view, can_create, can_update, can_delete')
          .eq('role', role)
        for (const permission of data || []) nextPermissions[permission.module] = permission
      }

      if (!mounted) return
      setPermissions(nextPermissions)
      setIsOwner(owner)
      setRoleReady(true)
    }

    loadAccess()
    return () => { mounted = false }
  }, [session.user.id])

  async function signOut() {
    await supabase.auth.signOut()
    navigate('/crm/login')
  }

  return (
    <div className="app-shell">

      <aside
        className={`sidebar ${
          mobileOpen ? 'open' : ''
        }`}
      >

        <div className="sidebar-top">

          <div className="sidebar-brand">

            <img
              src="/crm/images/qvb-it-logo.JPG"
              alt="QVB I.T."
            />

            <div>
              <strong>QVB I.T.</strong>
              <span>CRM</span>
            </div>

          </div>

          <button
            className="mobile-close"
            onClick={() => setMobileOpen(false)}
          >
            <X size={20} />
          </button>

        </div>

        <nav>

          <div className="nav-label">
            Workspace
          </div>

          {navItems.filter((item) => !roleReady || isOwner || item.to === '/crm/' || permissions[CRM_UI_MODULES[item.to]]?.can_view === true).map((item) => {
            const Icon = item.icon

            return (
              <NavItem
                key={item.to}
                {...item}
                Icon={Icon}
                onNavigate={() =>
                  setMobileOpen(false)
                }
              />
            )
          })}

          <div className="nav-label settings-label">
            System
          </div>

          {(!roleReady || isOwner) && (
            <>
              <NavItem
                to="/crm/settings"
                label="Settings"
                icon={Settings}
                onNavigate={() =>
                  setMobileOpen(false)
                }
              />
              {isOwner && (
                <NavItem
                  to="/crm/settings/audit-log"
                  label="Audit Log"
                  icon={ShieldCheck}
                  onNavigate={() =>
                    setMobileOpen(false)
                  }
                />
              )}
            </>
          )}

        </nav>

        <div className="sidebar-bottom">

          <div className="user-chip">

            <div className="avatar">
              {(session.user.email || 'Q')[0].toUpperCase()}
            </div>

            <div>
              <strong>
                {session.user.email}
              </strong>

              <span>
                Authenticated
              </span>
            </div>

          </div>

          <button
            className="logout-button"
            onClick={signOut}
          >
            <LogOut size={17} />
            Sign out
          </button>

        </div>

      </aside>

      {mobileOpen && (
        <button
          className="mobile-overlay"
          aria-label="Close navigation"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <div className="main-area">

        <header className="topbar">

          <button
            className="menu-button"
            onClick={() => setMobileOpen(true)}
          >
            <Menu size={22} />
          </button>

          <div>
            <span className="topbar-kicker">
              QVB I.T. CRM
            </span>

            <strong>
              Business Operations
            </strong>
          </div>

          <div className="topbar-right" style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '12px' }}>
            <span className="secure-pill">
              <ShieldCheck size={15} />
              Secure
            </span>
            <GlobalSearch />
          </div>

        </header>

        <main className="content">

          {!roleReady ? (
            <div className="loading-screen">Checking CRM permissions…</div>
          ) : null}

          <PermissionRouterGuard permissions={permissions} isOwner={isOwner} ready={roleReady} />
          <AccessEnforcer permissions={permissions} isOwner={isOwner} ready={roleReady} />

          <Routes>

            <Route
              index
              element={<Dashboard />}
            />

            <Route
              path="leads"
              element={<Leads />}
            />

            <Route
              path="leads/:leadId"
              element={<LeadDetail />}
            />

            <Route
              path="opportunities"
              element={<Opportunities />}
            />

            <Route
              path="opportunities/:opportunityId"
              element={<OpportunityDetail />}
            />

            <Route
              path="customers"
              element={<Customers />}
            />

            <Route
              path="customers/:customerId"
              element={<CustomerDetail />}
            />

            <Route
              path="customers/:customerId/statement"
              element={<CustomerStatement />}
            />

            <Route
              path="expenses"
              element={<Expenses />}
            />

            <Route
              path="inventory"
              element={<Inventory />}
            />

            <Route
              path="services"
              element={<ServiceCatalog />}
            />

            <Route
              path="tickets"
              element={<Ticketing />}
            />

            <Route
              path="quotes"
              element={<Quotes />}
            />

            <Route
              path="quotes/:quoteId"
              element={<QuoteDetail />}
            />

            <Route
              path="jobs"
              element={<Jobs />}
            />

            <Route
              path="jobs/:jobId"
              element={<JobDetail />}
            />

            <Route
              path="dispatch"
              element={<Dispatch />}
            />

            <Route
              path="projects"
              element={<Projects />}
            />

            <Route
              path="technicians"
              element={<Technicians />}
            />

            <Route
              path="invoices"
              element={<Invoices />}
            />

            <Route
              path="accounts-receivable"
              element={<AccountsReceivable />}
            />

            <Route
              path="invoices/:invoiceId"
              element={<InvoiceDetail />}
            />

            <Route
              path="quotes/:quoteId/print"
              element={<QuotePrint />}
            />

            <Route
              path="invoices/:invoiceId/print"
              element={<InvoicePrint />}
            />

            <Route
              path="reports"
              element={<Profitability />}
            />

            <Route
              path="time-tracking"
              element={<TimeTracking />}
            />

            <Route
              path="calendar"
              element={<SchedulingCalendar />}
            />

            <Route
              path="documents"
              element={<Documents />}
            />

            <Route
              path="purchase-orders"
              element={<PurchaseOrders />}
            />

            <Route
              path="activity"
              element={<ActivityLog />}
            />

            <Route
              path="follow-ups"
              element={<FollowUps />}
            />

            <Route
              path="workflow"
              element={<WorkflowCenter />}
            />

            <Route
              path="assets-contracts"
              element={<MspAssetsContracts />}
            />

            <Route
              path="customer-360"
              element={<Customer360 />}
            />

            <Route
              path="settings/audit-log"
              element={<SettingsAuditLog />}
            />

            <Route
              path="settings"
              element={<SettingsUsers />}
            />

            <Route
              path="*"
              element={
                <Navigate
                  to="/crm/"
                  replace
                />
              }
            />

          </Routes>

        </main>

      </div>

    </div>
  )
}


/* =========================================================
   NAV ITEM
========================================================= */

function NavItem({
  to,
  label,
  icon: Icon,
  onNavigate,
  end,
}) {
  const location = useLocation()

  const active = end
    ? location.pathname === to
    : location.pathname.startsWith(to)

  return (
    <a
      className={`nav-item ${
        active ? 'active' : ''
      }`}
      href={to}
      onClick={onNavigate}
    >
      <Icon size={18} />

      <span>
        {label}
      </span>

      {active && (
        <ChevronRight size={15} />
      )}
    </a>
  )
}


/* =========================================================
   PAGE HEADER
========================================================= */

function PageHeader({
  eyebrow,
  title,
  description,
  action,
}) {
  return (
    <div className="page-header">

      <div>

        <div className="eyebrow">
          {eyebrow}
        </div>

        <h1>
          {title}
        </h1>

        {description && (
          <p className="muted">
            {description}
          </p>
        )}

      </div>

      {action}

    </div>
  )
}



/* =========================================================
   INVENTORY / MATERIALS
========================================================= */

function Inventory() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState({
    sku: '',
    name: '',
    category: 'General',
    vendor: '',
    unit: 'each',
    quantity: '0',
    reorder_level: '0',
    unit_cost: '0',
    notes: '',
  })

  async function loadItems() {
    setLoading(true)
    setError('')

    const { data, error: loadError } = await supabase
      .from('inventory_items')
      .select('*')
      .order('name', { ascending: true })

    if (loadError) {
      setError(loadError.message)
      setItems([])
    } else {
      setItems(data || [])
    }

    setLoading(false)
  }

  useEffect(() => {
    loadItems()
  }, [])

  function resetForm() {
    setEditingId(null)
    setForm({
      sku: '',
      name: '',
      category: 'General',
      vendor: '',
      unit: 'each',
      quantity: '0',
      reorder_level: '0',
      unit_cost: '0',
      notes: '',
    })
  }

  function editItem(item) {
    setEditingId(item.id)
    setForm({
      sku: item.sku || '',
      name: item.name || '',
      category: item.category || 'General',
      vendor: item.vendor || '',
      unit: item.unit || 'each',
      quantity: String(item.quantity ?? 0),
      reorder_level: String(item.reorder_level ?? 0),
      unit_cost: String(item.unit_cost ?? 0),
      notes: item.notes || '',
    })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function saveItem(e) {
    e.preventDefault()
    setError('')

    if (!form.name.trim()) {
      setError('Item name is required.')
      return
    }

    setSaving(true)

    const payload = {
      sku: form.sku.trim() || null,
      name: form.name.trim(),
      category: form.category || 'General',
      vendor: form.vendor.trim() || null,
      unit: form.unit.trim() || 'each',
      quantity: Number(form.quantity || 0),
      reorder_level: Number(form.reorder_level || 0),
      unit_cost: Number(form.unit_cost || 0),
      active: true,
      notes: form.notes.trim() || null,
      updated_at: localNowIso(),
    }

    const result = editingId
      ? await supabase.from('inventory_items').update(payload).eq('id', editingId)
      : await supabase.from('inventory_items').insert(payload)

    if (result.error) {
      setError(result.error.message)
      setSaving(false)
      return
    }

    resetForm()
    await loadItems()
    setSaving(false)
  }

  async function deleteItem(id) {
    if (!window.confirm('Delete this inventory item?')) return

    const { error: deleteError } = await supabase
      .from('inventory_items')
      .delete()
      .eq('id', id)

    if (deleteError) {
      setError(deleteError.message)
      return
    }

    if (editingId === id) resetForm()
    await loadItems()
  }

  const visibleItems = items.filter((item) => {
    const haystack = [
      item.name,
      item.sku,
      item.category,
      item.vendor,
    ].filter(Boolean).join(' ').toLowerCase()

    const matchesSearch = haystack.includes(search.toLowerCase())
    const lowStock = Number(item.quantity || 0) <= Number(item.reorder_level || 0)

    if (filter === 'low') return matchesSearch && lowStock
    if (filter === 'active') return matchesSearch && item.active !== false
    return matchesSearch
  })

  const inventoryValue = items.reduce(
    (sum, item) => sum + Number(item.quantity || 0) * Number(item.unit_cost || 0),
    0,
  )
  const lowStockCount = items.filter(
    (item) => Number(item.quantity || 0) <= Number(item.reorder_level || 0),
  ).length
  const activeCount = items.filter((item) => item.active !== false).length

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="eyebrow">Materials management</div>
          <h1>Inventory</h1>
          <p>Track equipment, materials, stock levels, vendors, and costs.</p>
        </div>
      </div>

      {error && <div className="alert error">{error}</div>}

      <div className="stats-grid">
        <StatCard label="Items" value={String(items.length)} icon={Package} />
        <StatCard label="Active items" value={String(activeCount)} icon={ShieldCheck} />
        <StatCard label="Low stock" value={String(lowStockCount)} icon={ArrowUpRight} />
        <StatCard label="Inventory value" value={money(inventoryValue)} icon={CircleDollarSign} />
      </div>

      <div className="two-column-grid">
        <div className="card">
          <div className="card-header">
            <div>
              <h2>{editingId ? 'Edit inventory item' : 'Add inventory item'}</h2>
              <p>Keep your common IT materials and equipment available for job costing.</p>
            </div>
          </div>

          <form onSubmit={saveItem}>
            <div className="form-grid">
              <label>
                <span>Item name *</span>
                <input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Cat6 cable 1000 ft"
                  required
                />
              </label>

              <label>
                <span>SKU / part number</span>
                <input
                  value={form.sku}
                  onChange={(e) => setForm({ ...form, sku: e.target.value })}
                  placeholder="CAT6-1000"
                />
              </label>

              <label>
                <span>Category</span>
                <select
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                >
                  <option>General</option>
                  <option>Cabling</option>
                  <option>Networking</option>
                  <option>Hardware</option>
                  <option>Racks & Cabinets</option>
                  <option>Power</option>
                  <option>Tools</option>
                  <option>Accessories</option>
                  <option>Other</option>
                </select>
              </label>

              <label>
                <span>Vendor</span>
                <input
                  value={form.vendor}
                  onChange={(e) => setForm({ ...form, vendor: e.target.value })}
                  placeholder="Vendor"
                />
              </label>

              <label>
                <span>Unit</span>
                <input
                  value={form.unit}
                  onChange={(e) => setForm({ ...form, unit: e.target.value })}
                  placeholder="each, box, roll, ft"
                />
              </label>

              <label>
                <span>Quantity on hand</span>
                <input
                  type="number"
                  step="0.01"
                  value={form.quantity}
                  onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                />
              </label>

              <label>
                <span>Reorder level</span>
                <input
                  type="number"
                  step="0.01"
                  value={form.reorder_level}
                  onChange={(e) => setForm({ ...form, reorder_level: e.target.value })}
                />
              </label>

              <label>
                <span>Unit cost</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.unit_cost}
                  onChange={(e) => setForm({ ...form, unit_cost: e.target.value })}
                />
              </label>

              <label className="full-width">
                <span>Notes</span>
                <textarea
                  rows="3"
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  placeholder="Storage location, preferred vendor, part details..."
                />
              </label>
            </div>

            <div className="form-actions">
              <button className="button primary" type="submit" disabled={saving}>
                <Plus size={16} />
                {saving ? 'Saving...' : editingId ? 'Save changes' : 'Add item'}
              </button>

              {editingId && (
                <button className="button secondary" type="button" onClick={resetForm}>
                  Cancel
                </button>
              )}
            </div>
          </form>
        </div>

        <div className="card">
          <div className="card-header">
            <div>
              <h2>Stock alerts</h2>
              <p>Items at or below their reorder level.</p>
            </div>
          </div>

          {items.filter((item) => Number(item.quantity || 0) <= Number(item.reorder_level || 0)).length === 0 ? (
            <div className="empty-state">No low-stock items right now.</div>
          ) : (
            <div className="simple-list">
              {items
                .filter((item) => Number(item.quantity || 0) <= Number(item.reorder_level || 0))
                .slice(0, 8)
                .map((item) => (
                  <div className="simple-list-row" key={item.id}>
                    <span>
                      <strong>{item.name}</strong>
                      <span className="muted"> · {item.sku || 'No SKU'}</span>
                    </span>
                    <strong>{Number(item.quantity || 0)} {item.unit}</strong>
                  </div>
                ))}
            </div>
          )}
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <div>
            <h2>Inventory & materials</h2>
            <p>Search and manage stock available for QVB I.T. jobs.</p>
          </div>

          <div className="page-actions">
            <div className="search-box">
              <Search size={16} />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search inventory..."
              />
            </div>

            <select value={filter} onChange={(e) => setFilter(e.target.value)} className="select-control">
              <option value="all">All items</option>
              <option value="active">Active</option>
              <option value="low">Low stock</option>
            </select>
          </div>
        </div>

        {loading ? (
          <div className="empty-state">Loading inventory...</div>
        ) : visibleItems.length === 0 ? (
          <div className="empty-state">
            {items.length === 0 ? 'No inventory items yet. Add your first material above.' : 'No inventory items match your search.'}
          </div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Category</th>
                  <th>Vendor</th>
                  <th>On hand</th>
                  <th>Reorder</th>
                  <th>Unit cost</th>
                  <th>Stock value</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {visibleItems.map((item) => {
                  const quantity = Number(item.quantity || 0)
                  const reorder = Number(item.reorder_level || 0)
                  const stockValue = quantity * Number(item.unit_cost || 0)
                  const low = quantity <= reorder

                  return (
                    <tr key={item.id}>
                      <td>
                        <strong>{item.name}</strong>
                        <div className="muted">{item.sku || 'No SKU'} · {item.unit}</div>
                      </td>
                      <td>{item.category}</td>
                      <td>{item.vendor || '—'}</td>
                      <td>
                        <strong>{quantity}</strong>
                        {low && <div className="muted">Low stock</div>}
                      </td>
                      <td>{reorder}</td>
                      <td>{money(item.unit_cost)}</td>
                      <td>{money(stockValue)}</td>
                      <td>
                        <div className="inline-actions">
                          <button className="icon-button" title="Edit" onClick={() => editItem(item)}>
                            <Pencil size={16} />
                          </button>
                          <button className="icon-button danger" title="Delete" onClick={() => deleteItem(item.id)}>
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}


/* =========================================================
   PROFITABILITY
========================================================= */

function Profitability() {
  const navigate = useNavigate()
  const [period, setPeriod] = useState('month')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [data, setData] = useState({
    revenue: 0,
    collected: 0,
    expenses: 0,
    profit: 0,
    margin: 0,
    jobs: [],
    categories: [],
  })

  useEffect(() => {
    async function load() {
      setLoading(true)
      setError('')

      const now = new Date()
      let start = null
      if (period === 'month') {
        start = new Date(now.getFullYear(), now.getMonth(), 1)
      } else if (period === 'quarter') {
        const qStart = Math.floor(now.getMonth() / 3) * 3
        start = new Date(now.getFullYear(), qStart, 1)
      } else if (period === 'year') {
        start = new Date(now.getFullYear(), 0, 1)
      }
      const startDate = start ? localDateKey(start) : null

      const [invoiceResult, expenseResult, jobResult, laborResult] = await Promise.all([
        supabase
          .from('invoices')
          .select('id, invoice_number, customer_id, job_id, issue_date, total, amount_paid, status, customers(company_name)')
          .not('status', 'eq', 'void'),
        supabase
          .from('expenses')
          .select('id, expense_date, vendor, category, description, amount, job_id'),
        supabase
          .from('jobs')
          .select('id, job_number, title, customer_id, final_amount, estimated_amount, status, scheduled_date, customers(company_name)'),
        supabase
          .from('job_time_entries')
          .select('id, job_id, work_date, hours, hourly_cost')
      ])

      const firstError = [invoiceResult, expenseResult, jobResult, laborResult].find((r) => r.error)?.error
      if (firstError) {
        setError(firstError.message)
        setLoading(false)
        return
      }

      const invoices = (invoiceResult.data || []).filter((x) => !startDate || (x.issue_date && x.issue_date >= startDate))
      const expenses = (expenseResult.data || []).filter((x) => !startDate || (x.expense_date && x.expense_date >= startDate))
      const labor = (laborResult.data || []).filter((x) => !startDate || (x.work_date && x.work_date >= startDate))
      const jobs = jobResult.data || []

      const revenue = invoices.reduce((sum, x) => sum + Number(x.total || 0), 0)
      const collected = invoices.reduce((sum, x) => sum + Number(x.amount_paid || 0), 0)
      const expenseTotal = expenses.reduce((sum, x) => sum + Number(x.amount || 0), 0)
      const laborTotal = labor.reduce((sum, x) => sum + Number(x.hours || 0) * Number(x.hourly_cost || 0), 0)
      const totalCost = expenseTotal + laborTotal
      const profit = revenue - totalCost
      const margin = revenue > 0 ? (profit / revenue) * 100 : 0

      const categoryMap = new Map()
      expenses.forEach((x) => {
        const key = x.category || 'General'
        categoryMap.set(key, (categoryMap.get(key) || 0) + Number(x.amount || 0))
      })
      if (laborTotal > 0) categoryMap.set('Labor', laborTotal)

      const jobMap = new Map()
      jobs.forEach((job) => {
        const jobInvoices = invoices.filter((x) => x.job_id === job.id)
        const jobExpenses = expenses.filter((x) => x.job_id === job.id)
        const jobLabor = labor.filter((x) => x.job_id === job.id)
        const billed = jobInvoices.reduce((s, x) => s + Number(x.total || 0), 0)
        const expenseCost = jobExpenses.reduce((s, x) => s + Number(x.amount || 0), 0)
        const laborCost = jobLabor.reduce((s, x) => s + Number(x.hours || 0) * Number(x.hourly_cost || 0), 0)
        const cost = expenseCost + laborCost
        const value = billed || Number(job.final_amount || job.estimated_amount || 0)
        if (value || cost) {
          jobMap.set(job.id, {
            ...job,
            customerName: job.customers?.company_name || 'Customer',
            revenue: value,
            cost,
            profit: value - cost,
          })
        }
      })

      setData({
        revenue,
        collected,
        expenses: totalCost,
        profit,
        margin,
        jobs: [...jobMap.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 10),
        categories: [...categoryMap.entries()].map(([name, amount]) => ({ name, amount })).sort((a, b) => b.amount - a.amount),
      })
      setLoading(false)
    }
    load()
  }, [period])

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="eyebrow">Financial reporting</div>
          <h1>Profitability</h1>
          <p>Revenue, recorded expenses, technician labor, collections, and job-level profitability.</p>
        </div>
        <div className="page-actions">
          <select value={period} onChange={(e) => setPeriod(e.target.value)} className="select-control">
            <option value="month">This month</option>
            <option value="quarter">This quarter</option>
            <option value="year">This year</option>
            <option value="all">All time</option>
          </select>
        </div>
      </div>

      {error && <div className="alert error">{error}</div>}

      {loading ? (
        <div className="card"><div className="empty-state">Loading profitability data...</div></div>
      ) : (
        <>
          <div className="stats-grid">
            <StatCard label="Invoiced" value={money(data.revenue)} icon={FileText} />
            <StatCard label="Collected" value={money(data.collected)} icon={CreditCard} />
            <StatCard label="Total costs" value={money(data.expenses)} icon={ReceiptText} />
            <StatCard label="Gross profit" value={money(data.profit)} icon={ArrowUpRight} />
          </div>

          <div className="two-column-grid">
            <div className="card">
              <div className="card-header">
                <div><h2>Profit margin</h2><p>Invoiced revenue less recorded expenses and technician labor.</p></div>
              </div>
              <div className="metric-large">{data.margin.toFixed(1)}%</div>
              <div className="progress-track"><div className="progress-fill" style={{ width: `${Math.min(Math.max(data.margin, 0), 100)}%` }} /></div>
            </div>

            <div className="card">
              <div className="card-header">
                <div><h2>Expense breakdown</h2><p>Where recorded expenses are going.</p></div>
              </div>
              {data.categories.length === 0 ? (
                <div className="empty-state">No expenses in this period.</div>
              ) : (
                <div className="simple-list">
                  {data.categories.slice(0, 8).map((item) => (
                    <div className="simple-list-row" key={item.name}>
                      <span>{item.name}</span><strong>{money(item.amount)}</strong>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <div><h2>Job profitability</h2><p>Revenue compared with direct expenses and recorded technician labor.</p></div>
            </div>
            {data.jobs.length === 0 ? (
              <div className="empty-state">No job financial activity is available for this period.</div>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead><tr><th>Job</th><th>Customer</th><th>Revenue</th><th>Expenses</th><th>Profit</th><th>Margin</th></tr></thead>
                  <tbody>
                    {data.jobs.map((job) => {
                      const margin = job.revenue > 0 ? (job.profit / job.revenue) * 100 : 0
                      return (
                        <tr key={job.id} onClick={() => navigate(`/crm/jobs/${job.id}`)} className="clickable-row">
                          <td><strong>{job.job_number || 'Job'}</strong><div className="muted">{job.title}</div></td>
                          <td>{job.customerName}</td>
                          <td>{money(job.revenue)}</td>
                          <td>{money(job.cost)}</td>
                          <td>{money(job.profit)}</td>
                          <td>{margin.toFixed(1)}%</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}


/* =========================================================
   DASHBOARD
========================================================= */

function Dashboard() {
  const navigate = useNavigate()

  const [stats, setStats] = useState({
    leads: 0,
    customers: 0,
    openJobs: 0,
    quotes: 0,
    invoicedMonth: 0,
    invoicedYear: 0,
    paidRevenue: 0,
    outstanding: 0,
    overdue: 0,
    completedJobs: 0,
  })

  const [recentLeads, setRecentLeads] = useState([])
  const [upcomingJobs, setUpcomingJobs] = useState([])
  const [topCustomers, setTopCustomers] = useState([])
  const [overdueInvoices, setOverdueInvoices] = useState([])
  const [openFollowUps, setOpenFollowUps] = useState([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      setLoading(true)
      setError('')

      const now = new Date()
      const today = localDateKey(now)
      const monthStart = localDateKey(new Date(now.getFullYear(), now.getMonth(), 1))
      const yearStart = localDateKey(new Date(now.getFullYear(), 0, 1))
      const nextWeek = new Date(now)
      nextWeek.setDate(nextWeek.getDate() + 7)
      const nextWeekDate = localDateKey(nextWeek)

      const [
        leadsResult,
        customersResult,
        openJobsResult,
        activeQuotesResult,
        completedJobsResult,
        invoicesResult,
        monthInvoicesResult,
        yearInvoicesResult,
        recentLeadsResult,
        upcomingJobsResult,
        followUpsResult,
      ] = await Promise.all([
        supabase.from('leads').select('*', { count: 'exact', head: true }),
        supabase.from('customers').select('*', { count: 'exact', head: true }),
        supabase
          .from('jobs')
          .select('*', { count: 'exact', head: true })
          .not('status', 'in', '(completed,cancelled)'),
        supabase
          .from('quotes')
          .select('*', { count: 'exact', head: true })
          .not('status', 'in', '(accepted,declined,expired)'),
        supabase
          .from('jobs')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'completed'),
        supabase
          .from('invoices')
          .select('id, invoice_number, customer_id, job_id, status, issue_date, due_date, total, amount_paid, customers(company_name)')
          .not('status', 'eq', 'void'),
        supabase
          .from('invoices')
          .select('total, issue_date')
          .gte('issue_date', monthStart)
          .not('status', 'eq', 'void'),
        supabase
          .from('invoices')
          .select('total, issue_date')
          .gte('issue_date', yearStart)
          .not('status', 'eq', 'void'),
        supabase
          .from('leads')
          .select('id, contact_name, company_name, service_requested, status, estimated_value, created_at')
          .order('created_at', { ascending: false })
          .limit(5),
        supabase
          .from('jobs')
          .select('id, job_number, title, scheduled_date, scheduled_start, status, customer_id, customers(company_name)')
          .gte('scheduled_date', today)
          .lte('scheduled_date', nextWeekDate)
          .not('status', 'in', '(completed,cancelled)')
          .order('scheduled_date', { ascending: true })
          .order('scheduled_start', { ascending: true })
          .limit(6),
        fetchCrmActivities({
          select: 'id, customer_id, job_id, subject, body, activity_date, follow_up_status, priority, due_date, assigned_to, customers(company_name), jobs(job_number, title)',
          activityType: 'follow_up',
          openFollowUpsOnly: true,
          orderColumn: 'due_date',
          ascending: true,
          limit: 6,
        }),
      ])

      const results = [
        leadsResult,
        customersResult,
        openJobsResult,
        activeQuotesResult,
        completedJobsResult,
        invoicesResult,
        monthInvoicesResult,
        yearInvoicesResult,
        recentLeadsResult,
        upcomingJobsResult,
        followUpsResult,
      ]

      const firstError = results.find((x) => x.error)?.error || followUpsResult.error
      if (firstError) setError(firstError.message)

      const invoices = invoicesResult.data || []
      const monthInvoices = monthInvoicesResult.data || []
      const yearInvoices = yearInvoicesResult.data || []

      let outstanding = 0
      let overdue = 0
      let paidRevenue = 0
      const customerTotals = new Map()
      const overdueRows = []

      invoices.forEach((invoice) => {
        const total = Number(invoice.total || 0)
        const paid = Number(invoice.amount_paid || 0)
        const balance = Math.max(total - paid, 0)

        paidRevenue += paid
        outstanding += balance

        const customerName = invoice.customers?.company_name || 'Customer'
        const existing = customerTotals.get(invoice.customer_id) || {
          id: invoice.customer_id,
          name: customerName,
          invoiced: 0,
          balance: 0,
        }
        existing.invoiced += total
        existing.balance += balance
        customerTotals.set(invoice.customer_id, existing)

        if (balance > 0 && invoice.due_date && invoice.due_date < today) {
          overdue += balance
          const due = new Date(`${invoice.due_date}T00:00:00`)
          const todayDate = new Date(`${today}T00:00:00`)
          const days = Math.max(
            1,
            Math.floor((todayDate - due) / 86400000)
          )
          overdueRows.push({
            ...invoice,
            balance,
            overdueDays: days,
            customerName,
          })
        }
      })

      setStats({
        leads: leadsResult.count || 0,
        customers: customersResult.count || 0,
        openJobs: openJobsResult.count || 0,
        quotes: activeQuotesResult.count || 0,
        invoicedMonth: monthInvoices.reduce((sum, i) => sum + Number(i.total || 0), 0),
        invoicedYear: yearInvoices.reduce((sum, i) => sum + Number(i.total || 0), 0),
        paidRevenue,
        outstanding,
        overdue,
        completedJobs: completedJobsResult.count || 0,
      })

      setRecentLeads(recentLeadsResult.data || [])
      setUpcomingJobs(upcomingJobsResult.data || [])
      setOpenFollowUps(followUpsResult.data || [])
      setOverdueInvoices(
        overdueRows
          .sort((a, b) => b.overdueDays - a.overdueDays)
          .slice(0, 5)
      )
      setTopCustomers(
        Array.from(customerTotals.values())
          .filter((customer) => customer.invoiced > 0)
          .sort((a, b) => b.invoiced - a.invoiced)
          .slice(0, 5)
      )

      setLoading(false)
    }

    load()
  }, [])

  return (
    <>
      <PageHeader
        eyebrow="Overview"
        title="Dashboard"
        description="A live view of QVB I.T. sales, operations, and receivables."
        action={
          <div className="quick-actions">
            <a className="secondary-button" href="/crm/leads">
              <Plus size={16} />
              New lead
            </a>
            <a className="primary-button" href="/crm/customers">
              <Plus size={16} />
              New customer
            </a>
          </div>
        }
      />

      {error && <div className="error-box page-error">{error}</div>}

      {loading ? (
        <div className="card" style={{ padding: '28px' }}>Loading dashboard…</div>
      ) : (
        <>
          <div className="stat-grid">
            <StatCard label="Leads" value={stats.leads} icon={Users} link="/crm/leads" />
            <StatCard label="Customers" value={stats.customers} icon={Building2} link="/crm/customers" />
            <StatCard label="Open Jobs" value={stats.openJobs} icon={BriefcaseBusiness} link="/crm/jobs" />
            <StatCard label="Active Quotes" value={stats.quotes} icon={CircleDollarSign} link="/crm/quotes" />
          </div>

          <div className="metric-grid">
            <div className="metric-card">
              <div className="metric-label"><ReceiptText size={16} /> Invoiced this month</div>
              <strong>{money(stats.invoicedMonth)}</strong>
              <span>Invoices issued since the start of this month</span>
            </div>
            <div className="metric-card">
              <div className="metric-label"><CircleDollarSign size={16} /> Invoiced this year</div>
              <strong>{money(stats.invoicedYear)}</strong>
              <span>Invoices issued since January 1</span>
            </div>
            <div className="metric-card">
              <div className="metric-label"><ReceiptText size={16} /> Outstanding A/R</div>
              <strong>{money(stats.outstanding)}</strong>
              <span>Current unpaid invoice balance</span>
            </div>
            <div className="metric-card">
              <div className="metric-label"><CircleDollarSign size={16} /> Overdue A/R</div>
              <strong>{money(stats.overdue)}</strong>
              <span>Past-due invoice balance</span>
            </div>
            
</div>

          <div className="dashboard-grid">
            <section className="panel">
              <div className="panel-header">
                <div>
                  <h2>Sales & operations</h2>
                  <p>Quick indicators for the business.</p>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '12px' }}>
                <button className="secondary-button" onClick={() => navigate('/crm/quotes')} style={{ justifyContent: 'space-between' }}>
                  <span><FileText size={16} /> Quotes awaiting action</span>
                  <strong>{stats.quotes}</strong>
                </button>
                <button className="secondary-button" onClick={() => navigate('/crm/jobs')} style={{ justifyContent: 'space-between' }}>
                  <span><BriefcaseBusiness size={16} /> Open jobs</span>
                  <strong>{stats.openJobs}</strong>
                </button>
                <button className="secondary-button" onClick={() => navigate('/crm/jobs')} style={{ justifyContent: 'space-between' }}>
                  <span><CalendarClock size={16} /> Completed jobs</span>
                  <strong>{stats.completedJobs}</strong>
                </button>
                <button className="secondary-button" onClick={() => navigate('/crm/accounts-receivable')} style={{ justifyContent: 'space-between' }}>
                  <span><ReceiptText size={16} /> Paid to date</span>
                  <strong>{money(stats.paidRevenue)}</strong>
                </button>
              </div>
            </section>

            <section className="panel">
              <div className="panel-header">
                <div>
                  <h2>Overdue invoices</h2>
                  <p>Accounts needing attention.</p>
                </div>
                <a className="text-link" href="/crm/accounts-receivable">View A/R <ChevronRight size={15} /></a>
              </div>

              {overdueInvoices.length ? (
                <div className="upcoming-list">
                  {overdueInvoices.map((invoice) => (
                    <a className="upcoming-item" href={`/crm/invoices/${invoice.id}`} key={invoice.id}>
                      <div className="upcoming-icon"><ReceiptText size={17} /></div>
                      <div className="upcoming-copy">
                        <strong>{invoice.invoice_number || 'Invoice'}</strong>
                        <span>{invoice.customerName} · {invoice.overdueDays} day{invoice.overdueDays === 1 ? '' : 's'} overdue</span>
                      </div>
                      <strong>{money(invoice.balance)}</strong>
                    </a>
                  ))}
                </div>
              ) : (
                <EmptyState title="No overdue invoices" description="Your open invoices are currently within their due dates." />
              )}
            </section>
          </div>

          <div className="dashboard-grid">
            <section className="panel">
              <div className="panel-header">
                <div>
                  <h2>Follow-ups needing attention</h2>
                  <p>Open customer and operational follow-ups.</p>
                </div>
                <a className="text-link" href="/crm/follow-ups">View follow-ups <ChevronRight size={15} /></a>
              </div>

              {openFollowUps.length ? (
                <div className="upcoming-list">
                  {openFollowUps.map((item) => {
                    const dueDay = item.due_date ? localDateKey(new Date(item.due_date)) : ''
                    const overdueItem = dueDay && dueDay < today
                    const dueLabel = item.due_date ? activityDateTime(item.due_date) : 'No due date'
                    return (
                      <a className="upcoming-item" href="/crm/follow-ups" key={item.id}>
                        <div className="upcoming-icon"><CheckCircle2 size={17} /></div>
                        <div className="upcoming-copy">
                          <strong>{item.subject}</strong>
                          <span>{item.customers?.company_name || 'Customer'} · {overdueItem ? `Overdue · ${dueLabel}` : dueLabel}{item.assigned_to ? ` · ${item.assigned_to}` : ''}</span>
                        </div>
                        <span>{priorityLabel(item.priority)}</span>
                      </a>
                    )
                  })}
                </div>
              ) : (
                <EmptyState title="No open follow-ups" description="You are caught up. New customer tasks will appear here." />
              )}
            </section>

            <section className="panel">
              <div className="panel-header">
                <div>
                  <h2>Upcoming work</h2>
                  <p>Jobs scheduled over the next seven days.</p>
                </div>
                <a className="text-link" href="/crm/jobs">View jobs <ChevronRight size={15} /></a>
              </div>

              {upcomingJobs.length ? (
                <div className="upcoming-list">
                  {upcomingJobs.map((job) => (
                    <a className="upcoming-item" href={`/crm/jobs/${job.id}`} key={job.id}>
                      <div className="upcoming-icon"><CalendarClock size={17} /></div>
                      <div className="upcoming-copy">
                        <strong>{job.title}</strong>
                        <span>{job.customers?.company_name || 'Customer'} · {date(job.scheduled_date)}{job.scheduled_start ? ` · ${job.scheduled_start.slice(0, 5)}` : ''}</span>
                      </div>
                      <ArrowUpRight size={15} />
                    </a>
                  ))}
                </div>
              ) : (
                <EmptyState title="No upcoming jobs" description="Scheduled work for the next seven days will appear here." />
              )}
            </section>

            <section className="panel">
              <div className="panel-header">
                <div>
                  <h2>Top customers</h2>
                  <p>Customers ranked by total invoiced.</p>
                </div>
                <a className="text-link" href="/crm/customers">View customers <ChevronRight size={15} /></a>
              </div>

              {topCustomers.length ? (
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>Customer</th><th>Invoiced</th><th>Balance</th></tr></thead>
                    <tbody>
                      {topCustomers.map((customer) => (
                        <tr key={customer.id}>
                          <td><strong>{customer.name}</strong></td>
                          <td>{money(customer.invoiced)}</td>
                          <td>{money(customer.balance)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <EmptyState title="No invoice history" description="Customer billing activity will appear here after invoices are created." />
              )}
            </section>
          </div>

          <section className="panel">
            <div className="panel-header">
              <div>
                <h2>Recent leads</h2>
                <p>Newest opportunities entering the pipeline.</p>
              </div>
              <a className="text-link" href="/crm/leads">View all <ChevronRight size={15} /></a>
            </div>

            {recentLeads.length ? (
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Contact</th><th>Service</th><th>Status</th><th>Estimated value</th><th>Date</th></tr></thead>
                  <tbody>
                    {recentLeads.map((lead) => (
                      <tr key={lead.id}>
                        <td><strong>{lead.contact_name}</strong><span>{lead.company_name || 'Individual'}</span></td>
                        <td>{lead.service_requested || '—'}</td>
                        <td><Status status={lead.status} /></td>
                        <td>{money(lead.estimated_value)}</td>
                        <td>{date(lead.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState title="No leads yet" description="Leads submitted from the website will appear here once the CRM form is connected." />
            )}
          </section>
        </>
      )}
    </>
  )
}

/* =========================================================
   STAT CARD
========================================================= */

function StatCard({
  label,
  value,
  icon: Icon,
  link,
}) {
  return (
    <a
      className="stat-card"
      href={link}
    >

      <div className="stat-icon">
        <Icon size={19} />
      </div>

      <div>

        <span>
          {label}
        </span>

        <strong>
          {value}
        </strong>

      </div>

      <ChevronRight
        className="stat-arrow"
        size={17}
      />

    </a>
  )
}


/* =========================================================
   LEADS
========================================================= */

function Leads() {
  const navigate = useNavigate()
  const [leads, setLeads] = useState([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)

  const emptyForm = {
    contact_name: '',
    company_name: '',
    email: '',
    phone: '',
    service_requested: '',
    number_of_drops: '',
    estimated_value: '',
    status: 'new',
  }

  const [form, setForm] = useState(emptyForm)

  async function load() {
    setLoading(true)
    setError('')

    const { data, error: fetchError } = await supabase
      .from('leads')
      .select('*')
      .order('created_at', { ascending: false })

    if (fetchError) setError(fetchError.message)
    setLeads(data || [])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  function updateField(event) {
    setForm({
      ...form,
      [event.target.name]: event.target.value,
    })
  }

  function openNewLead() {
    setError('')
    setForm(emptyForm)
    setShowForm(true)
  }

  async function saveLead(event) {
    event.preventDefault()

    if (!form.contact_name.trim()) {
      setError('Contact name is required.')
      return
    }

    if (!form.company_name.trim() && !form.email.trim() && !form.phone.trim()) {
      setError('Enter a company name, email, or phone number.')
      return
    }

    setSaving(true)
    setError('')

    const { error: insertError } = await supabase
      .from('leads')
      .insert({
        contact_name: form.contact_name.trim(),
        company_name: form.company_name.trim() || null,
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        service_requested: form.service_requested.trim() || null,
        number_of_drops:
          form.number_of_drops === '' ? null : Number(form.number_of_drops),
        estimated_value:
          form.estimated_value === '' ? null : Number(form.estimated_value),
        status: form.status || 'new',
      })

    if (insertError) {
      setError(`Unable to save lead: ${insertError.message}`)
      setSaving(false)
      return
    }

    setForm(emptyForm)
    setShowForm(false)
    setSaving(false)
    await load()
  }

  const filtered = leads.filter((lead) =>
    `${lead.contact_name || ''} ${lead.company_name || ''} ${
      lead.email || ''
    } ${lead.phone || ''} ${lead.service_requested || ''} ${
      lead.status || ''
    }`
      .toLowerCase()
      .includes(query.toLowerCase())
  )

  return (
    <div className="page">
      <PageHeader
        eyebrow="Pipeline"
        title="Leads"
        description="Track new opportunities from first contact through close."
        action={
          <button className="primary-button" onClick={openNewLead}>
            <Plus size={17} />
            New lead
          </button>
        }
      />

      {error && <div className="alert">{error}</div>}

      {showForm && (
        <div className="card form-card">
          <div className="card-header">
            <div>
              <h2>New Lead</h2>
              <p>Add a new opportunity to the QVB I.T. pipeline.</p>
            </div>
            <button
              className="secondary-button"
              type="button"
              onClick={() => setShowForm(false)}
              disabled={saving}
            >
              Cancel
            </button>
          </div>

          <form onSubmit={saveLead}>
            <div className="form-grid">
              <label>
                Contact name *
                <input
                  name="contact_name"
                  value={form.contact_name}
                  onChange={updateField}
                  placeholder="John Smith"
                  required
                />
              </label>

              <label>
                Company
                <input
                  name="company_name"
                  value={form.company_name}
                  onChange={updateField}
                  placeholder="Company name"
                />
              </label>

              <label>
                Email
                <input
                  type="email"
                  name="email"
                  value={form.email}
                  onChange={updateField}
                  placeholder="contact@example.com"
                />
              </label>

              <label>
                Phone
                <input
                  name="phone"
                  value={form.phone}
                  onChange={updateField}
                  placeholder="(555) 555-5555"
                />
              </label>

              <label>
                Service requested
                <input
                  name="service_requested"
                  value={form.service_requested}
                  onChange={updateField}
                  placeholder="Network installation"
                />
              </label>

              <label>
                Number of drops
                <input
                  type="number"
                  min="0"
                  name="number_of_drops"
                  value={form.number_of_drops}
                  onChange={updateField}
                />
              </label>

              <label>
                Estimated value
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  name="estimated_value"
                  value={form.estimated_value}
                  onChange={updateField}
                />
              </label>

              <label>
                Status
                <select name="status" value={form.status} onChange={updateField}>
                  <option value="new">New</option>
                  <option value="contacted">Contacted</option>
                  <option value="qualified">Qualified</option>
                  <option value="proposal">Proposal</option>
                  <option value="won">Won</option>
                  <option value="lost">Lost</option>
                </select>
              </label>
            </div>

            <div className="form-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => setShowForm(false)}
                disabled={saving}
              >
                Cancel
              </button>
              <button type="submit" className="primary-button" disabled={saving}>
                {saving ? 'Saving…' : 'Save Lead'}
              </button>
            </div>
          </form>
        </div>
      )}

      <section className="panel">
        <div className="toolbar">
          <div className="search-box">
            <Search size={17} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search leads…"
            />
          </div>

          <button className="secondary-button" onClick={load} disabled={loading}>
            Refresh
          </button>
        </div>

        {loading ? (
          <div className="loading-box">Loading leads…</div>
        ) : filtered.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Contact</th>
                  <th>Contact info</th>
                  <th>Service</th>
                  <th>Drops</th>
                  <th>Value</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((lead) => (
                  <tr
                    key={lead.id}
                    onClick={() => navigate(`/crm/leads/${lead.id}`)}
                    style={{ cursor: 'pointer' }}
                  >
                    <td>
                      <strong>{lead.contact_name}</strong>
                      <span>{lead.company_name || '—'}</span>
                    </td>
                    <td>
                      <span>{lead.email || '—'}</span>
                      <span>{lead.phone || '—'}</span>
                    </td>
                    <td>{lead.service_requested || '—'}</td>
                    <td>{lead.number_of_drops ?? '—'}</td>
                    <td>{money(lead.estimated_value)}</td>
                    <td><Status status={lead.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            title="No leads found"
            description={query ? 'Try a different search.' : 'Your leads will appear here.'}
          />
        )}
      </section>
    </div>
  )
}


/* =========================================================
   LEAD DETAIL
========================================================= */

function LeadDetail() {
  const { leadId } = useParams()
  const navigate = useNavigate()

  const [lead, setLead] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState('')

  const [form, setForm] = useState({
    contact_name: '',
    company_name: '',
    email: '',
    phone: '',
    service_requested: '',
    number_of_drops: '',
    estimated_value: '',
    status: 'new',
  })

  async function loadLead() {
    setLoading(true)
    setError('')

    const { data, error: fetchError } = await supabase
      .from('leads')
      .select('*')
      .eq('id', leadId)
      .single()

    if (fetchError) {
      setError(fetchError.message)
      setLead(null)
      setLoading(false)
      return
    }

    setLead(data)
    setForm({
      contact_name: data.contact_name || '',
      company_name: data.company_name || '',
      email: data.email || '',
      phone: data.phone || '',
      service_requested: data.service_requested || '',
      number_of_drops: data.number_of_drops ?? '',
      estimated_value: data.estimated_value ?? '',
      status: data.status || 'new',
    })
    setLoading(false)
  }

  useEffect(() => {
    loadLead()
  }, [leadId])

  function updateField(event) {
    setForm({
      ...form,
      [event.target.name]: event.target.value,
    })
  }

  function startEditing() {
    if (!lead) return
    setError('')
    setForm({
      contact_name: lead.contact_name || '',
      company_name: lead.company_name || '',
      email: lead.email || '',
      phone: lead.phone || '',
      service_requested: lead.service_requested || '',
      number_of_drops: lead.number_of_drops ?? '',
      estimated_value: lead.estimated_value ?? '',
      status: lead.status || 'new',
    })
    setEditing(true)
  }

  function cancelEditing() {
    if (lead) {
      setForm({
        contact_name: lead.contact_name || '',
        company_name: lead.company_name || '',
        email: lead.email || '',
        phone: lead.phone || '',
        service_requested: lead.service_requested || '',
        number_of_drops: lead.number_of_drops ?? '',
        estimated_value: lead.estimated_value ?? '',
        status: lead.status || 'new',
      })
    }
    setError('')
    setEditing(false)
  }

  async function saveChanges(event) {
    event.preventDefault()

    if (!form.contact_name.trim()) {
      setError('Contact name is required.')
      return
    }

    setSaving(true)
    setError('')

    const { data, error: updateError } = await supabase
      .from('leads')
      .update({
        contact_name: form.contact_name.trim(),
        company_name: form.company_name.trim() || null,
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        service_requested: form.service_requested.trim() || null,
        number_of_drops:
          form.number_of_drops === '' ? null : Number(form.number_of_drops),
        estimated_value:
          form.estimated_value === '' ? null : Number(form.estimated_value),
        status: form.status || 'new',
      })
      .eq('id', leadId)
      .select()
      .single()

    if (updateError) {
      setError(`Unable to save lead: ${updateError.message}`)
      setSaving(false)
      return
    }

    setLead(data)
    setEditing(false)
    setSaving(false)
  }

  async function changeStatus(status) {
    if (!lead || saving || status === lead.status) return

    setSaving(true)
    setError('')

    const { data, error: updateError } = await supabase
      .from('leads')
      .update({ status })
      .eq('id', leadId)
      .select()
      .single()

    if (updateError) {
      setError(`Unable to change status: ${updateError.message}`)
      setSaving(false)
      return
    }

    setLead(data)
    setForm((current) => ({
      ...current,
      status: data.status || status,
    }))
    setSaving(false)
  }

  async function handleDelete() {
    if (!lead) return

    const confirmed = window.confirm(
      `Are you sure you want to delete the lead for "${lead.contact_name}"? This cannot be undone.`
    )

    if (!confirmed) return

    setSaving(true)
    setError('')

    const { error: deleteError } = await supabase
      .from('leads')
      .delete()
      .eq('id', leadId)

    if (deleteError) {
      setError(`Unable to delete lead: ${deleteError.message}`)
      setSaving(false)
      return
    }

    navigate('/crm/leads')
  }

  async function createOpportunityFromLead() {
    if (!lead) return
    setSaving(true)
    setError('')

    const { data: existing, error: existingError } = await supabase
      .from('opportunities')
      .select('id, title')
      .eq('lead_id', lead.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (existingError) {
      setError(`Unable to check opportunities: ${existingError.message}`)
      setSaving(false)
      return
    }

    if (existing?.id) {
      setSaving(false)
      navigate(`/crm/opportunities/${existing.id}`)
      return
    }

    const title = `${lead.service_requested || 'New opportunity'} — ${lead.company_name || lead.contact_name}`
    const { data, error: insertError } = await supabase
      .from('opportunities')
      .insert({
        lead_id: lead.id,
        title,
        description: `Created from lead for ${lead.contact_name || 'contact'}.`,
        stage: 'new',
        estimated_value: Number(lead.estimated_value || 0),
        probability: 25,
        service_requested: lead.service_requested || null,
        source: 'Lead',
      })
      .select('id, customer_id, lead_id, title, estimated_value')
      .single()

    if (insertError) {
      setError(`Unable to create opportunity: ${insertError.message}`)
      setSaving(false)
      return
    }

    await logCrmActivity({
      lead_id: lead.id,
      opportunity_id: data.id,
      activity_type: 'opportunity_created',
      subject: `Opportunity created from lead: ${data.title}`,
      body: `Sales opportunity created from lead ${lead.contact_name || 'contact'}.`,
      activity_date: localNowIso(),
    })

    setSaving(false)
    navigate(`/crm/opportunities/${data.id}`)
  }

  async function convertToCustomer() {
    if (!lead) return

    const companyName =
      lead.company_name?.trim() || lead.contact_name?.trim()

    if (!companyName) {
      setError('This lead needs a company or contact name before it can be converted.')
      return
    }

    const confirmed = window.confirm(
      `Convert "${companyName}" into a customer?`
    )

    if (!confirmed) return

    setSaving(true)
    setError('')

    const notes = [
      'Converted from CRM lead.',
      lead.contact_name ? `Contact: ${lead.contact_name}` : null,
      lead.service_requested
        ? `Service requested: ${lead.service_requested}`
        : null,
      lead.number_of_drops != null
        ? `Number of drops: ${lead.number_of_drops}`
        : null,
      lead.estimated_value != null
        ? `Estimated value: ${money(lead.estimated_value)}`
        : null,
    ]
      .filter(Boolean)
      .join('\n')

    const { data: customer, error: customerError } = await supabase
      .from('customers')
      .insert({
        company_name: companyName,
        phone: lead.phone || null,
        email: lead.email || null,
        notes: notes || null,
      })
      .select()
      .single()

    if (customerError) {
      setError(`Unable to create customer: ${customerError.message}`)
      setSaving(false)
      return
    }

    const { data: updatedLead, error: leadError } = await supabase
      .from('leads')
      .update({ status: 'won' })
      .eq('id', leadId)
      .select()
      .single()

    if (leadError) {
      setError(
        `Customer was created, but the lead status could not be updated: ${leadError.message}`
      )
      setSaving(false)
      return
    }

    setLead(updatedLead)
    setSaving(false)
    navigate(`/crm/customers/${customer.id}`)
  }

  if (loading) {
    return (
      <div className="page">
        <div className="loading-box">Loading lead…</div>
      </div>
    )
  }

  if (!lead) {
    return (
      <div className="page">
        <div className="page-header">
          <div>
            <div className="eyebrow">Leads</div>
            <h1>Lead not found</h1>
            <p className="muted">We couldn't load this lead record.</p>
          </div>
        </div>

        {error && <div className="alert">{error}</div>}

        <button
          className="secondary-button"
          onClick={() => navigate('/crm/leads')}
        >
          <ArrowLeft size={16} />
          Back to Leads
        </button>
      </div>
    )
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <button
            type="button"
            className="secondary-button"
            onClick={() => navigate('/crm/leads')}
            style={{ marginBottom: '16px' }}
          >
            <ArrowLeft size={16} />
            Back to Leads
          </button>

          <div className="eyebrow">Lead</div>
          <h1>{lead.company_name || lead.contact_name}</h1>
          <p>Opportunity and contact information.</p>
        </div>

        {!editing && (
          <div
            style={{
              display: 'flex',
              gap: '10px',
              flexWrap: 'wrap',
            }}
          >
            <button
              className="secondary-button"
              type="button"
              onClick={startEditing}
              disabled={saving}
            >
              <Pencil size={16} />
              Edit Lead
            </button>

            <button
              className="secondary-button"
              type="button"
              onClick={createOpportunityFromLead}
              disabled={saving}
            >
              <Target size={16} />
              Create Opportunity
            </button>

            <button
              className="primary-button"
              type="button"
              onClick={convertToCustomer}
              disabled={saving}
            >
              <Building2 size={16} />
              Convert to Customer
            </button>

            <button
              className="delete-button"
              type="button"
              onClick={handleDelete}
              disabled={saving}
            >
              <Trash2 size={16} />
              Delete
            </button>
          </div>
        )}
      </div>

      {error && <div className="alert">{error}</div>}

      {editing ? (
        <div className="card form-card">
          <div className="card-header">
            <div>
              <h2>Edit Lead</h2>
              <p>Update this opportunity.</p>
            </div>
          </div>

          <form onSubmit={saveChanges}>
            <div className="form-grid">
              <label>
                Contact name *
                <input
                  name="contact_name"
                  value={form.contact_name}
                  onChange={updateField}
                  required
                />
              </label>

              <label>
                Company
                <input
                  name="company_name"
                  value={form.company_name}
                  onChange={updateField}
                />
              </label>

              <label>
                Email
                <input
                  type="email"
                  name="email"
                  value={form.email}
                  onChange={updateField}
                />
              </label>

              <label>
                Phone
                <input
                  name="phone"
                  value={form.phone}
                  onChange={updateField}
                />
              </label>

              <label>
                Service requested
                <input
                  name="service_requested"
                  value={form.service_requested}
                  onChange={updateField}
                />
              </label>

              <label>
                Number of drops
                <input
                  type="number"
                  min="0"
                  name="number_of_drops"
                  value={form.number_of_drops}
                  onChange={updateField}
                />
              </label>

              <label>
                Estimated value
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  name="estimated_value"
                  value={form.estimated_value}
                  onChange={updateField}
                />
              </label>

              <label>
                Status
                <select name="status" value={form.status} onChange={updateField}>
                  <option value="new">New</option>
                  <option value="contacted">Contacted</option>
                  <option value="qualified">Qualified</option>
                  <option value="proposal">Proposal</option>
                  <option value="won">Won</option>
                  <option value="lost">Lost</option>
                </select>
              </label>
            </div>

            <div className="form-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={cancelEditing}
                disabled={saving}
              >
                Cancel
              </button>

              <button
                type="submit"
                className="primary-button"
                disabled={saving}
              >
                {saving ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </form>
        </div>
      ) : (
        <>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
              gap: '20px',
            }}
          >
            <section className="card">
              <div className="card-header">
                <div>
                  <h2>Contact Information</h2>
                  <p>Primary lead contact details.</p>
                </div>
                <Users size={22} />
              </div>

              <div style={{ display: 'grid', gap: '18px' }}>
                <DetailRow
                  icon={Users}
                  label="Contact"
                  value={lead.contact_name}
                />
                <DetailRow
                  icon={Building2}
                  label="Company"
                  value={lead.company_name}
                />
                <DetailRow
                  icon={Phone}
                  label="Phone"
                  value={lead.phone}
                  link={lead.phone ? `tel:${lead.phone}` : null}
                />
                <DetailRow
                  icon={Mail}
                  label="Email"
                  value={lead.email}
                  link={lead.email ? `mailto:${lead.email}` : null}
                />
              </div>
            </section>

            <section className="card">
              <div className="card-header">
                <div>
                  <h2>Opportunity</h2>
                  <p>Scope, value and current pipeline status.</p>
                </div>
                <CircleDollarSign size={22} />
              </div>

              <div style={{ display: 'grid', gap: '18px' }}>
                <DetailRow
                  icon={Package}
                  label="Service requested"
                  value={lead.service_requested}
                />
                <DetailRow
                  icon={Package}
                  label="Number of drops"
                  value={
                    lead.number_of_drops != null
                      ? String(lead.number_of_drops)
                      : null
                  }
                />
                <DetailRow
                  icon={CircleDollarSign}
                  label="Estimated value"
                  value={
                    lead.estimated_value != null
                      ? money(lead.estimated_value)
                      : null
                  }
                />

                <div>
                  <div
                    style={{
                      fontSize: '12px',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      marginBottom: '8px',
                      opacity: 0.65,
                    }}
                  >
                    Status
                  </div>

                  <select
                    value={lead.status || 'new'}
                    onChange={(event) => changeStatus(event.target.value)}
                    disabled={saving}
                    style={{ width: '100%' }}
                  >
                    <option value="new">New</option>
                    <option value="contacted">Contacted</option>
                    <option value="qualified">Qualified</option>
                    <option value="proposal">Proposal</option>
                    <option value="won">Won</option>
                    <option value="lost">Lost</option>
                  </select>
                </div>
              </div>
            </section>

            <section
              className="card"
              style={{ gridColumn: '1 / -1' }}
            >
              <div className="card-header">
                <div>
                  <h2>Lead Summary</h2>
                  <p>Current pipeline status and next action.</p>
                </div>
              </div>

              <div
                style={{
                  display: 'flex',
                  gap: '12px',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                }}
              >
                <Status status={lead.status} />

                <span>
                  {lead.status === 'won'
                    ? 'This lead is marked won. Use Convert to Customer to create the customer record.'
                    : lead.status === 'lost'
                      ? 'This lead is marked lost.'
                      : 'Continue moving this opportunity through the pipeline as the conversation progresses.'}
                </span>
              </div>
            </section>
          </div>

          <div
            style={{
              marginTop: '20px',
              color: 'var(--muted, #64748b)',
              fontSize: '13px',
            }}
          >
            {lead.created_at && (
              <span>Lead created {date(lead.created_at)}</span>
            )}
          </div>
        </>
      )}
    </div>
  )
}


/* =========================================================
   CUSTOMERS
========================================================= */

function Customers() {

  const [customers, setCustomers] =
    useState([])

  const [search, setSearch] =
    useState('')

  const [showForm, setShowForm] =
    useState(false)

  const [loading, setLoading] =
    useState(true)

  const [saving, setSaving] =
    useState(false)

  const [error, setError] =
    useState('')


  const emptyForm = {
    company_name: '',
    phone: '',
    email: '',
    website: '',
    billing_address: '',
    city: '',
    state: '',
    zip: '',
    notes: '',
  }


  const [form, setForm] =
    useState(emptyForm)


  /* ---------------------------------------------------------
     LOAD CUSTOMERS
  --------------------------------------------------------- */

  async function loadCustomers() {

    setLoading(true)
    setError('')

    const {
      data,
      error,
    } = await supabase
      .from('customers')
      .select('*')
      .order(
        'company_name',
        { ascending: true }
      )

    if (error) {
      setError(error.message)
    } else {
      setCustomers(data || [])
    }

    setLoading(false)
  }


  useEffect(() => {
    loadCustomers()
  }, [])


  /* ---------------------------------------------------------
     FORM FIELD UPDATE
  --------------------------------------------------------- */

  function updateField(event) {

    setForm({
      ...form,
      [event.target.name]:
        event.target.value,
    })
  }


  /* ---------------------------------------------------------
     CREATE CUSTOMER
  --------------------------------------------------------- */

  async function saveCustomer(event) {

    event.preventDefault()

    if (!form.company_name.trim()) {

      setError(
        'Company name is required.'
      )

      return
    }

    setSaving(true)
    setError('')

    const {
      error,
    } = await supabase
      .from('customers')
      .insert({
        company_name:
          form.company_name.trim(),

        phone:
          form.phone.trim() || null,

        email:
          form.email.trim() || null,

        website:
          form.website.trim() || null,

        billing_address:
          form.billing_address.trim() ||
          null,

        city:
          form.city.trim() || null,

        state:
          form.state.trim() || null,

        zip:
          form.zip.trim() || null,

        notes:
          form.notes.trim() || null,
      })


    if (error) {

      setError(error.message)
      setSaving(false)

      return
    }


    setForm(emptyForm)

    setShowForm(false)
    setSaving(false)

    await loadCustomers()
  }


  /* ---------------------------------------------------------
     DELETE CUSTOMER
  --------------------------------------------------------- */

  async function deleteCustomer(customer) {

    const confirmed =
      window.confirm(
        `Are you sure you want to delete "${customer.company_name}"?`
      )

    if (!confirmed) {
      return
    }

    setError('')
    setSaving(true)

    const {
      error,
    } = await supabase
      .from('customers')
      .delete()
      .eq('id', customer.id)


    if (error) {

      setError(
        `Unable to delete customer: ${error.message}`
      )

      setSaving(false)

      return
    }


    setSaving(false)

    await loadCustomers()
  }


  /* ---------------------------------------------------------
     FILTER CUSTOMERS
  --------------------------------------------------------- */

  const filteredCustomers =
    customers.filter(
      (customer) => {

        const text = [
          customer.company_name,
          customer.phone,
          customer.email,
          customer.city,
          customer.state,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()

        return text.includes(
          search.toLowerCase()
        )
      }
    )


  /* ---------------------------------------------------------
     CUSTOMER PAGE
  --------------------------------------------------------- */

  return (

    <div className="page">

      <div className="page-header">

        <div>

          <div className="eyebrow">
            QVB I.T. CRM
          </div>

          <h1>
            Customers
          </h1>

          <p>
            Manage QVB I.T. customers and their contact information.
          </p>

        </div>


        <button
          className="primary-button"
          onClick={() => {
            setError('')
            setForm(emptyForm)
            setShowForm(true)
          }}
        >
          <Plus size={17} />
          New Customer
        </button>

      </div>


      {error && (
        <div className="alert">
          {error}
        </div>
      )}


      {/* CUSTOMER FORM */}

      {showForm && (

        <div className="card form-card">

          <div className="card-header">

            <div>

              <h2>
                New Customer
              </h2>

              <p>
                Add a customer to the QVB I.T. CRM.
              </p>

            </div>


            <button
              className="secondary-button"
              type="button"
              onClick={() =>
                setShowForm(false)
              }
            >
              Cancel
            </button>

          </div>


          <form
            onSubmit={saveCustomer}
          >

            <div className="form-grid">

              <label>

                Company name *

                <input
                  name="company_name"
                  value={
                    form.company_name
                  }
                  onChange={updateField}
                  placeholder="Company name"
                  required
                />

              </label>


              <label>

                Phone

                <input
                  name="phone"
                  value={form.phone}
                  onChange={updateField}
                  placeholder="(555) 555-5555"
                />

              </label>


              <label>

                Email

                <input
                  type="email"
                  name="email"
                  value={form.email}
                  onChange={updateField}
                  placeholder="customer@example.com"
                />

              </label>


              <label>

                Website

                <input
                  name="website"
                  value={form.website}
                  onChange={updateField}
                  placeholder="https://example.com"
                />

              </label>


              <label className="full-width">

                Billing address

                <input
                  name="billing_address"
                  value={
                    form.billing_address
                  }
                  onChange={updateField}
                  placeholder="Street address"
                />

              </label>


              <label>

                City

                <input
                  name="city"
                  value={form.city}
                  onChange={updateField}
                  placeholder="City"
                />

              </label>


              <label>

                State

                <input
                  name="state"
                  value={form.state}
                  onChange={updateField}
                  placeholder="FL"
                  maxLength="2"
                />

              </label>


              <label>

                ZIP

                <input
                  name="zip"
                  value={form.zip}
                  onChange={updateField}
                  placeholder="33060"
                />

              </label>


              <label className="full-width">

                Notes

                <textarea
                  name="notes"
                  value={form.notes}
                  onChange={updateField}
                  placeholder="Customer notes..."
                  rows="4"
                />

              </label>

            </div>


            <div className="form-actions">

              <button
                type="button"
                className="secondary-button"
                onClick={() =>
                  setShowForm(false)
                }
              >
                Cancel
              </button>


              <button
                type="submit"
                className="primary-button"
                disabled={saving}
              >
                {saving
                  ? 'Saving...'
                  : 'Save Customer'}
              </button>

            </div>

          </form>

        </div>

      )}


      {/* CUSTOMER LIST */}

      <div className="card">

        <div className="card-header">

          <div>

            <h2>
              Customer List
            </h2>

            <p>
              {customers.length}{' '}
              {customers.length === 1
                ? 'customer'
                : 'customers'}
            </p>

          </div>


          <input
            className="search-input"
            value={search}
            onChange={(event) =>
              setSearch(
                event.target.value
              )
            }
            placeholder="Search customers..."
          />

        </div>


        {loading ? (

          <div className="empty-state">
            Loading customers...
          </div>

        ) : filteredCustomers.length === 0 ? (

          <div className="empty-state">

            {search
              ? 'No customers match your search.'
              : 'No customers yet. Click New Customer to add your first customer.'}

          </div>

        ) : (

          <div className="table-wrap">

            <table>

              <thead>

                <tr>

                  <th>
                    Company
                  </th>

                  <th>
                    Phone
                  </th>

                  <th>
                    Email
                  </th>

                  <th>
                    Location
                  </th>

                  <th>
                    Action
                  </th>

                </tr>

              </thead>


              <tbody>

                {filteredCustomers.map(
                  (customer) => (

                    <tr
                      key={customer.id}
                    >

                      <td>

                        <button
                          type="button"
                          onClick={() =>
                            window.location.href =
                              `/crm/customers/${customer.id}`
                          }
                          style={{
                            background: 'none',
                            border: 0,
                            padding: 0,
                            margin: 0,
                            cursor: 'pointer',
                            textAlign: 'left',
                            font: 'inherit',
                          }}
                        >
                          <strong>
                            {customer.company_name}
                          </strong>
                        </button>

                      </td>


                      <td>
                        {customer.phone ||
                          '—'}
                      </td>


                      <td>
                        {customer.email ||
                          '—'}
                      </td>


                      <td>

                        {[
                          customer.city,
                          customer.state,
                        ]
                          .filter(Boolean)
                          .join(', ') ||
                          '—'}

                      </td>


                      <td>

                        <button
                          type="button"
                          className="delete-button"
                          onClick={() =>
                            deleteCustomer(
                              customer
                            )
                          }
                          disabled={saving}
                        >

                          <Trash2
                            size={15}
                          />

                          Delete

                        </button>

                      </td>

                    </tr>
                  )
                )}

              </tbody>

            </table>

          </div>

        )}

      </div>

    </div>
  )
}



const paymentMethods = [
  'check',
  'cash',
  'credit_card',
  'bank_transfer',
  'ach',
  'other',
]

function paymentMethodLabel(method) {
  const labels = {
    check: 'Check',
    cash: 'Cash',
    credit_card: 'Credit card',
    bank_transfer: 'Bank transfer',
    ach: 'ACH',
    other: 'Other',
  }
  return labels[method] || method || 'Other'
}

function todayInputValue() {
  return localTodayInputValue()
}

function PaymentHistory({ payments, loading }) {
  return (
    <section className="panel" style={{ marginTop: '18px' }}>
      <div className="panel-header">
        <div>
          <h2>Payment history</h2>
          <p>Individual payment transactions recorded against this invoice.</p>
        </div>
      </div>

      {loading ? (
        <div className="loading-inline">Loading payments…</div>
      ) : payments.length ? (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Method</th>
                <th>Reference</th>
                <th>Notes</th>
                <th className="num">Amount</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((payment) => (
                <tr key={payment.id}>
                  <td>{date(payment.payment_date || payment.created_at)}</td>
                  <td>{paymentMethodLabel(payment.payment_method)}</td>
                  <td>{payment.reference_number || '—'}</td>
                  <td>{payment.notes || '—'}</td>
                  <td className="num"><strong>{money(payment.amount)}</strong></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="empty-state">
          <CreditCard size={20} />
          <h3>No payment transactions yet</h3>
          <p>Payments recorded from this invoice will appear here.</p>
        </div>
      )}
    </section>
  )
}

/* =========================================================
   CUSTOMER DETAIL
========================================================= */

function CustomerDetail() {

  const { customerId } = useParams()
  const navigate = useNavigate()

  const [customer, setCustomer] = useState(null)
  const [quotes, setQuotes] = useState([])
  const [jobs, setJobs] = useState([])
  const [invoices, setInvoices] = useState([])
  const [documents, setDocuments] = useState([])
  const [payments, setPayments] = useState([])
  const [activities, setActivities] = useState([])
  const [showEmailComposer, setShowEmailComposer] = useState(false)

  const [loading, setLoading] = useState(true)
  const [activityLoading, setActivityLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState('')

  const [form, setForm] = useState({
    company_name: '',
    phone: '',
    email: '',
    website: '',
    billing_address: '',
    city: '',
    state: '',
    zip: '',
    notes: '',
  })

  async function loadCustomer() {

    setLoading(true)
    setActivityLoading(true)
    setError('')

    const [
      customerResult,
      quotesResult,
      jobsResult,
      invoicesResult,
      documentsResult,
      paymentsResult,
      activitiesResult,
    ] = await Promise.all([
      supabase
        .from('customers')
        .select('*')
        .eq('id', customerId)
        .single(),

      supabase
        .from('quotes')
        .select('id, quote_number, title, status, valid_until, total, created_at')
        .eq('customer_id', customerId)
        .order('created_at', { ascending: false }),

      supabase
        .from('jobs')
        .select('id, job_number, title, status, scheduled_date, estimated_amount, final_amount, quote_id, created_at')
        .eq('customer_id', customerId)
        .order('scheduled_date', { ascending: false, nullsFirst: false }),

      supabase
        .from('invoices')
        .select('id, invoice_number, status, issue_date, due_date, total, amount_paid, job_id, created_at')
        .eq('customer_id', customerId)
        .order('issue_date', { ascending: false, nullsFirst: false }),

      supabase
        .from('crm_documents')
        .select('id, customer_id, job_id, file_name, storage_path, file_size, mime_type, category, notes, created_at, jobs(job_number, title)')
        .eq('customer_id', customerId)
        .order('created_at', { ascending: false }),

      supabase
        .from('invoice_payments')
        .select('id, invoice_id, amount, payment_date, payment_method, reference_number, notes, created_at, invoices(invoice_number)')
        .eq('invoices.customer_id', customerId)
        .order('payment_date', { ascending: false })
        .limit(50),
      fetchCrmActivities({
        customerId,
        orderColumn: 'activity_date',
        ascending: false,
        limit: 100,
      }),
    ])

    if (customerResult.error) {
      setError(customerResult.error.message)
      setCustomer(null)
    } else {
      const data = customerResult.data

      setCustomer(data)

      setForm({
        company_name: data.company_name || '',
        phone: data.phone || '',
        email: data.email || '',
        website: data.website || '',
        billing_address: data.billing_address || '',
        city: data.city || '',
        state: data.state || '',
        zip: data.zip || '',
        notes: data.notes || '',
      })
    }

    if (quotesResult.error) {
      setError((current) =>
        current
          ? `${current} Quotes could not be loaded: ${quotesResult.error.message}`
          : `Quotes could not be loaded: ${quotesResult.error.message}`
      )
    } else {
      setQuotes(quotesResult.data || [])
    }

    if (jobsResult.error) {
      setError((current) =>
        current
          ? `${current} Jobs could not be loaded: ${jobsResult.error.message}`
          : `Jobs could not be loaded: ${jobsResult.error.message}`
      )
    } else {
      setJobs(jobsResult.data || [])
    }

    if (invoicesResult.error) {
      setError((current) =>
        current
          ? `${current} Invoices could not be loaded: ${invoicesResult.error.message}`
          : `Invoices could not be loaded: ${invoicesResult.error.message}`
      )
    } else {
      setInvoices(invoicesResult.data || [])
    }

    if (documentsResult.error) {
      setError((current) =>
        current
          ? `${current} Documents could not be loaded: ${documentsResult.error.message}`
          : `Documents could not be loaded: ${documentsResult.error.message}`
      )
    }
    setDocuments(documentsResult.data || [])

    if (paymentsResult.error) {
      setError((current) =>
        current
          ? `${current} Payments could not be loaded: ${paymentsResult.error.message}`
          : `Payments could not be loaded: ${paymentsResult.error.message}`
      )
    } else {
      setPayments(paymentsResult.data || [])
    }

    if (activitiesResult.error) {
      setError((current) =>
        current
          ? `${current} Activity could not be loaded: ${activitiesResult.error.message}`
          : `Activity could not be loaded: ${activitiesResult.error.message}`
      )
    } else {
      setActivities(activitiesResult.data || [])
    }

    setLoading(false)
    setActivityLoading(false)
  }

  useEffect(() => {
    loadCustomer()
  }, [customerId])

  function updateField(event) {
    setForm({
      ...form,
      [event.target.name]: event.target.value,
    })
  }

  function startEditing() {
    setError('')

    setForm({
      company_name: customer.company_name || '',
      phone: customer.phone || '',
      email: customer.email || '',
      website: customer.website || '',
      billing_address: customer.billing_address || '',
      city: customer.city || '',
      state: customer.state || '',
      zip: customer.zip || '',
      notes: customer.notes || '',
    })

    setEditing(true)
  }

  function cancelEditing() {
    setEditing(false)
    setError('')
  }

  async function saveChanges(event) {
    event.preventDefault()

    setSaving(true)
    setError('')

    const { data, error } = await supabase
      .from('customers')
      .update({
        company_name: form.company_name.trim(),
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        website: form.website.trim() || null,
        billing_address: form.billing_address.trim() || null,
        city: form.city.trim() || null,
        state: form.state.trim().toUpperCase() || null,
        zip: form.zip.trim() || null,
        notes: form.notes.trim() || null,
        updated_at: localNowIso(),
      })
      .eq('id', customerId)
      .select()
      .single()

    if (error) {
      setError(error.message)
    } else {
      // Keep the normalized customer_emails table aligned with the legacy
      // customers.email field used by the original Edit Customer form.
      const normalizedEmail = form.email.trim().toLowerCase()
      const { data: primaryEmail, error: primaryEmailError } = await supabase
        .from('customer_emails')
        .select('id')
        .eq('customer_id', customerId)
        .eq('is_primary', true)
        .maybeSingle()

      if (primaryEmailError) {
        setError(`Customer saved, but the primary email could not be synchronized: ${primaryEmailError.message}`)
      } else if (normalizedEmail) {
        if (primaryEmail?.id) {
          const { error: syncError } = await supabase
            .from('customer_emails')
            .update({
              email: normalizedEmail,
              label: 'Primary',
              updated_at: localNowIso(),
            })
            .eq('id', primaryEmail.id)

          if (syncError) {
            setError(`Customer saved, but the primary email could not be synchronized: ${syncError.message}`)
          }
        } else {
          const { error: syncError } = await supabase
            .from('customer_emails')
            .insert({
              customer_id: customerId,
              email: normalizedEmail,
              label: 'Primary',
              is_primary: true,
            })

          if (syncError) {
            setError(`Customer saved, but the primary email could not be synchronized: ${syncError.message}`)
          }
        }
      } else {
        const { error: clearPrimaryError } = await supabase
          .from('customer_emails')
          .update({ is_primary: false, updated_at: localNowIso() })
          .eq('customer_id', customerId)
          .eq('is_primary', true)

        if (clearPrimaryError) {
          setError(`Customer saved, but the primary email could not be cleared: ${clearPrimaryError.message}`)
        }
      }

      setCustomer(data)
      setForm({
        company_name: data.company_name || '',
        phone: data.phone || '',
        email: data.email || '',
        website: data.website || '',
        billing_address: data.billing_address || '',
        city: data.city || '',
        state: data.state || '',
        zip: data.zip || '',
        notes: data.notes || '',
      })
      setEditing(false)
    }

    setSaving(false)
  }

  async function handleDelete() {
    if (!customer) return

    const confirmed = window.confirm(
      `Delete ${customer.company_name}? This cannot be undone.`
    )

    if (!confirmed) return

    setSaving(true)
    setError('')

    const { error } = await supabase
      .from('customers')
      .delete()
      .eq('id', customerId)

    if (error) {
      setError(error.message)
      setSaving(false)
      return
    }

    navigate('/crm/customers')
  }

    async function openCustomerDocument(document) {
    setError('')
    const { data, error: signedError } = await supabase.storage
      .from('crm-documents')
      .createSignedUrl(document.storage_path, 60)

    if (signedError) {
      setError(signedError.message)
      return
    }

    if (data?.signedUrl) {
      window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
    }
  }

  async function deleteCustomerDocument(document) {
    const confirmed = window.confirm(
      `Delete ${document.file_name}? This removes the stored file and its CRM record.`
    )

    if (!confirmed) return

    setError('')

    const { error: storageError } = await supabase.storage
      .from('crm-documents')
      .remove([document.storage_path])

    if (storageError) {
      setError(storageError.message)
      return
    }

    const { error: dbError } = await supabase
      .from('crm_documents')
      .delete()
      .eq('id', document.id)

    if (dbError) {
      setError(dbError.message)
      return
    }

    await logCrmActivity({
      customer_id: customerId,
      job_id: document.job_id || null,
      activity_type: 'document_deleted',
      subject: `Document deleted: ${document.file_name}`,
      body: `Customer document ${document.file_name} was deleted.`,
      activity_date: localNowIso(),
    })

    setDocuments((current) => current.filter((item) => item.id !== document.id))
  }

  function customerDocumentSize(bytes) {
    const value = Number(bytes || 0)
    if (!value) return '—'
    if (value < 1024) return `${value} B`
    if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
    if (value < 1024 * 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MB`
    return `${(value / (1024 * 1024 * 1024)).toFixed(1)} GB`
  }

  if (loading) {
      return (
      <div className="page">
        <div className="loading-inline">
          Loading customer…
        </div>
      </div>
    )
  }

  if (!customer) {
    return (
      <div className="page">
        <div className="page-header">
          <button
            className="back-button"
            type="button"
            onClick={() => navigate('/crm/customers')}
          >
            <ArrowLeft size={16} />
            Back to Customers
          </button>
        </div>

        <div className="error-box">
          {error || 'Customer not found.'}
        </div>
      </div>
    )
  }

  const quoteValue = quotes.reduce(
    (sum, quote) => sum + Number(quote.total || 0),
    0
  )

  const jobValue = jobs.reduce(
    (sum, job) =>
      sum +
      Number(
        Number(job.final_amount || 0) > 0
          ? job.final_amount
          : job.estimated_amount || 0
      ),
    0
  )

  const invoiceTotal = invoices.reduce(
    (sum, invoice) => sum + Number(invoice.total || 0),
    0
  )

  const amountPaid = invoices.reduce(
    (sum, invoice) => sum + Number(invoice.amount_paid || 0),
    0
  )

  const balanceDue = invoices.reduce(
    (sum, invoice) =>
      sum +
      Math.max(
        Number(invoice.total || 0) -
        Number(invoice.amount_paid || 0),
        0
      ),
    0
  )

  const openQuotes = quotes.filter(
    (quote) =>
      !['accepted', 'declined'].includes(
        quote.status
      )
  ).length

  const activeJobs = jobs.filter(
    (job) =>
      !['completed', 'cancelled'].includes(
        job.status
      )
  ).length

  const openInvoices = invoices.filter(
    (invoice) =>
      !['paid', 'void'].includes(
        invoice.status
      )
  ).length

  return (
    <div className="page">

      <div className="page-header">

        <div>
          <button
            className="back-button"
            type="button"
            onClick={() => navigate('/crm/customers')}
          >
            <ArrowLeft size={16} />
            Back to Customers
          </button>

          <h1 style={{ marginTop: '14px' }}>
            {customer.company_name}
          </h1>

          <p>
            Complete customer history and account overview.
          </p>
        </div>

        {!editing && (
          <div
            style={{
              display: 'flex',
              gap: '10px',
              flexWrap: 'wrap',
            }}
          >
            <button
              className="secondary-button"
              type="button"
              onClick={() => setShowEmailComposer((current) => !current)}
              title="Send an email to this customer"
            >
              <Mail size={16} />
              {showEmailComposer ? 'Close Email' : 'Send Email'}
            </button>

            <button
              className="secondary-button"
              type="button"
              onClick={() => navigate(`/crm/customers/${customerId}/statement`)}
            >
              <Printer size={16} />
              Statement
            </button>

            <button
              className="secondary-button"
              type="button"
              onClick={startEditing}
            >
              <Pencil size={16} />
              Edit Customer
            </button>

            <button
              className="danger-button"
              type="button"
              onClick={handleDelete}
              disabled={saving}
            >
              <Trash2 size={16} />
              Delete
            </button>
          </div>
        )}

      </div>

      {error && (
        <div className="alert">
          {error}
        </div>
      )}

{showEmailComposer && !editing && (
        <EmailComposer
          to={customer.email}
          customerId={customerId}
          onCancel={() => setShowEmailComposer(false)}
          onSent={async () => {
            setShowEmailComposer(false)
            const activityResult = await fetchCrmActivities({
              customerId,
              orderColumn: 'activity_date',
              ascending: false,
              limit: 100,
            })
            if (!activityResult.error) setActivities(activityResult.data || [])
          }}
        />
      )}

      {editing ? (

        <div className="card form-card">

          <div className="card-header">
            <div>
              <h2>Edit Customer</h2>
              <p>Update this customer's information.</p>
            </div>
          </div>

          <form onSubmit={saveChanges}>

            <div className="form-grid">

              <label>
                Company name *
                <input
                  name="company_name"
                  value={form.company_name}
                  onChange={updateField}
                  required
                />
              </label>

              <label>
                Phone
                <input
                  name="phone"
                  value={form.phone}
                  onChange={updateField}
                />
              </label>

              <label>
                Email
                <input
                  type="email"
                  name="email"
                  value={form.email}
                  onChange={updateField}
                />
              </label>

              <label>
                Website
                <input
                  name="website"
                  value={form.website}
                  onChange={updateField}
                />
              </label>

              <label className="full-width">
                Billing address
                <input
                  name="billing_address"
                  value={form.billing_address}
                  onChange={updateField}
                />
              </label>

              <label>
                City
                <input
                  name="city"
                  value={form.city}
                  onChange={updateField}
                />
              </label>

              <label>
                State
                <input
                  name="state"
                  value={form.state}
                  onChange={updateField}
                  maxLength="2"
                />
              </label>

              <label>
                ZIP
                <input
                  name="zip"
                  value={form.zip}
                  onChange={updateField}
                />
              </label>

              <label className="full-width">
                Notes
                <textarea
                  name="notes"
                  value={form.notes}
                  onChange={updateField}
                  rows="6"
                />
              </label>

            </div>

            <div className="form-actions">

              <button
                type="button"
                className="secondary-button"
                onClick={cancelEditing}
                disabled={saving}
              >
                Cancel
              </button>

              <button
                type="submit"
                className="primary-button"
                disabled={saving}
              >
                {saving ? 'Saving…' : 'Save Changes'}
              </button>

            </div>

          </form>

        </div>

      ) : (

        <>

          {/* ACCOUNT SUMMARY */}

          <div
            style={{
              display: 'grid',
              gridTemplateColumns:
                'repeat(auto-fit, minmax(180px, 1fr))',
              gap: '14px',
              marginBottom: '20px',
            }}
          >

            <section
              className="card"
              role="button"
              tabIndex={0}
              onClick={() => navigate('/crm/quotes')}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  navigate('/crm/quotes')
                }
              }}
              style={{ cursor: 'pointer' }}
              title="Open Quotes"
            >
              <div style={{ color: 'var(--muted, #64748b)', fontSize: '13px' }}>
                Quotes
              </div>
              <div style={{ fontSize: '28px', fontWeight: 700, marginTop: '7px' }}>
                {quotes.length}
              </div>
              <div style={{ color: 'var(--muted, #64748b)', fontSize: '13px', marginTop: '4px' }}>
                {openQuotes} open
              </div>
            </section>

            <section
              className="card"
              role="button"
              tabIndex={0}
              onClick={() => navigate('/crm/jobs')}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  navigate('/crm/jobs')
                }
              }}
              style={{ cursor: 'pointer' }}
              title="Open Jobs"
            >
              <div style={{ color: 'var(--muted, #64748b)', fontSize: '13px' }}>
                Jobs
              </div>
              <div style={{ fontSize: '28px', fontWeight: 700, marginTop: '7px' }}>
                {jobs.length}
              </div>
              <div style={{ color: 'var(--muted, #64748b)', fontSize: '13px', marginTop: '4px' }}>
                {activeJobs} active
              </div>
            </section>

            <section
              className="card"
              role="button"
              tabIndex={0}
              onClick={() => navigate('/crm/invoices')}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  navigate('/crm/invoices')
                }
              }}
              style={{ cursor: 'pointer' }}
              title="Open Invoices"
            >
              <div style={{ color: 'var(--muted, #64748b)', fontSize: '13px' }}>
                Invoices
              </div>
              <div style={{ fontSize: '28px', fontWeight: 700, marginTop: '7px' }}>
                {invoices.length}
              </div>
              <div style={{ color: 'var(--muted, #64748b)', fontSize: '13px', marginTop: '4px' }}>
                {openInvoices} open
              </div>
            </section>

            <section
              className="card"
              role="button"
              tabIndex={0}
              onClick={() => navigate('/crm/invoices')}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  navigate('/crm/invoices')
                }
              }}
              style={{ cursor: 'pointer' }}
              title="Open Invoices"
            >
              <div style={{ color: 'var(--muted, #64748b)', fontSize: '13px' }}>
                Invoiced
              </div>
              <div style={{ fontSize: '24px', fontWeight: 700, marginTop: '7px' }}>
                {money(invoiceTotal)}
              </div>
              <div style={{ color: 'var(--muted, #64748b)', fontSize: '13px', marginTop: '4px' }}>
                {money(amountPaid)} paid
              </div>
            </section>

            <section
              className="card"
              role="button"
              tabIndex={0}
              onClick={() => navigate('/crm/accounts-receivable')}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  navigate('/crm/accounts-receivable')
                }
              }}
              style={{ cursor: 'pointer' }}
              title="Open Accounts Receivable"
            >
              <div style={{ color: 'var(--muted, #64748b)', fontSize: '13px' }}>
                Balance due
              </div>
              <div style={{ fontSize: '24px', fontWeight: 700, marginTop: '7px' }}>
                {money(balanceDue)}
              </div>
              <div style={{ color: 'var(--muted, #64748b)', fontSize: '13px', marginTop: '4px' }}>
                Outstanding invoices
              </div>
            </section>

          </div>

          {/* BUSINESS + CONTACT */}

          <div
            style={{
              display: 'grid',
              gridTemplateColumns:
                'repeat(auto-fit, minmax(300px, 1fr))',
              gap: '20px',
              marginBottom: '20px',
            }}
          >

            <section className="card">

              <div className="card-header">
                <div>
                  <h2>Business Information</h2>
                  <p>Company and business details.</p>
                </div>
                <Building2 size={22} />
              </div>

              <div style={{ display: 'grid', gap: '18px' }}>

                <DetailRow
                  icon={Building2}
                  label="Company"
                  value={customer.company_name}
                />

                <DetailRow
                  icon={Globe}
                  label="Website"
                  value={customer.website}
                  link={customer.website}
                />

                <DetailRow
                  icon={MapPin}
                  label="Billing address"
                  value={[
                    customer.billing_address,
                    [
                      customer.city,
                      customer.state,
                      customer.zip,
                    ]
                      .filter(Boolean)
                      .join(', '),
                  ]
                    .filter(Boolean)
                    .join('\n')}
                />

              </div>

            </section>

            <section className="card">

              <div className="card-header">
                <div>
                  <h2>Contact Information</h2>
                  <p>Primary customer contact details.</p>
                </div>
                <Users size={22} />
              </div>

              <div style={{ display: 'grid', gap: '18px' }}>

                <DetailRow
                  icon={Phone}
                  label="Phone"
                  value={customer.phone}
                  link={
                    customer.phone
                      ? `tel:${customer.phone}`
                      : null
                  }
                />

                <DetailRow
                  icon={Mail}
                  label="Email"
                  value={customer.email}
                  link={
                    customer.email
                      ? `mailto:${customer.email}`
                      : null
                  }
                />

              </div>

            </section>

          
<div className="customer-email-grid-item">
    {!editing && (
            <EmailAddressManager
              customerId={customerId}
              legacyEmail={customer.email}
              onPrimaryChange={(email) => setCustomer((current) => current ? { ...current, email } : current)}
            />
          )}
  </div>
</div>

          {/* QUOTES */}

          <section className="card" style={{ marginBottom: '20px' }}>

            <div className="card-header">

              <div>
                <h2>Quotes</h2>
                <p>Every quote associated with this customer.</p>
              </div>

              <button
                className="secondary-button"
                type="button"
                onClick={() => navigate('/crm/quotes')}
              >
                <Plus size={16} />
                New Quote
              </button>

            </div>

            {activityLoading ? (
              <div className="loading-inline">
                Loading quotes…
              </div>
            ) : quotes.length === 0 ? (
              <div className="empty-state" style={{ margin: 0 }}>
                <div className="empty-icon">
                  <FileText size={20} />
                </div>
                <h3>No quotes yet</h3>
                <p>This customer does not have any quotes yet.</p>
              </div>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Quote</th>
                      <th>Title</th>
                      <th>Status</th>
                      <th>Total</th>
                      <th>Valid until</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {quotes.map((quote) => (
                      <tr
                        key={quote.id}
                        onClick={() => navigate(`/crm/quotes/${quote.id}`)}
                        style={{ cursor: 'pointer' }}
                      >
                        <td>
                          <strong>
                            {quote.quote_number || 'Draft quote'}
                          </strong>
                        </td>
                        <td>{quote.title}</td>
                        <td><Status status={quote.status} /></td>
                        <td>{money(quote.total)}</td>
                        <td>{date(quote.valid_until)}</td>
                        <td><button className="secondary-button" type="button" onClick={(event) => { event.stopPropagation(); navigate(`/crm/quotes/${quote.id}`) }}>Open</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

          </section>

          {/* JOBS */}

          <section className="card" style={{ marginBottom: '20px' }}>

            <div className="card-header">

              <div>
                <h2>Jobs</h2>
                <p>Work scheduled or completed for this customer.</p>
              </div>

              <button
                className="secondary-button"
                type="button"
                onClick={() => navigate('/crm/jobs')}
              >
                <Plus size={16} />
                New Job
              </button>

            </div>

            {activityLoading ? (
              <div className="loading-inline">
                Loading jobs…
              </div>
            ) : jobs.length === 0 ? (
              <div className="empty-state" style={{ margin: 0 }}>
                <div className="empty-icon">
                  <BriefcaseBusiness size={20} />
                </div>
                <h3>No jobs yet</h3>
                <p>This customer does not have any jobs yet.</p>
              </div>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Job</th>
                      <th>Title</th>
                      <th>Status</th>
                      <th>Scheduled</th>
                      <th>Value</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {jobs.map((job) => (
                      <tr
                        key={job.id}
                        onClick={() => navigate(`/crm/jobs/${job.id}`)}
                        style={{ cursor: 'pointer' }}
                      >
                        <td>
                          <strong>
                            {job.job_number || 'Job'}
                          </strong>
                        </td>
                        <td>{job.title}</td>
                        <td><Status status={job.status} /></td>
                        <td>{date(job.scheduled_date)}</td>
                        <td>
                          {money(
                            Number(job.final_amount || 0) > 0
                              ? job.final_amount
                              : job.estimated_amount
                          )}
                        </td>
                        <td><button className="secondary-button" type="button" onClick={(event) => { event.stopPropagation(); navigate(`/crm/jobs/${job.id}`) }}>Open</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

          </section>

          {/* INVOICES */}

          <section className="card" style={{ marginBottom: '20px' }}>

            <div className="card-header">

              <div>
                <h2>Invoices</h2>
                <p>Billing history and outstanding balances.</p>
              </div>

              <button
                className="secondary-button"
                type="button"
                onClick={() => navigate('/crm/invoices')}
              >
                <Plus size={16} />
                New Invoice
              </button>

            </div>

            {activityLoading ? (
              <div className="loading-inline">
                Loading invoices…
              </div>
            ) : invoices.length === 0 ? (
              <div className="empty-state" style={{ margin: 0 }}>
                <div className="empty-icon">
                  <ReceiptText size={20} />
                </div>
                <h3>No invoices yet</h3>
                <p>This customer does not have any invoices yet.</p>
              </div>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Invoice</th>
                      <th>Status</th>
                      <th>Issue date</th>
                      <th>Due date</th>
                      <th>Total</th>
                      <th>Balance</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoices.map((invoice) => (
                      <tr
                        key={invoice.id}
                        onClick={() => navigate(`/crm/invoices/${invoice.id}`)}
                        style={{ cursor: 'pointer' }}
                      >
                        <td>
                          <strong>
                            {invoice.invoice_number || 'Draft invoice'}
                          </strong>
                        </td>
                        <td><Status status={invoice.status} /></td>
                        <td>{date(invoice.issue_date)}</td>
                        <td>{date(invoice.due_date)}</td>
                        <td>{money(invoice.total)}</td>
                        <td>
                          {money(
                            Math.max(
                              Number(invoice.total || 0) -
                              Number(invoice.amount_paid || 0),
                              0
                            )
                          )}
                        </td>
                        <td><button className="secondary-button" type="button" onClick={(event) => { event.stopPropagation(); navigate(`/crm/invoices/${invoice.id}`) }}>Open</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

          </section>

          {/* DOCUMENTS */}

          <section className="card" style={{ marginBottom: '20px' }}>
            <div className="card-header">
              <div>
                <h2>Documents</h2>
                <p>Files stored for this customer, including job-related documents.</p>
              </div>
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                <button className="secondary-button" type="button" onClick={() => navigate('/crm/documents')}>View all documents</button>
                <button className="secondary-button" type="button" onClick={() => navigate(`/crm/documents?customerId=${customerId}`)}><Plus size={16} /> Upload document</button>
              </div>
            </div>

            {activityLoading ? (
              <div className="loading-inline">Loading documents…</div>
            ) : documents.length === 0 ? (
              <div className="empty-state" style={{ margin: 0 }}>
                <div className="empty-icon"><FileText size={20} /></div>
                <h3>No documents yet</h3>
                <p>Upload customer files from the Documents section and they will appear here.</p>
              </div>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead><tr><th>Document</th><th>Job</th><th>Category</th><th>Size</th><th>Added</th><th></th></tr></thead>
                  <tbody>
                    {documents.map((document) => (
                      <tr key={document.id}>
                        <td><strong>{document.file_name}</strong>{document.notes && <div className="muted">{document.notes}</div>}</td>
                        <td>{document.jobs?.job_number || document.jobs?.title || '—'}</td>
                        <td><Status status={document.category.toLowerCase().replace(/\s+/g, '_')} /></td>
                        <td>{customerDocumentSize(document.file_size)}</td>
                        <td>{date(document.created_at)}</td>
                        <td>
                          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                            <button className="secondary-button" type="button" onClick={() => openCustomerDocument(document)}>Open</button>
                            <button className="text-button danger" type="button" onClick={() => deleteCustomerDocument(document)}>
                              <Trash2 size={14} /> Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* PAYMENT HISTORY */}

          <section className="card" style={{ marginBottom: '20px' }}>
            <div className="card-header">
              <div>
                <h2>Payment History</h2>
                <p>Recent payment transactions across this customer's invoices.</p>
              </div>
              <CreditCard size={22} />
            </div>

            {payments.length === 0 ? (
              <div className="empty-state" style={{ margin: 0 }}>
                <div className="empty-icon"><CreditCard size={20} /></div>
                <h3>No payments recorded</h3>
                <p>Payment transactions will appear here as invoices are paid.</p>
              </div>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Invoice</th>
                      <th>Method</th>
                      <th>Reference</th>
                      <th className="num">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map((payment) => (
                      <tr key={payment.id}>
                        <td>{date(payment.payment_date || payment.created_at)}</td>
                        <td>
                          <button className="table-link" type="button" onClick={() => navigate(`/crm/invoices/${payment.invoice_id}`)}>
                            {payment.invoices?.invoice_number || 'Invoice'}
                          </button>
                        </td>
                        <td>{paymentMethodLabel(payment.payment_method)}</td>
                        <td>{payment.reference_number || '—'}</td>
                        <td className="num"><strong>{money(payment.amount)}</strong></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* ACCOUNT NOTES */}

          <section className="card" style={{ marginBottom: '20px' }}>

            <div className="card-header">

              <div>
                <h2>Notes</h2>
                <p>Internal notes about this customer.</p>
              </div>

              <StickyNote size={22} />

            </div>

            <div
              style={{
                whiteSpace: 'pre-wrap',
                lineHeight: 1.7,
                color: customer.notes
                  ? 'inherit'
                  : 'var(--muted, #64748b)',
              }}
            >
              {customer.notes ||
                'No notes have been added for this customer.'}
            </div>

          </section>

          {/* ACTIVITY TIMELINE */}

          <CustomerActivityTimeline
            customer={customer}
            activities={activities}
            jobs={jobs}
            quotes={quotes}
            invoices={invoices}
            payments={payments}
            onSaved={loadCustomer}
          />

          {/* RECORD INFORMATION */}

          <div
            style={{
              marginTop: '20px',
              color: 'var(--muted, #64748b)',
              fontSize: '13px',
            }}
          >

            {customer.created_at && (
              <span>
                Customer created {date(customer.created_at)}
              </span>
            )}

            {customer.updated_at && (
              <span>
                {' · '}
                Last updated {date(customer.updated_at)}
              </span>
            )}

          </div>

        </>

      )}

    </div>
  )
}

/* =========================================================
   DETAIL ROW
========================================================= */

function DetailRow({
  icon: Icon,
  label,
  value,
  link,
}) {

  const DetailIcon = Icon || FileText

  const displayValue =
    value || 'Not provided'

  return (
    <div
      style={{
        display: 'flex',
        gap: '12px',
        alignItems: 'flex-start',
      }}
    >

      <div
        style={{
          width: '34px',
          height: '34px',
          minWidth: '34px',
          borderRadius: '9px',
          display: 'grid',
          placeItems: 'center',
          background:
            'rgba(15, 23, 42, 0.06)',
        }}
      >
        <DetailIcon size={17} />
      </div>

      <div
        style={{
          minWidth: 0,
        }}
      >

        <div
          style={{
            fontSize: '12px',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            marginBottom: '4px',
            opacity: 0.65,
          }}
        >
          {label}
        </div>

        {link && value ? (

          <a
            href={link}
            target={
              link.startsWith('http')
                ? '_blank'
                : undefined
            }
            rel={
              link.startsWith('http')
                ? 'noreferrer'
                : undefined
            }
            style={{
              whiteSpace: 'pre-line',
              wordBreak: 'break-word',
            }}
          >
            {displayValue}
          </a>

        ) : (

          <div
            style={{
              whiteSpace: 'pre-line',
              wordBreak: 'break-word',
            }}
          >
            {displayValue}
          </div>

        )}

      </div>

    </div>
  )
}


/* =========================================================
   QUOTES
========================================================= */

const quoteStatuses = [
  'draft',
  'sent',
  'accepted',
  'declined',
]

function blankQuoteItem() {
  return {
    id: `new-${Date.now()}-${Math.random()}`,
    service_id: '',
    description: '',
    quantity: '1',
    unit_price: '',
    unit_cost: '0',
  }
}

function calculateQuoteSubtotal(items) {
  return items.reduce((sum, item) => {
    const quantity = Number(item.quantity || 0)
    const unitPrice = Number(item.unit_price || 0)
    return sum + quantity * unitPrice
  }, 0)
}

function QuoteItemsEditor({ items, setItems, services, disabled = false }) {
  function updateItem(id, changes) {
    setItems((current) =>
      current.map((item) =>
        item.id === id ? { ...item, ...changes } : item
      )
    )
  }

  function selectService(item, serviceId) {
    const service = services.find((entry) => entry.id === serviceId)

    updateItem(item.id, {
      service_id: serviceId,
      description: service?.name || item.description,
      unit_price: service?.default_price ?? item.unit_price,
      unit_cost: service?.default_cost ?? item.unit_cost,
    })
  }

  function addItem() {
    setItems((current) => [...current, blankQuoteItem()])
  }

  function removeItem(id) {
    setItems((current) => current.filter((item) => item.id !== id))
  }

  return (
    <div>
      <div className="panel-header" style={{ marginBottom: '14px' }}>
        <div>
          <h3 style={{ margin: 0 }}>Line items</h3>
          <p style={{ marginBottom: 0 }}>
            Add services, quantities and pricing for this quote.
          </p>
        </div>

        <button
          type="button"
          className="secondary-button"
          onClick={addItem}
          disabled={disabled}
        >
          <Plus size={16} />
          Add item
        </button>
      </div>

      {items.length === 0 ? (
        <div
          style={{
            padding: '22px',
            border: '1px dashed rgba(15, 23, 42, 0.18)',
            borderRadius: '12px',
            textAlign: 'center',
            opacity: 0.75,
          }}
        >
          No line items yet. Add a service to build the quote pricing.
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '12px' }}>
          {items.map((item, index) => {
            const lineTotal = Number(item.quantity || 0) * Number(item.unit_price || 0)
            const lineCost = Number(item.quantity || 0) * Number(item.unit_cost || 0)

            return (
              <div
                key={item.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'minmax(160px, 1.1fr) minmax(180px, 1.5fr) 75px 115px 115px 120px 42px',
                  gap: '10px',
                  alignItems: 'end',
                  padding: '14px',
                  border: '1px solid rgba(15, 23, 42, 0.10)',
                  borderRadius: '12px',
                }}
              >
                <label>
                  Service
                  <select
                    value={item.service_id}
                    onChange={(e) => selectService(item, e.target.value)}
                    disabled={disabled}
                  >
                    <option value="">Custom / select service</option>
                    {services.map((service) => (
                      <option key={service.id} value={service.id}>
                        {service.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  Description
                  <input
                    value={item.description}
                    onChange={(e) => updateItem(item.id, { description: e.target.value })}
                    placeholder={`Item ${index + 1}`}
                    disabled={disabled}
                  />
                </label>

                <label>
                  Qty
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={item.quantity}
                    onChange={(e) => updateItem(item.id, { quantity: e.target.value })}
                    disabled={disabled}
                  />
                </label>

                <label>
                  Unit price
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={item.unit_price}
                    onChange={(e) => updateItem(item.id, { unit_price: e.target.value })}
                    placeholder="0.00"
                    disabled={disabled}
                  />
                </label>

                <label>
                  Unit cost
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={item.unit_cost}
                    onChange={(e) => updateItem(item.id, { unit_cost: e.target.value })}
                    placeholder="0.00"
                    disabled={disabled}
                  />
                </label>

                <div style={{ paddingBottom: '10px' }}>
                  <div style={{ fontSize: '12px', opacity: 0.65, marginBottom: '6px' }}>
                    Line total
                  </div>
                  <strong>{money(lineTotal)}</strong>
                </div>

                <button
                  type="button"
                  className="icon-button"
                  onClick={() => removeItem(item.id)}
                  disabled={disabled}
                  aria-label={`Remove item ${index + 1}`}
                  title="Remove item"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function QuoteTotals({ items, taxRate, setTaxRate, readOnly = false }) {
  const subtotal = calculateQuoteSubtotal(items)
  const cost = (items || []).reduce((sum, item) => sum + (Number(item.quantity || 0) * Number(item.unit_cost || 0)), 0)
  const grossProfit = subtotal - cost
  const grossMargin = subtotal > 0 ? (grossProfit / subtotal) * 100 : null
  const tax = subtotal * (Number(taxRate || 0) / 100)
  const total = subtotal + tax

  return (
    <div
      style={{
        maxWidth: '440px',
        marginLeft: 'auto',
        display: 'grid',
        gap: '12px',
      }}
    >
      <PriceRow label="Subtotal" value={money(subtotal)} />
      <PriceRow label="Projected cost" value={money(cost)} />
      <PriceRow label="Projected gross profit" value={money(grossProfit)} />
      <PriceRow label="Projected gross margin" value={grossMargin == null ? '—' : `${grossMargin.toFixed(1)}%`} />

      {!readOnly && (
        <label>
          Tax rate (%)
          <input
            type="number"
            min="0"
            step="0.01"
            value={taxRate}
            onChange={(e) => setTaxRate(e.target.value)}
            placeholder="0"
          />
        </label>
      )}

      <PriceRow label={`Tax${readOnly ? '' : ` (${Number(taxRate || 0).toFixed(2)}%)`}`} value={money(tax)} />

      <div
        style={{
          borderTop: '1px solid rgba(15, 23, 42, 0.12)',
          paddingTop: '14px',
          display: 'flex',
          justifyContent: 'space-between',
          gap: '20px',
          fontSize: '18px',
        }}
      >
        <strong>Total</strong>
        <strong>{money(total)}</strong>
      </div>
    </div>
  )
}

function normalizeQuoteItems(items) {
  return (items || []).map((item) => ({
    id: item.id || `new-${Date.now()}-${Math.random()}`,
    service_id: item.service_id || '',
    description: item.description || '',
    quantity: item.quantity ?? '1',
    unit_price: item.unit_price ?? '',
    unit_cost: item.unit_cost ?? '0',
  }))
}

function quotePayloadFromItems(items) {
  return items
    .filter((item) => item.description.trim())
    .map((item) => ({
      service_id: item.service_id || null,
      description: item.description.trim(),
      quantity: Number(item.quantity || 0),
      unit_price: Number(item.unit_price || 0),
      unit_cost: Number(item.unit_cost || 0),
      line_total: Number(item.quantity || 0) * Number(item.unit_price || 0),
    }))
}

function Quotes() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const opportunityId = searchParams.get('opportunityId') || ''
  const [quotes, setQuotes] = useState([])
  const [customers, setCustomers] = useState([])
  const [services, setServices] = useState([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)

  const emptyForm = {
    quote_number: '',
    customer_id: '',
    opportunity_id: '',
    title: '',
    scope_of_work: '',
    status: 'draft',
    valid_until: '',
    notes: '',
  }

  const [form, setForm] = useState(emptyForm)
  const [items, setItems] = useState([])
  const [taxRate, setTaxRate] = useState('0')

  async function load() {
    setLoading(true)
    setError('')

    const [quotesResult, customersResult, servicesResult] = await Promise.all([
      supabase
        .from('quotes')
        .select('*, customers(company_name)')
        .order('created_at', { ascending: false }),
      supabase
        .from('customers')
        .select('id, company_name')
        .order('company_name'),
      supabase
        .from('services')
        .select('id, name, description, active, unit, default_price, default_cost')
        .eq('active', true)
        .order('name'),
    ])

    if (quotesResult.error) setError(quotesResult.error.message)
    if (customersResult.error) setError(customersResult.error.message)
    if (servicesResult.error) setError(servicesResult.error.message)

    setQuotes(quotesResult.data || [])
    setCustomers(customersResult.data || [])
    setServices(servicesResult.data || [])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  useEffect(() => {
    if (!opportunityId) return

    let cancelled = false
    async function loadOpportunityContext() {
      const { data, error: opportunityError } = await supabase
        .from('opportunities')
        .select('id, opportunity_number, title, customer_id')
        .eq('id', opportunityId)
        .single()

      if (cancelled) return
      if (opportunityError) {
        setError(opportunityError.message)
        return
      }

      const year = new Date().getFullYear()
      const suffix = String(Date.now()).slice(-6)
      setForm({
        ...emptyForm,
        quote_number: `Q-${year}-${suffix}`,
        valid_until: defaultQuoteDate(),
        opportunity_id: data.id,
        customer_id: data.customer_id || '',
        title: data.title || '',
      })
      setItems([])
      setTaxRate('0')
      setError('')
      setShowForm(true)
    }

    loadOpportunityContext()
    return () => { cancelled = true }
  }, [opportunityId])

  function openNewQuote() {
    const year = new Date().getFullYear()
    const suffix = String(Date.now()).slice(-6)

    setForm({
      ...emptyForm,
      quote_number: `Q-${year}-${suffix}`,
      valid_until: defaultQuoteDate(),
    })
    setItems([])
    setTaxRate('0')
    setError('')
    setShowForm(true)
  }

  function closeForm() {
    if (!saving) {
      setShowForm(false)
      setForm(emptyForm)
      setItems([])
      setTaxRate('0')
      setError('')
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    setError('')

    const cleanItems = quotePayloadFromItems(items)
    const subtotal = cleanItems.reduce((sum, item) => sum + item.line_total, 0)
    const tax = subtotal * (Number(taxRate || 0) / 100)
    const total = subtotal + tax

    const payload = {
      quote_number: form.quote_number.trim() || null,
      customer_id: form.customer_id || null,
      opportunity_id: form.opportunity_id || null,
      title: form.title.trim(),
      scope_of_work: form.scope_of_work.trim() || null,
      status: form.status,
      subtotal,
      tax,
      total,
      valid_until: form.valid_until || null,
      notes: form.notes.trim() || null,
    }

    if (!payload.title) {
      setError('Quote title is required.')
      setSaving(false)
      return
    }

    if (items.some((item) => item.description.trim() && Number(item.quantity || 0) < 0)) {
      setError('Quantity cannot be negative.')
      setSaving(false)
      return
    }

    const { data, error: insertError } = await supabase
      .from('quotes')
      .insert(payload)
      .select('id')
      .single()

    if (insertError) {
      setError(insertError.message)
      setSaving(false)
      return
    }

    if (cleanItems.length) {
      const { error: itemsError } = await supabase
        .from('quote_items')
        .insert(
          cleanItems.map((item) => ({
            ...item,
            quote_id: data.id,
          }))
        )

      if (itemsError) {
        await supabase.from('quotes').delete().eq('id', data.id)
        setError(itemsError.message)
        setSaving(false)
        return
      }
    }

    setSaving(false)
    setShowForm(false)
    setForm(emptyForm)
    setItems([])
    setTaxRate('0')
    await load()

    await logCrmActivity({
      customer_id: payload.customer_id,
      quote_id: data?.id || null,
      activity_type: 'quote_created',
      subject: `Quote created: ${payload.title}`,
      body: payload.quote_number ? `Quote ${payload.quote_number} was created.` : 'A new quote was created.',
      activity_date: localNowIso(),
    })

    if (data?.id) {
      navigate(`/crm/quotes/${data.id}`)
    }
  }

  const filteredQuotes = quotes.filter((quote) => {
    const haystack = [
      quote.quote_number,
      quote.title,
      quote.customers?.company_name,
      quote.scope_of_work,
      quote.status,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()

    return haystack.includes(query.toLowerCase())
  })

  return (
    <>
      <PageHeader
        eyebrow="Sales"
        title="Quotes"
        description="Create and track customer quotes from one place."
        action={(
          <button className="primary-button" onClick={openNewQuote}>
            <Plus size={17} />
            New quote
          </button>
        )}
      />

      {error && !showForm && (
        <div className="error-box" style={{ marginBottom: '18px' }}>
          {error}
        </div>
      )}

      {showForm && (
        <section className="panel" style={{ marginBottom: '24px' }}>
          <div className="panel-header">
            <div>
              <h2>New quote</h2>
              <p>Build the quote from your active services.</p>
            </div>
            {form.opportunity_id && (
              <div className="status-pill">Linked to opportunity</div>
            )}

            <button
              className="icon-button"
              onClick={closeForm}
              type="button"
              aria-label="Close new quote form"
              disabled={saving}
            >
              <X size={18} />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="stack-form">
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                gap: '16px',
              }}
            >
              <label>
                Quote number
                <input
                  value={form.quote_number}
                  onChange={(e) => setForm({ ...form, quote_number: e.target.value })}
                  placeholder="Q-2026-0001"
                />
              </label>

              <label>
                Customer
                <select
                  value={form.customer_id}
                  onChange={(e) => setForm({ ...form, customer_id: e.target.value })}
                >
                  <option value="">Select customer</option>
                  {customers.map((customer) => (
                    <option key={customer.id} value={customer.id}>
                      {customer.company_name}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label>
              Quote title
              <input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="Network installation proposal"
                required
              />
            </label>

            <QuoteItemsEditor
              items={items}
              setItems={setItems}
              services={services}
              disabled={saving}
            />

            <QuoteTotals
              items={items}
              taxRate={taxRate}
              setTaxRate={setTaxRate}
            />

            <label>
              Scope of work
              <textarea
                value={form.scope_of_work}
                onChange={(e) => setForm({ ...form, scope_of_work: e.target.value })}
                placeholder="Describe the work, materials and deliverables included in this quote."
                rows={5}
              />
            </label>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                gap: '16px',
              }}
            >
              <label>
                Status
                <select
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value })}
                >
                  {quoteStatuses.map((status) => (
                    <option key={status} value={status}>
                      {capitalize(status)}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Valid until
                <input
                  type="date"
                  value={form.valid_until}
                  onChange={(e) => setForm({ ...form, valid_until: e.target.value })}
                />
              </label>
            </div>

            <label>
              Notes
              <textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Internal notes or customer-facing notes."
                rows={3}
              />
            </label>

            {error && <div className="error-box">{error}</div>}

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="secondary-button"
                onClick={closeForm}
                disabled={saving}
              >
                Cancel
              </button>

              <button type="submit" className="primary-button" disabled={saving}>
                {saving ? 'Creating…' : 'Create quote'}
              </button>
            </div>
          </form>
        </section>
      )}

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>All quotes</h2>
            <p>{quotes.length} quote{quotes.length === 1 ? '' : 's'} in the CRM.</p>
          </div>

          <div style={{ minWidth: '260px' }}>
            <div className="search-box">
              <Search size={17} />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search quotes…"
              />
            </div>
          </div>
        </div>

        {loading ? (
          <div className="empty-state"><p>Loading quotes…</p></div>
        ) : filteredQuotes.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Quote</th>
                  <th>Customer</th>
                  <th>Status</th>
                  <th>Total</th>
                  <th>Valid until</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {filteredQuotes.map((quote) => (
                  <tr
                    key={quote.id}
                    onClick={() => navigate(`/crm/quotes/${quote.id}`)}
                    style={{ cursor: 'pointer' }}
                  >
                    <td>
                      <strong>{quote.quote_number || 'Unnumbered'}</strong>
                      <span>{quote.title}</span>
                    </td>
                    <td>{quote.customers?.company_name || 'No customer assigned'}</td>
                    <td><Status status={quote.status || 'draft'} /></td>
                    <td>{money(quote.total)}</td>
                    <td>{date(quote.valid_until)}</td>
                    <td>{date(quote.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            title={query ? 'No matching quotes' : 'No quotes yet'}
            description={query ? 'Try a different search.' : 'Create your first quote to start the sales workflow.'}
          />
        )}
      </section>
    </>
  )
}


/* =========================================================
   QUOTE DETAIL
========================================================= */

function QuoteDetail() {
  const { quoteId } = useParams()
  const navigate = useNavigate()
  const [quote, setQuote] = useState(null)
  const [customers, setCustomers] = useState([])
  const [services, setServices] = useState([])
  const [items, setItems] = useState([])
  const [relatedJob, setRelatedJob] = useState(null)
  const [relatedProject, setRelatedProject] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState('')
  const [showEmailComposer, setShowEmailComposer] = useState(false)
  const [taxRate, setTaxRate] = useState('0')

  const [form, setForm] = useState({
    quote_number: '',
    customer_id: '',
    opportunity_id: '',
    title: '',
    scope_of_work: '',
    status: 'draft',
    valid_until: '',
    notes: '',
  })

  async function load() {
    setLoading(true)
    setError('')

    const [quoteResult, customersResult, servicesResult, itemsResult, jobResult, projectResult] = await Promise.all([
      supabase
        .from('quotes')
        .select('*, customers(company_name, email), opportunities(opportunity_number, title, stage)')
        .eq('id', quoteId)
        .single(),
      supabase
        .from('customers')
        .select('id, company_name')
        .order('company_name'),
      supabase
        .from('services')
        .select('id, name, description, active, unit, default_price, default_cost')
        .eq('active', true)
        .order('name'),
      supabase
        .from('quote_items')
        .select('id, quote_id, service_id, description, quantity, unit_price, unit_cost, line_total, line_cost, created_at')
        .eq('quote_id', quoteId)
        .order('created_at'),
      supabase
        .from('jobs')
        .select('id, job_number, title, status, scheduled_date, estimated_amount, final_amount')
        .eq('quote_id', quoteId)
        .maybeSingle(),
      supabase
        .from('projects')
        .select('id, project_number, name, status, start_date, target_date')
        .eq('quote_id', quoteId)
        .maybeSingle(),
    ])

    if (quoteResult.error) {
      setError(quoteResult.error.message)
      setQuote(null)
    } else {
      const nextQuote = quoteResult.data
      setQuote(nextQuote)
      setForm({
        quote_number: nextQuote.quote_number || '',
        customer_id: nextQuote.customer_id || '',
        opportunity_id: nextQuote.opportunity_id || '',
        title: nextQuote.title || '',
        scope_of_work: nextQuote.scope_of_work || '',
        status: nextQuote.status || 'draft',
        valid_until: nextQuote.valid_until || '',
        notes: nextQuote.notes || '',
      })
    }

    if (customersResult.error) setError(customersResult.error.message)
    if (servicesResult.error) setError(servicesResult.error.message)
    if (itemsResult.error) setError(itemsResult.error.message)
    if (jobResult.error) setError(jobResult.error.message)
    if (projectResult.error) setError((current) => current || projectResult.error.message)

    setCustomers(customersResult.data || [])
    setServices(servicesResult.data || [])
    setItems(normalizeQuoteItems(itemsResult.data || []))
    setRelatedJob(jobResult.data || null)
    setRelatedProject(projectResult.data || null)

    const subtotal = Number(quoteResult.data?.subtotal || 0)
    const storedTax = Number(quoteResult.data?.tax || 0)
    setTaxRate(subtotal > 0 ? ((storedTax / subtotal) * 100).toFixed(2) : '0')

    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [quoteId])

  function resetFormFromQuote() {
    setForm({
      quote_number: quote.quote_number || '',
      customer_id: quote.customer_id || '',
      opportunity_id: quote.opportunity_id || '',
      title: quote.title || '',
      scope_of_work: quote.scope_of_work || '',
      status: quote.status || 'draft',
      valid_until: quote.valid_until || '',
      notes: quote.notes || '',
    })
  }

  async function save() {
    setSaving(true)
    setError('')

    const cleanItems = quotePayloadFromItems(items)
    const subtotal = cleanItems.reduce((sum, item) => sum + item.line_total, 0)
    const tax = subtotal * (Number(taxRate || 0) / 100)
    const total = subtotal + tax

    const payload = {
      quote_number: form.quote_number.trim() || null,
      customer_id: form.customer_id || null,
      opportunity_id: form.opportunity_id || null,
      title: form.title.trim(),
      scope_of_work: form.scope_of_work.trim() || null,
      status: form.status,
      subtotal,
      tax,
      total,
      valid_until: form.valid_until || null,
      notes: form.notes.trim() || null,
    }

    if (!payload.title) {
      setError('Quote title is required.')
      setSaving(false)
      return
    }

    const { data, error: updateError } = await supabase
      .from('quotes')
      .update(payload)
      .eq('id', quoteId)
      .select('*, customers(company_name, email)')
      .single()

    if (updateError) {
      setError(updateError.message)
      setSaving(false)
      return
    }

    const { error: deleteItemsError } = await supabase
      .from('quote_items')
      .delete()
      .eq('quote_id', quoteId)

    if (deleteItemsError) {
      setError(deleteItemsError.message)
      setSaving(false)
      return
    }

    if (cleanItems.length) {
      const { error: insertItemsError } = await supabase
        .from('quote_items')
        .insert(cleanItems.map((item) => ({ ...item, quote_id: quoteId })))

      if (insertItemsError) {
        setError(insertItemsError.message)
        setSaving(false)
        return
      }
    }

    setQuote(data)
    setItems(normalizeQuoteItems(cleanItems.map((item) => ({ ...item, quote_id: quoteId }))))
    setForm({
      quote_number: data.quote_number || '',
      customer_id: data.customer_id || '',
      title: data.title || '',
      scope_of_work: data.scope_of_work || '',
      status: data.status || 'draft',
      valid_until: data.valid_until || '',
      notes: data.notes || '',
    })
    setEditing(false)
    setSaving(false)
  }

  async function updateStatus(status) {
    setError('')

    if (quote?.status === status) return

    const previousStatus = quote?.status || 'draft'

    const { data, error: updateError } = await supabase
      .from('quotes')
      .update({ status })
      .eq('id', quoteId)
      .select('*, customers(company_name, email)')
      .single()

    if (updateError) {
      setError(updateError.message)
      return
    }

    setQuote(data)
    setForm((current) => ({ ...current, status: data.status, opportunity_id: data.opportunity_id || current.opportunity_id || '' }))

    if (status === 'accepted' && data.opportunity_id) {
      const { data: opportunity, error: opportunityError } = await supabase
        .from('opportunities')
        .update({ stage: 'won', probability: 100, updated_at: localNowIso() })
        .eq('id', data.opportunity_id)
        .select('id, customer_id, lead_id, title')
        .single()

      if (!opportunityError && opportunity) {
        await logCrmActivity({
          customer_id: opportunity.customer_id,
          lead_id: opportunity.lead_id,
          opportunity_id: opportunity.id,
          quote_id: data.id,
          activity_type: 'opportunity_stage',
          subject: `Opportunity won: ${opportunity.title}`,
          body: `Opportunity moved to won because ${data.quote_number || 'the quote'} was accepted.`,
          activity_date: localNowIso(),
        })
      }
    }

    await logCrmActivity({
      customer_id: data.customer_id,
      quote_id: data.id,
      activity_type: `quote_${status}`,
      subject: `Quote status changed: ${data.title}`,
      body: data.quote_number
        ? `Quote ${data.quote_number} changed from ${previousStatus} to ${status}.`
        : `Quote status changed from ${previousStatus} to ${status}.`,
      activity_date: localNowIso(),
    })
  }

  async function createJobFromQuote() {
    if (quote.status !== 'accepted') {
      setError('Only accepted quotes can be converted into a job.')
      return
    }

    if (!quote.customer_id) {
      setError('This quote needs a customer before it can become a job.')
      return
    }

    setError('')

    const { data: existingJob, error: existingError } = await supabase
      .from('jobs')
      .select('id')
      .eq('quote_id', quoteId)
      .maybeSingle()

    if (existingError) {
      setError(existingError.message)
      return
    }

    if (existingJob?.id) {
      navigate(`/crm/jobs/${existingJob.id}`)
      return
    }

    // Project-billing services create a project container first; the operational
    // job is then linked to that project.
    let projectId = relatedProject?.id || null
    let projectNumber = relatedProject?.project_number || null

    if (!projectId) {
      const { data: projectItems, error: projectItemsError } = await supabase
        .from('quote_items')
        .select('id, services(billing_model)')
        .eq('quote_id', quoteId)

      if (projectItemsError) {
        setError(projectItemsError.message)
        return
      }

      const isProjectQuote = (projectItems || []).some((item) => item.services?.billing_model === 'project')

      if (isProjectQuote) {
        const { data: project, error: projectError } = await supabase
          .from('projects')
          .insert({
            customer_id: quote.customer_id,
            opportunity_id: quote.opportunity_id || null,
            quote_id: quote.id,
            name: quote.title,
            description: quote.scope_of_work || null,
            status: 'planning',
            estimated_revenue: Number(quote.total || 0),
            estimated_cost: (items || []).reduce((sum, item) => sum + Number(item.line_cost || 0), 0),
            notes: quote.notes || null,
          })
          .select('id, project_number')
          .single()

        if (projectError) {
          setError(projectError.message)
          return
        }

        projectId = project.id
        projectNumber = project.project_number
        setRelatedProject({ id: project.id, project_number: project.project_number, name: quote.title, status: 'planning' })

        await logCrmActivity({
          customer_id: quote.customer_id,
          quote_id: quote.id,
          opportunity_id: quote.opportunity_id || null,
          activity_type: 'project_created',
          subject: `Project created from quote: ${quote.title}`,
          body: `Project ${project.project_number} was created from ${quote.quote_number || 'the accepted quote'}.`,
          activity_date: localNowIso(),
        })
      }
    }

    const jobNumber = defaultJobNumber()
    const { data, error: insertError } = await supabase
      .from('jobs')
      .insert({
        job_number: jobNumber,
        customer_id: quote.customer_id,
        quote_id: quote.id,
        project_id: projectId,
        title: quote.title,
        scope_of_work: quote.scope_of_work || null,
        status: 'scheduled',
        estimated_amount: Number(quote.total || 0),
        final_amount: 0,
        notes: quote.notes || null,
      })
      .select('id')
      .single()

    if (insertError) {
      setError(insertError.message)
      return
    }

    setRelatedJob({
      id: data.id,
      job_number: jobNumber,
      title: quote.title,
      status: 'scheduled',
      scheduled_date: null,
      estimated_amount: Number(quote.total || 0),
      final_amount: 0,
    })

    await logCrmActivity({
      customer_id: quote.customer_id,
      quote_id: quote.id,
      job_id: data.id,
      activity_type: 'job_created',
      subject: `Job created from quote: ${quote.title}`,
      body: projectNumber
        ? `Job ${jobNumber} was created from ${quote.quote_number || 'the accepted quote'} and linked to project ${projectNumber}.`
        : `Job ${jobNumber} was created from ${quote.quote_number || 'the accepted quote'}.`,
      activity_date: localNowIso(),
    })

    navigate(`/crm/jobs/${data.id}`)
  }

  async function removeQuote() {
    const confirmed = window.confirm('Delete this quote? This cannot be undone.')
    if (!confirmed) return

    setDeleting(true)
    setError('')

    const { error: deleteError } = await supabase
      .from('quotes')
      .delete()
      .eq('id', quoteId)

    if (deleteError) {
      setError(deleteError.message)
      setDeleting(false)
      return
    }

    navigate('/crm/quotes')
  }

  if (loading) {
    return <div className="empty-state"><p>Loading quote…</p></div>
  }

  if (!quote) {
    return (
      <>
        <button className="back-button" onClick={() => navigate('/crm/quotes')}>
          <ArrowLeft size={17} />
          Back to quotes
        </button>
        <div className="empty-state">
          <h3>Quote not found</h3>
          <p>{error || 'This quote may have been deleted.'}</p>
        </div>
      </>
    )
  }

  const customerName = quote.customers?.company_name || 'No customer assigned'
  const displayedSubtotal = calculateQuoteSubtotal(items)
  const displayedTax = displayedSubtotal * (Number(taxRate || 0) / 100)
  const displayedTotal = displayedSubtotal + displayedTax

  const liveTotal = Number(form.total || 0)
  const liveAmountPaid = Number(form.amount_paid || 0)
  const liveBalanceDue = Math.max(liveTotal - liveAmountPaid, 0)
  const liveInvoiceStatus = form.status === 'void'
    ? 'void'
    : (liveAmountPaid >= liveTotal && liveTotal > 0)
      ? 'paid'
      : liveAmountPaid > 0
        ? 'partial'
        : ['paid', 'partial'].includes(form.status)
          ? 'sent'
          : form.status

  return (
    <>
      <div style={{ marginBottom: '18px' }}>
        <button className="back-button" onClick={() => navigate('/crm/quotes')}>
          <ArrowLeft size={17} />
          Back to quotes
        </button>
      </div>

      <PageHeader
        eyebrow="Quote"
        title={quote.quote_number || 'Quote'}
        description={quote.title}
        action={(
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            {!editing && (
              <button className="secondary-button" onClick={() => navigate(`/crm/quotes/${quoteId}/print`)}>
                <Printer size={16} />
                Print / PDF
              </button>
            )}
            {!editing && (
              <button
                className="secondary-button"
                onClick={() => setShowEmailComposer(true)}
              >
                <Mail size={16} />
                Send Email
              </button>
            )}
            {!editing && (
              <button className="secondary-button" onClick={() => setEditing(true)}>
                <Pencil size={16} />
                Edit
              </button>
            )}
            {!editing && quote.status !== 'accepted' && quote.status !== 'declined' && (
              <button className="primary-button" onClick={() => updateStatus('accepted')}>
                Accept quote
              </button>
            )}
            {!editing && quote.status === 'sent' && (
              <button className="secondary-button" onClick={() => updateStatus('declined')}>
                Decline quote
              </button>
            )}
            {!editing && quote.status === 'accepted' && !relatedJob && (
              <button className="primary-button" onClick={createJobFromQuote}>
                <BriefcaseBusiness size={16} />
                Create job
              </button>
            )}
            {!editing && relatedJob && (
              <button className="secondary-button" onClick={() => navigate(`/crm/jobs/${relatedJob.id}`)}>
                <BriefcaseBusiness size={16} />
                Open job
              </button>
            )}
            <button className="danger-button" onClick={removeQuote} disabled={deleting}>
              <Trash2 size={16} />
              {deleting ? 'Deleting…' : 'Delete'}
            </button>
          </div>
        )}
      />

      {error && <div className="error-box" style={{ marginBottom: '18px' }}>{error}</div>}

      {showEmailComposer && (
        <EmailComposer
          to={quote.customers?.email}
          customerId={quote.customer_id}
          quoteId={quote.id}
          onCancel={() => setShowEmailComposer(false)}
          onSent={() => setShowEmailComposer(false)}
        />
      )}

      {relatedProject && (
        <section className="panel" style={{ marginBottom: '18px' }}>
          <div className="panel-header">
            <div>
              <h2>Project</h2>
              <p>{relatedProject.project_number || 'Project'} · {relatedProject.name || quote.title}</p>
            </div>
            <button className="secondary-button" type="button" onClick={() => navigate(`/crm/projects`)}>
              <BriefcaseBusiness size={16} />
              Open projects
            </button>
          </div>
          <div className="muted">Status: {capitalize(relatedProject.status || 'planning')}</div>
        </section>
      )}

      {quote.opportunities && (
        <section className="panel" style={{ marginBottom: '18px' }}>
          <div className="panel-header">
            <div>
              <h2>Opportunity</h2>
              <p>{quote.opportunities.title}</p>
            </div>
            <button className="secondary-button" type="button" onClick={() => navigate(`/crm/opportunities/${quote.opportunity_id}`)}>
              <Target size={16} />
              Open opportunity
            </button>
          </div>
          <div className="muted">
            {quote.opportunities.opportunity_number || 'Opportunity'} · {capitalize(quote.opportunities.stage || 'new')}
          </div>
        </section>
      )}

      {editing ? (
        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>Edit quote</h2>
              <p>Update the quote details, services and pricing.</p>
            </div>
          </div>

          <form
            className="stack-form"
            onSubmit={(e) => {
              e.preventDefault()
              save()
            }}
          >
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                gap: '16px',
              }}
            >
              <label>
                Quote number
                <input
                  value={form.quote_number}
                  onChange={(e) => setForm({ ...form, quote_number: e.target.value })}
                />
              </label>

              <label>
                Customer
                <select
                  value={form.customer_id}
                  onChange={(e) => setForm({ ...form, customer_id: e.target.value })}
                >
                  <option value="">No customer assigned</option>
                  {customers.map((customer) => (
                    <option key={customer.id} value={customer.id}>
                      {customer.company_name}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label>
              Quote title
              <input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                required
              />
            </label>

            <QuoteItemsEditor
              items={items}
              setItems={setItems}
              services={services}
              disabled={saving}
            />

            <QuoteTotals
              items={items}
              taxRate={taxRate}
              setTaxRate={setTaxRate}
            />

            <label>
              Scope of work
              <textarea
                value={form.scope_of_work}
                onChange={(e) => setForm({ ...form, scope_of_work: e.target.value })}
                rows={6}
              />
            </label>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                gap: '16px',
              }}
            >
              <label>
                Status
                <select
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value })}
                >
                  {quoteStatuses.map((status) => (
                    <option key={status} value={status}>
                      {capitalize(status)}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Valid until
                <input
                  type="date"
                  value={form.valid_until}
                  onChange={(e) => setForm({ ...form, valid_until: e.target.value })}
                />
              </label>
            </div>

            <label>
              Notes
              <textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                rows={4}
              />
            </label>

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="secondary-button"
                onClick={() => {
                  setEditing(false)
                  setError('')
                  resetFormFromQuote()
                  load()
                }}
                disabled={saving}
              >
                Cancel
              </button>
              <button type="submit" className="primary-button" disabled={saving}>
                {saving ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </form>
        </section>
      ) : (
        <div style={{ display: 'grid', gap: '20px' }}>
          <section className="panel">
            <div className="panel-header">
              <div>
                <h2>Quote overview</h2>
                <p>Customer and quote status.</p>
              </div>
              <Status status={quote.status || 'draft'} />
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                gap: '20px',
              }}
            >
              <DetailRow
                icon={Building2}
                label="Customer"
                value={customerName}
                link={quote.customer_id ? `/crm/customers/${quote.customer_id}` : undefined}
              />
              <DetailRow
                icon={FileText}
                label="Quote number"
                value={quote.quote_number || 'Not assigned'}
              />
              <DetailRow
                icon={CalendarClock}
                label="Valid until"
                value={date(quote.valid_until)}
              />
            </div>
          </section>

          <section className="panel">
            <div className="panel-header">
              <div>
                <h2>Line items</h2>
                <p>Services and pricing included in this quote.</p>
              </div>
            </div>

            {items.length ? (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Description</th>
                      <th>Qty</th>
                      <th>Unit price</th>
                      <th>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item) => (
                      <tr key={item.id}>
                        <td>{item.description}</td>
                        <td>{item.quantity}</td>
                        <td>{money(item.unit_price)}</td>
                        <td>{money(Number(item.quantity || 0) * Number(item.unit_price || 0))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState
                title="No line items"
                description="This quote does not have any service items yet."
              />
            )}
          </section>

          <section className="panel">
            <div className="panel-header">
              <div>
                <h2>Scope of work</h2>
                <p>What this quote covers.</p>
              </div>
            </div>
            <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>
              {quote.scope_of_work || 'No scope of work has been added yet.'}
            </div>
          </section>

          <section className="panel">
            <div className="panel-header">
              <div>
                <h2>Pricing</h2>
                <p>Calculated from the quote line items.</p>
              </div>
            </div>

            <div
              style={{
                maxWidth: '420px',
                marginLeft: 'auto',
                display: 'grid',
                gap: '12px',
              }}
            >
              <PriceRow label="Subtotal" value={money(displayedSubtotal)} />
              <PriceRow label={`Tax (${Number(taxRate || 0).toFixed(2)}%)`} value={money(displayedTax)} />
              <div
                style={{
                  borderTop: '1px solid rgba(15, 23, 42, 0.12)',
                  paddingTop: '14px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: '20px',
                  fontSize: '18px',
                }}
              >
                <strong>Total</strong>
                <strong>{money(displayedTotal)}</strong>
              </div>
            </div>
          </section>

          <section className="panel">
            <div className="panel-header">
              <div>
                <h2>Job</h2>
                <p>Work created from this quote.</p>
              </div>
              {relatedJob && (
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => navigate(`/crm/jobs/${relatedJob.id}`)}
                >
                  Open job
                  <ChevronRight size={16} />
                </button>
              )}
            </div>

            {relatedJob ? (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
                  gap: '20px',
                }}
              >
                <DetailRow icon={BriefcaseBusiness} label="Job number" value={relatedJob.job_number || 'Job'} />
                <DetailRow icon={FileText} label="Title" value={relatedJob.title || 'Untitled job'} />
                <DetailRow icon={CalendarClock} label="Scheduled" value={date(relatedJob.scheduled_date)} />
                <DetailRow icon={CircleDollarSign} label="Value" value={money(Number(relatedJob.final_amount || 0) || Number(relatedJob.estimated_amount || 0))} />
              </div>
            ) : (
              <div>
                <p style={{ margin: 0, opacity: 0.7 }}>No job has been created from this quote yet.</p>
                {quote.status === 'accepted' && (
                  <button
                    type="button"
                    className="primary-button"
                    style={{ marginTop: '14px' }}
                    onClick={createJobFromQuote}
                  >
                    <BriefcaseBusiness size={16} />
                    Create job from quote
                  </button>
                )}
              </div>
            )}
          </section>

          <section className="panel">
            <div className="panel-header">
              <div>
                <h2>Quote status</h2>
                <p>Move the quote through the sales process.</p>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              {quoteStatuses.map((status) => (
                <button
                  key={status}
                  type="button"
                  className={quote.status === status ? 'primary-button' : 'secondary-button'}
                  onClick={() => updateStatus(status)}
                >
                  {capitalize(status)}
                </button>
              ))}
            </div>
          </section>

          <section className="panel">
            <div className="panel-header">
              <div>
                <h2>Notes</h2>
                <p>Additional quote information.</p>
              </div>
            </div>

            <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>
              {quote.notes || 'No notes added.'}
            </div>

            <div
              style={{
                marginTop: '18px',
                paddingTop: '14px',
                borderTop: '1px solid rgba(15, 23, 42, 0.08)',
                fontSize: '13px',
                opacity: 0.65,
              }}
            >
              Created {date(quote.created_at)}
            </div>
          </section>
        </div>
      )}
    </>
  )
}


function PriceRow({ label, value }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        gap: '20px',
      }}
    >
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}


function defaultQuoteDate() {
  const value = new Date()
  value.setDate(value.getDate() + 30)

  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}


function capitalize(value) {
  return value
    ? value.charAt(0).toUpperCase() + value.slice(1)
    : ''
}


/* =========================================================
   JOBS
========================================================= */

const jobStatuses = [
  'scheduled',
  'in_progress',
  'completed',
  'cancelled',
]

function defaultJobNumber() {
  const year = new Date().getFullYear()
  const suffix = String(Date.now()).slice(-6)
  return `JOB-${year}-${suffix}`
}

function formatTime(value) {
  if (!value) return ''

  const parts = value.split(':')
  const hour = Number(parts[0])
  const minute = parts[1] || '00'
  const suffix = hour >= 12 ? 'PM' : 'AM'
  const displayHour = hour % 12 || 12

  return `${displayHour}:${minute} ${suffix}`
}

function jobScheduleLabel(job) {
  if (!job.scheduled_date) return 'Not scheduled'

  const datePart = date(job.scheduled_date)
  const start = formatTime(job.scheduled_start)
  const end = formatTime(job.scheduled_end)

  if (start && end) return `${datePart} · ${start}–${end}`
  if (start) return `${datePart} · ${start}`
  return datePart
}

function Jobs() {
  const navigate = useNavigate()
  const [jobs, setJobs] = useState([])
  const [customers, setCustomers] = useState([])
  const [quotes, setQuotes] = useState([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)

  const emptyForm = {
    job_number: '',
    customer_id: '',
    quote_id: '',
    title: '',
    scope_of_work: '',
    status: 'scheduled',
    scheduled_date: '',
    scheduled_start: '',
    scheduled_end: '',
    estimated_amount: '',
    final_amount: '',
    notes: '',
  }

  const [form, setForm] = useState(emptyForm)

  async function load() {
    setLoading(true)
    setError('')

    const [jobsResult, customersResult, quotesResult] = await Promise.all([
      supabase
        .from('jobs')
        .select('*, customers(company_name), quotes(quote_number, title)')
        .order('scheduled_date', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: false }),
      supabase
        .from('customers')
        .select('id, company_name')
        .order('company_name'),
      supabase
        .from('quotes')
        .select('id, quote_number, title, customer_id, total, status')
        .order('created_at', { ascending: false }),
    ])

    if (jobsResult.error) setError(jobsResult.error.message)
    if (customersResult.error) setError(customersResult.error.message)
    if (quotesResult.error) setError(quotesResult.error.message)

    setJobs(jobsResult.data || [])
    setCustomers(customersResult.data || [])
    setQuotes(quotesResult.data || [])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  function openNewJob(prefill = {}) {
    setForm({
      ...emptyForm,
      job_number: defaultJobNumber(),
      ...prefill,
    })
    setError('')
    setShowForm(true)
  }

  function closeForm() {
    if (!saving) {
      setShowForm(false)
      setForm(emptyForm)
      setError('')
    }
  }

  function applyQuote(quoteId) {
    const quote = quotes.find((item) => item.id === quoteId)

    if (!quote) {
      setForm((current) => ({ ...current, quote_id: quoteId }))
      return
    }

    setForm((current) => ({
      ...current,
      quote_id: quoteId,
      customer_id: quote.customer_id || current.customer_id,
      title: current.title || quote.title || '',
      estimated_amount: quote.total ?? current.estimated_amount,
    }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    setError('')

    const payload = {
      job_number: form.job_number.trim() || null,
      customer_id: form.customer_id,
      quote_id: form.quote_id || null,
      title: form.title.trim(),
      scope_of_work: form.scope_of_work.trim() || null,
      status: form.status,
      scheduled_date: form.scheduled_date || null,
      scheduled_start: form.scheduled_start || null,
      scheduled_end: form.scheduled_end || null,
      estimated_amount: form.estimated_amount === '' ? 0 : Number(form.estimated_amount),
      final_amount: form.final_amount === '' ? 0 : Number(form.final_amount),
      notes: form.notes.trim() || null,
    }

    if (!payload.customer_id) {
      setError('Customer is required.')
      setSaving(false)
      return
    }

    if (!payload.title) {
      setError('Job title is required.')
      setSaving(false)
      return
    }

    if (payload.scheduled_start && payload.scheduled_end && payload.scheduled_end <= payload.scheduled_start) {
      setError('Scheduled end time must be later than the start time.')
      setSaving(false)
      return
    }

    if (payload.estimated_amount < 0 || payload.final_amount < 0) {
      setError('Amounts cannot be negative.')
      setSaving(false)
      return
    }

    const { data, error: insertError } = await supabase
      .from('jobs')
      .insert(payload)
      .select('id')
      .single()

    if (insertError) {
      setError(insertError.message)
      setSaving(false)
      return
    }

    setSaving(false)
    setShowForm(false)
    setForm(emptyForm)
    await load()

    await logCrmActivity({
      customer_id: payload.customer_id,
      quote_id: payload.quote_id,
      job_id: data?.id || null,
      activity_type: 'job_created',
      subject: `Job created: ${payload.title}`,
      body: payload.job_number ? `Job ${payload.job_number} was created.` : 'A new job was created.',
      activity_date: localNowIso(),
    })

    if (data?.id) {
      navigate(`/crm/jobs/${data.id}`)
    }
  }

  const filteredJobs = jobs.filter((job) => {
    const haystack = [
      job.job_number,
      job.title,
      job.customers?.company_name,
      job.quotes?.quote_number,
      job.status,
      job.scope_of_work,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()

    return haystack.includes(query.toLowerCase())
  })

  return (
    <>
      <PageHeader
        eyebrow="Operations"
        title="Jobs"
        description="Schedule and track the work QVB I.T. has sold."
        action={(
          <button className="primary-button" onClick={() => openNewJob()}>
            <Plus size={17} />
            New job
          </button>
        )}
      />

      {error && !showForm && (
        <div className="error-box" style={{ marginBottom: '18px' }}>
          {error}
        </div>
      )}

      {showForm && (
        <section className="panel" style={{ marginBottom: '24px' }}>
          <div className="panel-header">
            <div>
              <h2>New job</h2>
              <p>Create a job and optionally connect it to a quote.</p>
            </div>
            <button
              className="icon-button"
              onClick={closeForm}
              type="button"
              aria-label="Close new job form"
              disabled={saving}
            >
              <X size={18} />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="stack-form">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '16px' }}>
              <label>
                Job number
                <input
                  value={form.job_number}
                  onChange={(e) => setForm({ ...form, job_number: e.target.value })}
                  placeholder="JOB-2026-0001"
                />
              </label>

              <label>
                Customer
                <select
                  value={form.customer_id}
                  onChange={(e) => setForm({ ...form, customer_id: e.target.value })}
                  required
                >
                  <option value="">Select customer</option>
                  {customers.map((customer) => (
                    <option key={customer.id} value={customer.id}>
                      {customer.company_name}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '16px' }}>
              <label>
                Quote
                <select
                  value={form.quote_id}
                  onChange={(e) => applyQuote(e.target.value)}
                >
                  <option value="">No quote linked</option>
                  {quotes.map((quote) => (
                    <option key={quote.id} value={quote.id}>
                      {quote.quote_number || 'Quote'} · {quote.title}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Status
                <select
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value })}
                >
                  {jobStatuses.map((status) => (
                    <option key={status} value={status}>
                      {capitalize(status)}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label>
              Job title
              <input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="Install network drops"
                required
              />
            </label>

            <label>
              Scope of work
              <textarea
                value={form.scope_of_work}
                onChange={(e) => setForm({ ...form, scope_of_work: e.target.value })}
                placeholder="Describe the work to be completed."
                rows={5}
              />
            </label>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '16px' }}>
              <label>
                Scheduled date
                <input
                  type="date"
                  value={form.scheduled_date}
                  onChange={(e) => setForm({ ...form, scheduled_date: e.target.value })}
                />
              </label>

              <label>
                Start time
                <input
                  type="time"
                  value={form.scheduled_start}
                  onChange={(e) => setForm({ ...form, scheduled_start: e.target.value })}
                />
              </label>

              <label>
                End time
                <input
                  type="time"
                  value={form.scheduled_end}
                  onChange={(e) => setForm({ ...form, scheduled_end: e.target.value })}
                />
              </label>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '16px' }}>
              <label>
                Estimated amount
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.estimated_amount}
                  onChange={(e) => setForm({ ...form, estimated_amount: e.target.value })}
                  placeholder="0.00"
                />
              </label>

              <label>
                Final amount
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.final_amount}
                  onChange={(e) => setForm({ ...form, final_amount: e.target.value })}
                  placeholder="0.00"
                />
              </label>
            </div>

            <label>
              Notes
              <textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Internal job notes."
                rows={4}
              />
            </label>

            {error && <div className="error-box">{error}</div>}

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button type="button" className="secondary-button" onClick={closeForm} disabled={saving}>
                Cancel
              </button>
              <button type="submit" className="primary-button" disabled={saving}>
                {saving ? 'Creating…' : 'Create job'}
              </button>
            </div>
          </form>
        </section>
      )}

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>All jobs</h2>
            <p>{jobs.length} job{jobs.length === 1 ? '' : 's'} in the CRM.</p>
          </div>

          <div style={{ minWidth: '260px' }}>
            <div className="search-box">
              <Search size={17} />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search jobs…"
              />
            </div>
          </div>
        </div>

        {loading ? (
          <div className="empty-state"><p>Loading jobs…</p></div>
        ) : filteredJobs.length === 0 ? (
          <EmptyState
            title={query ? 'No matching jobs' : 'No jobs yet'}
            description={query ? 'Try a different search.' : 'Create your first job to start scheduling work.'}
          />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Job</th>
                  <th>Customer</th>
                  <th>Schedule</th>
                  <th>Status</th>
                  <th>Estimated</th>
                  <th>Final</th>
                </tr>
              </thead>
              <tbody>
                {filteredJobs.map((job) => (
                  <tr
                    key={job.id}
                    onClick={() => navigate(`/crm/jobs/${job.id}`)}
                    style={{ cursor: 'pointer' }}
                  >
                    <td>
                      <strong>{job.job_number || 'Job'}</strong>
                      <div style={{ fontSize: '13px', opacity: 0.7 }}>{job.title}</div>
                    </td>
                    <td>{job.customers?.company_name || '—'}</td>
                    <td>{jobScheduleLabel(job)}</td>
                    <td><Status status={job.status || 'scheduled'} /></td>
                    <td>{money(job.estimated_amount)}</td>
                    <td>{money(job.final_amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  )
}

function JobMaterials({ jobId }) {
  const [materials, setMaterials] = useState([])
  const [inventory, setInventory] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ inventory_item_id: '', description: '', quantity: '1', unit_cost: '', notes: '' })

  async function loadMaterials() {
    setLoading(true); setError('')
    const [m, i] = await Promise.all([
      supabase.from('job_materials').select('id, job_id, inventory_item_id, description, quantity, unit_cost, line_total, notes, created_at').eq('job_id', jobId).order('created_at', { ascending: true }),
      supabase.from('inventory_items').select('id, name, sku, unit, quantity, unit_cost, active').eq('active', true).order('name', { ascending: true }),
    ])
    if (m.error) setError(m.error.message); else setMaterials(m.data || [])
    if (i.error) setError((current) => current || i.error.message); else setInventory(i.data || [])
    setLoading(false)
  }
  useEffect(() => { loadMaterials() }, [jobId])

  function resetForm() { setForm({ inventory_item_id: '', description: '', quantity: '1', unit_cost: '', notes: '' }) }
  function selectInventoryItem(id) {
    const item=inventory.find(x=>x.id===id)
    setForm((current)=>({ ...current, inventory_item_id:id, description:item?.name || current.description, unit_cost:item ? String(item.unit_cost ?? 0) : current.unit_cost }))
  }

  async function addMaterial(e) {
    e.preventDefault(); setSaving(true); setError('')
    const quantity=Number(form.quantity || 0), unitCost=Number(form.unit_cost || 0)
    if (!form.description.trim()) { setError('Material description is required.'); setSaving(false); return }
    if (!Number.isFinite(quantity) || quantity<=0) { setError('Quantity must be greater than zero.'); setSaving(false); return }
    if (!Number.isFinite(unitCost) || unitCost<0) { setError('Unit cost cannot be negative.'); setSaving(false); return }
    const selected=inventory.find(x=>x.id===form.inventory_item_id)
    if (selected && quantity>Number(selected.quantity||0)) { setError(`Only ${Number(selected.quantity||0)} ${selected.unit||'units'} are currently in stock.`); setSaving(false); return }
    const { error: insertError }=await supabase.from('job_materials').insert({ job_id:jobId, inventory_item_id:form.inventory_item_id||null, description:form.description.trim(), quantity, unit_cost:unitCost, line_total:quantity*unitCost, notes:form.notes.trim()||null })
    if (insertError) { setError(insertError.message); setSaving(false); return }
    if (selected) {
      const { error: stockError }=await supabase.from('inventory_items').update({ quantity:Number(selected.quantity||0)-quantity, updated_at:localNowIso() }).eq('id', selected.id)
      if (stockError) setError(`Material was added to the job, but inventory could not be updated: ${stockError.message}`)
    }
    resetForm(); setShowForm(false); setSaving(false); await loadMaterials()
  }

  async function removeMaterial(material) {
    if (!window.confirm(`Remove ${material.description} from this job?`)) return
    setError('')
    const { error: deleteError }=await supabase.from('job_materials').delete().eq('id', material.id)
    if (deleteError) { setError(deleteError.message); return }
    if (material.inventory_item_id) {
      const { data:item }=await supabase.from('inventory_items').select('id, quantity').eq('id', material.inventory_item_id).maybeSingle()
      if (item) await supabase.from('inventory_items').update({ quantity:Number(item.quantity||0)+Number(material.quantity||0), updated_at:localNowIso() }).eq('id', item.id)
    }
    await loadMaterials()
  }

  const totalMaterialCost=materials.reduce((sum,m)=>sum+Number(m.line_total||0),0)
  return <section className="panel">
    <div className="panel-header"><div><h2>Job materials</h2><p>Materials used on this job and their actual cost.</p></div><button type="button" className="primary-button" onClick={()=>setShowForm(v=>!v)}><Plus size={16}/>{showForm?'Close':'Add material'}</button></div>
    {error && <div className="error-box" style={{ marginBottom:'16px' }}>{error}</div>}
    {showForm && <form className="stack-form" onSubmit={addMaterial} style={{ marginBottom:'20px', paddingBottom:'20px', borderBottom:'1px solid rgba(15, 23, 42, 0.1)' }}>
      <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr 1fr', gap:'16px' }}>
        <label>Inventory item<select value={form.inventory_item_id} onChange={e=>selectInventoryItem(e.target.value)}><option value="">Manual material / not from inventory</option>{inventory.map(item=><option key={item.id} value={item.id}>{item.name} · {Number(item.quantity||0)} {item.unit||'each'} in stock</option>)}</select></label>
        <label>Quantity<input type="number" min="0.01" step="0.01" value={form.quantity} onChange={e=>setForm({...form,quantity:e.target.value})} required/></label>
        <label>Unit cost<input type="number" min="0" step="0.01" value={form.unit_cost} onChange={e=>setForm({...form,unit_cost:e.target.value})} required/></label>
      </div>
      <label>Description<input value={form.description} onChange={e=>setForm({...form,description:e.target.value})} placeholder="Material used" required/></label>
      <label>Notes<textarea rows={3} value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})} placeholder="Optional installation or material notes"/></label>
      <div style={{ display:'flex', justifyContent:'flex-end', gap:'10px' }}><button type="button" className="secondary-button" onClick={()=>{resetForm();setShowForm(false)}} disabled={saving}>Cancel</button><button type="submit" className="primary-button" disabled={saving}>{saving?'Adding…':'Add material'}</button></div>
    </form>}
    {loading ? <div className="empty-state">Loading materials…</div> : materials.length===0 ? <div className="empty-state"><h3>No materials recorded</h3><p>Add materials used on this job to track its actual cost.</p></div> : <><div className="table-wrap"><table className="table"><thead><tr><th>Material</th><th>Quantity</th><th>Unit cost</th><th>Total cost</th><th></th></tr></thead><tbody>{materials.map(m=><tr key={m.id}><td><strong>{m.description}</strong>{m.notes&&<div className="muted">{m.notes}</div>}</td><td>{Number(m.quantity||0)}</td><td>{money(m.unit_cost)}</td><td>{money(m.line_total)}</td><td><button type="button" className="icon-button danger" title="Remove material" onClick={()=>removeMaterial(m)}><Trash2 size={16}/></button></td></tr>)}</tbody></table></div><div style={{ maxWidth:'360px', marginLeft:'auto', marginTop:'18px' }}><PriceRow label="Total material cost" value={money(totalMaterialCost)}/></div></>}
  </section>
}



function JobTimeEntries({ jobId }) {
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editingEntry, setEditingEntry] = useState(null)
  const [form, setForm] = useState({ technician_name: '', work_date: localTodayInputValue(), hours: '1', hourly_cost: '', notes: '' })

  async function loadEntries() {
    setLoading(true)
    setError('')
    const { data, error: fetchError } = await supabase
      .from('job_time_entries')
      .select('id, job_id, technician_name, work_date, hours, hourly_cost, notes, created_at')
      .eq('job_id', jobId)
      .order('work_date', { ascending: true })
      .order('created_at', { ascending: true })
    if (fetchError) setError(fetchError.message)
    else setEntries(data || [])
    setLoading(false)
  }

  useEffect(() => { loadEntries() }, [jobId])

  function resetForm() {
    setForm({ technician_name: '', work_date: localTodayInputValue(), hours: '1', hourly_cost: '', notes: '' })
    setEditingEntry(null)
  }

  function startEdit(entry) {
    setEditingEntry(entry)
    setForm({
      technician_name: entry.technician_name || '',
      work_date: entry.work_date || localTodayInputValue(),
      hours: String(entry.hours ?? '1'),
      hourly_cost: String(entry.hourly_cost ?? ''),
      notes: entry.notes || '',
    })
    setError('')
    setShowForm(true)
  }

  function cancelForm() {
    resetForm()
    setShowForm(false)
    setError('')
  }

  async function saveEntry(e) {
    e.preventDefault()
    setSaving(true)
    setError('')
    const hours = Number(form.hours || 0)
    const hourlyCost = Number(form.hourly_cost || 0)
    if (!form.technician_name.trim()) { setError('Technician name is required.'); setSaving(false); return }
    if (!form.work_date) { setError('Work date is required.'); setSaving(false); return }
    if (!Number.isFinite(hours) || hours <= 0) { setError('Hours must be greater than zero.'); setSaving(false); return }
    if (Math.round(hours * 2) !== hours * 2) { setError('Hours must be entered in 30-minute increments (0.5 hours).'); setSaving(false); return }
    if (!Number.isFinite(hourlyCost) || hourlyCost < 0) { setError('Hourly cost cannot be negative.'); setSaving(false); return }

    const payload = {
      technician_name: form.technician_name.trim(),
      work_date: form.work_date,
      hours,
      hourly_cost: hourlyCost,
      notes: form.notes.trim() || null,
    }

    const result = editingEntry
      ? await supabase.from('job_time_entries').update(payload).eq('id', editingEntry.id)
      : await supabase.from('job_time_entries').insert({ ...payload, job_id: jobId })

    if (result.error) { setError(result.error.message); setSaving(false); return }

    resetForm()
    setShowForm(false)
    setSaving(false)
    await loadEntries()
  }

  async function removeEntry(entry) {
    if (!window.confirm(`Remove ${entry.technician_name}'s ${Number(entry.hours || 0)} hour entry?`)) return
    setError('')
    const { error: deleteError } = await supabase.from('job_time_entries').delete().eq('id', entry.id)
    if (deleteError) setError(deleteError.message)
    else await loadEntries()
  }

  const totalHours = entries.reduce((sum, e) => sum + Number(e.hours || 0), 0)
  const totalLaborCost = entries.reduce((sum, e) => sum + Number(e.hours || 0) * Number(e.hourly_cost || 0), 0)

  return <section className="panel">
    <div className="panel-header">
      <div><h2>Labor & time</h2><p>Track technician hours and actual labor cost for this job.</p></div>
      <button type="button" className="primary-button" onClick={() => {
        if (showForm) cancelForm()
        else { resetForm(); setShowForm(true) }
      }}><Plus size={16} />{showForm ? 'Close' : 'Add time'}</button>
    </div>
    {error && <div className="error-box" style={{ marginBottom: '16px' }}>{error}</div>}
    {showForm && <form className="stack-form" onSubmit={saveEntry} style={{ marginBottom: '20px', paddingBottom: '20px', borderBottom: '1px solid rgba(15, 23, 42, 0.1)' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: '16px' }}>
        <label>Technician / employee<input value={form.technician_name} onChange={e => setForm({ ...form, technician_name: e.target.value })} placeholder="Name" required /></label>
        <label>Work date<input type="date" value={form.work_date} onChange={e => setForm({ ...form, work_date: e.target.value })} required /></label>
        <label>Hours<input type="number" min="0.5" step="0.5" value={form.hours} onChange={e => setForm({ ...form, hours: e.target.value })} required /></label>
        <label>Hourly cost<input type="number" min="0" step="0.01" value={form.hourly_cost} onChange={e => setForm({ ...form, hourly_cost: e.target.value })} placeholder="0.00" required /></label>
      </div>
      <label>Notes<textarea rows={3} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Optional work notes" /></label>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
        <button type="button" className="secondary-button" onClick={cancelForm} disabled={saving}>Cancel</button>
        <button type="submit" className="primary-button" disabled={saving}>{saving ? (editingEntry ? 'Saving…' : 'Adding…') : (editingEntry ? 'Save changes' : 'Add time')}</button>
      </div>
    </form>}
    {loading ? <div className="empty-state">Loading labor…</div> : entries.length === 0 ? <div className="empty-state"><h3>No labor recorded</h3><p>Add technician time to include labor in the job's actual cost.</p></div> : <>
      <div className="table-wrap"><table className="table"><thead><tr><th>Technician</th><th>Date</th><th>Hours</th><th>Hourly cost</th><th>Labor cost</th><th></th></tr></thead><tbody>{entries.map(e => <tr key={e.id}><td><strong>{e.technician_name}</strong>{e.notes && <div className="muted">{e.notes}</div>}</td><td>{date(e.work_date)}</td><td>{Number(e.hours || 0)}</td><td>{money(e.hourly_cost)}</td><td>{money(Number(e.hours || 0) * Number(e.hourly_cost || 0))}</td><td><div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}><button type="button" className="text-button" onClick={() => startEdit(e)}>Edit</button><button type="button" className="text-button danger" onClick={() => removeEntry(e)}>Delete</button></div></td></tr>)}</tbody></table></div>
      <div style={{ maxWidth: '420px', marginLeft: 'auto', marginTop: '18px' }}><PriceRow label="Total hours" value={`${totalHours.toFixed(2)} hrs`} /><PriceRow label="Total labor cost" value={money(totalLaborCost)} /></div>
    </>}
  </section>
}

function TimeTracking() {
  const [entries, setEntries] = useState([])
  const [jobs, setJobs] = useState([])
  const [technicians, setTechnicians] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editingEntry, setEditingEntry] = useState(null)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ job_id: '', technician_id: '', technician_name: '', work_date: localTodayInputValue(), hours: '1', hourly_cost: '', notes: '' })

  async function load() {
    setLoading(true); setError('')
    const [entriesResult, jobsResult, techniciansResult] = await Promise.all([
      supabase.from('job_time_entries').select('id, job_id, technician_id, technician_name, work_date, hours, hourly_cost, notes, jobs(job_number, title)').order('work_date', { ascending: false }).order('created_at', { ascending: false }),
      supabase.from('jobs').select('id, job_number, title').order('scheduled_date', { ascending: false, nullsFirst: false }).limit(500),
      supabase.from('technicians').select('id, display_name, hourly_cost, active').order('display_name'),
    ])
    if (entriesResult.error) setError(entriesResult.error.message); else setEntries(entriesResult.data || [])
    if (jobsResult.error) setError(current => current || jobsResult.error.message); else setJobs(jobsResult.data || [])
    if (techniciansResult.error) setError(current => current || techniciansResult.error.message); else setTechnicians(techniciansResult.data || [])
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  function resetForm() {
    setForm({ job_id: '', technician_id: '', technician_name: '', work_date: localTodayInputValue(), hours: '1', hourly_cost: '', notes: '' })
    setEditingEntry(null)
  }

  function startEdit(entry) {
    setEditingEntry(entry)
    setForm({
      job_id: entry.job_id || '',
      technician_id: entry.technician_id || '',
      technician_name: entry.technician_name || '',
      work_date: entry.work_date || localTodayInputValue(),
      hours: String(entry.hours ?? '1'),
      hourly_cost: String(entry.hourly_cost ?? ''),
      notes: entry.notes || '',
    })
    setError('')
    setShowForm(true)
  }

  function cancelForm() {
    resetForm()
    setShowForm(false)
    setError('')
  }

  function selectTechnician(technicianId) {
    const technician = technicians.find((item) => item.id === technicianId)
    setForm((current) => ({
      ...current,
      technician_id: technicianId,
      technician_name: technician?.display_name || current.technician_name,
      hourly_cost: technician?.hourly_cost ?? current.hourly_cost,
    }))
  }

  async function saveEntry(e) {
    e.preventDefault(); setSaving(true); setError('')
    const hours = Number(form.hours || 0), hourlyCost = Number(form.hourly_cost || 0)
    if (!form.job_id) { setError('Job is required.'); setSaving(false); return }
    if (!form.technician_name.trim()) { setError('Technician is required.'); setSaving(false); return }
    if (!form.work_date) { setError('Work date is required.'); setSaving(false); return }
    if (!Number.isFinite(hours) || hours <= 0) { setError('Hours must be greater than zero.'); setSaving(false); return }
    if (Math.round(hours * 2) !== hours * 2) { setError('Hours must be entered in 30-minute increments (0.5 hours).'); setSaving(false); return }
    if (!Number.isFinite(hourlyCost) || hourlyCost < 0) { setError('Hourly cost cannot be negative.'); setSaving(false); return }

    const payload = {
      job_id: form.job_id,
      technician_id: form.technician_id || null,
      technician_name: form.technician_name.trim(),
      work_date: form.work_date,
      hours,
      hourly_cost: hourlyCost,
      notes: form.notes.trim() || null,
    }

    const result = editingEntry
      ? await supabase.from('job_time_entries').update(payload).eq('id', editingEntry.id)
      : await supabase.from('job_time_entries').insert(payload)

    if (result.error) { setError(result.error.message); setSaving(false); return }
    resetForm(); setShowForm(false); setSaving(false); await load()
  }

  async function removeEntry(entry) {
    if (!window.confirm(`Remove this ${Number(entry.hours || 0)} hour entry?`)) return
    const { error: deleteError } = await supabase.from('job_time_entries').delete().eq('id', entry.id)
    if (deleteError) setError(deleteError.message); else await load()
  }

  const filtered = entries.filter(e => `${e.technician_name} ${e.jobs?.job_number || ''} ${e.jobs?.title || ''} ${e.notes || ''}`.toLowerCase().includes(search.toLowerCase()))
  const totalHours = filtered.reduce((sum, e) => sum + Number(e.hours || 0), 0)
  const totalCost = filtered.reduce((sum, e) => sum + Number(e.hours || 0) * Number(e.hourly_cost || 0), 0)

  return <>
    <PageHeader eyebrow="Operations" title="Time Tracking" description="Record technician time and monitor actual labor cost across jobs." action={<button className="primary-button" onClick={() => {
      if (showForm) cancelForm()
      else { resetForm(); setShowForm(true) }
    }}><Plus size={17} /> {showForm ? 'Close' : 'Add time'}</button>} />
    {error && <div className="error-box page-error">{error}</div>}
    {showForm && <section className="panel" style={{ marginBottom: '20px' }}><form className="stack-form" onSubmit={saveEntry}>
      <div className="form-grid-3">
        <label>Job<select value={form.job_id} onChange={e => setForm({ ...form, job_id: e.target.value })} required><option value="">Select job</option>{jobs.map(j => <option key={j.id} value={j.id}>{j.job_number || 'Job'} · {j.title}</option>)}</select></label>
        <label>Technician<select value={form.technician_id} onChange={e => selectTechnician(e.target.value)} required><option value="">Select technician</option>{technicians.filter(t => t.active || t.id === form.technician_id).map(t => <option key={t.id} value={t.id}>{t.display_name}</option>)}</select></label>
        <label>Date<input type="date" value={form.work_date} onChange={e => setForm({ ...form, work_date: e.target.value })} required /></label>
      </div>
      <div className="form-grid-3">
        <label>Hours<input type="number" min="0.5" step="0.5" value={form.hours} onChange={e => setForm({ ...form, hours: e.target.value })} required /></label>
        <label>Hourly cost<input type="number" min="0" step="0.01" value={form.hourly_cost} onChange={e => setForm({ ...form, hourly_cost: e.target.value })} placeholder="0.00" required /></label>
        <label>Technician name snapshot<input value={form.technician_name} onChange={e => setForm({ ...form, technician_name: e.target.value })} placeholder="Auto-filled from technician" required /></label>
      </div>
      <label>Notes<textarea rows={2} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Optional notes" /></label>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}><button type="button" className="secondary-button" onClick={cancelForm} disabled={saving}>Cancel</button><button type="submit" className="primary-button" disabled={saving}>{saving ? (editingEntry ? 'Saving…' : 'Adding…') : (editingEntry ? 'Save changes' : 'Add time')}</button></div>
    </form></section>}
    <div className="metric-grid"><div className="metric-card"><div className="metric-label"><Timer size={16} /> Hours shown</div><strong>{totalHours.toFixed(2)}</strong><span>Across filtered entries</span></div><div className="metric-card"><div className="metric-label"><CircleDollarSign size={16} /> Labor cost</div><strong>{money(totalCost)}</strong><span>Actual cost of filtered time</span></div></div>
    <section className="panel"><div className="toolbar"><div className="search-box"><Search size={17} /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search technician, job or notes…" /></div><button className="secondary-button" onClick={load}>Refresh</button></div>
      {loading ? <div className="loading-box">Loading time entries…</div> : filtered.length ? <div className="table-wrap"><table className="table"><thead><tr><th>Job</th><th>Technician</th><th>Date</th><th>Hours</th><th>Hourly cost</th><th>Labor cost</th><th></th></tr></thead><tbody>{filtered.map(e => <tr key={e.id}><td><strong>{e.jobs?.job_number || 'Job'}</strong><span>{e.jobs?.title || '—'}</span></td><td>{e.technician_name}</td><td>{date(e.work_date)}</td><td>{Number(e.hours || 0)}</td><td>{money(e.hourly_cost)}</td><td>{money(Number(e.hours || 0) * Number(e.hourly_cost || 0))}</td><td><div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}><button type="button" className="text-button" onClick={() => startEdit(e)}>Edit</button><button type="button" className="text-button danger" onClick={() => removeEntry(e)}>Delete</button></div></td></tr>)}</tbody></table></div> : <EmptyState title="No time entries" description={search ? 'Try a different search.' : 'Add technician time to start tracking labor costs.'} />}
    </section>
  </>
}
function SchedulingCalendar() {
  const navigate = useNavigate()
  const [month, setMonth] = useState(() => {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), 1)
  })
  const [jobs, setJobs] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedDate, setSelectedDate] = useState(() => localTodayInputValue())

  async function loadJobs() {
    setLoading(true)
    setError('')
    const { data, error: loadError } = await supabase
      .from('jobs')
      .select('id, job_number, title, status, scheduled_date, scheduled_start, scheduled_end, estimated_amount, final_amount, customer_id, customers(company_name)')
      .not('scheduled_date', 'is', null)
      .order('scheduled_date', { ascending: true })
      .order('scheduled_start', { ascending: true, nullsFirst: true })
      .limit(1000)

    if (loadError) {
      setError(loadError.message)
      setJobs([])
    } else {
      setJobs(data || [])
    }
    setLoading(false)
  }

  useEffect(() => {
    loadJobs()
  }, [])

  function pad(value) {
    return String(value).padStart(2, '0')
  }

  function toDateKey(year, monthIndex, day) {
    return `${year}-${pad(monthIndex + 1)}-${pad(day)}`
  }

  function formatTime(value) {
    if (!value) return ''
    const parts = String(value).split(':')
    const hour = Number(parts[0])
    const minute = parts[1] || '00'
    if (!Number.isFinite(hour)) return String(value)
    const suffix = hour >= 12 ? 'PM' : 'AM'
    const displayHour = hour % 12 || 12
    return `${displayHour}:${minute} ${suffix}`
  }

  function jobTime(job) {
    if (!job.scheduled_start) return 'Time TBD'
    const start = formatTime(job.scheduled_start)
    const end = job.scheduled_end ? `–${formatTime(job.scheduled_end)}` : ''
    return `${start}${end}`
  }

  function statusClass(status) {
    const value = String(status || '').toLowerCase()
    if (value === 'completed') return 'status-completed'
    if (value === 'cancelled' || value === 'canceled') return 'status-cancelled'
    if (value === 'in_progress' || value === 'in progress') return 'status-in-progress'
    return 'status-scheduled'
  }

  function goToToday() {
    const now = new Date()
    setMonth(new Date(now.getFullYear(), now.getMonth(), 1))
    setSelectedDate(localDateKey(now))
  }

  function changeMonth(delta) {
    setMonth(current => new Date(current.getFullYear(), current.getMonth() + delta, 1))
  }

  const year = month.getFullYear()
  const monthIndex = month.getMonth()
  const firstDay = new Date(year, monthIndex, 1).getDay()
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate()
  const previousMonthDays = new Date(year, monthIndex, 0).getDate()
  const cells = []
  const totalCells = Math.ceil((firstDay + daysInMonth) / 7) * 7

  for (let index = 0; index < totalCells; index += 1) {
    const dayNumber = index - firstDay + 1
    let cellDate
    let inMonth = true
    if (dayNumber < 1) {
      const day = previousMonthDays + dayNumber
      cellDate = new Date(year, monthIndex - 1, day)
      inMonth = false
    } else if (dayNumber > daysInMonth) {
      const day = dayNumber - daysInMonth
      cellDate = new Date(year, monthIndex + 1, day)
      inMonth = false
    } else {
      cellDate = new Date(year, monthIndex, dayNumber)
    }
    const key = toDateKey(cellDate.getFullYear(), cellDate.getMonth(), cellDate.getDate())
    cells.push({ key, day: cellDate.getDate(), inMonth })
  }

  const jobsByDate = jobs.reduce((map, job) => {
    if (!job.scheduled_date) return map
    if (!map[job.scheduled_date]) map[job.scheduled_date] = []
    map[job.scheduled_date].push(job)
    return map
  }, {})

  const selectedJobs = jobsByDate[selectedDate] || []
  const monthPrefix = `${year}-${pad(monthIndex + 1)}`
  const monthJobs = jobs.filter(job => String(job.scheduled_date || '').startsWith(monthPrefix))
    .sort((a, b) => String(a.scheduled_date).localeCompare(String(b.scheduled_date)) || String(a.scheduled_start || '').localeCompare(String(b.scheduled_start || '')))

  const monthLabel = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(month)
  const todayKey = localTodayInputValue()

  return (
    <div className="page">
      <PageHeader
        eyebrow="Operations"
        title="Scheduling Calendar"
        description="See scheduled jobs by day and jump directly into job details."
        action={(
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <button className="secondary-button" onClick={goToToday}>Today</button>
            <button className="secondary-button" onClick={loadJobs}>Refresh</button>
          </div>
        )}
      />

      {error && <div className="error-box page-error">{error}</div>}

      <section className="panel" style={{ marginBottom: '20px' }}>
        <div className="panel-header">
          <div>
            <h2>{monthLabel}</h2>
            <p>{monthJobs.length} scheduled job{monthJobs.length === 1 ? '' : 's'} this month.</p>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="secondary-button" onClick={() => changeMonth(-1)} aria-label="Previous month">‹</button>
            <button className="secondary-button" onClick={() => changeMonth(1)} aria-label="Next month">›</button>
          </div>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <div style={{ minWidth: '900px', border: '1px solid rgba(15, 23, 42, 0.10)', borderRadius: '12px', overflow: 'hidden' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', background: '#f8fafc', borderBottom: '1px solid rgba(15, 23, 42, 0.10)' }}>
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                <div key={day} style={{ padding: '10px 12px', fontSize: '12px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>{day}</div>
              ))}
            </div>

            {Array.from({ length: totalCells / 7 }, (_, week) => (
              <div key={week} style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))' }}>
                {cells.slice(week * 7, week * 7 + 7).map(cell => {
                  const dayJobs = jobsByDate[cell.key] || []
                  const isSelected = selectedDate === cell.key
                  const isToday = todayKey === cell.key
                  return (
                    <button
                      key={cell.key}
                      type="button"
                      onClick={() => setSelectedDate(cell.key)}
                      style={{
                        minHeight: '126px',
                        padding: '10px',
                        textAlign: 'left',
                        verticalAlign: 'top',
                        background: isSelected ? '#f1f5f9' : '#fff',
                        border: 0,
                        borderRight: '1px solid rgba(15, 23, 42, 0.08)',
                        borderBottom: '1px solid rgba(15, 23, 42, 0.08)',
                        opacity: cell.inMonth ? 1 : 0.45,
                        cursor: 'pointer',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <span style={{ fontWeight: 800, fontSize: '13px', color: isToday ? '#2563eb' : '#0f172a' }}>{cell.day}</span>
                        {isToday && <span style={{ fontSize: '10px', fontWeight: 700, color: '#2563eb' }}>TODAY</span>}
                      </div>
                      <div style={{ display: 'grid', gap: '5px' }}>
                        {dayJobs.slice(0, 3).map(job => (
                          <div
                            key={job.id}
                            onClick={(event) => { event.stopPropagation(); navigate(`/crm/jobs/${job.id}`) }}
                            style={{ padding: '6px 7px', borderRadius: '7px', background: '#f8fafc', border: '1px solid rgba(15, 23, 42, 0.08)', cursor: 'pointer' }}
                            title={`${jobTime(job)} · ${job.title}`}
                          >
                            <div style={{ fontSize: '10px', fontWeight: 800, color: '#64748b', marginBottom: '2px' }}>{jobTime(job)}</div>
                            <div style={{ fontSize: '11px', fontWeight: 700, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{job.job_number || 'Job'} · {job.title}</div>
                          </div>
                        ))}
                        {dayJobs.length > 3 && <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 700 }}>+{dayJobs.length - 3} more</div>}
                      </div>
                    </button>
                  )
                })}
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="two-column-grid">
        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>{date(selectedDate)}</h2>
              <p>{selectedJobs.length ? `${selectedJobs.length} job${selectedJobs.length === 1 ? '' : 's'} scheduled.` : 'No jobs scheduled for this date.'}</p>
            </div>
          </div>
          {loading ? (
            <div className="loading-box">Loading schedule…</div>
          ) : selectedJobs.length === 0 ? (
            <EmptyState title="No scheduled jobs" description="Select another day or schedule a job from the Jobs area." />
          ) : (
            <div className="simple-list">
              {selectedJobs.map(job => (
                <button
                  key={job.id}
                  type="button"
                  onClick={() => navigate(`/crm/jobs/${job.id}`)}
                  style={{ width: '100%', textAlign: 'left', border: 0, background: 'transparent', padding: 0, cursor: 'pointer' }}
                >
                  <div className="simple-list-row">
                    <span>
                      <strong>{jobTime(job)} · {job.job_number || 'Job'}</strong>
                      <span className="muted" style={{ display: 'block' }}>{job.title}{job.customers?.company_name ? ` · ${job.customers.company_name}` : ''}</span>
                    </span>
                    <span className={`status ${statusClass(job.status)}`}>{String(job.status || 'scheduled').replace('_', ' ')}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>Upcoming jobs</h2>
              <p>Next scheduled work on the calendar.</p>
            </div>
          </div>
          {loading ? (
            <div className="loading-box">Loading schedule…</div>
          ) : jobs.length === 0 ? (
            <EmptyState title="No scheduled jobs" description="Add scheduled dates to jobs to see them here." />
          ) : (
            <div className="simple-list">
              {jobs.filter(job => String(job.scheduled_date) >= todayKey).slice(0, 8).map(job => (
                <button
                  key={job.id}
                  type="button"
                  onClick={() => navigate(`/crm/jobs/${job.id}`)}
                  style={{ width: '100%', textAlign: 'left', border: 0, background: 'transparent', padding: 0, cursor: 'pointer' }}
                >
                  <div className="simple-list-row">
                    <span>
                      <strong>{date(job.scheduled_date)} · {jobTime(job)}</strong>
                      <span className="muted" style={{ display: 'block' }}>{job.job_number || 'Job'} · {job.title}</span>
                    </span>
                    <ArrowUpRight size={16} />
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

function JobCosting({ job, jobId }) {
  const [materials, setMaterials] = useState([])
  const [expenses, setExpenses] = useState([])
  const [labor, setLabor] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function loadCosts() {
    setLoading(true); setError('')
    const [m, e, l] = await Promise.all([
      supabase.from('job_materials').select('line_total').eq('job_id', jobId),
      supabase.from('expenses').select('amount, description, vendor, expense_date').eq('job_id', jobId).order('expense_date', { ascending: false }),
      supabase.from('job_time_entries').select('hours, hourly_cost').eq('job_id', jobId),
    ])
    const firstError = [m, e, l].find(x => x.error)?.error
    if (firstError) setError(firstError.message)
    setMaterials(m.data || []); setExpenses(e.data || []); setLabor(l.data || [])
    setLoading(false)
  }
  useEffect(() => { loadCosts() }, [jobId])

  const materialCost = materials.reduce((sum, x) => sum + Number(x.line_total || 0), 0)
  const expenseCost = expenses.reduce((sum, x) => sum + Number(x.amount || 0), 0)
  const laborCost = labor.reduce((sum, x) => sum + Number(x.hours || 0) * Number(x.hourly_cost || 0), 0)
  const totalCost = materialCost + expenseCost + laborCost
  const revenue = Number(job.final_amount || 0) > 0 ? Number(job.final_amount) : Number(job.estimated_amount || 0)
  const profit = revenue - totalCost
  const margin = revenue > 0 ? (profit / revenue) * 100 : null

  return <section className="panel">
    <div className="panel-header"><div><h2>Job costing</h2><p>Actual cost and gross profit based on materials, job expenses and labor.</p></div>{margin != null && <span className="status status-completed">{margin.toFixed(1)}% margin</span>}</div>
    {error && <div className="error-box" style={{ marginBottom: '16px' }}>{error}</div>}
    {loading ? <div className="empty-state">Calculating job cost…</div> : <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '14px' }}>
        <div className="metric-card"><div className="metric-label">Revenue</div><strong>{money(revenue)}</strong><span>{Number(job.final_amount || 0) > 0 ? 'Final job amount' : 'Estimated until finalized'}</span></div>
        <div className="metric-card"><div className="metric-label">Total cost</div><strong>{money(totalCost)}</strong><span>Materials + expenses + labor</span></div>
        <div className="metric-card"><div className="metric-label">Gross profit</div><strong>{money(profit)}</strong><span>Revenue less actual cost</span></div>
        <div className="metric-card"><div className="metric-label">Labor hours</div><strong>{labor.reduce((sum, x) => sum + Number(x.hours || 0), 0).toFixed(2)}</strong><span>Technician time recorded</span></div>
      </div>
      <div style={{ maxWidth: '520px', marginLeft: 'auto', marginTop: '20px' }}>
        <PriceRow label="Materials" value={money(materialCost)} />
        <PriceRow label="Job expenses" value={money(expenseCost)} />
        <PriceRow label="Labor" value={money(laborCost)} />
        <div style={{ borderTop: '1px solid rgba(15, 23, 42, 0.12)', marginTop: '10px', paddingTop: '14px' }}><PriceRow label="Total cost" value={money(totalCost)} /></div>
        <div style={{ marginTop: '8px' }}><PriceRow label="Gross profit" value={money(profit)} /></div>
      </div>
    </>}
  </section>
}

function JobDetail() {
  const { jobId } = useParams()
  const navigate = useNavigate()
  const [job, setJob] = useState(null)
  const [customers, setCustomers] = useState([])
  const [quotes, setQuotes] = useState([])
  const [invoices, setInvoices] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [editing, setEditing] = useState(false)
  const [completing, setCompleting] = useState(false)
  const [completionBusy, setCompletionBusy] = useState(false)
  const [error, setError] = useState('')

  const [form, setForm] = useState({
    job_number: '',
    customer_id: '',
    quote_id: '',
    title: '',
    scope_of_work: '',
    status: 'scheduled',
    scheduled_date: '',
    scheduled_start: '',
    scheduled_end: '',
    estimated_amount: '',
    final_amount: '',
    notes: '',
  })

  const [completionForm, setCompletionForm] = useState({
    final_amount: '',
    completion_notes: '',
    create_invoice: true,
    due_date: '',
  })

  async function load() {
    setLoading(true)
    setError('')

    const [jobResult, customersResult, quotesResult, invoicesResult] = await Promise.all([
      supabase
        .from('jobs')
        .select('*, customers(company_name), quotes(quote_number, title)')
        .eq('id', jobId)
        .single(),
      supabase
        .from('customers')
        .select('id, company_name')
        .order('company_name'),
      supabase
        .from('quotes')
        .select('id, quote_number, title, customer_id, total, status')
        .order('created_at', { ascending: false }),
      supabase
        .from('invoices')
        .select('id, invoice_number, status, total, amount_paid, issue_date, due_date, job_id')
        .eq('job_id', jobId)
        .order('created_at', { ascending: false }),
    ])

    if (jobResult.error) {
      setError(jobResult.error.message)
      setJob(null)
    } else {
      const nextJob = jobResult.data
      setJob(nextJob)
      setForm({
        job_number: nextJob.job_number || '',
        customer_id: nextJob.customer_id || '',
        quote_id: nextJob.quote_id || '',
        title: nextJob.title || '',
        scope_of_work: nextJob.scope_of_work || '',
        status: nextJob.status || 'scheduled',
        scheduled_date: nextJob.scheduled_date || '',
        scheduled_start: nextJob.scheduled_start || '',
        scheduled_end: nextJob.scheduled_end || '',
        estimated_amount: nextJob.estimated_amount ?? '',
        final_amount: nextJob.final_amount ?? '',
        notes: nextJob.notes || '',
      })
    }

    if (customersResult.error) setError(customersResult.error.message)
    if (quotesResult.error) setError(quotesResult.error.message)
    if (invoicesResult.error) setError(invoicesResult.error.message)

    setCustomers(customersResult.data || [])
    setQuotes(quotesResult.data || [])
    setInvoices(invoicesResult.data || [])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [jobId])

  function resetFormFromJob() {
    setForm({
      job_number: job.job_number || '',
      customer_id: job.customer_id || '',
      quote_id: job.quote_id || '',
      title: job.title || '',
      scope_of_work: job.scope_of_work || '',
      status: job.status || 'scheduled',
      scheduled_date: job.scheduled_date || '',
      scheduled_start: job.scheduled_start || '',
      scheduled_end: job.scheduled_end || '',
      estimated_amount: job.estimated_amount ?? '',
      final_amount: job.final_amount ?? '',
      notes: job.notes || '',
    })
  }

  function openCompletion() {
    const today = localTodayInputValue()
    const existingInvoice = invoices[0]
    const startingAmount = Number(job.final_amount || 0) > 0
      ? Number(job.final_amount)
      : Number(job.estimated_amount || 0)

    setCompletionForm({
      final_amount: startingAmount ? startingAmount.toFixed(2) : '',
      completion_notes: '',
      create_invoice: !existingInvoice,
      due_date: addDaysToDate(today, 30),
    })
    setError('')
    setCompleting(true)
  }

  async function completeJob(e) {
    e.preventDefault()
    setCompletionBusy(true)
    setError('')

    const finalAmount = Number(completionForm.final_amount || 0)

    if (finalAmount < 0) {
      setError('Final amount cannot be negative.')
      setCompletionBusy(false)
      return
    }

    const completionNote = completionForm.completion_notes.trim()
    const existingNotes = job.notes?.trim() || ''
    let nextNotes = existingNotes

    if (completionNote) {
      nextNotes = existingNotes
        ? `${existingNotes}\n\nCompletion notes:\n${completionNote}`
        : `Completion notes:\n${completionNote}`
    }

    const { data: updatedJob, error: updateError } = await supabase
      .from('jobs')
      .update({
        status: 'completed',
        final_amount: finalAmount,
        notes: nextNotes || null,
      })
      .eq('id', jobId)
      .select('*, customers(company_name), quotes(quote_number, title)')
      .single()

    if (updateError) {
      setError(updateError.message)
      setCompletionBusy(false)
      return
    }

    setJob(updatedJob)
    setForm((current) => ({
      ...current,
      status: 'completed',
      final_amount: finalAmount,
      notes: nextNotes,
    }))

    await logCrmActivity({
      customer_id: updatedJob.customer_id,
      job_id: updatedJob.id,
      quote_id: updatedJob.quote_id,
      activity_type: 'job_completed',
      subject: `Job completed: ${updatedJob.title}`,
      body: completionNote || `Final amount: ${money(finalAmount)}.`,
      activity_date: localNowIso(),
    })

    if (completionForm.create_invoice) {
      let existingInvoice = invoices[0] || null

      if (!existingInvoice) {
        const { data: latestInvoice, error: invoiceLookupError } = await supabase
          .from('invoices')
          .select('id, invoice_number, status, total, amount_paid, issue_date, due_date, job_id')
          .eq('job_id', jobId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        if (invoiceLookupError) {
          setError(`Job completed, but the invoice check failed: ${invoiceLookupError.message}`)
          setCompleting(false)
          setCompletionBusy(false)
          await load()
          return
        }

        existingInvoice = latestInvoice || null
      }

      if (existingInvoice) {
        setInvoices((current) => [existingInvoice, ...current.filter((item) => item.id !== existingInvoice.id)])
        setCompleting(false)
        setCompletionBusy(false)
        await load()
        navigate(`/crm/invoices/${existingInvoice.id}`)
        return
      }

      const today = localTodayInputValue()
      const invoiceNotes = `Generated from completed job ${updatedJob.job_number || 'job'}.`
      const invoicePayload = {
        invoice_number: defaultInvoiceNumber(),
        customer_id: updatedJob.customer_id,
        job_id: updatedJob.id,
        status: 'draft',
        issue_date: today,
        due_date: completionForm.due_date || addDaysToDate(today, 30),
        subtotal: finalAmount,
        tax: 0,
        total: finalAmount,
        amount_paid: 0,
        notes: invoiceNotes,
      }

      const { data: newInvoice, error: invoiceError } = await supabase
        .from('invoices')
        .insert(invoicePayload)
        .select('id')
        .single()

      if (invoiceError) {
        setError(`Job completed, but the invoice could not be created: ${invoiceError.message}`)
        setCompleting(false)
        setCompletionBusy(false)
        await load()
        return
      }

      await logCrmActivity({
        customer_id: updatedJob.customer_id,
        job_id: updatedJob.id,
        invoice_id: newInvoice?.id || null,
        activity_type: 'invoice_created',
        subject: `Invoice created from completed job: ${updatedJob.title}`,
        body: invoicePayload.invoice_number ? `Invoice ${invoicePayload.invoice_number} was created.` : 'An invoice was created.',
      activity_date: localNowIso(),
    })

      setCompleting(false)
      setCompletionBusy(false)
      await load()

      if (newInvoice?.id) {
        navigate(`/crm/invoices/${newInvoice.id}`)
      }
      return
    }

    setCompleting(false)
    setCompletionBusy(false)
    await load()
  }

  async function save() {
    setSaving(true)
    setError('')

    const payload = {
      job_number: form.job_number.trim() || null,
      customer_id: form.customer_id,
      quote_id: form.quote_id || null,
      title: form.title.trim(),
      scope_of_work: form.scope_of_work.trim() || null,
      status: form.status,
      scheduled_date: form.scheduled_date || null,
      scheduled_start: form.scheduled_start || null,
      scheduled_end: form.scheduled_end || null,
      estimated_amount: form.estimated_amount === '' ? 0 : Number(form.estimated_amount),
      final_amount: form.final_amount === '' ? 0 : Number(form.final_amount),
      notes: form.notes.trim() || null,
    }

    if (!payload.customer_id) {
      setError('Customer is required.')
      setSaving(false)
      return
    }

    if (!payload.title) {
      setError('Job title is required.')
      setSaving(false)
      return
    }

    if (payload.scheduled_start && payload.scheduled_end && payload.scheduled_end <= payload.scheduled_start) {
      setError('Scheduled end time must be later than the start time.')
      setSaving(false)
      return
    }

    if (payload.estimated_amount < 0 || payload.final_amount < 0) {
      setError('Amounts cannot be negative.')
      setSaving(false)
      return
    }

    const { data, error: updateError } = await supabase
      .from('jobs')
      .update(payload)
      .eq('id', jobId)
      .select('*, customers(company_name), quotes(quote_number, title)')
      .single()

    if (updateError) {
      setError(updateError.message)
      setSaving(false)
      return
    }

    setJob(data)
    setForm({
      job_number: data.job_number || '',
      customer_id: data.customer_id || '',
      quote_id: data.quote_id || '',
      title: data.title || '',
      scope_of_work: data.scope_of_work || '',
      status: data.status || 'scheduled',
      scheduled_date: data.scheduled_date || '',
      scheduled_start: data.scheduled_start || '',
      scheduled_end: data.scheduled_end || '',
      estimated_amount: data.estimated_amount ?? '',
      final_amount: data.final_amount ?? '',
      notes: data.notes || '',
    })
    setEditing(false)
    setSaving(false)
    await load()
  }

  async function updateStatus(status) {
    setError('')

    if (status === 'completed') {
      openCompletion()
      return
    }

    const { data, error: updateError } = await supabase
      .from('jobs')
      .update({ status })
      .eq('id', jobId)
      .select('*, customers(company_name), quotes(quote_number, title)')
      .single()

    if (updateError) {
      setError(updateError.message)
      return
    }

    setJob(data)
    setForm((current) => ({ ...current, status: data.status }))

    await logCrmActivity({
      customer_id: data.customer_id,
      quote_id: data.quote_id,
      job_id: data.id,
      activity_type: 'job_status',
      subject: `Job status changed: ${data.title}`,
      body: data.job_number ? `Job ${data.job_number} changed to ${status}.` : `Job status changed to ${status}.`,
      activity_date: localNowIso(),
    })
  }

  async function removeJob() {
    const confirmed = window.confirm('Delete this job? This cannot be undone.')
    if (!confirmed) return

    setDeleting(true)
    setError('')

    const { error: deleteError } = await supabase
      .from('jobs')
      .delete()
      .eq('id', jobId)

    if (deleteError) {
      setError(deleteError.message)
      setDeleting(false)
      return
    }

    navigate('/crm/jobs')
  }

  if (loading) {
    return <div className="empty-state"><p>Loading job…</p></div>
  }

  if (!job) {
    return (
      <>
        <button className="back-button" onClick={() => navigate('/crm/jobs')}>
          <ArrowLeft size={17} />
          Back to jobs
        </button>
        <div className="empty-state">
          <h3>Job not found</h3>
          <p>{error || 'This job may have been deleted.'}</p>
        </div>
      </>
    )
  }

  const customerName = job.customers?.company_name || 'Customer'
  const quoteLabel = job.quotes?.quote_number
    ? `${job.quotes.quote_number}${job.quotes.title ? ` · ${job.quotes.title}` : ''}`
    : 'No quote linked'
  const linkedInvoice = invoices[0] || null
  const canComplete = job.status !== 'completed' && job.status !== 'cancelled'

  return (
    <>
      <div style={{ marginBottom: '18px' }}>
        <button className="back-button" onClick={() => navigate('/crm/jobs')}>
          <ArrowLeft size={17} />
          Back to jobs
        </button>
      </div>

      <PageHeader
        eyebrow="Job"
        title={job.job_number || 'Job'}
        description={job.title}
        action={(
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            {canComplete && !editing && (
              <button className="primary-button" onClick={openCompletion}>
                <BriefcaseBusiness size={16} />
                Complete job
              </button>
            )}
            {!editing && (
              <button className="secondary-button" onClick={() => setEditing(true)}>
                <Pencil size={16} />
                Edit
              </button>
            )}
            <button className="danger-button" onClick={removeJob} disabled={deleting}>
              <Trash2 size={16} />
              {deleting ? 'Deleting…' : 'Delete'}
            </button>
          </div>
        )}
      />

      {error && <div className="error-box" style={{ marginBottom: '18px' }}>{error}</div>}

      {!editing && <JobAssignmentsPanel jobId={jobId} />}

      {completing && !editing && (
        <section className="panel" style={{ marginBottom: '20px' }}>
          <div className="panel-header">
            <div>
              <h2>Complete job</h2>
              <p>Record the final job value and optionally create a draft invoice.</p>
            </div>
            <button
              className="icon-button"
              type="button"
              onClick={() => setCompleting(false)}
              disabled={completionBusy}
              aria-label="Close completion form"
            >
              <X size={18} />
            </button>
          </div>

          <form className="stack-form" onSubmit={completeJob}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '16px' }}>
              <label>
                Final amount
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={completionForm.final_amount}
                  onChange={(e) => setCompletionForm({ ...completionForm, final_amount: e.target.value })}
                  required
                />
              </label>

              <label>
                Invoice due date
                <input
                  type="date"
                  value={completionForm.due_date}
                  onChange={(e) => setCompletionForm({ ...completionForm, due_date: e.target.value })}
                  disabled={!completionForm.create_invoice}
                />
              </label>
            </div>

            <label>
              Completion notes
              <textarea
                value={completionForm.completion_notes}
                onChange={(e) => setCompletionForm({ ...completionForm, completion_notes: e.target.value })}
                placeholder="What was completed? Any materials, changes, customer sign-off, or follow-up items?"
                rows={5}
              />
            </label>

            <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={completionForm.create_invoice}
                onChange={(e) => setCompletionForm({ ...completionForm, create_invoice: e.target.checked })}
                style={{ width: '18px', height: '18px', marginTop: '2px' }}
              />
              <span>
                <strong>Create a draft invoice</strong>
                <span className="muted" style={{ display: 'block', marginTop: '3px' }}>
                  {linkedInvoice
                    ? `This job already has ${linkedInvoice.invoice_number || 'an invoice'}; the existing invoice will be opened.`
                    : 'The invoice will be created for the final amount and opened for review.'}
                </span>
              </span>
            </label>

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="secondary-button"
                onClick={() => setCompleting(false)}
                disabled={completionBusy}
              >
                Cancel
              </button>
              <button type="submit" className="primary-button" disabled={completionBusy}>
                {completionBusy ? 'Completing…' : completionForm.create_invoice ? 'Complete & create invoice' : 'Complete job'}
              </button>
            </div>
          </form>
        </section>
      )}

      {editing ? (
        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>Edit job</h2>
              <p>Update scheduling, status, customer and job details.</p>
            </div>
          </div>

          <form
            className="stack-form"
            onSubmit={(e) => {
              e.preventDefault()
              save()
            }}
          >
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '16px' }}>
              <label>
                Job number
                <input
                  value={form.job_number}
                  onChange={(e) => setForm({ ...form, job_number: e.target.value })}
                />
              </label>

              <label>
                Customer
                <select
                  value={form.customer_id}
                  onChange={(e) => setForm({ ...form, customer_id: e.target.value })}
                  required
                >
                  <option value="">Select customer</option>
                  {customers.map((customer) => (
                    <option key={customer.id} value={customer.id}>
                      {customer.company_name}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '16px' }}>
              <label>
                Quote
                <select
                  value={form.quote_id}
                  onChange={(e) => setForm({ ...form, quote_id: e.target.value })}
                >
                  <option value="">No quote linked</option>
                  {quotes.map((quote) => (
                    <option key={quote.id} value={quote.id}>
                      {quote.quote_number || 'Quote'} · {quote.title}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Status
                <select
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value })}
                >
                  {jobStatuses.map((status) => (
                    <option key={status} value={status}>
                      {capitalize(status)}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label>
              Job title
              <input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                required
              />
            </label>

            <label>
              Scope of work
              <textarea
                value={form.scope_of_work}
                onChange={(e) => setForm({ ...form, scope_of_work: e.target.value })}
                rows={6}
              />
            </label>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '16px' }}>
              <label>
                Scheduled date
                <input
                  type="date"
                  value={form.scheduled_date}
                  onChange={(e) => setForm({ ...form, scheduled_date: e.target.value })}
                />
              </label>

              <label>
                Start time
                <input
                  type="time"
                  value={form.scheduled_start}
                  onChange={(e) => setForm({ ...form, scheduled_start: e.target.value })}
                />
              </label>

              <label>
                End time
                <input
                  type="time"
                  value={form.scheduled_end}
                  onChange={(e) => setForm({ ...form, scheduled_end: e.target.value })}
                />
              </label>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '16px' }}>
              <label>
                Estimated amount
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.estimated_amount}
                  onChange={(e) => setForm({ ...form, estimated_amount: e.target.value })}
                />
              </label>

              <label>
                Final amount
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.final_amount}
                  onChange={(e) => setForm({ ...form, final_amount: e.target.value })}
                />
              </label>
            </div>

            <label>
              Notes
              <textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                rows={4}
              />
            </label>

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="secondary-button"
                onClick={() => {
                  setEditing(false)
                  setError('')
                  resetFormFromJob()
                }}
                disabled={saving}
              >
                Cancel
              </button>
              <button type="submit" className="primary-button" disabled={saving}>
                {saving ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </form>
        </section>
      ) : (
        <div style={{ display: 'grid', gap: '20px' }}>
          <section className="panel">
            <div className="panel-header">
              <div>
                <h2>Job overview</h2>
                <p>Customer, quote and current job status.</p>
              </div>
              <Status status={job.status || 'scheduled'} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '20px' }}>
              <DetailRow
                icon={Building2}
                label="Customer"
                value={customerName}
                link={job.customer_id ? `/crm/customers/${job.customer_id}` : undefined}
              />
              <DetailRow
                icon={FileText}
                label="Quote"
                value={quoteLabel}
              />
              <DetailRow
                icon={CalendarClock}
                label="Scheduled"
                value={jobScheduleLabel(job)}
              />
            </div>
          </section>

          <section className="panel">
            <div className="panel-header">
              <div>
                <h2>Scope of work</h2>
                <p>What needs to be completed.</p>
              </div>
            </div>
            <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>
              {job.scope_of_work || 'No scope of work has been added yet.'}
            </div>
          </section>

          <section className="panel">
            <div className="panel-header">
              <div>
                <h2>Job amounts</h2>
                <p>Estimated versus final job value.</p>
              </div>
            </div>

            <div style={{ maxWidth: '420px', marginLeft: 'auto', display: 'grid', gap: '12px' }}>
              <PriceRow label="Estimated" value={money(job.estimated_amount)} />
              <PriceRow label="Final" value={money(job.final_amount)} />
              <div style={{ borderTop: '1px solid rgba(15, 23, 42, 0.12)', paddingTop: '14px', display: 'flex', justifyContent: 'space-between', gap: '20px', fontSize: '18px' }}>
                <strong>Difference</strong>
                <strong>{money(Number(job.final_amount || 0) - Number(job.estimated_amount || 0))}</strong>
              </div>
            </div>
          </section>

          <section className="panel">
            <div className="panel-header">
              <div>
                <h2>Job status</h2>
                <p>Move the job through scheduling and completion.</p>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              {jobStatuses.map((status) => (
                <button
                  key={status}
                  type="button"
                  className={job.status === status ? 'primary-button' : 'secondary-button'}
                  onClick={() => updateStatus(status)}
                >
                  {capitalize(status)}
                </button>
              ))}
            </div>
          </section>

          <JobMaterials jobId={jobId} />

          <JobTimeEntries jobId={jobId} />

          <JobCosting job={job} jobId={jobId} />

          <section className="panel">
            <div className="panel-header">
              <div>
                <h2>Billing</h2>
                <p>Invoice generated from this job.</p>
              </div>
              {linkedInvoice && <Status status={linkedInvoice.status || 'draft'} />}
            </div>

            {linkedInvoice ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '18px', alignItems: 'center' }}>
                <DetailRow
                  icon={ReceiptText}
                  label="Invoice"
                  value={linkedInvoice.invoice_number || 'Invoice'}
                />
                <DetailRow
                  icon={CircleDollarSign}
                  label="Total"
                  value={money(linkedInvoice.total)}
                />
                <DetailRow
                  icon={CircleDollarSign}
                  label="Balance"
                  value={money(invoiceBalance(linkedInvoice))}
                />
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => navigate(`/crm/invoices/${linkedInvoice.id}`)}
                  >
                    Open invoice
                    <ArrowUpRight size={16} />
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
                <div>
                  <strong>No invoice linked</strong>
                  <p className="muted" style={{ margin: '5px 0 0' }}>
                    {job.status === 'completed'
                      ? 'This completed job is ready to be billed.'
                      : 'Complete the job to optionally create a draft invoice.'}
                  </p>
                </div>
                {job.status === 'completed' && (
                  <button type="button" className="secondary-button" onClick={openCompletion}>
                    <ReceiptText size={16} />
                    Create invoice
                  </button>
                )}
              </div>
            )}
          </section>

          <section className="panel">
            <div className="panel-header">
              <div>
                <h2>Notes</h2>
                <p>Additional job information.</p>
              </div>
            </div>

            <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>
              {job.notes || 'No notes added.'}
            </div>

            <div style={{ marginTop: '18px', paddingTop: '14px', borderTop: '1px solid rgba(15, 23, 42, 0.08)', fontSize: '13px', opacity: 0.65 }}>
              Created {date(job.created_at)}
            </div>
          </section>
        </div>
      )}
    </>
  )
}



/* =========================================================
   EXPENSES
========================================================= */

function Expenses() {
  const [expenses, setExpenses] = useState([])
  const [jobs, setJobs] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [showForm, setShowForm] = useState(false)

  const [form, setForm] = useState({
    expense_date: localTodayInputValue(),
    vendor: '',
    category: 'General',
    description: '',
    amount: '',
    job_id: '',
    notes: '',
  })

  async function loadExpenses() {
    setLoading(true)
    setError('')

    const [expenseResult, jobsResult] = await Promise.all([
      supabase
        .from('expenses')
        .select('id, expense_date, vendor, category, description, amount, job_id, notes, created_at, jobs(job_number, title)')
        .order('expense_date', { ascending: false })
        .order('created_at', { ascending: false }),
      supabase
        .from('jobs')
        .select('id, job_number, title')
        .order('scheduled_date', { ascending: false, nullsFirst: false })
        .limit(250),
    ])

    if (expenseResult.error) {
      setError(expenseResult.error.message)
    } else {
      setExpenses(expenseResult.data || [])
    }

    if (jobsResult.error) {
      setError((current) => current || jobsResult.error.message)
    } else {
      setJobs(jobsResult.data || [])
    }

    setLoading(false)
  }

  useEffect(() => {
    loadExpenses()
  }, [])

  const categories = Array.from(
    new Set(expenses.map((expense) => expense.category).filter(Boolean))
  ).sort()

  const filteredExpenses = expenses.filter((expense) => {
    const haystack = [
      expense.vendor,
      expense.category,
      expense.description,
      expense.notes,
      expense.jobs?.job_number,
      expense.jobs?.title,
    ].join(' ').toLowerCase()

    const matchesSearch = haystack.includes(search.toLowerCase().trim())
    const matchesCategory =
      categoryFilter === 'all' || expense.category === categoryFilter

    return matchesSearch && matchesCategory
  })

  const total = expenses.reduce(
    (sum, expense) => sum + Number(expense.amount || 0),
    0
  )

  const thisMonth = expenses
    .filter((expense) => {
      if (!expense.expense_date) return false
      const date = new Date(`${expense.expense_date}T00:00:00`)
      const now = new Date()
      return (
        date.getFullYear() === now.getFullYear() &&
        date.getMonth() === now.getMonth()
      )
    })
    .reduce((sum, expense) => sum + Number(expense.amount || 0), 0)

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    setError('')

    const amount = Number(form.amount)

    if (!Number.isFinite(amount) || amount <= 0) {
      setError('Enter an expense amount greater than zero.')
      setSaving(false)
      return
    }

    const { error: insertError } = await supabase
      .from('expenses')
      .insert({
        expense_date: form.expense_date || null,
        vendor: form.vendor.trim() || null,
        category: form.category,
        description: form.description.trim() || null,
        amount,
        job_id: form.job_id || null,
        notes: form.notes.trim() || null,
      })

    if (insertError) {
      setError(insertError.message)
      setSaving(false)
      return
    }

    setForm({
      expense_date: localTodayInputValue(),
      vendor: '',
      category: 'General',
      description: '',
      amount: '',
      job_id: '',
      notes: '',
    })
    setShowForm(false)
    setSaving(false)
    await loadExpenses()
  }

  async function handleDelete(id) {
    if (!window.confirm('Delete this expense?')) return

    const { error: deleteError } = await supabase
      .from('expenses')
      .delete()
      .eq('id', id)

    if (deleteError) {
      setError(deleteError.message)
      return
    }

    await loadExpenses()
  }

  return (
    <>
      <PageHeader
        eyebrow="Business costs"
        title="Expenses"
        description="Track operating costs and job-related expenses."
        action={
          <button
            className="primary-button"
            onClick={() => setShowForm((value) => !value)}
          >
            <Plus size={16} />
            {showForm ? 'Close form' : 'Record expense'}
          </button>
        }
      />

      {error && <div className="error-box page-error">{error}</div>}

      <div className="stat-grid">
        <StatCard
          label="Total expenses"
          value={money(total)}
          icon={CreditCard}
        />
        <StatCard
          label="This month"
          value={money(thisMonth)}
          icon={CalendarClock}
        />
        <StatCard
          label="Transactions"
          value={expenses.length}
          icon={ReceiptText}
        />
      </div>

      {showForm && (
        <section className="card" style={{ marginBottom: '20px' }}>
          <div className="card-header">
            <div>
              <div className="eyebrow">New transaction</div>
              <h2>Record expense</h2>
            </div>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="form-grid">
              <label>
                Date
                <input
                  type="date"
                  value={form.expense_date}
                  onChange={(e) =>
                    setForm({ ...form, expense_date: e.target.value })
                  }
                  required
                />
              </label>

              <label>
                Vendor
                <input
                  value={form.vendor}
                  onChange={(e) =>
                    setForm({ ...form, vendor: e.target.value })
                  }
                  placeholder="Vendor or supplier"
                />
              </label>

              <label>
                Category
                <select
                  value={form.category}
                  onChange={(e) =>
                    setForm({ ...form, category: e.target.value })
                  }
                >
                  <option>General</option>
                  <option>Materials</option>
                  <option>Equipment</option>
                  <option>Software</option>
                  <option>Fuel</option>
                  <option>Travel</option>
                  <option>Subcontractor</option>
                  <option>Office</option>
                  <option>Marketing</option>
                  <option>Utilities</option>
                  <option>Insurance</option>
                  <option>Other</option>
                </select>
              </label>

              <label>
                Amount
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={form.amount}
                  onChange={(e) =>
                    setForm({ ...form, amount: e.target.value })
                  }
                  placeholder="0.00"
                  required
                />
              </label>

              <label>
                Job (optional)
                <select
                  value={form.job_id}
                  onChange={(e) =>
                    setForm({ ...form, job_id: e.target.value })
                  }
                >
                  <option value="">Not tied to a job</option>
                  {jobs.map((job) => (
                    <option key={job.id} value={job.id}>
                      {job.job_number || 'Job'} — {job.title}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Description
                <input
                  value={form.description}
                  onChange={(e) =>
                    setForm({ ...form, description: e.target.value })
                  }
                  placeholder="What was purchased?"
                />
              </label>

              <label style={{ gridColumn: '1 / -1' }}>
                Notes
                <textarea
                  rows="3"
                  value={form.notes}
                  onChange={(e) =>
                    setForm({ ...form, notes: e.target.value })
                  }
                  placeholder="Optional notes"
                />
              </label>
            </div>

            <div className="form-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => setShowForm(false)}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="primary-button"
                disabled={saving}
              >
                <Plus size={16} />
                {saving ? 'Saving…' : 'Save expense'}
              </button>
            </div>
          </form>
        </section>
      )}

      <section className="card">
        <div className="card-header">
          <div>
            <div className="eyebrow">Expense ledger</div>
            <h2>All expenses</h2>
          </div>
          <div className="table-tools">
            <div className="search-box">
              <Search size={17} />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search expenses…"
              />
            </div>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
            >
              <option value="all">All categories</option>
              {categories.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </div>
        </div>

        {loading ? (
          <div style={{ padding: '28px' }}>Loading expenses…</div>
        ) : filteredExpenses.length === 0 ? (
          <EmptyState
            title="No expenses found"
            description="Record your first expense to start building the expense ledger."
            icon={CreditCard}
          />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Vendor</th>
                  <th>Category</th>
                  <th>Description</th>
                  <th>Job</th>
                  <th>Amount</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filteredExpenses.map((expense) => (
                  <tr key={expense.id}>
                    <td>{date(expense.expense_date)}</td>
                    <td>
                      <strong>{expense.vendor || '—'}</strong>
                    </td>
                    <td>
                      <span className="status-pill">{expense.category}</span>
                    </td>
                    <td>{expense.description || '—'}</td>
                    <td>
                      {expense.jobs ? (
                        <span>
                          {expense.jobs.job_number || 'Job'} — {expense.jobs.title}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>
                      <strong>{money(expense.amount)}</strong>
                    </td>
                    <td>
                      <button
                        className="icon-button"
                        title="Delete expense"
                        onClick={() => handleDelete(expense.id)}
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  )
}

/* =========================================================
   SERVICES
========================================================= */

function Services() {

  const [services, setServices] =
    useState([])

  useEffect(() => {

    supabase
      .from('services')
      .select('*')
      .eq('active', true)
      .order('name')
      .then(
        ({ data }) =>
          setServices(data || [])
      )

  }, [])


  return (
    <>

      <PageHeader
        eyebrow="Catalog"
        title="Services"
        description="QVB I.T. services and default pricing."
      />

      <div className="service-grid">

        {services.map(
          (service) => (

            <article
              className="service-card"
              key={service.id}
            >

              <div className="service-card-top">

                <div className="service-icon">
                  <Package size={18} />
                </div>

                <span className="unit-badge">
                  per {service.unit}
                </span>

              </div>

              <h3>
                {service.name}
              </h3>

              <p>
                {service.description ||
                  'No description added.'}
              </p>

              <div className="service-price">

                {service.default_price !=
                null ? (

                  <>
                    <strong>
                      {money(
                        service.default_price
                      )}
                    </strong>

                    <span>
                      / {service.unit}
                    </span>
                  </>

                ) : (

                  <span>
                    Pricing on request
                  </span>

                )}

              </div>

            </article>
          )
        )}

      </div>

    </>
  )
}


/* =========================================================
   COMING SOON
========================================================= */

function ComingSoon({
  title,
  description,
}) {
  return (

    <div className="coming-soon">

      <div className="coming-icon">
        <BriefcaseBusiness size={26} />
      </div>

      <div className="eyebrow">
        Phase 1
      </div>

      <h1>
        {title}
      </h1>

      <p>
        {description}
      </p>

      <div className="roadmap-note">
        The database structure is already in place. We're building this screen next.
      </div>

    </div>
  )
}


/* =========================================================
   EMPTY STATE
========================================================= */

function EmptyState({
  title,
  description,
}) {
  return (

    <div className="empty-state">

      <div className="empty-icon">
        <FileText size={20} />
      </div>

      <h3>
        {title}
      </h3>

      <p>
        {description}
      </p>

    </div>
  )
}


/* =========================================================
   STATUS
========================================================= */

function Status({ status }) {

  const label =
    (status || 'new')
      .replace('_', ' ')

  return (
    <span
      className={`status status-${
        status || 'new'
      }`}
    >
      {label}
    </span>
  )
}



/* =========================================================
   ACCOUNTS RECEIVABLE
========================================================= */

function ARMetricCard({ icon: Icon, label, value, detail }) {
  return (
    <div
      className="panel"
      style={{
        margin: 0,
        minHeight: '132px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
        <span className="muted">{label}</span>
        <Icon size={19} />
      </div>
      <div>
        <strong style={{ fontSize: '25px', display: 'block', marginBottom: '5px' }}>{value}</strong>
        <span className="muted" style={{ fontSize: '12px' }}>{detail}</span>
      </div>
    </div>
  )
}

function AccountsReceivable() {
  const navigate = useNavigate()
  const [invoices, setInvoices] = useState([])
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState('')
  const [error, setError] = useState('')
  const [filter, setFilter] = useState('open')
  const [query, setQuery] = useState('')

  async function load() {
    setLoading(true)
    setError('')

    const { data, error: loadError } = await supabase
      .from('invoices')
      .select('*, customers(company_name), jobs(job_number, title)')
      .neq('status', 'void')
      .order('due_date', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: false })

    if (loadError) {
      setError(loadError.message)
    }

    setInvoices(data || [])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  function daysOverdue(invoice) {
    if (!invoice?.due_date || invoiceBalance(invoice) <= 0) return 0

    const due = new Date(`${invoice.due_date}T00:00:00`)
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    return Math.max(
      Math.floor((today.getTime() - due.getTime()) / 86400000),
      0
    )
  }

  function isOpen(invoice) {
    return invoiceBalance(invoice) > 0 && invoice.status !== 'void'
  }

  function isOverdue(invoice) {
    return isOpen(invoice) && daysOverdue(invoice) > 0
  }

  function isDueSoon(invoice) {
    if (!isOpen(invoice) || !invoice.due_date) return false

    const due = new Date(`${invoice.due_date}T00:00:00`)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const diff = Math.ceil((due.getTime() - today.getTime()) / 86400000)

    return diff >= 0 && diff <= 7
  }

  async function recordPayment(invoice) {
    const balance = invoiceBalance(invoice)
    if (balance <= 0) return

    const input = window.prompt(
      `Balance due: ${money(balance)}\n\nEnter payment amount:`,
      balance.toFixed(2)
    )
    if (input === null) return

    const payment = Number(input)
    if (!Number.isFinite(payment) || payment <= 0) {
      setError('Enter a valid payment amount.')
      return
    }
    if (payment > balance) {
      setError(`Payment cannot exceed the current balance of ${money(balance)}.`)
      return
    }

    const methodInput = window.prompt(
      'Payment method (check, cash, credit_card, bank_transfer, ach, other):',
      'check'
    )
    if (methodInput === null) return
    const method = paymentMethods.includes(methodInput.trim()) ? methodInput.trim() : 'other'

    const reference = window.prompt('Reference / check number (optional):', '')
    if (reference === null) return
    const notes = window.prompt('Payment notes (optional):', '')
    if (notes === null) return

    setSavingId(invoice.id)
    setError('')

    const { error: paymentError } = await supabase
      .from('invoice_payments')
      .insert({
        invoice_id: invoice.id,
        amount: payment,
        payment_date: todayInputValue(),
        payment_method: method,
        reference_number: reference.trim() || null,
        notes: notes.trim() || null,
      })

    if (paymentError) {
      setError(paymentError.message)
      setSavingId('')
      return
    }

    const newAmountPaid = Number(invoice.amount_paid || 0) + payment
    const newStatus = newAmountPaid >= Number(invoice.total || 0) ? 'paid' : 'partial'

    const { error: updateError } = await supabase
      .from('invoices')
      .update({ amount_paid: newAmountPaid, status: newStatus })
      .eq('id', invoice.id)

    if (updateError) {
      setError(`Payment was recorded, but the invoice could not be updated: ${updateError.message}`)
    } else {
      await load()
    }

    setSavingId('')
  }

  const openInvoices = invoices.filter(isOpen)
  const outstanding = openInvoices.reduce(
    (sum, invoice) => sum + invoiceBalance(invoice),
    0
  )
  const overdueInvoices = openInvoices.filter(isOverdue)
  const overdueTotal = overdueInvoices.reduce(
    (sum, invoice) => sum + invoiceBalance(invoice),
    0
  )
  const dueSoonTotal = openInvoices
    .filter(isDueSoon)
    .reduce((sum, invoice) => sum + invoiceBalance(invoice), 0)
  const paidTotal = invoices.reduce(
    (sum, invoice) => sum + Number(invoice.amount_paid || 0),
    0
  )

  const aging = {
    current: 0,
    oneToThirty: 0,
    thirtyOneToSixty: 0,
    sixtyOnePlus: 0,
  }

  overdueInvoices.forEach((invoice) => {
    const days = daysOverdue(invoice)
    const balance = invoiceBalance(invoice)

    if (days <= 30) aging.oneToThirty += balance
    else if (days <= 60) aging.thirtyOneToSixty += balance
    else aging.sixtyOnePlus += balance
  })

  openInvoices.forEach((invoice) => {
    if (!isOverdue(invoice)) aging.current += invoiceBalance(invoice)
  })

  const filteredInvoices = openInvoices.filter((invoice) => {
    const searchText = [
      invoice.invoice_number,
      invoice.customers?.company_name,
      invoice.jobs?.job_number,
      invoice.jobs?.title,
      invoice.status,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()

    if (query && !searchText.includes(query.toLowerCase())) return false
    if (filter === 'overdue' && !isOverdue(invoice)) return false
    if (filter === 'due-soon' && !isDueSoon(invoice)) return false
    if (filter === 'current' && isOverdue(invoice)) return false

    return true
  })

  return (
    <>
      <PageHeader
        eyebrow="Billing"
        title="Accounts Receivable"
        description="See what customers owe, what is overdue, and record payments from one place."
        action={(
          <button
            className="secondary-button"
            onClick={() => navigate('/crm/invoices')}
          >
            <ReceiptText size={17} />
            View all invoices
          </button>
        )}
      />

      {error && (
        <div className="error-box" style={{ marginBottom: '18px' }}>
          {error}
        </div>
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
          gap: '16px',
          marginBottom: '22px',
        }}
      >
        <ARMetricCard
          icon={CircleDollarSign}
          label="Outstanding"
          value={money(outstanding)}
          detail={`${openInvoices.length} open invoice${openInvoices.length === 1 ? '' : 's'}`}
        />
        <ARMetricCard
          icon={CalendarClock}
          label="Overdue"
          value={money(overdueTotal)}
          detail={`${overdueInvoices.length} overdue invoice${overdueInvoices.length === 1 ? '' : 's'}`}
        />
        <ARMetricCard
          icon={ReceiptText}
          label="Due in 7 days"
          value={money(dueSoonTotal)}
          detail="Open balances approaching due date"
        />
        <ARMetricCard
          icon={ArrowUpRight}
          label="Payments recorded"
          value={money(paidTotal)}
          detail="Total paid across invoices"
        />
      </div>

      <section className="panel" style={{ marginBottom: '22px' }}>
        <div className="panel-header">
          <div>
            <h2>A/R aging</h2>
            <p>Outstanding balances grouped by how long they have been due.</p>
          </div>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
            gap: '14px',
          }}
        >
          {[
            ['Current', aging.current],
            ['1–30 days', aging.oneToThirty],
            ['31–60 days', aging.thirtyOneToSixty],
            ['61+ days', aging.sixtyOnePlus],
          ].map(([label, value]) => (
            <div
              key={label}
              style={{
                padding: '18px',
                border: '1px solid rgba(148, 163, 184, 0.18)',
                borderRadius: '12px',
              }}
            >
              <div className="muted" style={{ marginBottom: '8px' }}>{label}</div>
              <strong style={{ fontSize: '21px' }}>{money(value)}</strong>
            </div>
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Open receivables</h2>
            <p>Invoices with a remaining balance.</p>
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            gap: '10px',
            flexWrap: 'wrap',
            alignItems: 'center',
            marginBottom: '18px',
          }}
        >
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search customer, invoice, or job…"
            style={{ minWidth: '260px', flex: '1 1 260px' }}
          />

          {[
            ['open', 'All open'],
            ['current', 'Current'],
            ['due-soon', 'Due in 7 days'],
            ['overdue', 'Overdue'],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={filter === value ? 'primary-button' : 'secondary-button'}
              onClick={() => setFilter(value)}
            >
              {label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="loading-inline">Loading receivables…</div>
        ) : filteredInvoices.length === 0 ? (
          <EmptyState
            icon={CircleDollarSign}
            title="No receivables match this view"
            description="Open invoices with balances will appear here."
          />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Invoice</th>
                  <th>Customer</th>
                  <th>Due</th>
                  <th>Status</th>
                  <th>Total</th>
                  <th>Balance</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filteredInvoices.map((invoice) => {
                  const overdue = isOverdue(invoice)
                  const balance = invoiceBalance(invoice)

                  return (
                    <tr key={invoice.id}>
                      <td>
                        <button
                          className="table-link"
                          onClick={() => navigate(`/crm/invoices/${invoice.id}`)}
                        >
                          {invoice.invoice_number || 'Invoice'}
                        </button>
                      </td>
                      <td>{invoice.customers?.company_name || '—'}</td>
                      <td>
                        <span style={{ color: overdue ? '#b91c1c' : undefined }}>
                          {date(invoice.due_date)}
                        </span>
                        {overdue && (
                          <div style={{ fontSize: '12px', color: '#b91c1c', marginTop: '3px' }}>
                            {daysOverdue(invoice)} day{daysOverdue(invoice) === 1 ? '' : 's'} overdue
                          </div>
                        )}
                      </td>
                      <td><Status status={invoice.status} /></td>
                      <td>{money(invoice.total)}</td>
                      <td><strong>{money(balance)}</strong></td>
                      <td>
                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                          <button
                            className="secondary-button"
                            type="button"
                            onClick={() => recordPayment(invoice)}
                            disabled={savingId === invoice.id}
                          >
                            <CircleDollarSign size={15} />
                            {savingId === invoice.id ? 'Saving…' : 'Record payment'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  )
}


/* =========================================================
   INVOICES
========================================================= */

const invoiceStatuses = [
  'draft',
  'sent',
  'partial',
  'paid',
  'overdue',
  'void',
]

function defaultInvoiceNumber() {
  const year = new Date().getFullYear()
  const suffix = String(Date.now()).slice(-6)
  return `INV-${year}-${suffix}`
}

function invoiceBalance(invoice) {
  return Math.max(
    Number(invoice?.total || 0) - Number(invoice?.amount_paid || 0),
    0
  )
}

function invoiceStatusLabel(status) {
  return capitalize(status || 'draft')
}

function Invoices() {
  const navigate = useNavigate()
  const [invoices, setInvoices] = useState([])
  const [customers, setCustomers] = useState([])
  const [jobs, setJobs] = useState([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)

  const emptyForm = {
    invoice_number: '',
    customer_id: '',
    job_id: '',
    status: 'draft',
    issue_date: '',
    due_date: '',
    subtotal: '',
    tax: '',
    total: '',
    amount_paid: '0',
    notes: '',
  }

  const [form, setForm] = useState(emptyForm)

  async function load() {
    setLoading(true)
    setError('')

    const [invoiceResult, customerResult, jobsResult] = await Promise.all([
      supabase
        .from('invoices')
        .select('*, customers(company_name), jobs(job_number, title)')
        .order('issue_date', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false }),
      supabase
        .from('customers')
        .select('id, company_name')
        .order('company_name'),
      supabase
        .from('jobs')
        .select('id, job_number, title, customer_id, estimated_amount, final_amount, status')
        .order('created_at', { ascending: false }),
    ])

    if (invoiceResult.error) setError(invoiceResult.error.message)
    if (customerResult.error) setError(customerResult.error.message)
    if (jobsResult.error) setError(jobsResult.error.message)

    setInvoices(invoiceResult.data || [])
    setCustomers(customerResult.data || [])
    setJobs(jobsResult.data || [])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  function openNewInvoice(prefill = {}) {
    const today = localTodayInputValue()

    setForm({
      ...emptyForm,
      invoice_number: defaultInvoiceNumber(),
      issue_date: today,
      due_date: addDaysToDate(today, 30),
      ...prefill,
    })
    setError('')
    setShowForm(true)
  }

  function closeForm() {
    if (!saving) {
      setShowForm(false)
      setForm(emptyForm)
      setError('')
    }
  }

  function applyJob(jobId) {
    const job = jobs.find((item) => item.id === jobId)

    if (!job) {
      setForm((current) => ({ ...current, job_id: jobId }))
      return
    }

    const amount =
      Number(job.final_amount || 0) > 0
        ? Number(job.final_amount)
        : Number(job.estimated_amount || 0)

    setForm((current) => ({
      ...current,
      job_id: jobId,
      customer_id: job.customer_id || current.customer_id,
      subtotal: current.subtotal === '' && amount ? amount : current.subtotal,
      total: current.total === '' && amount ? amount : current.total,
    }))
  }

  function recalculateTotal(nextForm) {
    const subtotal = Number(nextForm.subtotal || 0)
    const tax = Number(nextForm.tax || 0)
    return {
      ...nextForm,
      total: (subtotal + tax).toFixed(2),
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    setError('')

    const subtotal = Number(form.subtotal || 0)
    const tax = Number(form.tax || 0)
    const total = Number(form.total === '' ? subtotal + tax : form.total)
    const amountPaid = Number(form.amount_paid || 0)

    if (!form.customer_id) {
      setError('Customer is required.')
      setSaving(false)
      return
    }

    if (subtotal < 0 || tax < 0 || total < 0 || amountPaid < 0) {
      setError('Invoice amounts cannot be negative.')
      setSaving(false)
      return
    }

    if (amountPaid > total && form.status !== 'void') {
      setError('Amount paid cannot be greater than the invoice total.')
      setSaving(false)
      return
    }

    const calculatedStatus = form.status === 'void'
      ? 'void'
      : (amountPaid >= total && total > 0)
        ? 'paid'
        : amountPaid > 0
          ? 'partial'
          : ['paid', 'partial'].includes(form.status)
            ? 'sent'
            : form.status

    const payload = {
      invoice_number: form.invoice_number.trim() || null,
      customer_id: form.customer_id,
      job_id: form.job_id || null,
      status: calculatedStatus,
      issue_date: form.issue_date || null,
      due_date: form.due_date || null,
      subtotal,
      tax,
      total,
      amount_paid: amountPaid,
      notes: form.notes.trim() || null,
    }

    const { data, error: insertError } = await supabase
      .from('invoices')
      .insert(payload)
      .select('id')
      .single()

    if (insertError) {
      setError(insertError.message)
      setSaving(false)
      return
    }

    setSaving(false)
    setShowForm(false)
    setForm(emptyForm)
    await load()

    await logCrmActivity({
      customer_id: payload.customer_id,
      job_id: payload.job_id,
      invoice_id: data?.id || null,
      activity_type: 'invoice_created',
      subject: `Invoice created: ${payload.invoice_number || 'Invoice'}`,
      body: `Invoice total: ${money(total)}.`,
      activity_date: localNowIso(),
    })

    if (data?.id) {
      navigate(`/crm/invoices/${data.id}`)
    }
  }

  const filteredInvoices = invoices.filter((invoice) => {
    const haystack = [
      invoice.invoice_number,
      invoice.customers?.company_name,
      invoice.jobs?.job_number,
      invoice.jobs?.title,
      invoice.status,
      invoice.notes,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()

    return haystack.includes(query.toLowerCase())
  })

  return (
    <>
      <PageHeader
        eyebrow="Billing"
        title="Invoices"
        description="Create invoices, track payments, and monitor balances due."
        action={(
          <button className="primary-button" onClick={() => openNewInvoice()}>
            <Plus size={17} />
            New invoice
          </button>
        )}
      />

      {error && !showForm && (
        <div className="error-box" style={{ marginBottom: '18px' }}>
          {error}
        </div>
      )}

      {showForm && (
        <section className="panel" style={{ marginBottom: '24px' }}>
          <div className="panel-header">
            <div>
              <h2>New invoice</h2>
              <p>Create an invoice and optionally connect it to a job.</p>
            </div>
            <button
              className="icon-button"
              onClick={closeForm}
              type="button"
              aria-label="Close new invoice form"
              disabled={saving}
            >
              <X size={18} />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="stack-form">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '16px' }}>
              <label>
                Invoice number
                <input
                  value={form.invoice_number}
                  onChange={(e) => setForm({ ...form, invoice_number: e.target.value })}
                  placeholder="INV-2026-0001"
                />
              </label>

              <label>
                Customer
                <select
                  value={form.customer_id}
                  onChange={(e) => setForm({ ...form, customer_id: e.target.value })}
                  required
                >
                  <option value="">Select customer</option>
                  {customers.map((customer) => (
                    <option key={customer.id} value={customer.id}>
                      {customer.company_name}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '16px' }}>
              <label>
                Job
                <select
                  value={form.job_id}
                  onChange={(e) => applyJob(e.target.value)}
                >
                  <option value="">No job linked</option>
                  {jobs.map((job) => (
                    <option key={job.id} value={job.id}>
                      {job.job_number || 'Job'} · {job.title}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Status
                <select
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value })}
                >
                  {invoiceStatuses.map((status) => (
                    <option key={status} value={status}>
                      {invoiceStatusLabel(status)}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '16px' }}>
              <label>
                Issue date
                <input
                  type="date"
                  value={form.issue_date}
                  onChange={(e) => setForm({ ...form, issue_date: e.target.value })}
                />
              </label>

              <label>
                Due date
                <input
                  type="date"
                  value={form.due_date}
                  onChange={(e) => setForm({ ...form, due_date: e.target.value })}
                />
              </label>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '16px' }}>
              <label>
                Subtotal
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.subtotal}
                  onChange={(e) => {
                    const next = { ...form, subtotal: e.target.value }
                    setForm(recalculateTotal(next))
                  }}
                  placeholder="0.00"
                />
              </label>

              <label>
                Tax
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.tax}
                  onChange={(e) => {
                    const next = { ...form, tax: e.target.value }
                    setForm(recalculateTotal(next))
                  }}
                  placeholder="0.00"
                />
              </label>

              <label>
                Total
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.total}
                  onChange={(e) => setForm({ ...form, total: e.target.value })}
                  placeholder="0.00"
                />
              </label>
            </div>

            <label>
              Amount paid
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.amount_paid}
                onChange={(e) => setForm({ ...form, amount_paid: e.target.value })}
                placeholder="0.00"
              />
            </label>

            <label>
              Notes
              <textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Payment terms, customer notes, or internal billing notes."
                rows={4}
              />
            </label>

            {error && (
              <div className="error-box">
                {error}
              </div>
            )}

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button className="secondary-button" type="button" onClick={closeForm} disabled={saving}>
                Cancel
              </button>
              <button className="primary-button" type="submit" disabled={saving}>
                {saving ? 'Saving…' : 'Create invoice'}
              </button>
            </div>
          </form>
        </section>
      )}

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>All invoices</h2>
            <p>{filteredInvoices.length} invoice{filteredInvoices.length === 1 ? '' : 's'} found.</p>
          </div>

          <div className="search-wrap">
            <Search size={17} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search invoices..."
            />
          </div>
        </div>

        {loading ? (
          <div className="loading-inline">Loading invoices…</div>
        ) : filteredInvoices.length === 0 ? (
          <EmptyState
            title="No invoices yet"
            description="Create your first invoice to start tracking billing."
          />
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Invoice</th>
                  <th>Customer</th>
                  <th>Job</th>
                  <th>Due</th>
                  <th>Total</th>
                  <th>Balance</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filteredInvoices.map((invoice) => (
                  <tr
                    key={invoice.id}
                    onClick={() => navigate(`/crm/invoices/${invoice.id}`)}
                    style={{ cursor: 'pointer' }}
                  >
                    <td>
                      <strong>{invoice.invoice_number || 'Invoice'}</strong>
                    </td>
                    <td>{invoice.customers?.company_name || '—'}</td>
                    <td>{invoice.jobs?.job_number || invoice.jobs?.title || '—'}</td>
                    <td>{date(invoice.due_date)}</td>
                    <td>{money(invoice.total)}</td>
                    <td>{money(invoiceBalance(invoice))}</td>
                    <td><Status status={invoice.status} /></td>
                    <td><ChevronRight size={17} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  )
}

function InvoiceDetail() {
  const { invoiceId } = useParams()
  const navigate = useNavigate()

  const [invoice, setInvoice] = useState(null)
  const [payments, setPayments] = useState([])
  const [customers, setCustomers] = useState([])
  const [jobs, setJobs] = useState([])
  const [loading, setLoading] = useState(true)
  const [paymentsLoading, setPaymentsLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState(false)
  const [showPaymentForm, setShowPaymentForm] = useState(false)
  const [showEmailComposer, setShowEmailComposer] = useState(false)
  const [error, setError] = useState('')
  const [paymentForm, setPaymentForm] = useState({
    amount: '',
    payment_date: todayInputValue(),
    payment_method: 'check',
    reference_number: '',
    notes: '',
  })

  const [form, setForm] = useState({
    invoice_number: '',
    customer_id: '',
    job_id: '',
    status: 'draft',
    issue_date: '',
    due_date: '',
    subtotal: '',
    tax: '',
    total: '',
    amount_paid: '0',
    notes: '',
  })

  async function load() {
    setLoading(true)
    setError('')

    setPaymentsLoading(true)

    const [invoiceResult, customerResult, jobsResult, paymentsResult] = await Promise.all([
      supabase
        .from('invoices')
        .select('*, customers(company_name, email), jobs(job_number, title)')
        .eq('id', invoiceId)
        .single(),
      supabase
        .from('customers')
        .select('id, company_name')
        .order('company_name'),
      supabase
        .from('jobs')
        .select('id, job_number, title, customer_id, estimated_amount, final_amount, status')
        .order('created_at', { ascending: false }),
      supabase
        .from('invoice_payments')
        .select('id, amount, payment_date, payment_method, reference_number, notes, created_at')
        .eq('invoice_id', invoiceId)
        .order('payment_date', { ascending: false })
        .order('created_at', { ascending: false }),
    ])

    if (invoiceResult.error) {
      setError(invoiceResult.error.message)
      setInvoice(null)
    } else {
      const row = invoiceResult.data
      setInvoice(row)
      setForm({
        invoice_number: row.invoice_number || '',
        customer_id: row.customer_id || '',
        job_id: row.job_id || '',
        status: row.status || 'draft',
        issue_date: row.issue_date || '',
        due_date: row.due_date || '',
        subtotal: row.subtotal ?? '',
        tax: row.tax ?? '',
        total: row.total ?? '',
        amount_paid: row.amount_paid ?? '0',
        notes: row.notes || '',
      })
    }

    if (customerResult.error) setError(customerResult.error.message)
    if (jobsResult.error) setError(jobsResult.error.message)
    if (paymentsResult.error) setError(paymentsResult.error.message)

    setCustomers(customerResult.data || [])
    setJobs(jobsResult.data || [])
    setPayments(paymentsResult.data || [])
    setPaymentsLoading(false)
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [invoiceId])

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }))
  }

  function recalculate() {
    const subtotal = Number(form.subtotal || 0)
    const tax = Number(form.tax || 0)
    setForm((current) => ({
      ...current,
      total: (subtotal + tax).toFixed(2),
    }))
  }

  async function save() {
    setSaving(true)
    setError('')

    const subtotal = Number(form.subtotal || 0)
    const tax = Number(form.tax || 0)
    const total = Number(form.total || 0)
    const amountPaid = Number(form.amount_paid || 0)

    if (!form.customer_id) {
      setError('Customer is required.')
      setSaving(false)
      return
    }

    if (subtotal < 0 || tax < 0 || total < 0 || amountPaid < 0) {
      setError('Invoice amounts cannot be negative.')
      setSaving(false)
      return
    }

    if (amountPaid > total && form.status !== 'void') {
      setError('Amount paid cannot be greater than the invoice total.')
      setSaving(false)
      return
    }

    const calculatedStatus = form.status === 'void'
      ? 'void'
      : (amountPaid >= total && total > 0)
        ? 'paid'
        : amountPaid > 0
          ? 'partial'
          : ['paid', 'partial'].includes(form.status)
            ? 'sent'
            : form.status

    const payload = {
      invoice_number: form.invoice_number.trim() || null,
      customer_id: form.customer_id,
      job_id: form.job_id || null,
      status: calculatedStatus,
      issue_date: form.issue_date || null,
      due_date: form.due_date || null,
      subtotal,
      tax,
      total,
      amount_paid: amountPaid,
      notes: form.notes.trim() || null,
    }

    const { error: updateError } = await supabase
      .from('invoices')
      .update(payload)
      .eq('id', invoiceId)

    if (updateError) {
      setError(updateError.message)
      setSaving(false)
      return
    }

    const previousAmountPaid = Number(invoice.amount_paid || 0)
    if (Math.abs(previousAmountPaid - amountPaid) > 0.001) {
      await logCrmActivity({
        customer_id: invoice.customer_id,
        job_id: invoice.job_id,
        invoice_id: invoice.id,
        activity_type: 'invoice_payment_adjustment',
        subject: `Invoice payment amount corrected: ${invoice.invoice_number || 'Invoice'}`,
        body: `Amount paid corrected from ${money(previousAmountPaid)} to ${money(amountPaid)}.`,
      })
    }

    setSaving(false)
    setEditing(false)
    await load()
  }

  async function changeStatus(status) {
    setSaving(true)
    setError('')

    const { error: updateError } = await supabase
      .from('invoices')
      .update({ status })
      .eq('id', invoiceId)

    if (updateError) {
      setError(updateError.message)
    } else {
      await logCrmActivity({
        customer_id: invoice.customer_id,
        job_id: invoice.job_id,
        invoice_id: invoice.id,
        activity_type: 'invoice_status',
        subject: `Invoice status changed: ${invoice.invoice_number || 'Invoice'}`,
        body: `Invoice status changed to ${status}.`,
      activity_date: localNowIso(),
    })
      await load()
    }

    setSaving(false)
  }

  async function recordPayment() {
    if (!invoice) return

    const balance = invoiceBalance(invoice)
    if (balance <= 0) {
      await changeStatus('paid')
      return
    }

    const amount = Number(paymentForm.amount)
    if (!Number.isFinite(amount) || amount <= 0) {
      setError('Enter a valid payment amount.')
      return
    }

    if (amount > balance) {
      setError(`Payment cannot exceed the current balance of ${money(balance)}.`)
      return
    }

    if (!paymentForm.payment_date) {
      setError('Payment date is required.')
      return
    }

    setSaving(true)
    setError('')

    const { error: paymentError } = await supabase
      .from('invoice_payments')
      .insert({
        invoice_id: invoiceId,
        amount,
        payment_date: paymentForm.payment_date,
        payment_method: paymentForm.payment_method || 'other',
        reference_number: paymentForm.reference_number.trim() || null,
        notes: paymentForm.notes.trim() || null,
      })

    if (paymentError) {
      setError(paymentError.message)
      setSaving(false)
      return
    }

    const newAmountPaid = Number(invoice.amount_paid || 0) + amount
    const newStatus = newAmountPaid >= Number(invoice.total || 0)
      ? 'paid'
      : 'partial'

    const { error: updateError } = await supabase
      .from('invoices')
      .update({
        amount_paid: newAmountPaid,
        status: newStatus,
      })
      .eq('id', invoiceId)

    if (updateError) {
      setError(`Payment was recorded, but the invoice total could not be updated: ${updateError.message}`)
      setSaving(false)
      return
    }

    await logCrmActivity({
      customer_id: invoice.customer_id,
      job_id: invoice.job_id,
      invoice_id: invoice.id,
      activity_type: 'payment_received',
      subject: `Payment received: ${invoice.invoice_number || 'Invoice'}`,
      body: `${money(amount)} received by ${paymentMethodLabel(paymentForm.payment_method)}${paymentForm.reference_number.trim() ? `, reference ${paymentForm.reference_number.trim()}` : ''}.`,
      activity_date: paymentForm.payment_date ? (paymentForm.payment_date === localTodayInputValue() ? localNowIso() : new Date(`${paymentForm.payment_date}T12:00:00`).toISOString()) : localNowIso(),
    })

    setPaymentForm({
      amount: '',
      payment_date: todayInputValue(),
      payment_method: 'check',
      reference_number: '',
      notes: '',
    })
    setShowPaymentForm(false)
    await load()
    setSaving(false)
  }

  async function remove() {
    if (!window.confirm('Delete this invoice? This cannot be undone.')) return

    setSaving(true)
    setError('')

    const { error: deleteError } = await supabase
      .from('invoices')
      .delete()
      .eq('id', invoiceId)

    if (deleteError) {
      setError(deleteError.message)
      setSaving(false)
      return
    }

    navigate('/crm/invoices')
  }

  if (loading) {
    return <div className="loading-inline">Loading invoice…</div>
  }

  if (!invoice) {
    return (
      <section className="panel">
        <button className="secondary-button" onClick={() => navigate('/crm/invoices')}>
          <ArrowLeft size={16} />
          Back to invoices
        </button>
        <div style={{ marginTop: '20px' }}>
          <h2>Invoice not found</h2>
          {error && <div className="error-box">{error}</div>}
        </div>
      </section>
    )
  }

  return (
    <>
      <div style={{ marginBottom: '18px' }}>
        <button
          className="secondary-button"
          onClick={() => navigate('/crm/invoices')}
          type="button"
        >
          <ArrowLeft size={16} />
          Back to invoices
        </button>
      </div>

      <PageHeader
        eyebrow="Billing"
        title={invoice.invoice_number || 'Invoice'}
        description={invoice.customers?.company_name || 'Invoice details'}
        action={(
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            {!editing && invoice.status !== 'void' && invoiceBalance(invoice) > 0 && (
              <button
                className="primary-button"
                onClick={() => {
                  setPaymentForm((current) => ({
                    ...current,
                    amount: invoiceBalance(invoice).toFixed(2),
                    payment_date: current.payment_date || todayInputValue(),
                  }))
                  setShowPaymentForm(true)
                  setError('')
                }}
                disabled={saving}
              >
                <CircleDollarSign size={17} />
                Record payment
              </button>
            )}
            {!editing && (
              <button className="secondary-button" onClick={() => navigate(`/crm/invoices/${invoiceId}/print`)} disabled={saving}>
                <Printer size={17} />
                Print / PDF
              </button>
            )}
            {!editing && (
              <button
                className="secondary-button"
                onClick={() => setShowEmailComposer(true)}
                disabled={saving}
              >
                <Mail size={17} />
                Send Email
              </button>
            )}
            {!editing && (
              <button className="secondary-button" onClick={() => setEditing(true)} disabled={saving}>
                <Pencil size={17} />
                Edit
              </button>
            )}
            <button className="danger-button" onClick={remove} disabled={saving}>
              <Trash2 size={17} />
              Delete
            </button>
          </div>
        )}
      />

      {error && (
        <div className="error-box" style={{ marginBottom: '18px' }}>
          {error}
        </div>
      )}

      {showEmailComposer && (
        <EmailComposer
          to={invoice.customers?.email}
          customerId={invoice.customer_id}
          invoiceId={invoice.id}
          onCancel={() => setShowEmailComposer(false)}
          onSent={() => setShowEmailComposer(false)}
        />
      )}

      {showPaymentForm && !editing && invoice.status !== 'void' && invoiceBalance(invoice) > 0 && (
        <section className="panel" style={{ marginBottom: '18px' }}>
          <div className="panel-header">
            <div>
              <h2>Record payment</h2>
              <p>Balance due: {money(invoiceBalance(invoice))}</p>
            </div>
          </div>

          <div className="stack-form">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '16px' }}>
              <label>
                Amount *
                <input type="number" min="0.01" step="0.01" max={invoiceBalance(invoice)} value={paymentForm.amount} onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })} />
              </label>
              <label>
                Payment date *
                <input type="date" value={paymentForm.payment_date} onChange={(e) => setPaymentForm({ ...paymentForm, payment_date: e.target.value })} />
              </label>
              <label>
                Method
                <select value={paymentForm.payment_method} onChange={(e) => setPaymentForm({ ...paymentForm, payment_method: e.target.value })}>
                  {paymentMethods.map((method) => <option key={method} value={method}>{paymentMethodLabel(method)}</option>)}
                </select>
              </label>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '16px' }}>
              <label>
                Reference / check number
                <input value={paymentForm.reference_number} onChange={(e) => setPaymentForm({ ...paymentForm, reference_number: e.target.value })} placeholder="Optional" />
              </label>
              <label>
                Notes
                <input value={paymentForm.notes} onChange={(e) => setPaymentForm({ ...paymentForm, notes: e.target.value })} placeholder="Optional" />
              </label>
            </div>

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button className="secondary-button" type="button" onClick={() => setShowPaymentForm(false)} disabled={saving}>Cancel</button>
              <button className="primary-button" type="button" onClick={recordPayment} disabled={saving}>
                {saving ? 'Recording…' : 'Record payment'}
              </button>
            </div>
          </div>
        </section>
      )}

      {editing ? (
        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>Edit invoice</h2>
              <p>Update billing information and payment status.</p>
            </div>
          </div>

          <div className="stack-form">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '16px' }}>
              <label>
                Invoice number
                <input value={form.invoice_number} onChange={(e) => updateField('invoice_number', e.target.value)} />
              </label>

              <label>
                Customer
                <select value={form.customer_id} onChange={(e) => updateField('customer_id', e.target.value)}>
                  <option value="">Select customer</option>
                  {customers.map((customer) => (
                    <option key={customer.id} value={customer.id}>{customer.company_name}</option>
                  ))}
                </select>
              </label>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '16px' }}>
              <label>
                Job
                <select value={form.job_id} onChange={(e) => updateField('job_id', e.target.value)}>
                  <option value="">No job linked</option>
                  {jobs.map((job) => (
                    <option key={job.id} value={job.id}>{job.job_number || 'Job'} · {job.title}</option>
                  ))}
                </select>
              </label>

              <label>
                Status
                <select value={form.status} onChange={(e) => updateField('status', e.target.value)}>
                  {invoiceStatuses.map((status) => (
                    <option key={status} value={status}>{invoiceStatusLabel(status)}</option>
                  ))}
                </select>
              </label>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '16px' }}>
              <label>
                Issue date
                <input type="date" value={form.issue_date} onChange={(e) => updateField('issue_date', e.target.value)} />
              </label>

              <label>
                Due date
                <input type="date" value={form.due_date} onChange={(e) => updateField('due_date', e.target.value)} />
              </label>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '16px' }}>
              <label>
                Subtotal
                <input type="number" min="0" step="0.01" value={form.subtotal} onChange={(e) => updateField('subtotal', e.target.value)} />
              </label>

              <label>
                Tax
                <input type="number" min="0" step="0.01" value={form.tax} onChange={(e) => updateField('tax', e.target.value)} />
              </label>

              <label>
                Total
                <input type="number" min="0" step="0.01" value={form.total} onChange={(e) => updateField('total', e.target.value)} />
              </label>
            </div>

            <button className="secondary-button" type="button" onClick={recalculate}>
              Recalculate total
            </button>

            <label>
              Amount paid
              <input
                type="number"
                min="0"
                step="0.01"
                max={form.status === 'void' ? undefined : Math.max(Number(form.total || 0), 0)}
                value={form.amount_paid}
                onChange={(e) => updateField('amount_paid', e.target.value)}
              />
              <span style={{ fontSize: '12px', opacity: 0.7 }}>
                Balance due: {money(Math.max(Number(form.total || 0) - Number(form.amount_paid || 0), 0))} · Status: {invoiceStatusLabel(
                  form.status === 'void'
                    ? 'void'
                    : Number(form.amount_paid || 0) >= Number(form.total || 0) && Number(form.total || 0) > 0
                      ? 'paid'
                      : Number(form.amount_paid || 0) > 0
                        ? 'partial'
                        : ['paid', 'partial'].includes(form.status)
                          ? 'sent'
                          : form.status
                )}
              </span>
              <span style={{ fontSize: '12px', opacity: 0.7 }}>
                Enter the corrected total amount received. This adjusts the invoice balance without changing individual payment transactions.
              </span>
            </label>

            <label>
              Notes
              <textarea value={form.notes} onChange={(e) => updateField('notes', e.target.value)} rows={4} />
            </label>

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button
                className="secondary-button"
                type="button"
                onClick={() => {
                  setEditing(false)
                  setError('')
                  load()
                }}
                disabled={saving}
              >
                Cancel
              </button>

              <button className="primary-button" type="button" onClick={save} disabled={saving}>
                {saving ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </div>
        </section>
      ) : (
        <>
          <section className="panel">
            <div className="panel-header">
              <div>
                <h2>Invoice summary</h2>
                <p>{invoice.customers?.company_name || 'No customer'}</p>
              </div>
              <Status status={invoice.status} />
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                gap: '18px',
              }}
            >
              <DetailRow label="Invoice number" value={invoice.invoice_number || '—'} />
              <DetailRow label="Issue date" value={date(invoice.issue_date)} />
              <DetailRow label="Due date" value={date(invoice.due_date)} />
              <DetailRow label="Customer" value={invoice.customers?.company_name || '—'} />
              <DetailRow label="Job" value={invoice.jobs?.job_number || invoice.jobs?.title || '—'} />
              <DetailRow label="Amount paid" value={money(invoice.amount_paid)} />
            </div>
          </section>

          <section className="panel" style={{ marginTop: '18px' }}>
            <div className="panel-header">
              <div>
                <h2>Amounts</h2>
                <p>Current invoice totals and outstanding balance.</p>
              </div>
            </div>

            <div
              style={{
                maxWidth: '460px',
                marginLeft: 'auto',
                display: 'grid',
                gap: '12px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Subtotal</span>
                <strong>{money(invoice.subtotal)}</strong>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Tax</span>
                <strong>{money(invoice.tax)}</strong>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '12px', borderTop: '1px solid rgba(148, 163, 184, 0.22)' }}>
                <span>Total</span>
                <strong style={{ fontSize: '20px' }}>{money(invoice.total)}</strong>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Paid</span>
                <strong>{money(invoice.amount_paid)}</strong>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '12px', borderTop: '1px solid rgba(148, 163, 184, 0.22)' }}>
                <span>Balance due</span>
                <strong style={{ fontSize: '20px' }}>{money(invoiceBalance(invoice))}</strong>
              </div>
            </div>
          </section>

          {invoice.notes && (
            <section className="panel" style={{ marginTop: '18px' }}>
              <div className="panel-header">
                <div>
                  <h2>Notes</h2>
                </div>
              </div>
              <p style={{ whiteSpace: 'pre-wrap' }}>{invoice.notes}</p>
            </section>
          )}

          <PaymentHistory payments={payments} loading={paymentsLoading} />

          <section className="panel" style={{ marginTop: '18px' }}>
            <div className="panel-header">
              <div>
                <h2>Invoice status</h2>
                <p>Update the billing status as the invoice moves through the payment cycle.</p>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              {invoiceStatuses.map((status) => (
                <button
                  key={status}
                  className={invoice.status === status ? 'primary-button' : 'secondary-button'}
                  onClick={() => changeStatus(status)}
                  disabled={saving || invoice.status === status}
                  type="button"
                >
                  {invoiceStatusLabel(status)}
                </button>
              ))}
            </div>
          </section>
        </>
      )}
    </>
  )
}


/* =========================================================
   CUSTOMER STATEMENT
========================================================= */

function CustomerStatement() {
  const { customerId } = useParams()
  const navigate = useNavigate()
  const [customer, setCustomer] = useState(null)
  const [invoices, setInvoices] = useState([])
  const [payments, setPayments] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let mounted = true

    async function load() {
      setLoading(true)
      setError('')

      const [customerResult, invoicesResult, paymentsResult] = await Promise.all([
        supabase
          .from('customers')
          .select('*')
          .eq('id', customerId)
          .single(),
        supabase
          .from('invoices')
          .select('id, invoice_number, job_id, status, issue_date, due_date, total, amount_paid, created_at, jobs(job_number, title)')
          .eq('customer_id', customerId)
          .order('issue_date', { ascending: true, nullsFirst: true }),
        supabase
          .from('invoice_payments')
          .select('id, invoice_id, amount, payment_date, payment_method, reference_number, notes, created_at, invoices!inner(customer_id, invoice_number)')
          .eq('invoices.customer_id', customerId)
          .order('payment_date', { ascending: true })
          .order('created_at', { ascending: true }),
      ])

      if (!mounted) return

      if (customerResult.error) {
        setError(customerResult.error.message)
      } else {
        setCustomer(customerResult.data)
      }

      if (invoicesResult.error) {
        setError((current) =>
          current
            ? `${current} Invoices could not be loaded: ${invoicesResult.error.message}`
            : invoicesResult.error.message
        )
      } else {
        setInvoices(invoicesResult.data || [])
      }

      if (paymentsResult.error) {
        setError((current) =>
          current
            ? `${current} Payments could not be loaded: ${paymentsResult.error.message}`
            : paymentsResult.error.message
        )
      } else {
        setPayments(paymentsResult.data || [])
      }

      setLoading(false)
    }

    load()

    return () => {
      mounted = false
    }
  }, [customerId])

  if (loading) {
    return (
      <PrintDocumentShell title="Customer Statement">
        <div className="print-loading">Loading customer statement…</div>
      </PrintDocumentShell>
    )
  }

  if (error || !customer) {
    return (
      <PrintDocumentShell title="Customer Statement">
        <div className="empty-state">
          <h3>Statement unavailable</h3>
          <p>{error || 'This customer could not be loaded.'}</p>
          <button
            className="secondary-button"
            type="button"
            onClick={() => navigate(`/crm/customers/${customerId}`)}
          >
            Return to customer
          </button>
        </div>
      </PrintDocumentShell>
    )
  }

  const totalInvoiced = invoices.reduce((sum, invoice) => sum + Number(invoice.total || 0), 0)
  const totalPaid = invoices.reduce((sum, invoice) => sum + Number(invoice.amount_paid || 0), 0)
  const balanceDue = Math.max(totalInvoiced - totalPaid, 0)
  const openInvoices = invoices.filter((invoice) => !['paid', 'void'].includes(invoice.status))
  const statementDate = new Date()

  return (
    <PrintDocumentShell title={`Statement - ${customer.company_name}`}>
      <PrintCompanyHeader />

      <div className="print-title-row">
        <div>
          <h1 className="print-title">STATEMENT</h1>
          <div className="print-number">Account statement</div>
        </div>

        <div className="print-meta">
          <div className="print-meta-row">
            <span>Statement date</span>
            <strong>{date(statementDate)}</strong>
          </div>
          <div className="print-meta-row">
            <span>Open invoices</span>
            <strong>{openInvoices.length}</strong>
          </div>
          <div className="print-meta-row">
            <span>Balance due</span>
            <strong>{money(balanceDue)}</strong>
          </div>
        </div>
      </div>

      <PrintCustomerBlock customer={customer} />

      <section className="print-section">
        <h3 className="print-section-title">Account Summary</h3>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '14px',
          }}
        >
          <div style={{ border: '1px solid #e5e7eb', padding: '14px' }}>
            <div style={{ fontSize: '12px', color: '#6b7280' }}>Total invoiced</div>
            <strong style={{ display: 'block', marginTop: '5px', fontSize: '20px' }}>{money(totalInvoiced)}</strong>
          </div>
          <div style={{ border: '1px solid #e5e7eb', padding: '14px' }}>
            <div style={{ fontSize: '12px', color: '#6b7280' }}>Payments received</div>
            <strong style={{ display: 'block', marginTop: '5px', fontSize: '20px' }}>{money(totalPaid)}</strong>
          </div>
          <div style={{ border: '1px solid #e5e7eb', padding: '14px' }}>
            <div style={{ fontSize: '12px', color: '#6b7280' }}>Balance due</div>
            <strong style={{ display: 'block', marginTop: '5px', fontSize: '20px' }}>{money(balanceDue)}</strong>
          </div>
        </div>
      </section>

      <section className="print-section">
        <h3 className="print-section-title">Invoice Activity</h3>

        {invoices.length ? (
          <table className="print-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Invoice</th>
                <th>Description</th>
                <th>Status</th>
                <th className="num">Invoiced</th>
                <th className="num">Paid</th>
                <th className="num">Balance</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((invoice) => (
                <tr key={invoice.id}>
                  <td>{date(invoice.issue_date || invoice.created_at)}</td>
                  <td>{invoice.invoice_number || 'Invoice'}</td>
                  <td>{invoice.jobs?.job_number || invoice.jobs?.title || 'Account invoice'}</td>
                  <td>{(invoice.status || 'draft').replace('_', ' ')}</td>
                  <td className="num">{money(invoice.total)}</td>
                  <td className="num">{money(invoice.amount_paid)}</td>
                  <td className="num">{money(invoiceBalance(invoice))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="print-note">No invoices have been issued for this account.</div>
        )}
      </section>

      <section className="print-section">
        <h3 className="print-section-title">Payment Activity</h3>
        {payments.length ? (
          <table className="print-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Invoice</th>
                <th>Method</th>
                <th>Reference</th>
                <th className="num">Amount</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((payment) => (
                <tr key={payment.id}>
                  <td>{date(payment.payment_date || payment.created_at)}</td>
                  <td>{payment.invoices?.invoice_number || 'Invoice'}</td>
                  <td>{paymentMethodLabel(payment.payment_method)}</td>
                  <td>{payment.reference_number || '—'}</td>
                  <td className="num">{money(payment.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="print-note">No payment transactions have been recorded for this account.</div>
        )}
      </section>

      <section className="print-section">
        <div className="print-total-row">
          <span>Account balance due</span>
          <strong>{money(balanceDue)}</strong>
        </div>
      </section>

      <section className="print-section">
        <p className="print-note">
          Thank you for your business. Please contact QVB I.T. with any questions regarding this statement.
        </p>
      </section>
    </PrintDocumentShell>
  )
}


/* =========================================================
   PRINTABLE DOCUMENTS
========================================================= */

const documentPrintStyles = `
  .print-page {
    max-width: 920px;
    margin: 0 auto;
    padding: 34px;
    background: #fff;
    color: #111827;
    border-radius: 12px;
    box-sizing: border-box;
  }

  .print-toolbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    margin-bottom: 18px;
  }

  .print-paper {
    background: #fff;
    border: 1px solid #e5e7eb;
    box-shadow: 0 12px 40px rgba(15, 23, 42, .08);
    padding: 54px;
    min-height: 900px;
  }

  .print-brand {
    display: flex;
    justify-content: space-between;
    gap: 32px;
    align-items: flex-start;
    padding-bottom: 28px;
    border-bottom: 2px solid #111827;
  }

  .print-logo {
    width: 180px;
    max-height: 80px;
    object-fit: contain;
    object-position: left center;
  }

  .print-company {
    text-align: right;
    font-size: 13px;
    line-height: 1.6;
    color: #4b5563;
  }

  .print-title-row {
    display: flex;
    justify-content: space-between;
    gap: 30px;
    margin: 34px 0;
  }

  .print-title {
    margin: 0 0 8px;
    font-size: 34px;
    letter-spacing: -.03em;
  }

  .print-number {
    font-size: 15px;
    color: #4b5563;
  }

  .print-meta {
    min-width: 230px;
    display: grid;
    gap: 8px;
  }

  .print-meta-row {
    display: flex;
    justify-content: space-between;
    gap: 20px;
    font-size: 13px;
  }

  .print-meta-row strong {
    color: #111827;
  }

  .print-section {
    margin-top: 30px;
  }

  .print-section-title {
    margin: 0 0 12px;
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: .12em;
    color: #6b7280;
  }

  .print-address {
    font-size: 14px;
    line-height: 1.65;
  }

  .print-table {
    width: 100%;
    border-collapse: collapse;
    margin-top: 12px;
    font-size: 13px;
  }

  .print-table th {
    padding: 11px 10px;
    text-align: left;
    border-bottom: 2px solid #111827;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: .08em;
  }

  .print-table td {
    padding: 13px 10px;
    border-bottom: 1px solid #e5e7eb;
    vertical-align: top;
  }

  .print-table .num {
    text-align: right;
    white-space: nowrap;
  }

  .print-totals {
    width: 330px;
    margin-left: auto;
    margin-top: 24px;
    display: grid;
    gap: 9px;
  }

  .print-total-row {
    display: flex;
    justify-content: space-between;
    gap: 24px;
    font-size: 14px;
  }

  .print-total-row.grand {
    padding-top: 12px;
    border-top: 2px solid #111827;
    font-size: 19px;
    font-weight: 700;
  }

  .print-note {
    white-space: pre-wrap;
    font-size: 13px;
    line-height: 1.7;
    color: #374151;
  }

  .print-footer {
    margin-top: 60px;
    padding-top: 18px;
    border-top: 1px solid #d1d5db;
    font-size: 11px;
    line-height: 1.6;
    color: #6b7280;
  }

  .print-loading {
    padding: 40px;
    text-align: center;
  }

  @media print {
    @page {
      size: Letter;
      margin: .45in;
    }

    html, body {
      background: #fff !important;
    }

    body * {
      visibility: hidden !important;
    }

    .print-page,
    .print-page * {
      visibility: visible !important;
    }

    .print-page {
      position: absolute;
      inset: 0;
      max-width: none;
      margin: 0;
      padding: 0;
      background: #fff;
    }

    .print-toolbar {
      display: none !important;
    }

    .print-paper {
      border: 0;
      box-shadow: none;
      padding: 0;
      min-height: 0;
    }

    .print-section,
    .print-table,
    .print-footer {
      break-inside: avoid;
    }

    .print-table tr {
      break-inside: avoid;
    }
  }
`

function PrintDocumentShell({ children, title }) {
  useEffect(() => {
    document.title = title
    return () => {
      document.title = 'QVB I.T. CRM'
    }
  }, [title])

  return (
    <div className="print-page">
      <style>{documentPrintStyles}</style>

      <div className="print-toolbar">
        <button
          className="secondary-button"
          onClick={() => window.history.back()}
          type="button"
        >
          <ArrowLeft size={16} />
          Back
        </button>

        <button
          className="primary-button"
          onClick={() => window.print()}
          type="button"
        >
          <Printer size={16} />
          Print / Save PDF
        </button>
      </div>

      <div className="print-paper">
        {children}
      </div>
    </div>
  )
}

function PrintCompanyHeader() {
  return (
    <div className="print-brand">
      <img
        className="print-logo"
        src="/crm/images/qvb-it-logo.JPG"
        alt="QVB I.T."
      />

      <div className="print-company">
        <strong>QVB I.T.</strong><br />
        IT Services &amp; Network Solutions<br />
        qvbit.net
      </div>
    </div>
  )
}

function PrintCustomerBlock({ customer }) {
  return (
    <div className="print-section">
      <h3 className="print-section-title">Bill to</h3>

      <div className="print-address">
        <strong>{customer?.company_name || 'Customer'}</strong><br />
        {customer?.billing_address && <>{customer.billing_address}<br /></>}
        {(customer?.city || customer?.state || customer?.zip) && (
          <>
            {[customer.city, customer.state, customer.zip].filter(Boolean).join(', ')}
            <br />
          </>
        )}
        {customer?.email && <>{customer.email}<br /></>}
        {customer?.phone && <>{customer.phone}</>}
      </div>
    </div>
  )
}

function QuotePrint() {
  const { quoteId } = useParams()
  const navigate = useNavigate()
  const [quote, setQuote] = useState(null)
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let mounted = true

    async function load() {
      const [quoteResult, itemsResult] = await Promise.all([
        supabase
          .from('quotes')
          .select('*, customers(*)')
          .eq('id', quoteId)
          .single(),
        supabase
          .from('quote_items')
          .select('id, description, quantity, unit_price, line_total')
          .eq('quote_id', quoteId)
          .order('created_at'),
      ])

      if (!mounted) return

      if (quoteResult.error) {
        setError(quoteResult.error.message)
      } else {
        setQuote(quoteResult.data)
      }

      if (itemsResult.error) {
        setError(itemsResult.error.message)
      } else {
        setItems(itemsResult.data || [])
      }

      setLoading(false)
    }

    load()

    return () => {
      mounted = false
    }
  }, [quoteId])

  if (loading) {
    return <PrintDocumentShell title="Quote"><div className="print-loading">Loading quote…</div></PrintDocumentShell>
  }

  if (error || !quote) {
    return (
      <PrintDocumentShell title="Quote">
        <div className="empty-state">
          <h3>Quote unavailable</h3>
          <p>{error || 'This quote could not be loaded.'}</p>
          <button className="secondary-button" onClick={() => navigate(`/crm/quotes/${quoteId}`)} type="button">
            Return to quote
          </button>
        </div>
      </PrintDocumentShell>
    )
  }

  const customer = quote.customers || null
  const subtotal = Number(quote.subtotal || 0)
  const tax = Number(quote.tax || 0)
  const total = Number(quote.total || 0)

  return (
    <PrintDocumentShell title={`Quote ${quote.quote_number || ''}`}>
      <PrintCompanyHeader />

      <div className="print-title-row">
        <div>
          <h1 className="print-title">QUOTE</h1>
          <div className="print-number">{quote.quote_number || 'Quote number not assigned'}</div>
        </div>

        <div className="print-meta">
          <div className="print-meta-row">
            <span>Date</span>
            <strong>{date(quote.created_at)}</strong>
          </div>
          <div className="print-meta-row">
            <span>Valid until</span>
            <strong>{date(quote.valid_until)}</strong>
          </div>
          <div className="print-meta-row">
            <span>Status</span>
            <strong>{(quote.status || 'draft').replace('_', ' ')}</strong>
          </div>
        </div>
      </div>

      <PrintCustomerBlock customer={customer} />

      <section className="print-section">
        <h3 className="print-section-title">Project</h3>
        <div style={{ fontSize: '16px', fontWeight: 700 }}>{quote.title}</div>

        {quote.scope_of_work && (
          <p className="print-note" style={{ marginTop: '10px' }}>
            {quote.scope_of_work}
          </p>
        )}
      </section>

      <section className="print-section">
        <h3 className="print-section-title">Services</h3>

        {items.length ? (
          <table className="print-table">
            <thead>
              <tr>
                <th>Description</th>
                <th className="num">Qty</th>
                <th className="num">Unit price</th>
                <th className="num">Amount</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td>{item.description}</td>
                  <td className="num">{item.quantity}</td>
                  <td className="num">{money(item.unit_price)}</td>
                  <td className="num">{money(item.line_total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="print-note">No line items have been added to this quote.</div>
        )}

        <div className="print-totals">
          <div className="print-total-row">
            <span>Subtotal</span>
            <strong>{money(subtotal)}</strong>
          </div>
          <div className="print-total-row">
            <span>Tax</span>
            <strong>{money(tax)}</strong>
          </div>
          <div className="print-total-row grand">
            <span>Total</span>
            <strong>{money(total)}</strong>
          </div>
        </div>
      </section>

      {quote.notes && (
        <section className="print-section">
          <h3 className="print-section-title">Notes</h3>
          <div className="print-note">{quote.notes}</div>
        </section>
      )}

      <div className="print-footer">
        Thank you for the opportunity to provide this proposal. Please contact QVB I.T.
        with any questions regarding this quote.
      </div>
    </PrintDocumentShell>
  )
}

function InvoicePrint() {
  const { invoiceId } = useParams()
  const navigate = useNavigate()
  const [invoice, setInvoice] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let mounted = true

    async function load() {
      const { data, error: loadError } = await supabase
        .from('invoices')
        .select('*, customers(*), jobs(job_number, title, scope_of_work, scheduled_date)')
        .eq('id', invoiceId)
        .single()

      if (!mounted) return

      if (loadError) {
        setError(loadError.message)
      } else {
        setInvoice(data)
      }

      setLoading(false)
    }

    load()

    return () => {
      mounted = false
    }
  }, [invoiceId])

  if (loading) {
    return <PrintDocumentShell title="Invoice"><div className="print-loading">Loading invoice…</div></PrintDocumentShell>
  }

  if (error || !invoice) {
    return (
      <PrintDocumentShell title="Invoice">
        <div className="empty-state">
          <h3>Invoice unavailable</h3>
          <p>{error || 'This invoice could not be loaded.'}</p>
          <button className="secondary-button" onClick={() => navigate(`/crm/invoices/${invoiceId}`)} type="button">
            Return to invoice
          </button>
        </div>
      </PrintDocumentShell>
    )
  }

  const customer = invoice.customers || null
  const job = invoice.jobs || null
  const total = Number(invoice.total || 0)
  const paid = Number(invoice.amount_paid || 0)
  const balance = invoiceBalance(invoice)

  return (
    <PrintDocumentShell title={`Invoice ${invoice.invoice_number || ''}`}>
      <PrintCompanyHeader />

      <div className="print-title-row">
        <div>
          <h1 className="print-title">INVOICE</h1>
          <div className="print-number">{invoice.invoice_number || 'Invoice number not assigned'}</div>
        </div>

        <div className="print-meta">
          <div className="print-meta-row">
            <span>Issue date</span>
            <strong>{date(invoice.issue_date)}</strong>
          </div>
          <div className="print-meta-row">
            <span>Due date</span>
            <strong>{date(invoice.due_date)}</strong>
          </div>
          <div className="print-meta-row">
            <span>Status</span>
            <strong>{(invoice.status || 'draft').replace('_', ' ')}</strong>
          </div>
        </div>
      </div>

      <PrintCustomerBlock customer={customer} />

      {job && (
        <section className="print-section">
          <h3 className="print-section-title">Job</h3>
          <div style={{ fontSize: '16px', fontWeight: 700 }}>
            {job.job_number || job.title || 'Job'}
          </div>
          {job.title && job.job_number && (
            <div style={{ marginTop: '4px', fontSize: '13px', color: '#4b5563' }}>
              {job.title}
            </div>
          )}
          {job.scope_of_work && (
            <p className="print-note" style={{ marginTop: '10px' }}>
              {job.scope_of_work}
            </p>
          )}
        </section>
      )}

      <section className="print-section">
        <h3 className="print-section-title">Invoice summary</h3>

        <table className="print-table">
          <thead>
            <tr>
              <th>Description</th>
              <th className="num">Amount</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <strong>{job?.title || 'IT services'}</strong>
                {job?.job_number && (
                  <div style={{ marginTop: '4px', color: '#6b7280' }}>
                    Job {job.job_number}
                  </div>
                )}
              </td>
              <td className="num">{money(invoice.subtotal)}</td>
            </tr>
            <tr>
              <td>Tax</td>
              <td className="num">{money(invoice.tax)}</td>
            </tr>
          </tbody>
        </table>

        <div className="print-totals">
          <div className="print-total-row">
            <span>Subtotal</span>
            <strong>{money(invoice.subtotal)}</strong>
          </div>
          <div className="print-total-row">
            <span>Tax</span>
            <strong>{money(invoice.tax)}</strong>
          </div>
          <div className="print-total-row grand">
            <span>Total</span>
            <strong>{money(total)}</strong>
          </div>
          <div className="print-total-row">
            <span>Amount paid</span>
            <strong>{money(paid)}</strong>
          </div>
          <div className="print-total-row" style={{ fontSize: '16px' }}>
            <span>Balance due</span>
            <strong>{money(balance)}</strong>
          </div>
        </div>
      </section>

      {invoice.notes && (
        <section className="print-section">
          <h3 className="print-section-title">Notes</h3>
          <div className="print-note">{invoice.notes}</div>
        </section>
      )}

      <div className="print-footer">
        Thank you for your business. Please remit payment according to the due date shown
        above. Contact QVB I.T. with any billing questions.
      </div>
    </PrintDocumentShell>
  )
}

function addDaysToDate(value, days) {
  if (!value) return ''
  const result = new Date(`${value}T00:00:00`)
  result.setDate(result.getDate() + days)
  return localDateKey(result)
}

/* =========================================================
   PURCHASE ORDERS
========================================================= */

const purchaseOrderStatuses = [
  'draft',
  'ordered',
  'partially_received',
  'received',
  'cancelled',
]

function purchaseOrderStatusLabel(status) {
  return String(status || 'draft')
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function nextPurchaseOrderNumber(orders) {
  const numbers = orders
    .map((order) => String(order.po_number || '').match(/(\d+)$/)?.[1])
    .filter(Boolean)
    .map(Number)
    .filter(Number.isFinite)

  const next = numbers.length ? Math.max(...numbers) + 1 : 1
  return `PO-${String(next).padStart(5, '0')}`
}

function PurchaseOrders() {
  const navigate = useNavigate()
  const [orders, setOrders] = useState([])
  const [customers, setCustomers] = useState([])
  const [jobs, setJobs] = useState([])
  const [inventory, setInventory] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState({
    po_number: '',
    vendor: '',
    customer_id: '',
    job_id: '',
    status: 'draft',
    order_date: localTodayInputValue(),
    expected_date: '',
    tax: '0',
    notes: '',
  })
  const [items, setItems] = useState([])

  async function load() {
    setLoading(true)
    setError('')

    const [ordersResult, customersResult, jobsResult, inventoryResult] = await Promise.all([
      supabase
        .from('purchase_orders')
        .select('id, po_number, vendor, customer_id, job_id, status, order_date, expected_date, subtotal, tax, total, notes, created_at, customers(company_name), jobs(job_number, title)')
        .order('order_date', { ascending: false })
        .order('created_at', { ascending: false }),
      supabase.from('customers').select('id, company_name').order('company_name'),
      supabase.from('jobs').select('id, job_number, title, customer_id').order('scheduled_date', { ascending: false, nullsFirst: false }).order('created_at', { ascending: false }).limit(500),
      supabase.from('inventory_items').select('id, sku, name, category, vendor, unit, quantity, unit_cost, active').order('name'),
    ])

    const firstError = [ordersResult, customersResult, jobsResult, inventoryResult].find((r) => r.error)?.error
    if (firstError) setError(firstError.message)
    setOrders(ordersResult.data || [])
    setCustomers(customersResult.data || [])
    setJobs(jobsResult.data || [])
    setInventory(inventoryResult.data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  function resetForm() {
    setEditingId(null)
    setForm({
      po_number: nextPurchaseOrderNumber(orders),
      vendor: '',
      customer_id: '',
      job_id: '',
      status: 'draft',
      order_date: localTodayInputValue(),
      expected_date: '',
      tax: '0',
      notes: '',
    })
    setItems([])
  }

  async function openEdit(order) {
    setError('')
    const { data, error: itemError } = await supabase
      .from('purchase_order_items')
      .select('id, purchase_order_id, inventory_item_id, description, quantity, received_quantity, unit_cost, line_total, created_at')
      .eq('purchase_order_id', order.id)
      .order('created_at')

    if (itemError) {
      setError(itemError.message)
      return
    }

    setEditingId(order.id)
    setForm({
      po_number: order.po_number || '',
      vendor: order.vendor || '',
      customer_id: order.customer_id || '',
      job_id: order.job_id || '',
      status: order.status || 'draft',
      order_date: order.order_date || '',
      expected_date: order.expected_date || '',
      tax: String(order.tax ?? 0),
      notes: order.notes || '',
    })
    setItems((data || []).map((item) => ({
      ...item,
      quantity: String(item.quantity ?? 1),
      received_quantity: String(item.received_quantity ?? 0),
      unit_cost: String(item.unit_cost ?? 0),
    })))
    setShowForm(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function closeForm() {
    if (saving) return
    setShowForm(false)
    resetForm()
    setError('')
  }

  function addItem() {
    setItems((current) => [
      ...current,
      {
        id: `new-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        inventory_item_id: '',
        description: '',
        quantity: '1',
        received_quantity: '0',
        unit_cost: '0',
      },
    ])
  }

  function removeItem(index) {
    const item = items[index]
    if (Number(item?.received_quantity || 0) > 0) {
      setError('Received line items cannot be removed. Keep them on the PO for an accurate purchasing history.')
      return
    }
    setItems((current) => current.filter((_, itemIndex) => itemIndex !== index))
  }

  function updateItem(index, patch) {
    setItems((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item))
  }

  function chooseInventoryItem(index, inventoryItemId) {
    const inventoryItem = inventory.find((item) => item.id === inventoryItemId)
    if (!inventoryItem) {
      updateItem(index, { inventory_item_id: '', description: '', unit_cost: '0' })
      return
    }
    updateItem(index, {
      inventory_item_id: inventoryItem.id,
      description: inventoryItem.name,
      unit_cost: String(inventoryItem.unit_cost ?? 0),
    })
    if (!form.vendor && inventoryItem.vendor) setForm((current) => ({ ...current, vendor: inventoryItem.vendor }))
  }

  const subtotal = items.reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.unit_cost || 0), 0)
  const tax = Number(form.tax || 0)
  const total = subtotal + tax
  const filteredJobs = form.customer_id ? jobs.filter((job) => job.customer_id === form.customer_id) : jobs

  async function saveOrder(e) {
    e.preventDefault()
    setError('')

    if (!form.vendor.trim()) {
      setError('Vendor is required.')
      return
    }

    if (!form.order_date) {
      setError('Order date is required.')
      return
    }

    if (!items.length) {
      setError('Add at least one line item to the purchase order.')
      return
    }

    if (items.some((item) => !String(item.description || '').trim())) {
      setError('Every line item needs a description.')
      return
    }

    if (items.some((item) => Number(item.quantity || 0) <= 0)) {
      setError('Line item quantities must be greater than zero.')
      return
    }

    if (items.some((item) => Number(item.received_quantity || 0) > Number(item.quantity || 0))) {
      setError('Received quantity cannot exceed ordered quantity.')
      return
    }

    setSaving(true)

    const payload = {
      po_number: form.po_number.trim() || nextPurchaseOrderNumber(orders),
      vendor: form.vendor.trim(),
      customer_id: form.customer_id || null,
      job_id: form.job_id || null,
      status: form.status || 'draft',
      order_date: form.order_date,
      expected_date: form.expected_date || null,
      subtotal,
      tax,
      total,
      notes: form.notes.trim() || null,
      updated_at: localNowIso(),
    }

    let orderId = editingId
    let result

    if (editingId) {
      result = await supabase.from('purchase_orders').update(payload).eq('id', editingId)
    } else {
      result = await supabase.from('purchase_orders').insert(payload).select('id').single()
      orderId = result.data?.id
    }

    if (result.error || !orderId) {
      setError(result.error?.message || 'Could not save the purchase order.')
      setSaving(false)
      return
    }

    if (editingId) {
      const originalItems = await supabase.from('purchase_order_items').select('id').eq('purchase_order_id', orderId)
      if (originalItems.error) {
        setError(originalItems.error.message)
        setSaving(false)
        return
      }

      const existingIds = new Set(items.filter((item) => !String(item.id).startsWith('new-')).map((item) => item.id))
      const deleteIds = (originalItems.data || []).map((item) => item.id).filter((id) => !existingIds.has(id))
      if (deleteIds.length) {
        const deletions = await supabase.from('purchase_order_items').delete().in('id', deleteIds)
        if (deletions.error) {
          setError(deletions.error.message)
          setSaving(false)
          return
        }
      }
    }

    for (const item of items) {
      const itemPayload = {
        purchase_order_id: orderId,
        inventory_item_id: item.inventory_item_id || null,
        description: String(item.description).trim(),
        quantity: Number(item.quantity || 0),
        received_quantity: Number(item.received_quantity || 0),
        unit_cost: Number(item.unit_cost || 0),
        line_total: Number(item.quantity || 0) * Number(item.unit_cost || 0),
      }

      const itemResult = String(item.id).startsWith('new-')
        ? await supabase.from('purchase_order_items').insert(itemPayload)
        : await supabase.from('purchase_order_items').update(itemPayload).eq('id', item.id)

      if (itemResult.error) {
        setError(itemResult.error.message)
        setSaving(false)
        return
      }
    }

    setSaving(false)
    setShowForm(false)
    resetForm()
    await load()

    if (!editingId) {
      await logCrmActivity({
        customer_id: payload.customer_id,
        job_id: payload.job_id,
        purchase_order_id: orderId,
        activity_type: 'purchase_order_created',
        subject: `Purchase order created: ${payload.po_number}`,
        body: `Purchase order for ${payload.vendor} was created for ${money(total)}.`,
      activity_date: localNowIso(),
    })
    }
  }

  async function deleteOrder(order) {
    if (order.status === 'received' || order.status === 'partially_received') {
      setError('Received purchase orders cannot be deleted. Keep them for purchasing history.')
      return
    }
    if (!window.confirm(`Delete ${order.po_number || 'this purchase order'}?`)) return

    const { error: deleteError } = await supabase.from('purchase_orders').delete().eq('id', order.id)
    if (deleteError) {
      setError(deleteError.message)
      return
    }
    await load()
  }

  async function receiveItem(order, item) {
    const remaining = Number(item.quantity || 0) - Number(item.received_quantity || 0)
    if (remaining <= 0) {
      setError('This line item is already fully received.')
      return
    }

    const answer = window.prompt(`Receive quantity for “${item.description}” (remaining ${remaining}):`, String(remaining))
    if (answer === null) return
    const receivedNow = Number(answer)
    if (!Number.isFinite(receivedNow) || receivedNow <= 0 || receivedNow > remaining) {
      setError(`Enter a quantity greater than 0 and no more than ${remaining}.`)
      return
    }

    setError('')
    setSaving(true)

    if (item.inventory_item_id) {
      const inventoryItem = inventory.find((entry) => entry.id === item.inventory_item_id)
      if (inventoryItem) {
        const { error: inventoryError } = await supabase
          .from('inventory_items')
          .update({
            quantity: Number(inventoryItem.quantity || 0) + receivedNow,
            updated_at: localNowIso(),
          })
          .eq('id', inventoryItem.id)

        if (inventoryError) {
          setError(inventoryError.message)
          setSaving(false)
          return
        }
      }
    }

    const newReceived = Number(item.received_quantity || 0) + receivedNow
    const { error: itemError } = await supabase
      .from('purchase_order_items')
      .update({ received_quantity: newReceived })
      .eq('id', item.id)

    if (itemError) {
      setError(itemError.message)
      setSaving(false)
      return
    }

    const { data: allItems, error: allItemsError } = await supabase
      .from('purchase_order_items')
      .select('quantity, received_quantity')
      .eq('purchase_order_id', order.id)

    if (allItemsError) {
      setError(allItemsError.message)
      setSaving(false)
      return
    }

    const complete = (allItems || []).length > 0 && allItems.every((entry) => Number(entry.received_quantity || 0) >= Number(entry.quantity || 0))
    const anyReceived = (allItems || []).some((entry) => Number(entry.received_quantity || 0) > 0)
    const nextStatus = complete ? 'received' : anyReceived ? 'partially_received' : order.status

    const { error: orderError } = await supabase
      .from('purchase_orders')
      .update({ status: nextStatus, updated_at: localNowIso() })
      .eq('id', order.id)

    if (orderError) setError(orderError.message)

    if (!orderError) {
      const receiveStatus = nextStatus === 'received' ? 'purchase_order_received' : 'purchase_order_partial_received'
      await logCrmActivity({
        customer_id: order.customer_id,
        job_id: order.job_id,
        purchase_order_id: order.id,
        activity_type: receiveStatus,
        subject: `${nextStatus === 'received' ? 'Purchase order received' : 'Purchase order partially received'}: ${order.po_number || order.vendor}`,
        body: `${receivedNow} × ${item.description} received from ${order.vendor}.`,
      activity_date: localNowIso(),
    })
    }

    setSaving(false)
    await load()
  }

  async function printOrder(order) {
    setError('')
    const { data: orderItems, error: itemError } = await supabase
      .from('purchase_order_items')
      .select('description, quantity, unit_cost, line_total, received_quantity')
      .eq('purchase_order_id', order.id)
      .order('created_at')

    if (itemError) {
      setError(itemError.message)
      return
    }

    const customer = customers.find((entry) => entry.id === order.customer_id)
    const job = jobs.find((entry) => entry.id === order.job_id)
    const rows = (orderItems || []).map((item) => `
      <tr>
        <td>${escapeHtml(item.description)}</td>
        <td>${Number(item.quantity || 0)}</td>
        <td>${escapeHtml(money(item.unit_cost))}</td>
        <td>${escapeHtml(money(item.line_total))}</td>
      </tr>`).join('')

    const popup = window.open('', '_blank', 'width=900,height=900')
    if (!popup) {
      setError('Your browser blocked the print window. Allow pop-ups for the CRM and try again.')
      return
    }

    popup.document.write(`<!doctype html><html><head><title>${escapeHtml(order.po_number || 'Purchase Order')}</title>
      <style>
        body{font-family:Arial,sans-serif;color:#111827;margin:40px;line-height:1.45}
        .head{display:flex;justify-content:space-between;gap:30px;border-bottom:2px solid #111827;padding-bottom:20px;margin-bottom:25px}
        h1{margin:0 0 6px;font-size:30px}.muted{color:#6b7280}.box{border:1px solid #d1d5db;border-radius:10px;padding:14px;margin:18px 0}
        table{width:100%;border-collapse:collapse;margin-top:22px}th,td{border-bottom:1px solid #e5e7eb;padding:10px;text-align:left}th{font-size:12px;text-transform:uppercase;letter-spacing:.05em}
        .right{text-align:right}.total{font-size:18px;font-weight:700}.notes{white-space:pre-wrap}
        @media print{body{margin:20px}.no-print{display:none}}
      </style></head><body>
      <div class="head"><div><h1>QVB I.T.</h1><div class="muted">Purchase Order</div></div><div class="right"><h1>${escapeHtml(order.po_number || 'Purchase Order')}</h1><div>Order date: ${escapeHtml(date(order.order_date))}</div><div>Status: ${escapeHtml(purchaseOrderStatusLabel(order.status))}</div></div></div>
      <div class="box"><strong>Vendor</strong><div>${escapeHtml(order.vendor)}</div>${customer ? `<br><strong>Customer</strong><div>${escapeHtml(customer.company_name)}</div>` : ''}${job ? `<br><strong>Job</strong><div>${escapeHtml(job.job_number || 'Job')} · ${escapeHtml(job.title || '')}</div>` : ''}${order.expected_date ? `<br><strong>Expected delivery</strong><div>${escapeHtml(date(order.expected_date))}</div>` : ''}</div>
      <table><thead><tr><th>Description</th><th>Qty</th><th>Unit Cost</th><th>Total</th></tr></thead><tbody>${rows}</tbody></table>
      <div class="box right"><div>Subtotal: ${escapeHtml(money(order.subtotal))}</div><div>Tax: ${escapeHtml(money(order.tax))}</div><div class="total">Total: ${escapeHtml(money(order.total))}</div></div>
      ${order.notes ? `<div class="box"><strong>Notes</strong><div class="notes">${escapeHtml(order.notes)}</div></div>` : ''}
      <button class="no-print" onclick="window.print()">Print</button>
      </body></html>`)
    popup.document.close()
    popup.focus()
  }

  const filteredOrders = orders.filter((order) => {
    const haystack = [order.po_number, order.vendor, order.status, order.customers?.company_name, order.jobs?.job_number, order.jobs?.title, order.notes].filter(Boolean).join(' ').toLowerCase()
    return (!statusFilter || order.status === statusFilter) && haystack.includes(search.toLowerCase())
  })

  return <>
    <PageHeader
      eyebrow="Purchasing"
      title="Purchase Orders"
      description="Create vendor orders, track expected deliveries, receive materials into inventory, and keep purchasing tied to customers and jobs."
      action={<button className="primary-button" onClick={() => { if (showForm) closeForm(); else { resetForm(); setShowForm(true) } }}><PlusCircle size={17} /> {showForm ? 'Close' : 'New purchase order'}</button>}
    />

    {error && <div className="error-box page-error">{error}</div>}

    {showForm && <section className="panel" style={{ marginBottom: '20px' }}>
      <form className="stack-form" onSubmit={saveOrder}>
        <div className="panel-header" style={{ marginBottom: '4px' }}>
          <div><h2>{editingId ? 'Edit purchase order' : 'New purchase order'}</h2><p>Build the vendor order and optionally associate it with a customer and job.</p></div>
        </div>

        <div className="form-grid">
          <label><span>PO number</span><input value={form.po_number} onChange={(e) => setForm({ ...form, po_number: e.target.value })} placeholder="PO-00001" /></label>
          <label><span>Vendor *</span><input value={form.vendor} onChange={(e) => setForm({ ...form, vendor: e.target.value })} placeholder="Vendor / distributor" required /></label>
          <label><span>Customer</span><select value={form.customer_id} onChange={(e) => setForm({ ...form, customer_id: e.target.value, job_id: '' })}><option value="">No customer</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.company_name}</option>)}</select></label>
          <label><span>Job</span><select value={form.job_id} onChange={(e) => setForm({ ...form, job_id: e.target.value })}><option value="">No job</option>{filteredJobs.map((job) => <option key={job.id} value={job.id}>{job.job_number || 'Job'} · {job.title}</option>)}</select></label>
          <label><span>Status</span><select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>{purchaseOrderStatuses.map((status) => <option key={status} value={status}>{purchaseOrderStatusLabel(status)}</option>)}</select></label>
          <label><span>Order date *</span><input type="date" value={form.order_date} onChange={(e) => setForm({ ...form, order_date: e.target.value })} required /></label>
          <label><span>Expected delivery</span><input type="date" value={form.expected_date} onChange={(e) => setForm({ ...form, expected_date: e.target.value })} /></label>
          <label><span>Tax</span><input type="number" min="0" step="0.01" value={form.tax} onChange={(e) => setForm({ ...form, tax: e.target.value })} /></label>
        </div>

        <div className="card" style={{ padding: '16px' }}>
          <div className="card-header"><div><h2>Line items</h2><p>Link items to inventory when you want receiving to increase stock automatically.</p></div><button type="button" className="secondary-button" onClick={addItem}><Plus size={15} /> Add line</button></div>
          {items.length === 0 ? <div className="empty-state">No line items yet. Add a line to start the purchase order.</div> : <div className="table-wrap"><table className="table"><thead><tr><th style={{ minWidth: '220px' }}>Inventory item</th><th>Description</th><th>Qty</th><th>Unit cost</th><th>Total</th><th>Received</th><th></th></tr></thead><tbody>{items.map((item, index) => { const lineTotal = Number(item.quantity || 0) * Number(item.unit_cost || 0); return <tr key={item.id}>
            <td><select value={item.inventory_item_id || ''} onChange={(e) => chooseInventoryItem(index, e.target.value)}><option value="">Manual / no inventory link</option>{inventory.filter((entry) => entry.active !== false).map((entry) => <option key={entry.id} value={entry.id}>{entry.sku ? `${entry.sku} · ` : ''}{entry.name}</option>)}</select></td>
            <td><input value={item.description || ''} onChange={(e) => updateItem(index, { description: e.target.value })} placeholder="Cat6 cable, switch, patch panel..." /></td>
            <td><input type="number" min="0.01" step="0.01" value={item.quantity} onChange={(e) => updateItem(index, { quantity: e.target.value })} /></td>
            <td><input type="number" min="0" step="0.01" value={item.unit_cost} onChange={(e) => updateItem(index, { unit_cost: e.target.value })} /></td>
            <td>{money(lineTotal)}</td>
            <td>{Number(item.received_quantity || 0)} / {Number(item.quantity || 0)}</td>
            <td><button type="button" className="text-button danger" onClick={() => removeItem(index)}>Remove</button></td>
          </tr>})}</tbody></table></div>}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: '20px', alignItems: 'start' }}>
          <label><span>Notes</span><textarea rows="4" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Vendor notes, shipping instructions, special order details..." /></label>
          <div className="card" style={{ padding: '16px' }}><div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}><span>Subtotal</span><strong>{money(subtotal)}</strong></div><div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}><span>Tax</span><strong>{money(tax)}</strong></div><div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '10px', borderTop: '1px solid rgba(15,23,42,.1)' }}><span>Total</span><strong>{money(total)}</strong></div></div>
        </div>

        <div className="form-actions"><button type="submit" className="primary-button" disabled={saving}>{saving ? 'Saving…' : editingId ? 'Save changes' : 'Create purchase order'}</button><button type="button" className="secondary-button" onClick={closeForm} disabled={saving}>Cancel</button></div>
      </form>
    </section>}

    <section className="stats-grid">
      <StatCard label="Purchase orders" value={String(orders.length)} icon={ShoppingCart} />
      <StatCard label="Open orders" value={String(orders.filter((order) => ['draft', 'ordered', 'partially_received'].includes(order.status)).length)} icon={Truck} />
      <StatCard label="Received" value={String(orders.filter((order) => order.status === 'received').length)} icon={CheckCircle2} />
      <StatCard label="Open value" value={money(orders.filter((order) => !['received', 'cancelled'].includes(order.status)).reduce((sum, order) => sum + Number(order.total || 0), 0))} icon={CircleDollarSign} />
    </section>

    <section className="panel">
      <div className="toolbar"><div className="search-box"><Search size={17} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search PO number, vendor, customer, job or notes…" /></div><select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ minWidth: '170px' }}><option value="">All statuses</option>{purchaseOrderStatuses.map((status) => <option key={status} value={status}>{purchaseOrderStatusLabel(status)}</option>)}</select><button className="secondary-button" onClick={load}>Refresh</button></div>

      {loading ? <div className="loading-box">Loading purchase orders…</div> : filteredOrders.length === 0 ? <EmptyState title="No purchase orders" description={search || statusFilter ? 'Try changing your search or status filter.' : 'Create your first purchase order to start tracking purchasing.'} /> : <div className="table-wrap"><table className="table"><thead><tr><th>PO</th><th>Vendor</th><th>Customer</th><th>Job</th><th>Status</th><th>Order date</th><th>Expected</th><th>Total</th><th></th></tr></thead><tbody>{filteredOrders.map((order) => <tr key={order.id}>
        <td><strong>{order.po_number || '—'}</strong></td><td>{order.vendor}</td><td>{order.customers?.company_name || '—'}</td><td>{order.jobs?.job_number || order.jobs?.title || '—'}</td><td><Status status={order.status} /></td><td>{date(order.order_date)}</td><td>{date(order.expected_date)}</td><td>{money(order.total)}</td>
        <td><div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', flexWrap: 'wrap' }}><button className="text-button" onClick={() => openEdit(order)}><Pencil size={14} /> Edit</button><button className="text-button" onClick={() => printOrder(order)}><Printer size={14} /> Print</button>{order.status !== 'received' && order.status !== 'cancelled' && <button className="text-button" onClick={async () => { const { data, error: itemError } = await supabase.from('purchase_order_items').select('id, description, quantity, received_quantity, inventory_item_id, unit_cost').eq('purchase_order_id', order.id).order('created_at'); if (itemError) setError(itemError.message); else { const next = (data || []).find((item) => Number(item.received_quantity || 0) < Number(item.quantity || 0)); if (!next) { setError('All line items are fully received.'); } else await receiveItem(order, next) } }}><Truck size={14} /> Receive</button>}<button className="text-button danger" onClick={() => deleteOrder(order)}>Delete</button></div></td>
      </tr>)}</tbody></table></div>}
    </section>
  </>
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

/* =========================================================
   DOCUMENTS
========================================================= */

const documentCategories = [
  'General',
  'Quote',
  'Invoice',
  'Job',
  'Receipt',
  'Photo',
  'Other',
]

function Documents() {
  const [searchParams] = useSearchParams()
  const [documents, setDocuments] = useState([])
  const [customers, setCustomers] = useState([])
  const [jobs, setJobs] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [showForm, setShowForm] = useState(Boolean(searchParams.get('customerId')))
  const [form, setForm] = useState({
    customer_id: searchParams.get('customerId') || '',
    job_id: '',
    category: 'General',
    notes: '',
    file: null,
  })

  async function load() {
    setLoading(true)
    setError('')

    const [docsResult, customersResult, jobsResult] = await Promise.all([
      supabase
        .from('crm_documents')
        .select('id, customer_id, job_id, file_name, storage_path, file_size, mime_type, category, notes, created_at, customers(company_name), jobs(job_number, title)')
        .order('created_at', { ascending: false }),
      supabase
        .from('customers')
        .select('id, company_name')
        .order('company_name'),
      supabase
        .from('jobs')
        .select('id, job_number, title, customer_id')
        .order('scheduled_date', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })
        .limit(500),
    ])

    const firstError = [docsResult, customersResult, jobsResult].find((r) => r.error)?.error
    if (firstError) setError(firstError.message)
    setDocuments(docsResult.data || [])
    setCustomers(customersResult.data || [])
    setJobs(jobsResult.data || [])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  function resetForm() {
    setForm({ customer_id: searchParams.get('customerId') || '', job_id: '', category: 'General', notes: '', file: null })
  }

  function closeForm() {
    if (!saving) {
      setShowForm(false)
      resetForm()
      setError('')
    }
  }

  function formatFileSize(bytes) {
    const value = Number(bytes || 0)
    if (!value) return '—'
    if (value < 1024) return `${value} B`
    if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
    if (value < 1024 * 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MB`
    return `${(value / (1024 * 1024 * 1024)).toFixed(1)} GB`
  }

  function fileExtension(name) {
    const parts = String(name || '').split('.')
    return parts.length > 1 ? parts.pop().toUpperCase() : 'FILE'
  }

  async function uploadDocument(e) {
    e.preventDefault()
    setSaving(true)
    setError('')

    if (!form.file) {
      setError('Please choose a file to upload.')
      setSaving(false)
      return
    }

    if (!form.customer_id && !form.job_id) {
      setError('Select a customer or job so the document is easy to find later.')
      setSaving(false)
      return
    }

    const safeName = form.file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
    const storagePath = `${unique}-${safeName}`

    const { error: storageError } = await supabase.storage
      .from('crm-documents')
      .upload(storagePath, form.file, {
        cacheControl: '3600',
        upsert: false,
        contentType: form.file.type || 'application/octet-stream',
      })

    if (storageError) {
      setError(storageError.message)
      setSaving(false)
      return
    }

    const { error: dbError } = await supabase.from('crm_documents').insert({
      customer_id: form.customer_id || null,
      job_id: form.job_id || null,
      file_name: form.file.name,
      storage_path: storagePath,
      file_size: form.file.size,
      mime_type: form.file.type || null,
      category: form.category,
      notes: form.notes.trim() || null,
    })

    if (dbError) {
      await supabase.storage.from('crm-documents').remove([storagePath])
      setError(dbError.message)
      setSaving(false)
      return
    }

    await logCrmActivity({
      customer_id: form.customer_id || null,
      job_id: form.job_id || null,
      activity_type: 'document_uploaded',
      subject: `Document uploaded: ${form.file.name}`,
      body: `${form.category} document was uploaded${form.notes.trim() ? ` — ${form.notes.trim()}` : '.'}`,
      activity_date: localNowIso(),
    })

    setSaving(false)
    setShowForm(false)
    resetForm()
    await load()
  }

  async function downloadDocument(document) {
    setError('')
    const { data, error: signedError } = await supabase.storage
      .from('crm-documents')
      .createSignedUrl(document.storage_path, 60)

    if (signedError) {
      setError(signedError.message)
      return
    }

    if (data?.signedUrl) window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
  }

  async function deleteDocument(document) {
    if (!window.confirm(`Delete ${document.file_name}? This removes the stored file and its CRM record.`)) return
    setError('')

    const { error: storageError } = await supabase.storage
      .from('crm-documents')
      .remove([document.storage_path])

    if (storageError) {
      setError(storageError.message)
      return
    }

    const { error: dbError } = await supabase
      .from('crm_documents')
      .delete()
      .eq('id', document.id)

    if (dbError) {
      setError(dbError.message)
      return
    }

    await load()
  }

  const filtered = documents.filter((document) => {
    const haystack = [
      document.file_name,
      document.category,
      document.notes,
      document.customers?.company_name,
      document.jobs?.job_number,
      document.jobs?.title,
    ].filter(Boolean).join(' ').toLowerCase()

    return (!category || document.category === category) && haystack.includes(search.toLowerCase())
  })

  const filteredJobs = form.customer_id
    ? jobs.filter((job) => job.customer_id === form.customer_id)
    : jobs

  return <>
    <PageHeader
      eyebrow="Records"
      title="Documents"
      description="Store quotes, invoices, receipts, job files, photos and other CRM documents in one private library."
      action={<button className="primary-button" onClick={() => {
        if (showForm) closeForm()
        else { resetForm(); setShowForm(true) }
      }}><FileUp size={17} /> {showForm ? 'Close' : 'Upload document'}</button>}
    />

    {error && <div className="error-box page-error">{error}</div>}

    {showForm && <section className="panel" style={{ marginBottom: '20px' }}>
      <form className="stack-form" onSubmit={uploadDocument}>
        <div className="panel-header" style={{ marginBottom: '4px' }}>
          <div><h2>Upload document</h2><p>Choose where this file belongs so it stays connected to your CRM records.</p></div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
          <label>Customer<select value={form.customer_id} onChange={e => setForm({ ...form, customer_id: e.target.value, job_id: '' })}>
            <option value="">Select customer</option>
            {customers.map(customer => <option key={customer.id} value={customer.id}>{customer.company_name}</option>)}
          </select></label>
          <label>Job<select value={form.job_id} onChange={e => {
            const selectedJob = jobs.find(job => job.id === e.target.value)
            setForm({ ...form, job_id: e.target.value, customer_id: selectedJob?.customer_id || form.customer_id })
          }}>
            <option value="">Select job</option>
            {filteredJobs.map(job => <option key={job.id} value={job.id}>{job.job_number || 'Job'} · {job.title}</option>)}
          </select></label>
          <label>Category<select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>
            {documentCategories.map(item => <option key={item} value={item}>{item}</option>)}
          </select></label>
        </div>
        <label>File<input type="file" onChange={e => setForm({ ...form, file: e.target.files?.[0] || null })} required /></label>
        {form.file && <div className="muted">Selected: <strong>{form.file.name}</strong> · {formatFileSize(form.file.size)}</div>}
        <label>Notes<textarea rows={3} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Optional notes about this document" /></label>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
          <button type="button" className="secondary-button" onClick={closeForm} disabled={saving}>Cancel</button>
          <button type="submit" className="primary-button" disabled={saving}>{saving ? 'Uploading…' : 'Upload document'}</button>
        </div>
      </form>
    </section>}

    <section className="panel">
      <div className="toolbar">
        <div className="search-box"><Search size={17} /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search files, customers, jobs or notes…" /></div>
        <select value={category} onChange={e => setCategory(e.target.value)} style={{ minWidth: '150px' }}>
          <option value="">All categories</option>
          {documentCategories.map(item => <option key={item} value={item}>{item}</option>)}
        </select>
        <button className="secondary-button" onClick={load}>Refresh</button>
      </div>

      {loading ? <div className="loading-box">Loading documents…</div> : filtered.length === 0 ? <EmptyState title="No documents" description={search || category ? 'Try changing your search or filter.' : 'Upload your first CRM document to start building the document library.'} /> : <div className="table-wrap">
        <table className="table">
          <thead><tr><th>Document</th><th>Customer</th><th>Job</th><th>Category</th><th>Size</th><th>Added</th><th></th></tr></thead>
          <tbody>{filtered.map(document => <tr key={document.id}>
            <td><div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}><div style={{ width: '36px', height: '36px', borderRadius: '9px', background: 'rgba(15,23,42,.06)', display: 'grid', placeItems: 'center', fontSize: '10px', fontWeight: 800 }}>{fileExtension(document.file_name)}</div><div><strong>{document.file_name}</strong>{document.notes && <div className="muted">{document.notes}</div>}</div></div></td>
            <td>{document.customers?.company_name || '—'}</td>
            <td>{document.jobs?.job_number || document.jobs?.title || '—'}</td>
            <td><Status status={document.category.toLowerCase().replace(/\s+/g, '_')} /></td>
            <td>{formatFileSize(document.file_size)}</td>
            <td>{date(document.created_at)}</td>
            <td><div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}><button type="button" className="text-button" onClick={() => downloadDocument(document)}><Download size={14} /> Open</button><button type="button" className="text-button danger" onClick={() => deleteDocument(document)}>Delete</button></div></td>
          </tr>)}</tbody>
        </table>
      </div>}
    </section>
  </>
}

/* =========================================================
   ACTIVITY & COMMUNICATIONS
========================================================= */

const activityTypes = [
  'call',
  'email',
  'email_sent',
  'meeting',
  'follow_up',
  'site_visit',
  'customer_request',
  'internal_note',
  'general_note',
]

function activityTypeLabel(type) {
  return String(type || 'general_note')
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function localDateTimeInput(value) {
  const parsed = value ? new Date(value) : new Date()
  if (Number.isNaN(parsed.getTime())) return ''
  const pad = (number) => String(number).padStart(2, '0')
  return `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())}T${pad(parsed.getHours())}:${pad(parsed.getMinutes())}`
}

function activityDateTime(value) {
  if (!value) return '—'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return '—'
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(parsed)
}

function followUpStatusLabel(status) {
  return String(status || 'completed')
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function priorityLabel(priority) {
  return String(priority || 'normal').charAt(0).toUpperCase() + String(priority || 'normal').slice(1)
}

function isOpenFollowUp(item) {
  return item?.activity_type === 'follow_up' && item?.follow_up_status !== 'completed' && item?.follow_up_status !== 'cancelled'
}

function FollowUpBadge({ item }) {
  if (!isOpenFollowUp(item)) return null
  const due = item.due_date ? new Date(item.due_date) : null
  const now = new Date()
  const today = localDateKey(now)
  const dueDay = due && !Number.isNaN(due.getTime()) ? localDateKey(due) : ''
  let label = followUpStatusLabel(item.follow_up_status)
  if (dueDay && dueDay < today) label = 'Overdue'
  else if (dueDay === today) label = 'Due today'
  return <span className="status-pill" style={{ marginLeft: '6px' }}>{label} · {priorityLabel(item.priority)}</span>
}

function followUpDueLabel(value) {
  if (!value) return 'No due date'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return 'No due date'
  return `Due ${activityDateTime(parsed)}`
}

function OpportunityDetail() {
  const { opportunityId } = useParams()
  const navigate = useNavigate()
  const [opportunity, setOpportunity] = useState(null)
  const [quotes, setQuotes] = useState([])
  const [jobs, setJobs] = useState([])
  const [activities, setActivities] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const stages = [
    { key: 'new', label: 'New', probability: 25 },
    { key: 'qualified', label: 'Qualified', probability: 50 },
    { key: 'quoted', label: 'Quoted', probability: 65 },
    { key: 'negotiation', label: 'Negotiation', probability: 80 },
    { key: 'won', label: 'Won', probability: 100 },
    { key: 'lost', label: 'Lost', probability: 0 },
  ]

  async function load() {
    setLoading(true)
    setError('')
    const { data: opportunityData, error: opportunityError } = await supabase
      .from('opportunities')
      .select('*, customers(company_name), leads(contact_name, company_name)')
      .eq('id', opportunityId)
      .single()

    if (opportunityError) {
      setError(opportunityError.message)
      setOpportunity(null)
      setLoading(false)
      return
    }

    setOpportunity(opportunityData)

    const [quotesResult, activitiesResult] = await Promise.all([
      supabase
        .from('quotes')
        .select('id, quote_number, title, status, total, customer_id, opportunity_id, created_at')
        .eq('opportunity_id', opportunityId)
        .order('created_at', { ascending: false }),
      fetchCrmActivities({ opportunityId, limit: 100 }),
    ])

    const quoteIds = (quotesResult.data || []).map((quote) => quote.id)
    let jobsResult = { data: [], error: null }
    if (quoteIds.length) {
      jobsResult = await supabase
        .from('jobs')
        .select('id, job_number, title, status, scheduled_date, final_amount, estimated_amount, quote_id')
        .in('quote_id', quoteIds)
        .order('created_at', { ascending: false })
    }

    const firstError = [quotesResult, jobsResult, activitiesResult].find((result) => result?.error)?.error
    if (firstError) setError(firstError.message)

    setQuotes(quotesResult.data || [])
    setJobs(jobsResult.data || [])
    setActivities(activitiesResult.data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [opportunityId])

  async function changeStage(stage) {
    if (!opportunity || opportunity.stage === stage || saving) return
    const stageInfo = stages.find((item) => item.key === stage) || stages[0]
    setSaving(true)
    setError('')
    const { data, error: updateError } = await supabase
      .from('opportunities')
      .update({ stage, probability: stageInfo.probability, updated_at: localNowIso() })
      .eq('id', opportunityId)
      .select('*, customers(company_name), leads(contact_name, company_name)')
      .single()
    if (updateError) {
      setError(updateError.message)
      setSaving(false)
      return
    }
    setOpportunity(data)
    await logCrmActivity({
      customer_id: data.customer_id,
      lead_id: data.lead_id,
      opportunity_id: data.id,
      activity_type: 'opportunity_stage',
      subject: `Opportunity moved to ${stageInfo.label}: ${data.title}`,
      body: `Opportunity stage changed to ${stageInfo.label}.`,
      activity_date: localNowIso(),
    })
    await load()
    setSaving(false)
  }

  async function deleteOpportunity() {
    if (!opportunity) return
    if (!window.confirm(`Delete opportunity “${opportunity.title}”?`)) return
    setSaving(true)
    const { error: deleteError } = await supabase.from('opportunities').delete().eq('id', opportunityId)
    if (deleteError) {
      setError(deleteError.message)
      setSaving(false)
      return
    }
    navigate('/crm/opportunities')
  }

  if (loading) return <div className="empty-state"><p>Loading opportunity…</p></div>

  if (!opportunity) {
    return <>
      <button className="back-button" onClick={() => navigate('/crm/opportunities')}><ArrowLeft size={17} /> Back to opportunities</button>
      <div className="empty-state"><h3>Opportunity not found</h3><p>{error || 'This opportunity may have been deleted.'}</p></div>
    </>
  }

  const stageInfo = stages.find((stage) => stage.key === opportunity.stage) || stages[0]
  const customerName = opportunity.customers?.company_name || opportunity.leads?.company_name || 'No customer assigned'
  const acceptedQuote = quotes.find((quote) => quote.status === 'accepted')
  const linkedJob = acceptedQuote ? jobs.find((job) => job.quote_id === acceptedQuote.id) : null
  const weightedValue = Number(opportunity.estimated_value || 0) * Number(opportunity.probability || 0) / 100

  return <>
    <div style={{ marginBottom: '18px' }}>
      <button className="back-button" onClick={() => navigate('/crm/opportunities')}><ArrowLeft size={17} /> Back to opportunities</button>
    </div>

    <PageHeader
      eyebrow="Sales opportunity"
      title={opportunity.opportunity_number || opportunity.title}
      description={opportunity.title}
      action={<div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
        <button className="primary-button" type="button" onClick={() => navigate(`/crm/quotes?opportunityId=${opportunity.id}`)}><Plus size={16} /> Create quote</button>
        <button className="danger-button" type="button" onClick={deleteOpportunity} disabled={saving}><Trash2 size={16} /> Delete</button>
      </div>}
    />

    {error && <div className="error-box" style={{ marginBottom: '18px' }}>{error}</div>}

    <section className="panel" style={{ marginBottom: '18px' }}>
      <div className="panel-header"><div><h2>Pipeline</h2><p>{customerName}{opportunity.service_requested ? ` · ${opportunity.service_requested}` : ''}</p></div><strong>{money(opportunity.estimated_value)}</strong></div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '14px' }}>
        <div className="metric-card"><div className="metric-label">Stage</div><select value={opportunity.stage} onChange={(e) => changeStage(e.target.value)} disabled={saving}>{stages.map((stage) => <option key={stage.key} value={stage.key}>{stage.label}</option>)}</select></div>
        <div className="metric-card"><div className="metric-label">Probability</div><strong>{opportunity.probability}%</strong><span>{stageInfo.label}</span></div>
        <div className="metric-card"><div className="metric-label">Weighted value</div><strong>{money(weightedValue)}</strong><span>Probability-adjusted</span></div>
        <div className="metric-card"><div className="metric-label">Expected close</div><strong>{opportunity.expected_close_date ? date(opportunity.expected_close_date) : '—'}</strong><span>{opportunity.source || 'No source recorded'}</span></div>
      </div>
      {(opportunity.description || opportunity.notes || opportunity.lost_reason) && <div style={{ marginTop: '18px', display: 'grid', gap: '12px' }}>
        {opportunity.description && <div><strong>Description</strong><p className="muted" style={{ whiteSpace: 'pre-wrap' }}>{opportunity.description}</p></div>}
        {opportunity.notes && <div><strong>Notes</strong><p className="muted" style={{ whiteSpace: 'pre-wrap' }}>{opportunity.notes}</p></div>}
        {opportunity.lost_reason && <div><strong>Lost reason</strong><p className="muted">{opportunity.lost_reason}</p></div>}
      </div>}
    </section>

    <section className="panel" style={{ marginBottom: '18px' }}>
      <div className="panel-header"><div><h2>Quotes</h2><p>{quotes.length} linked quote{quotes.length === 1 ? '' : 's'}. Multiple quotes can belong to this opportunity.</p></div><button className="secondary-button" type="button" onClick={() => navigate(`/crm/quotes?opportunityId=${opportunity.id}`)}><Plus size={16} /> New quote</button></div>
      {quotes.length ? <div className="table-wrap"><table className="table"><thead><tr><th>Quote</th><th>Status</th><th>Total</th><th>Created</th><th></th></tr></thead><tbody>{quotes.map((quote) => <tr key={quote.id} onClick={() => navigate(`/crm/quotes/${quote.id}`)} style={{ cursor: 'pointer' }}><td><strong>{quote.quote_number || 'Unnumbered'}</strong><div className="muted">{quote.title}</div></td><td><Status status={quote.status || 'draft'} /></td><td>{money(quote.total)}</td><td>{date(quote.created_at)}</td><td><button className="secondary-button" type="button" onClick={(event) => { event.stopPropagation(); navigate(`/crm/quotes/${quote.id}`) }}>Open</button></td></tr>)}</tbody></table></div> : <EmptyState title="No quotes yet" description="Create the first quote for this opportunity." />}
    </section>

    {acceptedQuote && <section className="panel" style={{ marginBottom: '18px' }}>
      <div className="panel-header"><div><h2>Won handoff</h2><p>Accepted quote and downstream job for this opportunity.</p></div></div>
      <div className="card" style={{ margin: 0 }}><strong>{acceptedQuote.quote_number || 'Accepted quote'}</strong><div className="muted" style={{ marginTop: '4px' }}>{acceptedQuote.title} · {money(acceptedQuote.total)}</div><div style={{ display: 'flex', gap: '8px', marginTop: '12px', flexWrap: 'wrap' }}><button className="secondary-button" type="button" onClick={() => navigate(`/crm/quotes/${acceptedQuote.id}`)}>Open quote</button>{linkedJob ? <button className="primary-button" type="button" onClick={() => navigate(`/crm/jobs/${linkedJob.id}`)}><BriefcaseBusiness size={16} /> Open job</button> : <span className="muted" style={{ alignSelf: 'center' }}>Open the accepted quote to create the job.</span>}</div></div>
    </section>}

    <section className="panel">
      <div className="panel-header"><div><h2>Activity</h2><p>Sales history for this opportunity.</p></div></div>
      {activities.length ? <div className="timeline">{activities.map((activity) => <div key={activity.id} className="timeline-item"><div className="timeline-dot"><Activity size={14} /></div><div><strong>{activity.subject}</strong><div className="muted">{activityDateTime(activity.activity_date)}</div>{activity.body && <p className="muted" style={{ whiteSpace: 'pre-wrap' }}>{activity.body}</p>}</div></div>)}</div> : <EmptyState title="No activity yet" description="Opportunity events will appear here as the sales process moves forward." />}
    </section>
  </>
}

function Opportunities() {
  const navigate = useNavigate()
  const stages = [
    { key: 'new', label: 'New', probability: 25 },
    { key: 'qualified', label: 'Qualified', probability: 50 },
    { key: 'quoted', label: 'Quoted', probability: 65 },
    { key: 'negotiation', label: 'Negotiation', probability: 80 },
    { key: 'won', label: 'Won', probability: 100 },
    { key: 'lost', label: 'Lost', probability: 0 },
  ]

  const [items, setItems] = useState([])
  const [customers, setCustomers] = useState([])
  const [leads, setLeads] = useState([])
  const [quotes, setQuotes] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [view, setView] = useState('kanban')
  const [search, setSearch] = useState('')
  const [stageFilter, setStageFilter] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState(null)
  const emptyForm = {
    opportunity_number: '',
    customer_id: '',
    lead_id: '',
    title: '',
    description: '',
    stage: 'new',
    estimated_value: '0',
    probability: '25',
    expected_close_date: '',
    service_requested: '',
    source: '',
    lost_reason: '',
    notes: '',
  }
  const [form, setForm] = useState(emptyForm)

  async function load() {
    setLoading(true)
    setError('')
    const [opportunityResult, customerResult, leadResult, quoteResult] = await Promise.all([
      supabase.from('opportunities').select('*, customers(company_name), leads(contact_name, company_name)').order('created_at', { ascending: false }).limit(1000),
      supabase.from('customers').select('id, company_name').order('company_name'),
      supabase.from('leads').select('id, contact_name, company_name, estimated_value, service_requested').order('created_at', { ascending: false }).limit(1000),
      supabase.from('quotes').select('id, quote_number, title, status, total, customer_id, opportunity_id, customers(company_name)').order('created_at', { ascending: false }).limit(1000),
    ])
    const firstError = [opportunityResult, customerResult, leadResult, quoteResult].find((r) => r.error)?.error
    if (firstError) setError(firstError.message)
    setItems(opportunityResult.data || [])
    setCustomers(customerResult.data || [])
    setLeads(leadResult.data || [])
    setQuotes(quoteResult.data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  function startNew() {
    setEditing(null)
    setForm(emptyForm)
    setShowForm(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function editItem(item) {
    setEditing(item)
    setForm({
      opportunity_number: item.opportunity_number || '',
      customer_id: item.customer_id || '',
      lead_id: item.lead_id || '',
      title: item.title || '',
      description: item.description || '',
      stage: item.stage || 'new',
      estimated_value: String(item.estimated_value ?? 0),
      probability: String(item.probability ?? 25),
      expected_close_date: item.expected_close_date || '',
      service_requested: item.service_requested || '',
      source: item.source || '',
      lost_reason: item.lost_reason || '',
      notes: item.notes || '',
    })
    setShowForm(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function updateField(e) {
    const { name, value } = e.target
    setForm((current) => ({ ...current, [name]: value }))
    if (name === 'stage') {
      const stage = stages.find((item) => item.key === value)
      if (stage) setForm((current) => ({ ...current, probability: String(stage.probability) }))
    }
  }

  function applyLead(leadId) {
    const lead = leads.find((item) => item.id === leadId)
    setForm((current) => ({
      ...current,
      lead_id: leadId,
      title: current.title || (lead ? `${lead.service_requested || 'New opportunity'} — ${lead.company_name || lead.contact_name}` : ''),
      customer_id: current.customer_id,
      estimated_value: current.estimated_value === '0' && lead?.estimated_value != null ? String(lead.estimated_value) : current.estimated_value,
      service_requested: current.service_requested || lead?.service_requested || '',
    }))
  }

  async function save(e) {
    e.preventDefault()
    setError('')
    if (!form.title.trim()) { setError('Opportunity title is required.'); return }
    const probability = Math.min(100, Math.max(0, Number(form.probability || 0)))
    const estimatedValue = Math.max(0, Number(form.estimated_value || 0))
    const payload = {
      opportunity_number: form.opportunity_number.trim() || null,
      customer_id: form.customer_id || null,
      lead_id: form.lead_id || null,
      title: form.title.trim(),
      description: form.description.trim() || null,
      stage: form.stage || 'new',
      estimated_value: estimatedValue,
      probability,
      expected_close_date: form.expected_close_date || null,
      service_requested: form.service_requested.trim() || null,
      source: form.source.trim() || null,
      lost_reason: form.lost_reason.trim() || null,
      notes: form.notes.trim() || null,
      updated_at: localNowIso(),
    }
    setSaving(true)
    const result = editing
      ? await supabase.from('opportunities').update(payload).eq('id', editing.id).select('*, customers(company_name), leads(contact_name, company_name)').single()
      : await supabase.from('opportunities').insert(payload).select('*, customers(company_name), leads(contact_name, company_name)').single()
    if (result.error) { setError(result.error.message); setSaving(false); return }
    const data = result.data
    const previousStage = editing?.stage
    if (!editing || previousStage !== data.stage) {
      await logCrmActivity({
        customer_id: data.customer_id,
        lead_id: data.lead_id,
        opportunity_id: data.id,
        activity_type: 'opportunity_stage',
        subject: editing ? `Opportunity moved to ${data.stage}: ${data.title}` : `Opportunity created: ${data.title}`,
        body: editing ? `Opportunity stage changed from ${previousStage || 'new'} to ${data.stage}.` : `New sales opportunity created with an estimated value of ${money(data.estimated_value)}.`,
        activity_date: localNowIso(),
      })
    }
    setShowForm(false)
    setEditing(null)
    setForm(emptyForm)
    setSaving(false)
    await load()
  }

  async function changeStage(item, stage) {
    if (item.stage === stage) return
    const stageInfo = stages.find((entry) => entry.key === stage) || stages[0]
    setError('')
    const { data, error: updateError } = await supabase.from('opportunities').update({ stage, probability: stageInfo.probability, updated_at: localNowIso() }).eq('id', item.id).select('*, customers(company_name), leads(contact_name, company_name)').single()
    if (updateError) { setError(updateError.message); return }
    await logCrmActivity({
      customer_id: data.customer_id,
      lead_id: data.lead_id,
      opportunity_id: data.id,
      activity_type: 'opportunity_stage',
      subject: `Opportunity moved to ${stageInfo.label}: ${data.title}`,
      body: `Opportunity stage changed from ${item.stage} to ${stage}.`,
      activity_date: localNowIso(),
    })
    await load()
  }

  async function deleteItem(item) {
    if (!window.confirm(`Delete opportunity “${item.title}”?`)) return
    const { error: deleteError } = await supabase.from('opportunities').delete().eq('id', item.id)
    if (deleteError) { setError(deleteError.message); return }
    await load()
  }

  const filtered = items.filter((item) => {
    const q = search.trim().toLowerCase()
    const matchesSearch = !q || [item.title, item.opportunity_number, item.service_requested, item.source, item.customers?.company_name, item.leads?.company_name, item.leads?.contact_name].some((value) => String(value || '').toLowerCase().includes(q))
    return matchesSearch && (!stageFilter || item.stage === stageFilter)
  })

  const openItems = filtered.filter((item) => !['won', 'lost'].includes(item.stage))
  const openValue = openItems.reduce((sum, item) => sum + Number(item.estimated_value || 0), 0)
  const weightedValue = openItems.reduce((sum, item) => sum + Number(item.estimated_value || 0) * Number(item.probability || 0) / 100, 0)
  const wonValue = filtered.filter((item) => item.stage === 'won').reduce((sum, item) => sum + Number(item.estimated_value || 0), 0)
  const overdueCount = openItems.filter((item) => item.expected_close_date && item.expected_close_date < localTodayInputValue()).length
  const quoteCount = (item) => quotes.filter((quote) => quote.opportunity_id === item.id).length

  function stageItems(stage) { return filtered.filter((item) => item.stage === stage) }

  return <>
    <PageHeader
      eyebrow="Sales"
      title="Opportunities"
      description="Manage the sales pipeline from first qualification through won or lost."
      action={<button className="primary-button" onClick={startNew}><Plus size={17} /> New opportunity</button>}
    />

    {error && <div className="error-box page-error">{error}</div>}

    <div className="stat-grid" style={{ marginBottom: '20px' }}>
      <div className="stat-card"><span>Open pipeline</span><strong>{money(openValue)}</strong><small>{openItems.length} open opportunities</small></div>
      <div className="stat-card"><span>Weighted pipeline</span><strong>{money(weightedValue)}</strong><small>Probability-adjusted value</small></div>
      <div className="stat-card"><span>Won</span><strong>{money(wonValue)}</strong><small>{stageItems('won').length} won opportunities</small></div>
      <div className="stat-card"><span>Overdue closes</span><strong>{overdueCount}</strong><small>Open opportunities past expected close</small></div>
    </div>

    {showForm && <section className="panel" style={{ marginBottom: '20px' }}>
      <div className="panel-header"><div><h2>{editing ? 'Edit opportunity' : 'New opportunity'}</h2><p>Keep the sales record separate from individual quotes so multiple proposals can belong to one opportunity.</p></div></div>
      <form onSubmit={save} className="form-card">
        <div className="form-grid">
          <label>Opportunity number<input name="opportunity_number" value={form.opportunity_number} onChange={updateField} placeholder="OPP-1001" /></label>
          <label>Title *<input name="title" value={form.title} onChange={updateField} placeholder="Network refresh — ABC Company" required /></label>
          <label>Customer<select name="customer_id" value={form.customer_id} onChange={updateField}><option value="">No customer selected</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.company_name}</option>)}</select></label>
          <label>Lead<select name="lead_id" value={form.lead_id} onChange={(e) => applyLead(e.target.value)}><option value="">No lead linked</option>{leads.map((lead) => <option key={lead.id} value={lead.id}>{lead.company_name || lead.contact_name} — {lead.service_requested || 'Lead'}</option>)}</select></label>
          <label>Stage<select name="stage" value={form.stage} onChange={updateField}>{stages.map((stage) => <option key={stage.key} value={stage.key}>{stage.label}</option>)}</select></label>
          <label>Estimated value<input type="number" min="0" step="0.01" name="estimated_value" value={form.estimated_value} onChange={updateField} /></label>
          <label>Probability %<input type="number" min="0" max="100" step="5" name="probability" value={form.probability} onChange={updateField} /></label>
          <label>Expected close date<input type="date" name="expected_close_date" value={form.expected_close_date} onChange={updateField} /></label>
          <label>Service requested<input name="service_requested" value={form.service_requested} onChange={updateField} placeholder="Network installation" /></label>
          <label>Source<input name="source" value={form.source} onChange={updateField} placeholder="Referral, website, existing customer…" /></label>
          {form.stage === 'lost' && <label>Lost reason<input name="lost_reason" value={form.lost_reason} onChange={updateField} placeholder="Budget, timing, competitor…" /></label>}
          <label style={{ gridColumn: '1 / -1' }}>Description<textarea name="description" value={form.description} onChange={updateField} rows="3" placeholder="Opportunity scope and sales context" /></label>
          <label style={{ gridColumn: '1 / -1' }}>Notes<textarea name="notes" value={form.notes} onChange={updateField} rows="3" placeholder="Internal sales notes" /></label>
        </div>
        <div className="form-actions"><button type="button" className="secondary-button" onClick={() => { setShowForm(false); setEditing(null) }} disabled={saving}>Cancel</button><button type="submit" className="primary-button" disabled={saving}>{saving ? 'Saving…' : editing ? 'Save opportunity' : 'Create opportunity'}</button></div>
      </form>
    </section>}

    <section className="panel">
      <div className="toolbar">
        <div className="search-box"><Search size={17} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search opportunities, customers or services…" /></div>
        <select value={stageFilter} onChange={(e) => setStageFilter(e.target.value)}><option value="">All stages</option>{stages.map((stage) => <option key={stage.key} value={stage.key}>{stage.label}</option>)}</select>
        <button className={view === 'kanban' ? 'primary-button' : 'secondary-button'} onClick={() => setView('kanban')}>Kanban</button>
        <button className={view === 'list' ? 'primary-button' : 'secondary-button'} onClick={() => setView('list')}>List</button>
        <button className="secondary-button" onClick={load} disabled={loading}>Refresh</button>
      </div>

      {loading ? <div className="loading-box">Loading opportunities…</div> : filtered.length === 0 ? <EmptyState title="No opportunities" description="Create an opportunity to start tracking a sales deal." /> : view === 'kanban' ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, minmax(210px, 1fr))', gap: '14px', overflowX: 'auto', paddingBottom: '6px' }}>
          {stages.map((stage) => <div key={stage.key} style={{ minWidth: '210px', background: 'rgba(15,23,42,.025)', border: '1px solid rgba(15,23,42,.08)', borderRadius: '12px', padding: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', alignItems: 'center', marginBottom: '12px' }}><strong>{stage.label}</strong><span className="muted">{stageItems(stage.key).length}</span></div>
            <div className="muted" style={{ marginBottom: '12px', fontSize: '12px' }}>{money(stageItems(stage.key).reduce((sum, item) => sum + Number(item.estimated_value || 0), 0))}</div>
            <div style={{ display: 'grid', gap: '10px' }}>
              {stageItems(stage.key).map((item) => <div key={item.id} className="card" style={{ padding: '13px', margin: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}><button className="table-link" type="button" onClick={() => navigate(`/crm/opportunities/${item.id}`)} style={{ textAlign: 'left', padding: 0 }}>{item.title}</button><button className="icon-button" title="Edit" onClick={() => editItem(item)}><Pencil size={14} /></button></div>
                <div className="muted" style={{ marginTop: '7px' }}>{item.customers?.company_name || item.leads?.company_name || 'No customer'} </div>
                <div style={{ marginTop: '10px', fontWeight: 700 }}>{money(item.estimated_value)}</div>
                <div className="muted" style={{ marginTop: '3px' }}>{item.probability}% probability{item.expected_close_date ? ` · Close ${date(item.expected_close_date)}` : ''}</div>
                {quoteCount(item) > 0 && <div className="muted" style={{ marginTop: '5px' }}>{quoteCount(item)} linked quote{quoteCount(item) === 1 ? '' : 's'}</div>}
                <div style={{ display: 'flex', gap: '6px', marginTop: '11px', flexWrap: 'wrap' }}>
                  <select value={item.stage} onChange={(e) => changeStage(item, e.target.value)} aria-label={`Move ${item.title}`} style={{ maxWidth: '100%' }}>{stages.map((entry) => <option key={entry.key} value={entry.key}>{entry.label}</option>)}</select>
                  <button className="secondary-button" type="button" onClick={() => navigate(`/crm/opportunities/${item.id}`)}>Open</button>
                  <button className="text-button danger" onClick={() => deleteItem(item)}>Delete</button>
                </div>
              </div>)}
            </div>
          </div>)}
        </div>
      ) : <div className="table-wrap"><table className="table"><thead><tr><th>Opportunity</th><th>Customer</th><th>Stage</th><th>Value</th><th>Probability</th><th>Expected close</th><th>Quotes</th><th></th></tr></thead><tbody>{filtered.map((item) => <tr key={item.id}>
        <td><button className="table-link" type="button" onClick={() => navigate(`/crm/opportunities/${item.id}`)}><strong>{item.title}</strong></button>{item.opportunity_number && <div className="muted">{item.opportunity_number}</div>}{item.service_requested && <div className="muted">{item.service_requested}</div>}</td>
        <td>{item.customers?.company_name || item.leads?.company_name || '—'}</td>
        <td>{stages.find((stage) => stage.key === item.stage)?.label || item.stage}</td>
        <td><strong>{money(item.estimated_value)}</strong></td>
        <td>{item.probability}%<div className="muted">{money(Number(item.estimated_value || 0) * Number(item.probability || 0) / 100)} weighted</div></td>
        <td>{item.expected_close_date ? date(item.expected_close_date) : '—'}</td>
        <td>{quoteCount(item)}</td>
        <td><div className="inline-actions"><button className="secondary-button" type="button" onClick={() => navigate(`/crm/opportunities/${item.id}`)}>Open</button><button className="icon-button" title="Edit" onClick={() => editItem(item)}><Pencil size={16} /></button><button className="icon-button danger" title="Delete" onClick={() => deleteItem(item)}><Trash2 size={16} /></button></div></td>
      </tr>)}</tbody></table></div>}
    </section>
  </>
}

function ActivityForm({ customers = [], jobs = [], initial = null, customerId = '', onSaved, onCancel }) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState(() => ({
    customer_id: initial?.customer_id || customerId || '',
    job_id: initial?.job_id || '',
    activity_type: initial?.activity_type || 'general_note',
    subject: initial?.subject || '',
    body: initial?.body || '',
    activity_date: initial?.activity_date
      ? localDateTimeInput(initial.activity_date)
      : localDateTimeInput(),
    created_by: initial?.created_by || '',
    follow_up_status: initial?.follow_up_status || (initial?.activity_type === 'follow_up' ? 'open' : 'completed'),
    priority: initial?.priority || 'normal',
    due_date: initial?.due_date ? localDateTimeInput(initial.due_date) : (initial?.activity_type === 'follow_up' ? localDateTimeInput() : ''),
    assigned_to: initial?.assigned_to || '',
  }))

  const filteredJobs = form.customer_id
    ? jobs.filter((job) => job.customer_id === form.customer_id)
    : jobs

  function update(name, value) {
    setForm((current) => ({ ...current, [name]: value }))
  }

  async function save(e) {
    e.preventDefault()
    setError('')

    if (!form.subject.trim()) {
      setError('Subject is required.')
      return
    }

    if (!form.activity_date) {
      setError('Activity date and time are required.')
      return
    }

    setSaving(true)

    const payload = {
      customer_id: form.customer_id || null,
      job_id: form.job_id || null,
      activity_type: form.activity_type,
      subject: form.subject.trim(),
      body: form.body.trim() || null,
      activity_date: new Date(form.activity_date).toISOString(),
      created_by: form.created_by.trim() || null,
      follow_up_status: form.activity_type === 'follow_up' ? (form.follow_up_status || 'open') : 'completed',
      priority: form.activity_type === 'follow_up' ? (form.priority || 'normal') : 'normal',
      due_date: form.activity_type === 'follow_up' && form.due_date ? new Date(form.due_date).toISOString() : null,
      assigned_to: form.activity_type === 'follow_up' ? (form.assigned_to.trim() || null) : null,
      completed_at: form.activity_type === 'follow_up' && form.follow_up_status === 'completed' ? (initial?.completed_at || localNowIso()) : null,
    }

    const result = initial?.id
      ? await supabase.from('crm_activities').update(payload).eq('id', initial.id).select().single()
      : await supabase.from('crm_activities').insert(payload).select().single()

    if (result.error) {
      setError(result.error.message)
      setSaving(false)
      return
    }

    setSaving(false)
    if (onSaved) await onSaved(result.data)
  }

  return (
    <form onSubmit={save} className="form-card" style={{ border: '1px solid rgba(15,23,42,.08)' }}>
      {error && <div className="alert">{error}</div>}

      <div className="form-grid">
        {customers.length > 0 && (
          <label>
            Customer
            <select
              value={form.customer_id}
              onChange={(e) => update('customer_id', e.target.value) || update('job_id', '')}
            >
              <option value="">Select customer</option>
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>{customer.company_name}</option>
              ))}
            </select>
          </label>
        )}

        <label>
          Activity type *
          <select value={form.activity_type} onChange={(e) => update('activity_type', e.target.value)} required>
            {activityTypes.map((type) => <option key={type} value={type}>{activityTypeLabel(type)}</option>)}
          </select>
        </label>

        {form.activity_type === 'follow_up' && (
          <>
            <label>
              Follow-up status
              <select value={form.follow_up_status} onChange={(e) => update('follow_up_status', e.target.value)}>
                <option value="open">Open</option>
                <option value="in_progress">In progress</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </label>
            <label>
              Priority
              <select value={form.priority} onChange={(e) => update('priority', e.target.value)}>
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </label>
            <label>
              Due date & time
              <input type="datetime-local" value={form.due_date} onChange={(e) => update('due_date', e.target.value)} />
            </label>
            <label>
              Assigned to
              <input value={form.assigned_to} onChange={(e) => update('assigned_to', e.target.value)} placeholder="Technician or staff member" />
            </label>
          </>
        )}

        <label>
          Job
          <select value={form.job_id} onChange={(e) => update('job_id', e.target.value)}>
            <option value="">No job</option>
            {filteredJobs.map((job) => (
              <option key={job.id} value={job.id}>{job.job_number ? `${job.job_number} — ` : ''}{job.title}</option>
            ))}
          </select>
        </label>

        <label>
          Date & time *
          <input type="datetime-local" value={form.activity_date} onChange={(e) => update('activity_date', e.target.value)} required />
        </label>

        <label>
          Logged by
          <input value={form.created_by} onChange={(e) => update('created_by', e.target.value)} placeholder="Your name or initials" />
        </label>

        <label className="full-width">
          Subject *
          <input value={form.subject} onChange={(e) => update('subject', e.target.value)} placeholder="What happened?" required />
        </label>

        <label className="full-width">
          Notes
          <textarea rows="5" value={form.body} onChange={(e) => update('body', e.target.value)} placeholder="Add communication details, next steps, or internal notes…" />
        </label>
      </div>

      <div className="form-actions">
        {onCancel && <button type="button" className="secondary-button" onClick={onCancel} disabled={saving}>Cancel</button>}
        <button type="submit" className="primary-button" disabled={saving}>{saving ? 'Saving…' : initial?.id ? 'Save Activity' : 'Add Activity'}</button>
      </div>
    </form>
  )
}

function ActivityTimeline({ activities, onEdit, onDelete }) {
  if (!activities.length) {
    return (
      <div className="empty-state" style={{ margin: 0 }}>
        <div className="empty-icon"><Activity size={20} /></div>
        <h3>No activity yet</h3>
        <p>Log calls, emails, meetings, follow-ups, and customer notes here.</p>
      </div>
    )
  }

  return (
    <div style={{ display: 'grid', gap: '0' }}>
      {activities.map((item, index) => (
        <div key={item.id} style={{ display: 'grid', gridTemplateColumns: '34px 1fr', gap: '12px', position: 'relative' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div style={{ width: '30px', height: '30px', borderRadius: '50%', background: 'rgba(15,23,42,.07)', display: 'grid', placeItems: 'center' }}>
              {item.activity_type === 'call' ? <Phone size={15} /> : item.activity_type === 'email' ? <Mail size={15} /> : item.activity_type === 'meeting' ? <CalendarDays size={15} /> : <MessageSquare size={15} />}
            </div>
            {index < activities.length - 1 && <div style={{ width: '1px', flex: 1, minHeight: '34px', background: 'rgba(15,23,42,.12)' }} />}
          </div>

          <div style={{ paddingBottom: '22px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
              <div>
                <strong>{item.subject}</strong>
                <div style={{ marginTop: '4px', fontSize: '12px', color: 'var(--muted, #64748b)' }}>
                  {activityTypeLabel(item.activity_type)} · {activityDateTime(item.activity_date)}{item.created_by ? ` · ${item.created_by}` : ''}
                  <FollowUpBadge item={item} />
                </div>
                {item.activity_type === 'follow_up' && (
                  <div style={{ marginTop: '5px', fontSize: '12px', color: 'var(--muted, #64748b)' }}>
                    {followUpDueLabel(item.due_date)}{item.assigned_to ? ` · Assigned to ${item.assigned_to}` : ''}
                  </div>
                )}
              </div>
              {(onEdit || onDelete) && (
                <div style={{ display: 'flex', gap: '8px' }}>
                  {onEdit && <button type="button" className="text-button" onClick={() => onEdit(item)}><Pencil size={13} /> Edit</button>}
                  {onDelete && <button type="button" className="text-button danger" onClick={() => onDelete(item)}>Delete</button>}
                </div>
              )}
            </div>
            {item.body && <div style={{ marginTop: '8px', whiteSpace: 'pre-wrap', lineHeight: 1.55 }}>{item.body}</div>}
            {(item.jobs?.job_number || item.jobs?.title || item.quotes?.quote_number || item.invoices?.invoice_number || item.purchase_orders?.po_number) && (
              <div style={{ marginTop: '8px', fontSize: '12px', color: 'var(--muted, #64748b)' }}>
                {item.jobs?.job_number && `Job ${item.jobs.job_number}`}
                {!item.jobs?.job_number && item.jobs?.title && `Job ${item.jobs.title}`}
                {item.quotes?.quote_number && ` · Quote ${item.quotes.quote_number}`}
                {item.invoices?.invoice_number && ` · Invoice ${item.invoices.invoice_number}`}
                {item.purchase_orders?.po_number && ` · PO ${item.purchase_orders.po_number}`}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

function CustomerActivityTimeline({ customer, activities, jobs, quotes, invoices, payments, onSaved }) {
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState(null)
  const [error, setError] = useState('')

  async function deleteActivity(item) {
    if (!window.confirm(`Delete activity “${item.subject}”?`)) return
    const { error: deleteError } = await supabase.from('crm_activities').delete().eq('id', item.id)
    if (deleteError) {
      setError(deleteError.message)
      return
    }
    await onSaved()
  }

  return (
    <section className="card" style={{ marginTop: '20px' }}>
      <div className="card-header">
        <div>
          <h2>Activity Timeline</h2>
          <p>Customer communications, follow-ups, and internal notes.</p>
        </div>
        <button type="button" className="primary-button" onClick={() => { setEditing(null); setShowForm((current) => !current); }}>
          <Plus size={16} /> {showForm ? 'Close' : 'Add Activity'}
        </button>
      </div>

      {error && <div className="alert">{error}</div>}

      {showForm && (
        <div style={{ marginBottom: '22px' }}>
          <ActivityForm
            customerId={customer.id}
            jobs={jobs}
            initial={editing}
            onCancel={() => { setShowForm(false); setEditing(null) }}
            onSaved={async () => { setShowForm(false); setEditing(null); await onSaved() }}
          />
        </div>
      )}

      <ActivityTimeline
        activities={activities}
        onEdit={(item) => { setEditing(item); setShowForm(true); window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }) }}
        onDelete={deleteActivity}
      />
    </section>
  )
}

function FollowUps() {
  const navigate = useNavigate()
  const [items, setItems] = useState([])
  const [customers, setCustomers] = useState([])
  const [jobs, setJobs] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState('open')
  const [priorityFilter, setPriorityFilter] = useState('')
  const [customerFilter, setCustomerFilter] = useState('')
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState(null)
  const [savingId, setSavingId] = useState('')

  async function load() {
    setLoading(true)
    setError('')
    const [activityResult, customerResult, jobsResult] = await Promise.all([
      supabase
        .from('crm_activities')
        .select('id, customer_id, lead_id, job_id, quote_id, invoice_id, opportunity_id, activity_type, subject, body, activity_date, created_by, created_at, follow_up_status, priority, due_date, assigned_to, completed_at, customers(company_name), jobs(job_number, title)')
        .eq('activity_type', 'follow_up')
        .order('due_date', { ascending: true, nullsFirst: false })
        .limit(500),
      supabase.from('customers').select('id, company_name').order('company_name'),
      supabase.from('jobs').select('id, customer_id, job_number, title').order('created_at', { ascending: false }).limit(500),
    ])
    const firstError = [activityResult, customerResult, jobsResult].find((r) => r.error)?.error
    if (firstError) setError(firstError.message)
    setItems(activityResult.data || [])
    setCustomers(customerResult.data || [])
    setJobs(jobsResult.data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const today = localDateKey(new Date())
  const weekEnd = new Date()
  weekEnd.setHours(23, 59, 59, 999)
  weekEnd.setDate(weekEnd.getDate() + (7 - weekEnd.getDay()))
  const weekEndKey = localDateKey(weekEnd)

  const openItems = items.filter((item) => isOpenFollowUp(item))
  const overdue = openItems.filter((item) => item.due_date && localDateKey(new Date(item.due_date)) < today)
  const dueToday = openItems.filter((item) => item.due_date && localDateKey(new Date(item.due_date)) === today)
  const dueThisWeek = openItems.filter((item) => {
    if (!item.due_date) return false
    const dueDay = localDateKey(new Date(item.due_date))
    return dueDay >= today && dueDay <= weekEndKey
  })
  const highPriority = openItems.filter((item) => item.priority === 'high' || item.priority === 'urgent')

  function matchesBucket(item) {
    const isOpen = isOpenFollowUp(item)
    const dueDay = item.due_date ? localDateKey(new Date(item.due_date)) : ''

    if (filter === 'open') return isOpen
    if (filter === 'overdue') return isOpen && dueDay && dueDay < today
    if (filter === 'today') return isOpen && dueDay === today
    if (filter === 'this_week') return isOpen && dueDay >= today && dueDay <= weekEndKey
    if (filter === 'high_priority') return isOpen && (item.priority === 'high' || item.priority === 'urgent')
    return item.follow_up_status === filter
  }

  const filtered = items.filter((item) => {
    const q = search.trim().toLowerCase()
    const matchesSearch = !q || [
      item.subject,
      item.body,
      item.customers?.company_name,
      item.jobs?.job_number,
      item.jobs?.title,
      item.assigned_to,
    ].some((value) => String(value || '').toLowerCase().includes(q))
    const matchesFilter = !filter || matchesBucket(item)
    const matchesPriority = !priorityFilter || item.priority === priorityFilter
    const matchesCustomer = !customerFilter || item.customer_id === customerFilter
    return matchesSearch && matchesFilter && matchesPriority && matchesCustomer
  })

  async function setFollowUpStatus(item, status) {
    setError('')
    setSavingId(item.id)
    const completedAt = status === 'completed' ? localNowIso() : null
    const { error: updateError } = await supabase
      .from('crm_activities')
      .update({ follow_up_status: status, completed_at: completedAt })
      .eq('id', item.id)
    if (updateError) {
      setError(updateError.message)
      setSavingId('')
      return
    }
    if (status === 'completed') {
      await logCrmActivity({
        customer_id: item.customer_id,
        lead_id: item.lead_id,
        job_id: item.job_id,
        quote_id: item.quote_id,
        invoice_id: item.invoice_id,
        opportunity_id: item.opportunity_id,
        activity_type: 'general_note',
        subject: `Follow-up completed: ${item.subject}`,
        body: item.body || null,
        activity_date: localNowIso(),
      })
    }
    setSavingId('')
    await load()
  }

  async function reschedule(item, days) {
    setError('')
    setSavingId(item.id)
    const base = item.due_date ? new Date(item.due_date) : new Date()
    if (Number.isNaN(base.getTime())) base.setTime(Date.now())
    base.setDate(base.getDate() + days)
    const { error: updateError } = await supabase
      .from('crm_activities')
      .update({ due_date: base.toISOString(), follow_up_status: 'open', completed_at: null })
      .eq('id', item.id)
    if (updateError) setError(updateError.message)
    setSavingId('')
    await load()
  }

  async function deleteFollowUp(item) {
    if (!window.confirm(`Delete follow-up “${item.subject}”?`)) return
    setError('')
    const { error: deleteError } = await supabase.from('crm_activities').delete().eq('id', item.id)
    if (deleteError) { setError(deleteError.message); return }
    await load()
  }

  function openRelated(item) {
    if (item.opportunity_id) return navigate(`/crm/opportunities/${item.opportunity_id}`)
    if (item.quote_id) return navigate(`/crm/quotes/${item.quote_id}`)
    if (item.invoice_id) return navigate(`/crm/invoices/${item.invoice_id}`)
    if (item.job_id) return navigate(`/crm/jobs/${item.job_id}`)
    if (item.lead_id) return navigate(`/crm/leads/${item.lead_id}`)
    if (item.customer_id) return navigate(`/crm/customers/${item.customer_id}`)
  }

  function relatedLabel(item) {
    if (item.opportunity_id) return 'Opportunity'
    if (item.quote_id) return 'Quote'
    if (item.invoice_id) return 'Invoice'
    if (item.job_id) return 'Job'
    if (item.lead_id) return 'Lead'
    if (item.customer_id) return 'Customer'
    return ''
  }

  return <>
    <PageHeader
      eyebrow="Workflow"
      title="Follow-ups"
      description="Your daily queue for customer calls, quote follow-ups, site visits, and other work that needs attention."
      action={<button className="primary-button" onClick={() => { setEditing(null); setShowForm(true) }}><Plus size={17} /> New follow-up</button>}
    />

    {error && <div className="error-box page-error">{error}</div>}

    <div className="stat-grid" style={{ marginBottom: '20px' }}>
      <button type="button" className="stat-card" onClick={() => setFilter('overdue')} style={{ textAlign: 'left', cursor: 'pointer' }}><span>Overdue</span><strong>{overdue.length}</strong><small>Needs attention now</small></button>
      <button type="button" className="stat-card" onClick={() => setFilter('today')} style={{ textAlign: 'left', cursor: 'pointer' }}><span>Due today</span><strong>{dueToday.length}</strong><small>Due on {date(today)}</small></button>
      <button type="button" className="stat-card" onClick={() => setFilter('this_week')} style={{ textAlign: 'left', cursor: 'pointer' }}><span>This week</span><strong>{dueThisWeek.length}</strong><small>Due through this week</small></button>
      <button type="button" className="stat-card" onClick={() => setFilter('high_priority')} style={{ textAlign: 'left', cursor: 'pointer' }}><span>High priority</span><strong>{highPriority.length}</strong><small>High or urgent</small></button>
    </div>

    {showForm && <section className="panel" style={{ marginBottom: '20px' }}>
      <div className="panel-header"><div><h2>{editing ? 'Edit Follow-up' : 'New Follow-up'}</h2><p>Set the customer, due date, priority, and next action.</p></div></div>
      <ActivityForm
        customers={customers}
        jobs={jobs}
        initial={editing || { activity_type: 'follow_up', follow_up_status: 'open', priority: 'normal' }}
        onCancel={() => { setShowForm(false); setEditing(null) }}
        onSaved={async () => { setShowForm(false); setEditing(null); await load() }}
      />
    </section>}

    <section className="panel">
      <div className="toolbar">
        <div className="search-box"><Search size={17} /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search follow-ups, customers or jobs…" /></div>
        <select value={filter} onChange={e => setFilter(e.target.value)}>
          <option value="open">All open</option>
          <option value="overdue">Overdue</option>
          <option value="today">Due today</option>
          <option value="this_week">Due this week</option>
          <option value="high_priority">High priority</option>
          <option value="">All statuses</option>
          <option value="in_progress">In progress</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <select value={priorityFilter} onChange={e => setPriorityFilter(e.target.value)}><option value="">All priorities</option><option value="urgent">Urgent</option><option value="high">High</option><option value="normal">Normal</option><option value="low">Low</option></select>
        <select value={customerFilter} onChange={e => setCustomerFilter(e.target.value)}><option value="">All customers</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.company_name}</option>)}</select>
        <button className="secondary-button" onClick={load}>Refresh</button>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', marginBottom: '14px', flexWrap: 'wrap' }}>
        <div className="muted">Showing {filtered.length} of {items.length} follow-ups</div>
        {(filter || priorityFilter || customerFilter || search) && <button className="text-button" type="button" onClick={() => { setFilter('open'); setPriorityFilter(''); setCustomerFilter(''); setSearch('') }}>Clear filters</button>}
      </div>

      {loading ? <div className="loading-box">Loading follow-ups…</div> : filtered.length === 0 ? <EmptyState title="No follow-ups" description="Create a follow-up when there is a customer or operational task that needs attention." /> : <div className="table-wrap">
        <table className="table">
          <thead><tr><th>Follow-up</th><th>Customer</th><th>Due</th><th>Priority</th><th>Status</th><th>Assigned to</th><th></th></tr></thead>
          <tbody>{filtered.map(item => {
            const overdueItem = isOpenFollowUp(item) && item.due_date && localDateKey(new Date(item.due_date)) < today
            const related = relatedLabel(item)
            return <tr key={item.id}>
              <td>
                <strong>{item.subject}</strong>
                {item.body && <div className="muted">{item.body}</div>}
                {related && <button type="button" className="text-button" style={{ marginTop: '5px' }} onClick={() => openRelated(item)}>Open {related} →</button>}
              </td>
              <td>{item.customers?.company_name || '—'}{item.jobs?.job_number ? <div className="muted">{item.jobs.job_number} · {item.jobs.title}</div> : ''}</td>
              <td>{item.due_date ? <span style={{ fontWeight: overdueItem ? 700 : 500 }}>{activityDateTime(item.due_date)}</span> : 'No due date'}</td>
              <td>{priorityLabel(item.priority)}</td>
              <td>{overdueItem ? 'Overdue' : followUpStatusLabel(item.follow_up_status)}</td>
              <td>{item.assigned_to || '—'}</td>
              <td><div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', flexWrap: 'wrap' }}>
                {isOpenFollowUp(item) && <>
                  <button className="text-button" type="button" disabled={savingId === item.id} onClick={() => setFollowUpStatus(item, 'completed')}><CheckCircle2 size={14} /> Complete</button>
                  <button className="text-button" type="button" disabled={savingId === item.id} onClick={() => reschedule(item, 1)}>+1 day</button>
                  <button className="text-button" type="button" disabled={savingId === item.id} onClick={() => reschedule(item, 7)}>+1 week</button>
                </>}
                <button className="text-button" type="button" onClick={() => { setEditing(item); setShowForm(true); window.scrollTo({ top: 0, behavior: 'smooth' }) }}><Pencil size={14} /> Edit</button>
                <button className="text-button danger" type="button" onClick={() => deleteFollowUp(item)}>Delete</button>
              </div></td>
            </tr>
          })}</tbody>
        </table>
      </div>}
    </section>
  </>
}
function ActivityLog() {
  const [activities, setActivities] = useState([])
  const [customers, setCustomers] = useState([])
  const [jobs, setJobs] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [customerFilter, setCustomerFilter] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState(null)

  async function load() {
    setLoading(true)
    setError('')
    const [activityResult, customerResult, jobsResult] = await Promise.all([
      fetchCrmActivities({
        select: 'id, customer_id, job_id, activity_type, subject, body, activity_date, created_by, created_at, follow_up_status, priority, due_date, assigned_to, completed_at, customers(company_name), jobs(job_number, title)',
        orderColumn: 'activity_date',
        ascending: false,
        limit: 500,
      }),
      supabase.from('customers').select('id, company_name').order('company_name'),
      supabase.from('jobs').select('id, customer_id, job_number, title').order('created_at', { ascending: false }).limit(500),
    ])
    const firstError = [activityResult, customerResult, jobsResult].find((result) => result.error)?.error
    if (firstError) {
      setError(firstError.message)
    } else {
      setActivities(activityResult.data || [])
      setCustomers(customerResult.data || [])
      setJobs(jobsResult.data || [])
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function deleteActivity(item) {
    if (!window.confirm(`Delete activity “${item.subject}”?`)) return
    const { error: deleteError } = await supabase.from('crm_activities').delete().eq('id', item.id)
    if (deleteError) { setError(deleteError.message); return }
    await load()
  }

  const filtered = activities.filter((item) => {
    const q = search.trim().toLowerCase()
    const matchesSearch = !q || [item.subject, item.body, item.customers?.company_name, item.jobs?.job_number, item.jobs?.title, item.created_by].some((value) => String(value || '').toLowerCase().includes(q))
    const matchesType = !typeFilter || item.activity_type === typeFilter
    const matchesCustomer = !customerFilter || item.customer_id === customerFilter
    return matchesSearch && matchesType && matchesCustomer
  })

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Activity</h1>
          <p>Centralized customer communications and CRM activity history.</p>
        </div>
        <button type="button" className="primary-button" onClick={() => { setEditing(null); setShowForm((current) => !current) }}>
          <Plus size={16} /> {showForm ? 'Close' : 'Add Activity'}
        </button>
      </div>

      {error && <div className="alert">{error}</div>}

      {showForm && (
        <section className="card" style={{ marginBottom: '20px' }}>
          <div className="card-header"><div><h2>{editing ? 'Edit Activity' : 'Log Activity'}</h2><p>Keep a record of calls, emails, meetings, and follow-ups.</p></div></div>
          <ActivityForm
            customers={customers}
            jobs={jobs}
            initial={editing}
            onCancel={() => { setShowForm(false); setEditing(null) }}
            onSaved={async () => { setShowForm(false); setEditing(null); await load() }}
          />
        </section>
      )}

      <section className="card">
        <div className="card-header">
          <div><h2>Timeline</h2><p>{filtered.length} of {activities.length} activities</p></div>
          <button type="button" className="secondary-button" onClick={load}>Refresh</button>
        </div>

        <div className="toolbar" style={{ marginBottom: '18px' }}>
          <div className="search-box"><Search size={16} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search activity…" /></div>
          <select value={customerFilter} onChange={(e) => setCustomerFilter(e.target.value)}><option value="">All customers</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.company_name}</option>)}</select>
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}><option value="">All types</option>{activityTypes.map((type) => <option key={type} value={type}>{activityTypeLabel(type)}</option>)}</select>
        </div>

        {loading ? <div className="loading-box">Loading activity…</div> : <ActivityTimeline activities={filtered} onEdit={(item) => { setEditing(item); setShowForm(true); window.scrollTo({ top: 0, behavior: 'smooth' }) }} onDelete={deleteActivity} />}
      </section>
    </div>
  )
}

/* =========================================================
   HELPERS
========================================================= */

function money(value) {

  return value == null
    ? '—'
    : new Intl.NumberFormat(
        'en-US',
        {
          style: 'currency',
          currency: 'USD',
          maximumFractionDigits: 2,
        }
      ).format(value)
}


function date(value) {
  if (!value) return '—'

  // Date-only database fields (YYYY-MM-DD) must be parsed as a local date.
  // new Date('YYYY-MM-DD') is interpreted as UTC, which can display the
  // previous day for users in U.S. time zones.
  const text = String(value)
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  const parsed = match
    ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
    : new Date(value)

  return Number.isNaN(parsed.getTime())
    ? '—'
    : new Intl.DateTimeFormat(
        'en-US',
        {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        }
      ).format(parsed)
}


/* =========================================================
   START REACT
========================================================= */

ReactDOM
  .createRoot(
    document.getElementById('root')
  )
  .render(
    <BrowserRouter>
      <App />
    </BrowserRouter>
  )
