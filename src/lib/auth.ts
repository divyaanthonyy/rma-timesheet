import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { tanstackStartCookies } from 'better-auth/tanstack-start'

import { db } from '../db'

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL!,
   trustedOrigins: [
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:3002',
    'http://localhost:3003',
    'http://localhost:3004',
    'https://tanstack-start-app.rma-fiventures-ap.workers.dev',
  ],
  database: drizzleAdapter(db, {
    provider: 'sqlite',
  }),
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    },
  },
  secret: process.env.BETTER_AUTH_SECRET!,
  plugins: [tanstackStartCookies()],
})dev