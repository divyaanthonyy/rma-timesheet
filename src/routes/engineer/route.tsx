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

export const Route = createFileRoute('/engineer')({
  beforeLoad: async () => {
    const user = await getSessionUser()

    // not signed in, or signed in with an email the admin never registered
    if (!user) {
      throw redirect({ to: '/login', search: { error: 'unauthorized' } })
    }

    // admins are sent to their own portal regardless of engineer access
    if (user.role === 'admin') {
      throw redirect({ to: '/admin/dashboard' })
    }

    return { sessionUser: user }
  },
  component: EngineerLayout,
})

function EngineerLayout() {
  return <Outlet />
}