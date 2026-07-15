import {
  Outlet,
  createRootRoute,
  useLocation,
  Link,
  HeadContent,
  Scripts,
} from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { getRequestHeaders } from '@tanstack/react-start/server'
import { useState, useEffect } from 'react'
import { auth } from '../lib/auth'
import { getUserByEmail } from '../db/queries'
import { signOut } from '../lib/auth-client'
import '../styles.css'

export const Route = createRootRoute({
  component: RootLayout,
})

type NavItem = {
  to: '/engineer/timesheet' | '/admin/dashboard' | '/login' |  '/admin/employees' | '/admin/projects' | '/admin/timesheet' | '/admin/manpower' | '/admin/archive'
  label: string
}

const ENGINEER_NAV: NavItem[] = [
  { to: '/engineer/timesheet', label: 'Timesheet' },
]

const ADMIN_NAV: NavItem[] = [
  { to: '/admin/dashboard',  label: 'Dashboard'      },
  { to: '/admin/employees',  label: 'Employees'      },
  { to: '/admin/projects',   label: 'Projects'       },
  { to: '/admin/timesheet',  label: 'Timesheet'      },
  { to: '/admin/manpower',   label: 'Analytics'       },
  { to: '/admin/archive',    label: 'Archive'         },
]

const getCurrentUser = createServerFn().handler(async () => {
  const headers = getRequestHeaders()
  const session = await auth.api.getSession({ headers })
  if (!session) return null
  return getUserByEmail(session.user.email)
})

function RootLayout() {
  const location = useLocation()
  const isLogin = location.pathname === '/login'
  const isAdmin = location.pathname.startsWith('/admin')
  const [user, setUser] = useState<{ name: string; employeeNumber: string; role: string } | null>(null)

  useEffect(() => {
    getCurrentUser().then(setUser)
  }, [])

  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body className="bg-gray-950 min-h-screen">
        {isLogin ? (
          <Outlet />
        ) : (
          <div className="flex min-h-screen">
            <Sidebar isAdmin={isAdmin} user={user} />
            <div className="flex-1 flex flex-col ml-[220px]">
              <Topbar isAdmin={isAdmin} user={user} />
              <main className="flex-1 p-8">
                <Outlet />
              </main>
            </div>
          </div>
        )}
        <Scripts />
      </body>
    </html>
  )
}

function Sidebar({ isAdmin, user }: { isAdmin: boolean; user: { name: string; employeeNumber: string; role: string } | null }) {
  const location = useLocation()
  const navItems = isAdmin ? ADMIN_NAV : ENGINEER_NAV
  const [confirmLogout, setConfirmLogout] = useState(false)
  const initials = user
    ? user.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    : isAdmin ? 'AD' : 'EN'
  const displayName = user?.name ?? (isAdmin ? 'Admin' : 'Engineer')
  const displayRole = user ? `${user.role === 'admin' ? 'Admin' : 'Engineer'} · ${user.employeeNumber}` : (isAdmin ? 'Admin' : 'Engineer')

  async function handleLogout() {
    await signOut()
    window.location.href = '/login'
  }

  return (
    <aside className="fixed top-0 left-0 h-screen w-[220px] bg-gray-900 border-r border-gray-800 flex flex-col">
      <div className="p-5 border-b border-gray-800">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-gray-800 border border-gray-700 rounded-lg flex items-center justify-center">
            <span className="text-amber-400 text-[10px] font-bold">RMA</span>
          </div>
          <div>
            <p className="text-white text-xs font-medium">RMA Fiventures</p>
            <p className="text-gray-600 text-[10px]">Timesheet Portal</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 p-3 flex flex-col gap-0.5 mt-1">
        <p className="text-[10px] text-gray-700 uppercase tracking-widest px-3 mb-2">
          {isAdmin ? 'Admin' : 'My workspace'}
        </p>
        {navItems.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            className={`flex items-center px-3 py-2.5 rounded-lg text-sm transition-all ${
              location.pathname === item.to
                ? 'bg-gray-800 text-amber-400 border-l-2 border-amber-400 pl-[10px]'
                : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800/50'
            }`}
          >
            {item.label}
          </Link>
        ))}
      </nav>

      <div className="p-4 border-t border-gray-800">
        <div className="flex items-center gap-2.5 mb-3">
          <div className="w-7 h-7 rounded-full bg-gray-700 flex items-center justify-center text-gray-300 text-xs font-medium flex-shrink-0">
            {initials}
          </div>
          <div className="min-w-0">
            <p className="text-white text-xs font-medium truncate">
              {displayName}
            </p>
            <p className="text-gray-600 text-[10px] truncate">
              {displayRole}
            </p>
          </div>
        </div>
        <button
          onClick={() => setConfirmLogout(true)}
          className="w-full text-xs text-gray-500 hover:text-gray-300 bg-gray-800/50 hover:bg-gray-800 border border-gray-800 hover:border-gray-700 rounded-lg py-2 transition-colors"
        >
          Sign out
        </button>
      </div>

      {confirmLogout && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 w-full max-w-sm mx-4">
            <h3 className="text-white text-sm font-medium mb-2">Sign out</h3>
            <p className="text-gray-400 text-sm mb-6">
              Are you sure you want to sign out?
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setConfirmLogout(false)}
                className="text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 px-4 py-2 rounded-lg border border-gray-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleLogout}
                className="text-xs bg-amber-500 hover:bg-amber-400 text-gray-950 font-medium px-4 py-2 rounded-lg transition-colors"
              >
                Sign out
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  )
}

function Topbar({ isAdmin, user }: { isAdmin: boolean; user: { name: string; employeeNumber: string; role: string } | null }) {
  return (
    <header className="h-[52px] bg-gray-900 border-b border-gray-800 flex items-center justify-between px-8">
      <p className="text-gray-600 text-[11px] uppercase tracking-widest">
        {isAdmin ? 'Admin Portal' : 'Engineer Portal'}
      </p>
      <div className="flex items-center gap-3">
        <div className="w-2 h-2 rounded-full bg-emerald-500" />
        <span className="text-gray-400 text-xs">
          {user?.name ?? (isAdmin ? 'Admin' : 'Engineer')}
        </span>
      </div>
    </header>
  )
}