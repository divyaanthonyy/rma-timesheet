#!/usr/bin/env dotenv-cli -e .env -- npx tsx
import { createClient } from '@libsql/client'

const client = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN!,
})

async function migrate() {
  console.log('→ Adding start_month column...')
  await client.execute(`ALTER TABLE user_projects ADD COLUMN start_month TEXT;`)

  console.log('→ Copying month data to start_month...')
  await client.execute(`UPDATE user_projects SET start_month = month;`)

  console.log('→ Adding end_month column...')
  await client.execute(`ALTER TABLE user_projects ADD COLUMN end_month TEXT;`)

  console.log('→ Dropping month column...')
  await client.execute(`ALTER TABLE user_projects DROP COLUMN month;`)

  console.log('→ Verifying migration...')
  const info = await client.execute(`PRAGMA table_info(user_projects);`)
  const cols = info.rows.map((r: any) => r.name)
  console.log('Columns:', cols)

  if (cols.includes('start_month') && !cols.includes('month')) {
    console.log('✓ Migration complete!')
  } else {
    console.error('✗ Migration may have failed. Columns:', cols)
    process.exit(1)
  }
}

migrate().catch((e) => {
  console.error('Migration failed:', e)
  process.exit(1)
})
