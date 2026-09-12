import { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

const routeModules = {
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
}

function moduleForPath(pathname) {
  if (pathname.startsWith('/crm/leads/')) return 'leads'
  if (pathname.startsWith('/crm/opportunities/')) return 'opportunities'
  if (pathname.startsWith('/crm/customers/')) return 'customers'
  if (pathname.startsWith('/crm/quotes/')) return 'quotes'
  if (pathname.startsWith('/crm/jobs/')) return 'jobs'
  if (pathname.startsWith('/crm/invoices/')) return 'invoices'
  return routeModules[pathname] || null
}

export default function PermissionRouterGuard({ permissions = {}, isOwner = false, ready = false }) {
  const location = useLocation()
  const navigate = useNavigate()

  useEffect(() => {
    if (!ready || isOwner) return

    const module = moduleForPath(location.pathname)
    if (!module) return

    const allowed = permissions[module]?.can_view === true
    if (!allowed && location.pathname !== '/crm/') {
      navigate('/crm/', { replace: true })
    }
  }, [location.pathname, permissions, isOwner, ready, navigate])

  return null
}
