import { drizzle } from 'drizzle-orm/libsql'
import { createClient } from '@libsql/client'
import { eq, and, lte, gte, or, isNull } from 'drizzle-orm'
import { timesheetEntries, timesheets, userProjects, projects, users } from './schema'
import * as schema from './schema'
import { nanoid } from 'nanoid'

function getDb() {
  const client = createClient({
    url: process.env.TURSO_DATABASE_URL!,
    authToken: process.env.TURSO_AUTH_TOKEN!,
  })
  return drizzle(client, { schema })
}

// load all entries for a user for a given month
export async function loadEntriesForMonth(userId: string, month: string) {
  const db = getDb()
  const entries = await db
    .select()
    .from(timesheetEntries)
    .where(and(eq(timesheetEntries.userId, userId)))

  // filter by month on the date string e.g. '2026-06-03' starts with '2026-06'
  return entries.filter((e) => e.date.startsWith(month))
}

// save or update a single cell
export async function upsertEntry(
  userId: string,
  projectId: string,
  date: string,
  hours: number,
) {
  const db = getDb()

  // check if entry already exists
  const existing = await db
    .select()
    .from(timesheetEntries)
    .where(
      and(
        eq(timesheetEntries.userId, userId),
        eq(timesheetEntries.projectId, projectId),
        eq(timesheetEntries.date, date),
      ),
    )

  if (existing.length > 0) {
    // update existing
    await db
      .update(timesheetEntries)
      .set({ hours })
      .where(eq(timesheetEntries.id, existing[0].id))
  } else {
    // insert new
    await db.insert(timesheetEntries).values({
      id: nanoid(),
      userId,
      projectId,
      date,
      hours,
    })
  }
}

// load projects assigned to a user for a given month (range-aware)
export async function loadUserProjects(userId: string, month: string) {
  const db = getDb()
  return db
    .select({ id: projects.id, name: projects.name })
    .from(userProjects)
    .innerJoin(projects, eq(userProjects.projectId, projects.id))
    .where(
      and(
        eq(userProjects.userId, userId),
        lte(userProjects.startMonth, month),
        or(isNull(userProjects.endMonth), gte(userProjects.endMonth, month)),
      ),
    )
}

// update timesheet status
export async function updateTimesheetStatus(
  userId: string,
  month: string,
  status: 'draft' | 'submitted' | 'approved' | 'returned',
  returnNote?: string,
) {
  const db = getDb()

  const existing = await db
    .select()
    .from(timesheets)
    .where(and(eq(timesheets.userId, userId), eq(timesheets.month, month)))

  if (existing.length > 0) {
    await db
      .update(timesheets)
      .set({
        status,
        returnNote: returnNote ?? null,
        submittedAt:
          status === 'submitted'
            ? new Date().toISOString()
            : existing[0].submittedAt,
        approvedAt:
          status === 'approved'
            ? new Date().toISOString()
            : existing[0].approvedAt,
      })
      .where(eq(timesheets.id, existing[0].id))
  } else {
    await db.insert(timesheets).values({
      id: nanoid(),
      userId,
      month,
      status,
      returnNote: returnNote ?? null,
      submittedAt: status === 'submitted' ? new Date().toISOString() : null,
      approvedAt: status === 'approved' ? new Date().toISOString() : null,
    })
  }
}

// load all timesheet statuses for a given month (admin use)
export async function loadAllTimesheetStatuses(month: string) {
  const db = getDb()
  return db
    .select({ userId: timesheets.userId, status: timesheets.status })
    .from(timesheets)
    .where(eq(timesheets.month, month))
}

// load a single timesheet status and return note
export async function loadTimesheetStatus(userId: string, month: string) {
  const db = getDb()
  const result = await db
    .select({ status: timesheets.status, returnNote: timesheets.returnNote })
    .from(timesheets)
    .where(and(eq(timesheets.userId, userId), eq(timesheets.month, month)))
  return result[0] ?? null
}

// load all users
export async function loadAllUsers() {
  const db = getDb()
  return db.select().from(users)
}

// create a new user
export async function createUserRecord(data: {
  id: string
  name: string
  email: string
  employeeNumber: string
  position: string
  role: string
  manDayRate: number
}) {
  const db = getDb()
  const existing = await db
    .select()
    .from(users)
    .where(eq(users.email, data.email))
  if (existing.length > 0) {
    throw new Error(`A user with email ${data.email} already exists`)
  }
  await db.insert(users).values(data)
  const month = new Date().toISOString().slice(0, 7)
  await db.insert(timesheets).values({
    id: nanoid(),
    userId: data.id,
    month,
    status: 'draft',
  })
}

// load all projects
export async function loadAllProjects() {
  const db = getDb()
  return db.select().from(projects)
}

// assign a project to a user for a duration
export async function assignProjectToUser(
  userId: string,
  projectId: string,
  startMonth: string,
  endMonth?: string | null,
) {
  const db = getDb()
  const id = nanoid()
  await db.insert(userProjects).values({ id, userId, projectId, startMonth, endMonth: endMonth ?? null })
}

// load projects for a user (range-aware)
export async function loadUserProjectsForAdmin(userId: string, month: string) {
  const db = getDb()
  return db
    .select({ id: projects.id, name: projects.name })
    .from(userProjects)
    .innerJoin(projects, eq(userProjects.projectId, projects.id))
    .where(
      and(
        eq(userProjects.userId, userId),
        lte(userProjects.startMonth, month),
        or(isNull(userProjects.endMonth), gte(userProjects.endMonth, month)),
      ),
    )
}

// load ALL user project assignments with durations (for admin projects page)
export async function loadAllUserProjectAssignments() {
  const db = getDb()
  return db
    .select({
      userId: userProjects.userId,
      projectId: userProjects.projectId,
      projectName: projects.name,
      userName: users.name,
      startMonth: userProjects.startMonth,
      endMonth: userProjects.endMonth,
    })
    .from(userProjects)
    .innerJoin(projects, eq(userProjects.projectId, projects.id))
    .innerJoin(users, eq(userProjects.userId, users.id))
}

// create a new project
export async function createProject(data: { id: string; name: string; client: string }) {
  const db = getDb()
  await db.insert(projects).values({ ...data, active: true })
}

// remove a project assignment (all months)
export async function removeProjectAssignment(userId: string, projectId: string) {
  const db = getDb()
  await db
    .delete(userProjects)
    .where(
      and(
        eq(userProjects.userId, userId),
        eq(userProjects.projectId, projectId),
      )
    )
}

// update the duration of an existing assignment
export async function updateAssignmentDuration(
  userId: string,
  projectId: string,
  startMonth: string,
  endMonth: string | null,
) {
  const db = getDb()
  await db
    .update(userProjects)
    .set({ startMonth, endMonth })
    .where(
      and(
        eq(userProjects.userId, userId),
        eq(userProjects.projectId, projectId),
      ),
    )
}

// load all user_projects active for a given month (range-aware)
export async function loadAllUserProjects(month: string) {
  const db = getDb()
  return db
    .select({
      userId: userProjects.userId,
      projectId: userProjects.projectId,
      projectName: projects.name,
    })
    .from(userProjects)
    .innerJoin(projects, eq(userProjects.projectId, projects.id))
    .where(
      and(
        lte(userProjects.startMonth, month),
        or(isNull(userProjects.endMonth), gte(userProjects.endMonth, month)),
      ),
    )
}

// load total hours per user for a given month
export async function loadTotalHoursPerUser(month: string) {
  const db = getDb()
  const entries = await db
    .select()
    .from(timesheetEntries)
  
  // filter by month and sum per user
  const filtered = entries.filter((e) => e.date.startsWith(month))
  const totals: Record<string, number> = {}
  for (const entry of filtered) {
    totals[entry.userId] = (totals[entry.userId] ?? 0) + entry.hours
  }
  return totals
}

export async function deleteUser(id: string) {
  const db = getDb()
  // delete related rows first
  await db.delete(timesheetEntries).where(eq(timesheetEntries.userId, id))
  await db.delete(timesheets).where(eq(timesheets.userId, id))
  await db.delete(userProjects).where(eq(userProjects.userId, id))
  // then delete the user
  await db.delete(users).where(eq(users.id, id))
}

export async function getUserById(id: string) {
  const db = getDb()
  const result = await db
    .select()
    .from(users)
    .where(eq(users.id, id))
  return result[0] ?? null
}

export async function getUserByEmail(email: string) {
  const db = getDb()
  const result = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
  return result[0] ?? null
}