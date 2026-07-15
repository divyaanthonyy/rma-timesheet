import { drizzle } from 'drizzle-orm/libsql'
import { createClient } from '@libsql/client'
import { eq, and, lte, gte, or, isNull, desc } from 'drizzle-orm'
import { timesheetEntries, timesheets, userProjects, projects, users, timesheetHistory, leaveDays, manpowerCapacity, manpowerEntries, holidays, nonChargeCategories, monthSnapshots, snapshotProjectHours, snapshotEmployeeStats, monthReopenLog } from './schema'
import * as schema from './schema'
import { nanoid } from 'nanoid'
import { monthMeta } from '../lib/month'

function getDb() {
  const client = createClient({
    url: process.env.TURSO_DATABASE_URL!,
    authToken: process.env.TURSO_AUTH_TOKEN!,
  })
  return drizzle(client, { schema })
}

async function ensureTimesheetHistoryTable() {
  const client = createClient({
    url: process.env.TURSO_DATABASE_URL!,
    authToken: process.env.TURSO_AUTH_TOKEN!,
  })

  await client.execute(`
    CREATE TABLE IF NOT EXISTS timesheet_history (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      month TEXT NOT NULL,
      event_type TEXT NOT NULL,
      note TEXT,
      performed_by_user_id TEXT,
      performed_by_name TEXT,
      created_at TEXT DEFAULT (CURRENT_TIMESTAMP)
    )
  `)

  try {
    await client.execute('ALTER TABLE timesheet_history ADD COLUMN performed_by_user_id TEXT')
  } catch {
    // Column already exists.
  }

  try {
    await client.execute('ALTER TABLE timesheet_history ADD COLUMN performed_by_name TEXT')
  } catch {
    // Column already exists.
  }
}

async function ensureUsersIsEngineerColumn() {
  const client = createClient({
    url: process.env.TURSO_DATABASE_URL!,
    authToken: process.env.TURSO_AUTH_TOKEN!,
  })

  try {
    await client.execute("ALTER TABLE users ADD COLUMN is_engineer INTEGER NOT NULL DEFAULT 0")
  } catch {
    // Column already exists
  }
}

async function ensureProjectDatesColumns() {
  const client = createClient({
    url: process.env.TURSO_DATABASE_URL!,
    authToken: process.env.TURSO_AUTH_TOKEN!,
  })

  try {
    await client.execute("ALTER TABLE projects ADD COLUMN rf_job_code TEXT")
  } catch {
    // Column already exists
  }

  try {
    await client.execute("ALTER TABLE projects ADD COLUMN start_month TEXT")
  } catch {
    // Column already exists
  }

  try {
    await client.execute("ALTER TABLE projects ADD COLUMN end_month TEXT")
  } catch {
    // Column already exists
  }

  try {
    await client.execute("ALTER TABLE projects ADD COLUMN category TEXT NOT NULL DEFAULT 'backlog'")
  } catch {
    // Column already exists
  }
}

async function ensureLeaveDaysTable() {
  const client = createClient({
    url: process.env.TURSO_DATABASE_URL!,
    authToken: process.env.TURSO_AUTH_TOKEN!,
  })

  await client.execute(`
    CREATE TABLE IF NOT EXISTS leave_days (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      date TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'full',
      created_at TEXT DEFAULT (CURRENT_TIMESTAMP),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `)
}

export async function loadLeaveDaysForMonth(userId: string, month: string) {
  await ensureLeaveDaysTable()
  const db = getDb()
  const rows = await db
    .select()
    .from(leaveDays)
    .where(eq(leaveDays.userId, userId))
  return rows.filter((r) => r.date.startsWith(month))
}

export async function upsertLeaveDay(userId: string, date: string, type: 'full' | 'half') {
  await ensureLeaveDaysTable()
  const db = getDb()
  const existing = await db
    .select()
    .from(leaveDays)
    .where(and(eq(leaveDays.userId, userId), eq(leaveDays.date, date)))

  if (existing.length > 0) {
    await db
      .update(leaveDays)
      .set({ type })
      .where(eq(leaveDays.id, existing[0].id))
  } else {
    await db.insert(leaveDays).values({
      id: nanoid(),
      userId,
      date,
      type,
    })
  }
}

export async function deleteLeaveDay(userId: string, date: string) {
  await ensureLeaveDaysTable()
  const db = getDb()
  await db
    .delete(leaveDays)
    .where(and(eq(leaveDays.userId, userId), eq(leaveDays.date, date)))
}



async function ensureUserDateColumns() {
  const client = createClient({
    url: process.env.TURSO_DATABASE_URL!,
    authToken: process.env.TURSO_AUTH_TOKEN!,
  })
  try {
    await client.execute("ALTER TABLE users ADD COLUMN start_date TEXT")
  } catch { /* already exists */ }
  try {
    await client.execute("ALTER TABLE users ADD COLUMN end_date TEXT")
  } catch { /* already exists */ }
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
  const month = date.slice(0, 7)
  if (await isMonthClosed(month)) throw new Error(`Month ${month} is closed and cannot be edited`)

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
  actor?: { userId: string; name: string } | null,
) {
  if (await isMonthClosed(month)) throw new Error(`Month ${month} is closed and cannot be edited`)

  const db = getDb()
  const now = new Date().toISOString()

  const existing = await db
    .select()
    .from(timesheets)
    .where(and(eq(timesheets.userId, userId), eq(timesheets.month, month)))

  const previousStatus = existing[0]?.status ?? 'draft'

  if (existing.length > 0) {
    await db
      .update(timesheets)
      .set({
        status,
        returnNote: returnNote ?? null,
        submittedAt:
          status === 'submitted'
            ? now
            : existing[0].submittedAt,
        approvedAt:
          status === 'approved'
            ? now
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
      submittedAt: status === 'submitted' ? now : null,
      approvedAt: status === 'approved' ? now : null,
    })
  }

  const eventType =
    status === 'submitted' && previousStatus === 'approved'
      ? 'unapproved'
      : status === 'submitted' && previousStatus === 'returned'
        ? 'resubmitted'
        : status === 'submitted'
          ? 'submitted'
          : status === 'approved'
            ? 'approved'
            : 'returned'

  await ensureTimesheetHistoryTable()

  try {
    await db.insert(timesheetHistory).values({
      id: nanoid(),
      userId,
      month,
      eventType,
      note: status === 'returned' ? returnNote ?? null : null,
      performedByUserId: actor?.userId ?? null,
      performedByName: actor?.name ?? null,
      createdAt: now,
    })
  } catch {
    // Fallback: legacy status columns already capture the latest workflow state.
  }
}

export async function loadTimesheetHistory(userId: string, month: string) {
  const db = getDb()

  try {
    return await db
      .select()
      .from(timesheetHistory)
      .where(and(eq(timesheetHistory.userId, userId), eq(timesheetHistory.month, month)))
      .orderBy(desc(timesheetHistory.createdAt))
  } catch {
    const rows = await db
      .select({
        status: timesheets.status,
        submittedAt: timesheets.submittedAt,
        approvedAt: timesheets.approvedAt,
        returnNote: timesheets.returnNote,
      })
      .from(timesheets)
      .where(and(eq(timesheets.userId, userId), eq(timesheets.month, month)))

    const item = rows[0]
    const history = [] as Array<{ id: string; eventType: string; note: string | null; createdAt: string | null; performedByUserId: string | null; performedByName: string | null }>

    if (item?.submittedAt) {
      history.push({ id: 'submitted', eventType: 'submitted', note: null, createdAt: item.submittedAt, performedByUserId: null, performedByName: null })
    }

    if (item?.approvedAt) {
      history.push({ id: 'approved', eventType: 'approved', note: null, createdAt: item.approvedAt, performedByUserId: null, performedByName: null })
    }

    if (item?.returnNote) {
      history.push({ id: 'returned', eventType: 'returned', note: item.returnNote, createdAt: item.approvedAt ?? item.submittedAt, performedByUserId: null, performedByName: null })
    }

    return history.sort((a, b) => (a.createdAt ?? '').localeCompare(b.createdAt ?? ''))
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

// ── Manpower Loading ─────────────────────────────────────────────────────────

export async function loadCapacityOverrides(months: string[]) {
  try {
    const db = getDb()
    const rows = await db.select().from(manpowerCapacity)
    return rows.filter((r) => months.includes(r.month))
  } catch {
    return []
  }
}

export async function setCapacityOverride(month: string, hours: number) {
  try {
    const db = getDb()
    const existing = await db
      .select()
      .from(manpowerCapacity)
      .where(eq(manpowerCapacity.month, month))

    if (existing.length > 0) {
      await db
        .update(manpowerCapacity)
        .set({ overrideHours: hours })
        .where(eq(manpowerCapacity.id, existing[0].id))
    } else {
      await db.insert(manpowerCapacity).values({
        id: nanoid(),
        month,
        overrideHours: hours,
      })
    }
  } catch {
    // table not yet migrated
  }
}

export async function clearCapacityOverride(month: string) {
  try {
    const db = getDb()
    const existing = await db
      .select()
      .from(manpowerCapacity)
      .where(eq(manpowerCapacity.month, month))

    if (existing.length > 0) {
      await db
        .update(manpowerCapacity)
        .set({ overrideHours: null })
        .where(eq(manpowerCapacity.id, existing[0].id))
    }
  } catch {
    // table not yet migrated
  }
}

async function ensureManpowerEntryColumns() {
  const client = createClient({
    url: process.env.TURSO_DATABASE_URL!,
    authToken: process.env.TURSO_AUTH_TOKEN!,
  })
  try {
    await client.execute("ALTER TABLE manpower_entries ADD COLUMN estimate_hours INTEGER")
  } catch { /* already exists */ }
  try {
    await client.execute("ALTER TABLE manpower_entries ADD COLUMN confirmed_hours INTEGER")
  } catch { /* already exists */ }
}

export async function loadManpowerEntries(months: string[]) {
  await ensureManpowerEntryColumns()
  const db = getDb()
  const rows = await db.select().from(manpowerEntries)
  return rows.filter((r) => months.includes(r.month))
}

export async function upsertManpowerEntry(projectId: string, month: string, hours: number) {
  if (await isMonthClosed(month)) throw new Error(`Month ${month} is closed and cannot be edited`)
  await ensureManpowerEntryColumns()
  const db = getDb()
  const existing = await db
    .select()
    .from(manpowerEntries)
    .where(
      and(
        eq(manpowerEntries.projectId, projectId),
        eq(manpowerEntries.month, month),
      ),
    )

  if (existing.length > 0) {
    await db
      .update(manpowerEntries)
      .set({ estimateHours: hours, source: 'manual' })
      .where(eq(manpowerEntries.id, existing[0].id))
  } else {
    await db.insert(manpowerEntries).values({
      id: nanoid(),
      projectId,
      month,
      estimateHours: hours,
      source: 'manual',
    })
  }
}

export async function confirmManpowerEntry(projectId: string, month: string, hours: number) {
  if (await isMonthClosed(month)) throw new Error(`Month ${month} is closed and cannot be edited`)
  await ensureManpowerEntryColumns()
  const db = getDb()
  const existing = await db
    .select()
    .from(manpowerEntries)
    .where(
      and(
        eq(manpowerEntries.projectId, projectId),
        eq(manpowerEntries.month, month),
      ),
    )

  if (existing.length > 0) {
    await db
      .update(manpowerEntries)
      .set({ confirmedHours: hours, source: 'manual' })
      .where(eq(manpowerEntries.id, existing[0].id))
  } else {
    await db.insert(manpowerEntries).values({
      id: nanoid(),
      projectId,
      month,
      confirmedHours: hours,
      source: 'manual',
    })
  }
}

export async function clearConfirmedHours(projectId: string, month: string) {
  await ensureManpowerEntryColumns()
  const db = getDb()
  await db
    .update(manpowerEntries)
    .set({ confirmedHours: null })
    .where(
      and(
        eq(manpowerEntries.projectId, projectId),
        eq(manpowerEntries.month, month),
      ),
    )
}

// Sum timesheet_entries.hours grouped by projectId + month for the given months.
// Returns: { [projectId]: { [month]: hours } }
export async function loadActualHoursByProjectMonth(months: string[]) {
  const db = getDb()
  const entries = await db.select().from(timesheetEntries)
  const result: Record<string, Record<string, number>> = {}
  for (const entry of entries) {
    const m = entry.date.slice(0, 7)
    if (!months.includes(m)) continue
    if (!result[entry.projectId]) result[entry.projectId] = {}
    result[entry.projectId][m] = (result[entry.projectId][m] ?? 0) + entry.hours
  }
  return result
}

// Returns which users logged time per project+month.
// Returns: { [projectId]: { [month]: string[] } } — array of userIds
export async function loadWhoLoggedTimeByProjectMonth(months: string[]) {
  const db = getDb()
  const entries = await db
    .select({ userId: timesheetEntries.userId, projectId: timesheetEntries.projectId, date: timesheetEntries.date })
    .from(timesheetEntries)
  const result: Record<string, Record<string, string[]>> = {}
  for (const entry of entries) {
    const m = entry.date.slice(0, 7)
    if (!months.includes(m)) continue
    if (!result[entry.projectId]) result[entry.projectId] = {}
    if (!result[entry.projectId][m]) result[entry.projectId][m] = []
    if (!result[entry.projectId][m].includes(entry.userId)) {
      result[entry.projectId][m].push(entry.userId)
    }
  }
  return result
}

// Returns approved status per userId+month for the given months.
// Returns: { [userId]: Set<month> } of months where that user has an approved timesheet.
export async function loadApprovedTimesheetMonths(months: string[]) {
  const db = getDb()
  const all = await db
    .select({ userId: timesheets.userId, month: timesheets.month, status: timesheets.status })
    .from(timesheets)
  const approved: Record<string, Set<string>> = {}
  for (const row of all) {
    if (row.status === 'approved' && months.includes(row.month)) {
      if (!approved[row.userId]) approved[row.userId] = new Set()
      approved[row.userId].add(row.month)
    }
  }
  return approved
}

// ── Holidays ─────────────────────────────────────────────────────────────────

export async function loadHolidays(months: string[]) {
  try {
    const db = getDb()
    const rows = await db.select().from(holidays)
    return rows.filter((r) => months.some((m) => r.date.startsWith(m)))
  } catch {
    return []
  }
}

export async function refreshHolidaysFromApi(year: number) {
  let apiHolidays: { date: string; localName: string }[] = []
  try {
    const res = await fetch(`https://date.nager.at/api/v3/PublicHolidays/${year}/ID`)
    if (res.ok) apiHolidays = await res.json()
  } catch {
    return
  }

  try {
    const db = getDb()
    for (const h of apiHolidays) {
      const existing = await db
        .select()
        .from(holidays)
        .where(eq(holidays.date, h.date))
      if (existing.length > 0 && existing[0].source === 'manual') continue
      if (existing.length > 0) {
        await db.update(holidays).set({ name: h.localName }).where(eq(holidays.id, existing[0].id))
      } else {
        await db.insert(holidays).values({ id: nanoid(), date: h.date, name: h.localName, source: 'api' })
      }
    }
  } catch {
    // table not yet migrated
  }
}

export async function addManualHoliday(date: string, name: string) {
  try {
    const db = getDb()
    await db.insert(holidays).values({ id: nanoid(), date, name, source: 'manual' })
  } catch {
    // table not yet migrated
  }
}

export async function removeHoliday(id: string) {
  try {
    const db = getDb()
    await db.delete(holidays).where(eq(holidays.id, id))
  } catch {
    // table not yet migrated
  }
}

// ── Non-charge categories ─────────────────────────────────────────────────────

async function ensureNonChargeCategoriesTable() {
  const client = createClient({
    url: process.env.TURSO_DATABASE_URL!,
    authToken: process.env.TURSO_AUTH_TOKEN!,
  })
  await client.execute(`
    CREATE TABLE IF NOT EXISTS non_charge_categories (
      id TEXT PRIMARY KEY,
      category TEXT NOT NULL,
      month TEXT NOT NULL,
      hours INTEGER NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT (CURRENT_TIMESTAMP)
    )
  `)
}

export async function loadNonChargeEntries(months: string[]) {
  await ensureNonChargeCategoriesTable()
  const db = getDb()
  const rows = await db.select().from(nonChargeCategories)
  return rows.filter((r) => months.includes(r.month))
}

export async function upsertNonChargeEntry(category: string, month: string, hours: number) {
  await ensureNonChargeCategoriesTable()
  const db = getDb()
  const existing = await db
    .select()
    .from(nonChargeCategories)
    .where(and(eq(nonChargeCategories.category, category), eq(nonChargeCategories.month, month)))

  if (existing.length > 0) {
    await db
      .update(nonChargeCategories)
      .set({ hours })
      .where(eq(nonChargeCategories.id, existing[0].id))
  } else {
    await db.insert(nonChargeCategories).values({ id: nanoid(), category, month, hours })
  }
}

// ── Capacity helpers ─────────────────────────────────────────────────────────

// Compute base capacity per month = Σ(active working days per engineer × 8).
// Pro-rating falls out naturally: counting actual active working days per engineer
// is cleaner than a fractional multiplier. An engineer with no startDate is treated
// as "active for the whole window" so unmigrated rows don't silently drop to zero.
export async function computeBaseCapacity(months: string[]) {
  await ensureUserDateColumns()
  const db = getDb()

  const allUsers = await db.select({
    id: users.id,
    role: users.role,
    isEngineer: users.isEngineer,
    startDate: users.startDate,
    endDate: users.endDate,
  }).from(users)

  const engineers = allUsers.filter((u) => u.role === 'engineer' || u.isEngineer)

  // Load holidays
  let holidayDates = new Set<string>()
  try {
    const hRows = await db.select({ date: holidays.date }).from(holidays)
    holidayDates = new Set(hRows.map((h) => h.date))
  } catch { /* table may not exist yet */ }

  const result: Record<string, number> = {}
  for (const m of months) result[m] = 0

  // For each month, for each engineer, count active working days
  for (const m of months) {
    const meta = monthMeta(m)
    const weekendSet = new Set(meta.weekends)
    let total = 0

    for (const eng of engineers) {
      for (const d of meta.days) {
        const dateStr = `${m}-${String(d).padStart(2, '0')}`
        // Must be weekday (Mon–Fri, not in weekends set)
        if (weekendSet.has(d)) continue
        // Must not be a public holiday
        if (holidayDates.has(dateStr)) continue
        // Must be on or after startDate (null startDate = active from start)
        if (eng.startDate && dateStr < eng.startDate) continue
        // Must be on or before endDate (null endDate = still active)
        if (eng.endDate && dateStr > eng.endDate) continue
        total++
      }
    }
    result[m] = total * 8
  }

  return result
}

export type EngineerBreakdown = {
  id: string
  name: string
  activeDays: number
  hours: number
  note: string | null
}

export type CapacityBreakdown = {
  total: number
  daysInMonth: number
  weekendDays: number
  workingDays: number
  holidays: { date: string; name: string }[]
  engineers: EngineerBreakdown[]
  excludedEngineers: { name: string; reason: string }[]
}

// Returns a full breakdown per month (same computation as computeBaseCapacity
// but with full context for tooltip display).
export async function computeCapacityBreakdown(months: string[]) {
  await ensureUserDateColumns()
  const db = getDb()

  const allUsers = await db.select({
    id: users.id, name: users.name, role: users.role,
    isEngineer: users.isEngineer,
    startDate: users.startDate, endDate: users.endDate,
  }).from(users)

  const engineers = allUsers.filter((u) => u.role === 'engineer' || u.isEngineer)

  // Load holidays with names
  let holidayList: { date: string; name: string }[] = []
  try {
    const hRows = await db.select({ date: holidays.date, name: holidays.name }).from(holidays)
    holidayList = hRows
  } catch { /* table may not exist yet */ }
  const holidaySet = new Set(holidayList.map((h) => h.date))

  const monthHolidays = (m: string) => holidayList.filter((h) => h.date.startsWith(m))

  const result: Record<string, CapacityBreakdown> = {}

  for (const m of months) {
    const meta = monthMeta(m)
    const weekendSet = new Set(meta.weekends)
    const hols = monthHolidays(m)
    let totalDays = 0

    const engBreakdown: EngineerBreakdown[] = []
    const excluded: { name: string; reason: string }[] = []

    for (const eng of engineers) {
      let active = 0
      for (const d of meta.days) {
        const dateStr = `${m}-${String(d).padStart(2, '0')}`
        if (weekendSet.has(d)) continue
        if (holidaySet.has(dateStr)) continue
        if (eng.startDate && dateStr < eng.startDate) continue
        if (eng.endDate && dateStr > eng.endDate) continue
        active++
      }

      if (active > 0) {
        const notes: string[] = []
        if (eng.startDate && active < meta.days.length - weekendSet.size - hols.length) {
          // Only show start note if they started mid-month
          const firstDay = `${m}-01`
          if (firstDay < eng.startDate) notes.push(`started ${eng.startDate}`)
        }
        if (eng.endDate) {
          const lastDayOfMonth = `${m}-${String(meta.lastDay).padStart(2, '0')}`
          if (eng.endDate < lastDayOfMonth) notes.push(`ended ${eng.endDate}`)
        }
        engBreakdown.push({
          id: eng.id,
          name: eng.name,
          activeDays: active,
          hours: active * 8,
          note: notes.length > 0 ? notes.join(' · ') : null,
        })
        totalDays += active
      } else {
        let reason = ''
        if (eng.startDate && `${m}-${String(meta.lastDay).padStart(2, '0')}` < eng.startDate) {
          reason = `not yet started (starts ${eng.startDate})`
        } else if (eng.endDate && `${m}-01` > eng.endDate) {
          reason = `ended ${eng.endDate}`
        } else if (eng.startDate && eng.startDate > `${m}-01`) {
          // started after month began but holidays/weekends reduced active to 0
        } else {
          reason = '0 working days after holidays'
        }
        if (reason) excluded.push({ name: eng.name, reason })
      }
    }

    const workingDays = meta.days.length - weekendSet.size - hols.length
    result[m] = {
      total: totalDays * 8,
      daysInMonth: meta.days.length,
      weekendDays: weekendSet.size,
      workingDays,
      holidays: hols,
      engineers: engBreakdown,
      excludedEngineers: excluded,
    }
  }

  return result
}

// Load raw approved leave day records for the given months.
// Returns records with date, type, and userId, filtered to approved users,
// weekdays, and engineers active on that date. Holiday filtering is done in the browser.
export async function loadApprovedLeaveDays(months: string[]) {
  const db = getDb()

  const allTimesheets = await db
    .select({ userId: timesheets.userId, month: timesheets.month, status: timesheets.status })
    .from(timesheets)
  const approvedUsersByMonth: Record<string, Set<string>> = {}
  for (const t of allTimesheets) {
    if (t.status === 'approved' && months.includes(t.month)) {
      if (!approvedUsersByMonth[t.month]) approvedUsersByMonth[t.month] = new Set()
      approvedUsersByMonth[t.month].add(t.userId)
    }
  }

  // Load engineer dates for active-on-date check
  await ensureUserDateColumns()
  const userDates = await db
    .select({ id: users.id, role: users.role, isEngineer: users.isEngineer, startDate: users.startDate, endDate: users.endDate })
    .from(users)
  const engineerMap = new Map<string, { startDate: string | null; endDate: string | null }>()
  for (const u of userDates) {
    if (u.role === 'engineer' || u.isEngineer) {
      engineerMap.set(u.id, { startDate: u.startDate, endDate: u.endDate })
    }
  }

  const allLeave = await db.select({ userId: leaveDays.userId, date: leaveDays.date, type: leaveDays.type }).from(leaveDays)
  const result: { date: string; type: string }[] = []
  for (const ld of allLeave) {
    const m = ld.date.slice(0, 7)
    if (!months.includes(m)) continue
    if (!approvedUsersByMonth[m]?.has(ld.userId)) continue

    // Check engineer was active on the leave date
    const eng = engineerMap.get(ld.userId)
    if (!eng) continue
    if (eng.startDate && ld.date < eng.startDate) continue
    if (eng.endDate && ld.date > eng.endDate) continue

    const day = new Date(ld.date).getDay()
    if (day === 0 || day === 6) continue
    result.push({ date: ld.date, type: ld.type })
  }
  return result
}

// load all users
export async function loadAllUsers() {
  await ensureUsersIsEngineerColumn()
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
  canApprove: boolean
  isEngineer: boolean
  startDate?: string | null
  endDate?: string | null
}) {
  await ensureUsersIsEngineerColumn()
  await ensureUserDateColumns()
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

export async function updateUserRecord(data: {
  id: string
  name: string
  email: string
  employeeNumber: string
  position: string
  role: string
  manDayRate: number
  canApprove: boolean
  isEngineer: boolean
  startDate?: string | null
  endDate?: string | null
}) {
  await ensureUsersIsEngineerColumn()
  await ensureUserDateColumns()
  const db = getDb()
  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, data.id))

  if (existing.length === 0) {
    throw new Error(`User ${data.id} does not exist`)
  }

  await db
    .update(users)
    .set({
      name: data.name,
      email: data.email,
      employeeNumber: data.employeeNumber,
      position: data.position,
      role: data.role,
      manDayRate: data.manDayRate,
      canApprove: data.canApprove,
      isEngineer: data.isEngineer,
      startDate: data.startDate ?? null,
      endDate: data.endDate ?? null,
    })
    .where(eq(users.id, data.id))
}

// load all projects
export async function loadAllProjects() {
  await ensureProjectDatesColumns()
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
export async function createProject(data: { id: string; name: string; client: string; rfJobCode?: string | null; category?: string | null; startMonth?: string | null; endMonth?: string | null }) {
  await ensureProjectDatesColumns()
  const db = getDb()
  await db.insert(projects).values({
    id: data.id,
    name: data.name,
    client: data.client,
    rfJobCode: data.rfJobCode ?? null,
    category: data.category ?? 'backlog',
    startMonth: data.startMonth ?? null,
    endMonth: data.endMonth ?? null,
    active: true,
  })
}

// update an existing project
export async function updateProject(data: { id: string; name: string; client: string | null; rfJobCode?: string | null; category?: string | null; startMonth?: string | null; endMonth?: string | null }) {
  await ensureProjectDatesColumns()
  const db = getDb()
  await db
    .update(projects)
    .set({
      name: data.name,
      client: data.client,
      rfJobCode: data.rfJobCode ?? null,
      category: data.category ?? 'backlog',
      startMonth: data.startMonth ?? null,
      endMonth: data.endMonth ?? null,
    })
    .where(eq(projects.id, data.id))
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

// Load per-employee actual hours split by category (billable vs non-charge) for given months.
// Returns: { [userId]: { [month]: { billable: number, nonCharge: number, allApproved: boolean } } }
export async function loadEmployeeActualHours(months: string[]) {
  const db = getDb()

  // Load all projects for category lookup
  const allProjects = await db.select({ id: projects.id, category: projects.category }).from(projects)
  const projCategory: Record<string, string> = {}
  for (const p of allProjects) projCategory[p.id] = p.category ?? 'backlog'

  // Load all timesheets (approval status per user+month)
  const allTimesheets = await db
    .select({ userId: timesheets.userId, month: timesheets.month, status: timesheets.status })
    .from(timesheets)
  const approvedMonths: Record<string, Set<string>> = {}
  for (const t of allTimesheets) {
    if (t.status === 'approved') {
      if (!approvedMonths[t.userId]) approvedMonths[t.userId] = new Set()
      approvedMonths[t.userId].add(t.month)
    }
  }

  // Load timesheet entries
  const entries = await db.select().from(timesheetEntries)
  const result: Record<string, Record<string, { billable: number; nonCharge: number; allApproved: boolean }>> = {}

  for (const entry of entries) {
    const m = entry.date.slice(0, 7)
    if (!months.includes(m)) continue

    if (!result[entry.userId]) result[entry.userId] = {}
    if (!result[entry.userId][m]) result[entry.userId][m] = { billable: 0, nonCharge: 0, allApproved: true }

    const cat = projCategory[entry.projectId] ?? 'backlog'
    const isBillable = cat === 'backlog' || cat === 'forecast'
    if (isBillable) {
      result[entry.userId][m].billable += entry.hours
    } else {
      result[entry.userId][m].nonCharge += entry.hours
    }

    // Track approval: if any entry is in a not-fully-approved month, mark false
    if (!approvedMonths[entry.userId]?.has(m)) {
      result[entry.userId][m].allApproved = false
    }
  }

  return result
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

export async function deleteProject(id: string) {
  const db = getDb()
  // delete related rows first
  await db.delete(timesheetEntries).where(eq(timesheetEntries.projectId, id))
  await db.delete(userProjects).where(eq(userProjects.projectId, id))
  // then delete the project
  await db.delete(projects).where(eq(projects.id, id))
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
  await ensureUsersIsEngineerColumn()
  const db = getDb()
  const result = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
  return result[0] ?? null
}

// ── Archive / Snapshot functions ─────────────────────────────────────────────

export async function isMonthClosed(month: string) {
  const db = getDb()
  const rows = await db.select({ id: monthSnapshots.id }).from(monthSnapshots).where(eq(monthSnapshots.month, month))
  return rows.length > 0
}

export async function loadAllSnapshots() {
  const db = getDb()
  const snapshots = await db.select().from(monthSnapshots).orderBy(desc(monthSnapshots.month))
  const reopenLogs = await db.select().from(monthReopenLog).orderBy(desc(monthReopenLog.reopenedAt))
  return { snapshots, reopenLogs }
}

export async function loadSnapshot(month: string) {
  const db = getDb()
  const snapshots = await db.select().from(monthSnapshots).where(eq(monthSnapshots.month, month))
  if (snapshots.length === 0) return null
  const snapshot = snapshots[0]
  const projectHours = await db.select().from(snapshotProjectHours).where(eq(snapshotProjectHours.snapshotId, snapshot.id))
  const employeeStats = await db.select().from(snapshotEmployeeStats).where(eq(snapshotEmployeeStats.snapshotId, snapshot.id))
  const reopenLogs = await db.select().from(monthReopenLog).where(eq(monthReopenLog.month, month)).orderBy(desc(monthReopenLog.reopenedAt))
  return { snapshot, projectHours, employeeStats, reopenLogs }
}

export async function closeMonth(
  month: string,
  closedBy: string,
  capacityHours: number,
  backlogHours: number,
  forecastHours: number,
  nonChargeHours: number,
  totalLoadingHours: number,
  backlogPct: number | null,
  forecastPct: number | null,
  nonChargePct: number | null,
  projectRows: { projectId: string; projectName: string; category: string; hours: number; source: string }[],
  employeeRows: { userId: string; userName: string; capacityHours: number; billableHours: number; nonChargeHours: number; efficiencyPct: number | null; timesheetStatus: string | null }[],
) {
  const db = getDb()
  const existing = await db.select().from(monthSnapshots).where(eq(monthSnapshots.month, month))
  if (existing.length > 0) {
    // Delete old snapshot data for re-close
    await db.delete(snapshotProjectHours).where(eq(snapshotProjectHours.snapshotId, existing[0].id))
    await db.delete(snapshotEmployeeStats).where(eq(snapshotEmployeeStats.snapshotId, existing[0].id))
    await db.delete(monthSnapshots).where(eq(monthSnapshots.id, existing[0].id))
  }

  const snapshotId = nanoid()
  await db.insert(monthSnapshots).values({
    id: snapshotId,
    month,
    closedAt: new Date().toISOString(),
    closedBy,
    capacityHours,
    backlogHours,
    forecastHours,
    nonChargeHours,
    totalLoadingHours,
    backlogPct,
    forecastPct,
    nonChargePct,
  })

  for (const row of projectRows) {
    await db.insert(snapshotProjectHours).values({
      id: nanoid(), snapshotId,
      projectId: row.projectId, projectName: row.projectName,
      category: row.category, hours: row.hours, source: row.source,
    })
  }

  for (const row of employeeRows) {
    await db.insert(snapshotEmployeeStats).values({
      id: nanoid(), snapshotId,
      userId: row.userId, userName: row.userName,
      capacityHours: row.capacityHours, billableHours: row.billableHours,
      nonChargeHours: row.nonChargeHours, efficiencyPct: row.efficiencyPct,
      timesheetStatus: row.timesheetStatus,
    })
  }
}

export async function reopenMonth(month: string, reopenedBy: string, reason: string) {
  const db = getDb()
  const existing = await db.select().from(monthSnapshots).where(eq(monthSnapshots.month, month))
  if (existing.length > 0) {
    await db.delete(snapshotProjectHours).where(eq(snapshotProjectHours.snapshotId, existing[0].id))
    await db.delete(snapshotEmployeeStats).where(eq(snapshotEmployeeStats.snapshotId, existing[0].id))
    await db.delete(monthSnapshots).where(eq(monthSnapshots.id, existing[0].id))
  }
  await db.insert(monthReopenLog).values({
    id: nanoid(), month, reopenedBy, reopenedAt: new Date().toISOString(), reason,
  })
}

export async function loadOpenPastMonths(userId: string) {
  const db = getDb()
  const allClosed = await db.select({ month: monthSnapshots.month }).from(monthSnapshots)
  const closedSet = new Set(allClosed.map((r) => r.month))
  const currentMonth = new Date().toISOString().slice(0, 7)

  const userTimesheets = await db
    .select({ month: timesheets.month, status: timesheets.status })
    .from(timesheets)
    .where(eq(timesheets.userId, userId))

  return userTimesheets
    .filter((t) => t.month < currentMonth && !closedSet.has(t.month) && (t.status === 'returned' || t.status === 'draft'))
    .sort((a, b) => b.month.localeCompare(a.month))
}