import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { getRequestHeaders } from '@tanstack/react-start/server'
import { auth } from '../../lib/auth'
import { getUserByEmail } from '../../db/queries'

// Returns the app-level user (from the `users` table) for the current session,
// or null when there is no session / no registered user for that email.
const getSessionUser = createServerFn().handler(async () => {
  const headers = getRequestHeaders()
  const session = await auth.api.getSession({ headers })
  if (!session) return null
  return getUserByEmail(session.user.email)
})

export const Route = createFileRoute('/admin')({
  beforeLoad: async () => {
    const user = await getSessionUser()

    // not signed in, or signed in with an email the admin never registered
    if (!user) {
      throw redirect({ to: '/login', search: { error: 'unauthorized' } })
    }

    // signed in as an engineer — not allowed into the admin portal
    if (user.role !== 'admin') {
      throw redirect({ to: '/engineer/timesheet' })
    }

    // expose the user to child routes via context if needed later
    return { sessionUser: user }
  },
  component: AdminLayout,
})

function AdminLayout() {
  return <Outlet />
}