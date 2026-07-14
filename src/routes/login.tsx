import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { signIn } from '../lib/auth-client'

export const Route = createFileRoute('/login')({
  component: LoginPage,
})

function LoginPage() {
  const [unauthorized, setUnauthorized] = useState(false)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('error') === 'unauthorized') {
      setUnauthorized(true)
    }
  }, [])

  async function handleGoogleLogin() {
    await signIn.social({
      provider: 'google',
      callbackURL: '/engineer/timesheet',
    })
  }

  async function handleMicrosoftLogin() {
    await signIn.social({
      provider: 'microsoft',
      callbackURL: '/engineer/timesheet',
    })
  }

  return (
    <div className="w-full min-h-screen bg-gray-950 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-10">
          <div className="w-12 h-12 bg-gray-800 border border-gray-700 rounded-xl flex items-center justify-center mx-auto mb-5">
            <span className="text-amber-400 text-sm font-bold tracking-tight">RMA</span>
          </div>
          <h1 className="text-white text-2xl font-medium tracking-tight">RMA Fiventures</h1>
          <p className="text-gray-500 text-sm mt-2">Timesheet Portal · Sign in to continue</p>
        </div>

        {unauthorized && (
          <div className="bg-red-950/30 border border-red-900/50 rounded-xl p-4 mb-4">
            <p className="text-red-400 text-xs text-center">
              Your account is not registered. Please contact your administrator.
            </p>
          </div>
        )}

        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 flex flex-col gap-3">
          <button
            onClick={handleGoogleLogin}
            className="w-full flex items-center justify-center gap-3 bg-white hover:bg-gray-100 text-gray-900 font-medium text-sm py-3 rounded-xl transition-colors"
          >
            <svg width="18" height="18" viewBox="0 0 18 18">
              <path fill="#4285F4" d="M16.51 8H8.98v3h4.3c-.18 1-.74 1.48-1.6 2.04v2.01h2.6a7.8 7.8 0 0 0 2.38-5.88c0-.57-.05-.66-.15-1.18z"/>
              <path fill="#34A853" d="M8.98 17c2.16 0 3.97-.72 5.3-1.94l-2.6-2a4.8 4.8 0 0 1-7.18-2.54H1.83v2.07A8 8 0 0 0 8.98 17z"/>
              <path fill="#FBBC05" d="M4.5 10.52a4.8 4.8 0 0 1 0-3.04V5.41H1.83a8 8 0 0 0 0 7.18z"/>
              <path fill="#EA4335" d="M8.98 4.18c1.17 0 2.23.4 3.06 1.2l2.3-2.3A8 8 0 0 0 1.83 5.4L4.5 7.49a4.77 4.77 0 0 1 4.48-3.3z"/>
            </svg>
            Sign in with Google
          </button>
          <button
            onClick={handleMicrosoftLogin}
            className="w-full flex items-center justify-center gap-3 bg-white hover:bg-gray-100 text-gray-900 font-medium text-sm py-3 rounded-xl transition-colors"
          >
            <svg width="18" height="18" viewBox="0 0 18 18">
              <rect x="1" y="1" width="7.5" height="7.5" fill="#F25022"/>
              <rect x="9.5" y="1" width="7.5" height="7.5" fill="#7FBA00"/>
              <rect x="1" y="9.5" width="7.5" height="7.5" fill="#00A4EF"/>
              <rect x="9.5" y="9.5" width="7.5" height="7.5" fill="#FFB900"/>
            </svg>
            Sign in with Microsoft
          </button>
        </div>

        <p className="text-gray-700 text-xs text-center mt-6">
          Contact your administrator if you need access.
        </p>
      </div>
    </div>
  )
}