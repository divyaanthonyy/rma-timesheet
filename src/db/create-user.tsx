import { auth } from '../lib/auth'

async function createUser() {
  const result = await auth.api.signUpEmail({
    body: {
      name: 'Ahmad Razif',
      email: 'ahmad@rmafiventures.com',
      password: 'password123',
    },
  })
  console.log('user created:', result)
  process.exit(0)
}

createUser().catch((e) => {
  console.error(e)
  process.exit(1)
})