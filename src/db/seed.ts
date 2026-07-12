import { drizzle } from 'drizzle-orm/libsql'
import { createClient } from '@libsql/client'
import * as schema from './schema'
import { users, projects, userProjects } from './schema'

const client = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN!,
})

const db = drizzle(client, { schema })

async function seed() {
  console.log('seeding database...')

  // insert projects
  await db.insert(projects).values([
    { id: 'proj-1', name: 'SEDA-KL01', client: 'SEDA' },
    { id: 'proj-2', name: 'TNB-PV02', client: 'TNB' },
    { id: 'proj-3', name: 'GreenX-03', client: 'GreenX' },
  ])

  // insert engineers
  await db.insert(users).values([
    {
      id: 'E-007',
      name: 'Ahmad Razif',
      employeeNumber: 'E-007',
      position: 'Solar Engineer',
      role: 'engineer',
      manDayRate: 850,
      email: 'ahmad@rmafiventures.com',
    },
    {
      id: 'E-003',
      name: 'Siti Nabilah',
      employeeNumber: 'E-003',
      position: 'Project Engineer',
      role: 'engineer',
      manDayRate: 800,
      email: 'siti@rmafiventures.com',
    },
    {
      id: 'E-011',
      name: 'Hafizuddin',
      employeeNumber: 'E-011',
      position: 'M&E Engineer',
      role: 'engineer',
      manDayRate: 800,
      email: 'hafiz@rmafiventures.com',
    },
    {
      id: 'E-002',
      name: 'Rashdan Yusof',
      employeeNumber: 'E-002',
      position: 'Sr. Engineer',
      role: 'engineer',
      manDayRate: 950,
      email: 'rashdan@rmafiventures.com',
    },
    {
      id: 'E-009',
      name: 'Nurul Ain',
      employeeNumber: 'E-009',
      position: 'Civil Engineer',
      role: 'engineer',
      manDayRate: 800,
      email: 'nurul@rmafiventures.com',
    },
    {
      id: 'E-005',
      name: 'Mohd Faizal',
      employeeNumber: 'E-005',
      position: 'Elec. Engineer',
      role: 'engineer',
      manDayRate: 800,
      email: 'faizal@rmafiventures.com',
    },
    {
      id: 'A-001',
      name: 'Puan Norlia',
      employeeNumber: 'A-001',
      position: 'HR & Finance',
      role: 'admin',
      manDayRate: 0,
      email: 'admin@rmafiventures.com',
    },
  ])

  // assign projects to engineers (open-ended from June 2026)
  await db.insert(userProjects).values([
    { id: 'up-1', userId: 'E-007', projectId: 'proj-1', startMonth: '2026-06', endMonth: null },
    { id: 'up-2', userId: 'E-007', projectId: 'proj-2', startMonth: '2026-06', endMonth: null },
    { id: 'up-3', userId: 'E-003', projectId: 'proj-1', startMonth: '2026-06', endMonth: null },
    { id: 'up-4', userId: 'E-011', projectId: 'proj-2', startMonth: '2026-06', endMonth: null },
    { id: 'up-5', userId: 'E-011', projectId: 'proj-3', startMonth: '2026-06', endMonth: null },
    { id: 'up-6', userId: 'E-002', projectId: 'proj-3', startMonth: '2026-06', endMonth: null },
    { id: 'up-7', userId: 'E-009', projectId: 'proj-1', startMonth: '2026-06', endMonth: null },
    { id: 'up-8', userId: 'E-009', projectId: 'proj-2', startMonth: '2026-06', endMonth: null },
    { id: 'up-9', userId: 'E-005', projectId: 'proj-3', startMonth: '2026-06', endMonth: null },
  ])

  console.log('done!')
  process.exit(0)
}

seed().catch((e) => {
  console.error(e)
  process.exit(1)
})
