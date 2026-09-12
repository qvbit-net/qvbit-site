import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

const MODULES = {
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
  for (const [prefix, module] of Object.entries(MODULES)) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) return module
  }
  return null
}

function actionForButton(button) {
  const label = `${button.textContent || ''} ${button.getAttribute('title') || ''} ${button.getAttribute('aria-label') || ''}`.trim().toLowerCase()
  if (/\b(delete|remove|trash)\b/.test(label)) return 'delete'
  if (/\b(edit|modify)\b/.test(label)) return 'update'
  if (/\b(add|new|create|invite)\b/.test(label)) return 'create'
  return null
}

export default function AccessEnforcer({ permissions = {}, isOwner = false, ready = false }) {
  const location = useLocation()

  useEffect(() => {
    if (!ready) return undefined

    const module = moduleForPath(location.pathname)
    if (!module) return undefined

    const permission = isOwner
      ? { can_create: true, can_update: true, can_delete: true }
      : (permissions[module] || {})

    const enforce = () => {
      document.querySelectorAll('button').forEach((button) => {
        const action = actionForButton(button)
        if (!action) return

        const allowed = action === 'create'
          ? permission.can_create === true
          : action === 'update'
            ? permission.can_update === true
            : permission.can_delete === true

        if (!allowed) {
          button.disabled = true
          button.setAttribute('aria-disabled', 'true')
          button.setAttribute('title', 'Not permitted for your CRM role')
          button.dataset.crmPermissionBlocked = 'true'
          button.style.opacity = '0.45'
          button.style.cursor = 'not-allowed'
        } else if (button.dataset.crmPermissionBlocked === 'true') {
          delete button.dataset.crmPermissionBlocked
          button.removeAttribute('aria-disabled')
          button.removeAttribute('title')
          button.disabled = false
          button.style.opacity = ''
          button.style.cursor = ''
        }
      })
    }

    enforce()
    const observer = new MutationObserver(enforce)
    observer.observe(document.body, { childList: true, subtree: true, characterData: true })

    return () => observer.disconnect()
  }, [location.pathname, permissions, isOwner, ready])

  return null
}
