import { createFileRoute } from '@tanstack/react-router'
import { useState, useEffect, useRef } from 'react'
import { createServerFn } from '@tanstack/react-start'
import {
  loadAllProjects, loadCapacityOverrides, setCapacityOverride, clearCapacityOverride,
  loadManpowerEntries, upsertManpowerEntry, loadActualHoursByProjectMonth,
  loadWhoLoggedTimeByProjectMonth, loadApprovedTimesheetMonths,
  loadHolidays, refreshHolidaysFromApi, addManualHoliday, removeHoliday,
  computeBaseCapacity, loadNonChargeEntries, upsertNonChargeEntry,
} from '../../db/queries'
import { ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid } from 'recharts'

export const Route = createFileRoute('/admin/manpower')({
  component: ManpowerPage,
})

const FISCAL_MONTHS = [
  '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09',
  '2026-10', '2026-11', '2026-12', '2027-01', '2027-02', '2027-03',
]

function monthDisplay(month: string) {
  const [y, m] = month.split('-')
  const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${names[parseInt(m) - 1].slice(0, 3)}-${y.slice(2)}`
}

const fetchProjects = createServerFn().handler(async () => loadAllProjects())

const fetchOverrides = createServerFn()
  .validator((data: { months: string[] }) => data)
  .handler(async ({ data }) => loadCapacityOverrides(data.months))

const saveOverride = createServerFn()
  .validator((data: { month: string; hours: number }) => data)
  .handler(async ({ data }) => setCapacityOverride(data.month, data.hours))

const clearOverride = createServerFn()
  .validator((data: { month: string }) => data)
  .handler(async ({ data }) => clearCapacityOverride(data.month))

const fetchHolidaysData = createServerFn()
  .validator((data: { months: string[] }) => data)
  .handler(async ({ data }) => loadHolidays(data.months))

const refreshHolidays = createServerFn()
  .validator((data: { year: number }) => data)
  .handler(async ({ data }) => refreshHolidaysFromApi(data.year))

const addHoliday = createServerFn()
  .validator((data: { date: string; name: string }) => data)
  .handler(async ({ data }) => addManualHoliday(data.date, data.name))

const removeHolidayFn = createServerFn()
  .validator((data: { id: string }) => data)
  .handler(async ({ data }) => removeHoliday(data.id))

const fetchBaseCapacity = createServerFn()
  .validator((data: { months: string[] }) => data)
  .handler(async ({ data }) => computeBaseCapacity(data.months))

const fetchEntries = createServerFn()
  .validator((data: { months: string[] }) => data)
  .handler(async ({ data }) => loadManpowerEntries(data.months))

const saveEntry = createServerFn()
  .validator((data: { projectId: string; month: string; hours: number }) => data)
  .handler(async ({ data }) => upsertManpowerEntry(data.projectId, data.month, data.hours))

const fetchActualHours = createServerFn()
  .validator((data: { months: string[] }) => data)
  .handler(async ({ data }) => loadActualHoursByProjectMonth(data.months))

const fetchApproved = createServerFn()
  .validator((data: { months: string[] }) => data)
  .handler(async ({ data }) => loadApprovedTimesheetMonths(data.months))

const fetchWhoLogged = createServerFn()
  .validator((data: { months: string[] }) => data)
  .handler(async ({ data }) => loadWhoLoggedTimeByProjectMonth(data.months))

const fetchNonCharge = createServerFn()
  .validator((data: { months: string[] }) => data)
  .handler(async ({ data }) => loadNonChargeEntries(data.months))

const saveNonCharge = createServerFn()
  .validator((data: { category: string; month: string; hours: number }) => data)
  .handler(async ({ data }) => upsertNonChargeEntry(data.category, data.month, data.hours))

type Project = { id: string; name: string; client: string | null; category: string | null; startMonth: string | null; endMonth: string | null; rfJobCode: string | null }

const NC_CATEGORIES = ['nc_annual_leave', 'nc_sick_leave', 'nc_maternity_leave', 'nc_training', 'nc_meeting', 'nc_other']
const NC_LABELS: Record<string, string> = {
  nc_annual_leave: 'Annual Leave',
  nc_sick_leave: 'Sick Leave',
  nc_maternity_leave: 'Maternity Leave',
  nc_training: 'Training',
  nc_meeting: 'Internal Engineering Meeting',
  nc_other: 'Others',
}

function ManpowerPage() {
  const [projects, setProjects] = useState<Project[]>([])
  const [overrides, setOverrides] = useState<Record<string, number | null>>({})
  const [entries, setEntries] = useState<Record<string, Record<string, { hours: number; source: string }>>>({})
  const [actualHours, setActualHours] = useState<Record<string, Record<string, number>>>({})
  const [approvedMonths, setApprovedMonths] = useState<Record<string, Set<string>>>({})
  const [whoLogged, setWhoLogged] = useState<Record<string, Record<string, Set<string>>>>({})
  const [holidays, setHolidays] = useState<{ id: string; date: string; name: string; source: string }[]>([])
  const [baseCapacity, setBaseCapacity] = useState<Record<string, number>>({})
  const [ncEntries, setNcEntries] = useState<Record<string, Record<string, number>>>({}) // [category][month] = hours
  const [ncStatus, setNcStatus] = useState<'saved' | 'saving' | 'unsaved' | 'error'>('saved')
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'backlog' | 'forecast' | 'all'>('backlog')
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'unsaved' | 'error'>('saved')
  const [capacityStatus, setCapacityStatus] = useState<'saved' | 'saving' | 'unsaved' | 'error'>('saved')
  const [holidaysExpanded, setHolidaysExpanded] = useState(false)
  const [newHolidayDate, setNewHolidayDate] = useState('')
  const [newHolidayName, setNewHolidayName] = useState('')
  const [holidayType, setHolidayType] = useState<'national' | 'other'>('national')
  const [holidayFilterMonth, setHolidayFilterMonth] = useState<string | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const ncDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [activeTab, setActiveTab] = useState<'overview' | 'projects' | 'people'>('overview')

  useEffect(() => {
    async function load() {
      try {
        const [pData, oData, eData, aData, apData, wData, hData, bData, nData] = await Promise.all([
          fetchProjects().catch(() => []),
          fetchOverrides({ data: { months: FISCAL_MONTHS } }).catch(() => []),
          fetchEntries({ data: { months: FISCAL_MONTHS } }).catch(() => []),
          fetchActualHours({ data: { months: FISCAL_MONTHS } }).catch(() => ({})),
          fetchApproved({ data: { months: FISCAL_MONTHS } }).catch(() => ({})),
          fetchWhoLogged({ data: { months: FISCAL_MONTHS } }).catch(() => ({})),
          fetchHolidaysData({ data: { months: FISCAL_MONTHS } }).catch(() => []),
          fetchBaseCapacity({ data: { months: FISCAL_MONTHS } }).catch(() => ({})),
          fetchNonCharge({ data: { months: FISCAL_MONTHS } }).catch(() => []),
        ])

        setProjects(pData as Project[])
        setOverrides(ovMapFrom(oData))
        setEntries(entriesMapFrom(eData))
        setActualHours(aData as Record<string, Record<string, number>>)
        setApprovedMonths(apData as Record<string, Set<string>>)
        setWhoLogged(whoMapFrom(wData))
        setHolidays(hData as { id: string; date: string; name: string; source: string }[])
        setBaseCapacity(bData as Record<string, number>)

        const nc: Record<string, Record<string, number>> = {}
        for (const row of nData as { category: string; month: string; hours: number }[]) {
          if (!nc[row.category]) nc[row.category] = {}
          nc[row.category][row.month] = row.hours
        }
        setNcEntries(nc)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  function ovMapFrom(rows: { month: string; overrideHours: number | null }[]): Record<string, number | null> {
    const m: Record<string, number | null> = {}
    for (const r of rows) m[r.month] = r.overrideHours ?? null
    return m
  }

  function entriesMapFrom(rows: { projectId: string; month: string; hours: number; source: string }[]): Record<string, Record<string, { hours: number; source: string }>> {
    const m: Record<string, Record<string, { hours: number; source: string }>> = {}
    for (const r of rows) {
      if (!m[r.projectId]) m[r.projectId] = {}
      m[r.projectId][r.month] = { hours: r.hours, source: r.source }
    }
    return m
  }

  function whoMapFrom(data: Record<string, Record<string, string[]>>): Record<string, Record<string, Set<string>>> {
    const m: Record<string, Record<string, Set<string>>> = {}
    for (const [projectId, months] of Object.entries(data)) {
      if (!m[projectId]) m[projectId] = {}
      for (const [month, userIds] of Object.entries(months)) {
        m[projectId][month] = new Set(userIds)
      }
    }
    return m
  }

  function getCellValue(projectId: string, month: string) {
    const actual = actualHours[projectId]?.[month]
    const manual = entries[projectId]?.[month]?.hours ?? 0

    if (actual !== undefined && actual > 0) {
      const users = whoLogged[projectId]?.[month]
      const allApproved = users && users.size > 0 && [...users].every((uid) => approvedMonths[uid]?.has(month))
      return {
        value: actual,
        source: allApproved ? 'confirmed_actual' as const : 'draft_actual' as const,
      }
    }
    return {
      value: manual,
      source: 'manual' as const,
    }
  }

  // ── Capacity computation (Model B: no leave subtraction) ────────────────────

  function getEffectiveCapacity(month: string): number {
    const override = overrides[month]
    if (override != null) return override
    const base = baseCapacity[month] ?? 0
    return Math.max(0, base)
  }

  function projectsByCategory(cats: string[]) {
    return projects.filter((p) => cats.includes(p.category ?? ''))
  }

  function sumCategory(month: string, projects: Project[]): number {
    return projects.reduce((sum, p) => sum + getCellValue(p.id, month).value, 0)
  }

  const backlogProjects = projectsByCategory(['backlog'])
  const forecastProjects = projectsByCategory(['forecast'])

  function getBacklogTotal(month: string) { return sumCategory(month, backlogProjects) }
  function getForecastTotal(month: string) { return sumCategory(month, forecastProjects) }
  function getNCTotal(month: string) {
    return NC_CATEGORIES.reduce((sum, cat) => sum + (ncEntries[cat]?.[month] ?? 0), 0)
  }

  function getEfficiency(month: string, numerator: number) {
    const cap = getEffectiveCapacity(month)
    if (cap <= 0) return null
    return ((numerator / cap) * 100).toFixed(2)
  }

  function renderProjectTable(title: string, projectList: Project[], months: string[]) {
    const isEmpty = projectList.length === 0
    return (
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden mb-6">
        <div className="px-4 py-3 border-b border-gray-800">
          <p className="text-white text-sm font-medium">{title}</p>
          <p className="text-gray-500 text-xs">{projectList.length} project{projectList.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-gray-800/50">
                <th className="text-left text-gray-400 font-normal px-4 py-2 w-12 sticky left-0 bg-gray-800/50 z-10">No.</th>
                <th className="text-left text-gray-400 font-normal px-4 py-2 w-48 sticky left-12 bg-gray-800/50 z-10">Project</th>
                {months.map((m) => (
                  <th key={m} className="text-center font-normal py-2 px-1 min-w-[72px] text-gray-400">{monthDisplay(m)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isEmpty ? (
                <tr>
                  <td colSpan={14} className="px-4 py-8 text-center text-gray-600 text-sm">No projects in this category.</td>
                </tr>
              ) : (
                projectList.map((project, pi) => (
                  <tr key={project.id} className="border-t border-gray-800 hover:bg-gray-800/20">
                    <td className="px-4 py-1.5 text-gray-500 font-mono text-[10px] sticky left-0 bg-gray-900">{pi + 1}</td>
                    <td className={`px-4 py-1.5 font-medium sticky left-12 bg-gray-900 ${projectColor(project.category)}`}>
                      <div>
                        <p>{project.name}</p>
                        {project.client && <p className="text-gray-600 text-[10px] font-normal">{project.client}</p>}
                      </div>
                    </td>
                    {months.map((m) => {
                      const cell = getCellValue(project.id, m)
                      const isManual = cell.source === 'manual'
                      return (
                        <td key={m} className="p-0">
                          {isManual ? (
                            <input
                              type="number" min={0}
                              value={cell.value > 0 ? cell.value : ''}
                              onChange={(e) => handleChange(project.id, m, e.target.value)}
                              placeholder="—"
                              className={`w-full text-center py-1.5 px-1 bg-transparent text-xs outline-none focus:bg-gray-800 rounded transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${'text-blue-300'}`}
                            />
                          ) : (
                            <div className={`w-full text-center py-1.5 px-1 ${cell.source === 'confirmed_actual' ? 'text-white' : 'text-amber-300'}`}>
                              {cell.value}
                            </div>
                          )}
                        </td>
                      )
                    })}
                  </tr>
                ))
              )}
              {/* Total row */}
              {!isEmpty && (
                <tr className="border-t border-gray-700 bg-gray-800/30">
                  <td className="px-4 py-1.5 sticky left-0 bg-gray-800/30" />
                  <td className="px-4 py-1.5 text-gray-500 text-[10px] uppercase tracking-wider sticky left-12 bg-gray-800/30">
                    Total {title}
                  </td>
                  {months.map((m) => {
                    const total = sumCategory(m, projectList)
                    return (
                      <td key={m} className={`text-center py-1.5 font-medium ${total > 0 ? 'text-white' : 'text-gray-700'}`}>
                        {total > 0 ? total : '—'}
                      </td>
                    )
                  })}
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  function handleChange(projectId: string, month: string, raw: string) {
    const value = parseInt(raw)
    const clamped = raw === '' || isNaN(value) ? 0 : Math.max(0, value)

    setEntries((prev) => {
      const next = { ...prev }
      if (!next[projectId]) next[projectId] = {}
      next[projectId] = { ...next[projectId], [month]: { hours: clamped, source: 'manual' } }
      return next
    })

    setSaveStatus('unsaved')
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      try {
        setSaveStatus('saving')
        await saveEntry({ data: { projectId, month, hours: clamped } })
        setSaveStatus('saved')
      } catch {
        setSaveStatus('error')
      }
    }, 600)
  }

  async function handleCapacityChange(month: string, raw: string) {
    const value = parseInt(raw)
    const clamped = raw === '' || isNaN(value) ? 0 : Math.max(0, value)

    setOverrides((prev) => ({ ...prev, [month]: clamped }))
    setCapacityStatus('unsaved')

    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      try {
        setCapacityStatus('saving')
        await saveOverride({ data: { month, hours: clamped } })
        setCapacityStatus('saved')
      } catch {
        setCapacityStatus('error')
      }
    }, 600)
  }

  async function handleResetCapacity(month: string) {
    setOverrides((prev) => ({ ...prev, [month]: null }))
    await clearOverride({ data: { month } })
  }

  // Project row color by category
  function projectColor(cat: string | null) {
    if (cat === 'forecast') return 'text-pink-400'
    if (cat && cat.startsWith('nc_')) return 'text-gray-400'
    return 'text-amber-400'
  }

  function OverviewContent() {
    return (
      <>

        {/* ── Manpower Capacity ── */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden mb-6">
          <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
            <div>
              <p className="text-white text-sm font-medium">Manpower Capacity</p>
              <p className="text-gray-500 text-xs">
                Per-engineer active working days × 8, pro-rated by start/end dates
              </p>
            </div>
            <p className="text-gray-500 text-xs">
              {capacityStatus === 'saving' ? '⏳ Saving...' : capacityStatus === 'unsaved' ? '● Unsaved' : capacityStatus === 'error' ? '✕ Save failed' : ''}
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-gray-800/50">
                  <th className="text-left text-gray-400 font-normal px-4 py-2 w-40 sticky left-0 bg-gray-800/50">
                    Month
                  </th>
                  {FISCAL_MONTHS.map((m) => (
                    <th key={m} className="text-center font-normal py-2 px-1 min-w-[72px] text-gray-400">
                      {monthDisplay(m)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr className="border-t border-gray-800">
                  <td className="px-4 py-1.5 text-gray-500 text-[10px] uppercase tracking-wider sticky left-0 bg-gray-900">
                    Base capacity
                  </td>
                  {FISCAL_MONTHS.map((m) => {
                    const base = baseCapacity[m] ?? 0
                    return (
                      <td key={m} className="text-center py-1.5 px-1 font-medium text-blue-300">
                        {base > 0 ? base : 0}
                      </td>
                    )
                  })}
                </tr>
                <tr className="border-t border-gray-700 bg-gray-800/30">
                  <td className="px-4 py-1.5 text-gray-400 font-medium sticky left-0 bg-gray-800/30">
                    Gross capacity
                  </td>
                  {FISCAL_MONTHS.map((m) => {
                    const cap = baseCapacity[m] ?? 0
                    const overridden = overrides[m] != null
                    return (
                      <td key={m} className={`text-center py-1.5 px-1 font-medium ${
                        overridden ? 'text-gray-600 line-through' : 'text-blue-300'
                      }`}>
                        {cap > 0 ? cap : 0}
                      </td>
                    )
                  })}
                </tr>
                <tr className="border-t border-gray-700 bg-amber-900/10">
                  <td className="px-4 py-1.5 text-amber-400 font-medium sticky left-0 bg-gray-900">
                    Override — editable
                  </td>
                  {FISCAL_MONTHS.map((m) => {
                    const isOverridden = overrides[m] != null
                    return (
                      <td key={m} className="p-0 relative">
                        <div className="flex items-center">
                          <input
                            type="number"
                            min={0}
                            value={overrides[m] ?? (baseCapacity[m] ?? 0)}
                            onChange={(e) => handleCapacityChange(m, e.target.value)}
                            placeholder="—"
                            className={`w-full text-center py-1.5 px-1 bg-transparent text-xs outline-none focus:bg-gray-800 rounded transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${
                              isOverridden ? 'text-amber-300' : 'text-blue-300'
                            }`}
                          />
                          {isOverridden && (
                            <button
                              onClick={() => handleResetCapacity(m)}
                              className="absolute -right-1 text-[9px] text-gray-600 hover:text-gray-400 transition-colors"
                              title="Reset to computed"
                            >
                              ↺
                            </button>
                          )}
                        </div>
                        {isOverridden && (
                          <p className="text-[8px] text-amber-500/70 text-center leading-none pb-0.5">overridden</p>
                        )}
                      </td>
                    )
                  })}
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* ── Public Holidays ── */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden mb-6">
          <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
            <div>
              <p className="text-white text-sm font-medium">Public Holidays</p>
              <p className="text-gray-500 text-xs">{holidays.length} holiday{holidays.length !== 1 ? 's' : ''} loaded</p>
            </div>
            <button
              onClick={() => setHolidaysExpanded((v) => !v)}
              className="text-xs bg-gray-800 hover:bg-gray-700 text-gray-400 px-3 py-1.5 rounded-lg border border-gray-700 transition-colors"
            >
              {holidaysExpanded ? 'Collapse' : 'Manage'}
            </button>
          </div>
          {holidaysExpanded && (
            <div className="p-4">
              <div className="flex items-center gap-2 mb-4">
                <input
                  type="date"
                  value={newHolidayDate}
                  onChange={(e) => setNewHolidayDate(e.target.value)}
                  className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-white text-xs outline-none focus:border-gray-500 transition-colors [color-scheme:dark] w-40"
                />
                <select
                  value={holidayType}
                  onChange={(e) => {
                    setHolidayType(e.target.value as 'national' | 'other')
                    if (e.target.value === 'national') setNewHolidayName('National Holiday')
                  }}
                  className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-white text-xs outline-none focus:border-gray-500 transition-colors"
                >
                  <option value="national">National Holiday</option>
                  <option value="other">Other</option>
                </select>
                {holidayType === 'other' && (
                  <input
                    value={newHolidayName}
                    onChange={(e) => setNewHolidayName(e.target.value)}
                    placeholder="Holiday name"
                    className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-white text-xs placeholder-gray-600 outline-none focus:border-gray-500 transition-colors flex-1"
                  />
                )}
                <button
                  onClick={async () => {
                    const name = holidayType === 'national' ? 'National Holiday' : newHolidayName
                    if (!newHolidayDate || !name) return
                    await addHoliday({ data: { date: newHolidayDate, name } })
                    const updated = await fetchHolidaysData({ data: { months: FISCAL_MONTHS } })
                    setHolidays(updated as { id: string; date: string; name: string; source: string }[])
                    setNewHolidayDate('')
                    setNewHolidayName('')
                    setHolidayType('national')
                  }}
                  className="text-xs bg-amber-500 hover:bg-amber-400 text-gray-950 font-medium px-3 py-1.5 rounded-lg transition-colors"
                >
                  Add
                </button>
              </div>
              <div className="flex items-center gap-1 mb-3 flex-wrap">
                <button
                  onClick={() => setHolidayFilterMonth(null)}
                  className={`text-[10px] px-2 py-1 rounded border transition-colors ${
                    holidayFilterMonth === null
                      ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                      : 'bg-gray-800 border-gray-700 text-gray-500 hover:text-gray-300'
                  }`}
                >
                  All
                </button>
                {FISCAL_MONTHS.map((m) => (
                  <button
                    key={m}
                    onClick={() => setHolidayFilterMonth(m)}
                    className={`text-[10px] px-2 py-1 rounded border transition-colors ${
                      holidayFilterMonth === m
                        ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                        : 'bg-gray-800 border-gray-700 text-gray-500 hover:text-gray-300'
                    }`}
                  >
                    {monthDisplay(m)}
                  </button>
                ))}
              </div>
              <div className="max-h-48 overflow-y-auto space-y-1">
                {holidays.length === 0 ? (
                  <p className="text-gray-600 text-xs">No holidays loaded. Click &quot;Refresh from API&quot; or add manually.</p>
                ) : (
                  holidays
                    .filter((h) => !holidayFilterMonth || h.date.startsWith(holidayFilterMonth))
                    .map((h) => (
                    <div key={h.id} className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-gray-800/40 transition-colors">
                      <div className="flex items-center gap-3">
                        <span className="text-gray-400 text-xs font-mono w-24">{h.date}</span>
                        <span className="text-gray-300 text-xs">{h.name}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                          h.source === 'manual' ? 'text-amber-400 bg-amber-900/20' : 'text-gray-500 bg-gray-800'
                        }`}>
                          {h.source}
                        </span>
                      </div>
                      <button
                        onClick={async () => {
                          await removeHolidayFn({ data: { id: h.id } })
                          const updated = await fetchHolidaysData({ data: { months: FISCAL_MONTHS } })
                          setHolidays(updated as { id: string; date: string; name: string; source: string }[])
                        }}
                        className="text-[10px] text-gray-600 hover:text-red-400 transition-colors"
                      >
                        Remove
                      </button>
                    </div>
                  ))
                )}
              </div>
              <div className="mt-3 flex gap-2">
                <button
                  onClick={async () => {
                    await refreshHolidays({ data: { year: 2026 } })
                    await refreshHolidays({ data: { year: 2027 } })
                    const updated = await fetchHolidaysData({ data: { months: FISCAL_MONTHS } })
                    setHolidays(updated as { id: string; date: string; name: string; source: string }[])
                  }}
                  className="text-xs bg-gray-800 hover:bg-gray-700 text-gray-400 px-3 py-1.5 rounded-lg border border-gray-700 transition-colors"
                >
                  Refresh from API
                </button>
                <p className="text-gray-600 text-[10px] self-center">Source: Nager.Date · Manual holidays are preserved</p>
              </div>
            </div>
          )}
        </div>

        {/* ── Efficiency Summary ── */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden mt-6">
          <div className="px-4 py-3 border-b border-gray-800">
            <p className="text-white text-sm font-medium">Efficiency per month</p>
            <p className="text-gray-500 text-xs">Each slice as % of effective capacity</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-gray-800/50">
                  <th className="text-left text-gray-400 font-normal px-4 py-2 w-40 sticky left-0 bg-gray-800/50">Category</th>
                  {FISCAL_MONTHS.map((m) => (
                    <th key={m} className="text-center font-normal py-2 px-1 min-w-[72px] text-gray-400">{monthDisplay(m)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  { label: 'Backlog %', getter: getBacklogTotal, color: 'text-emerald-400' },
                  { label: 'Forecast %', getter: getForecastTotal, color: 'text-pink-400' },
                  { label: 'Non-charge %', getter: getNCTotal, color: 'text-gray-400' },
                ].map((row) => (
                  <tr key={row.label} className="border-t border-gray-800">
                    <td className={`px-4 py-1.5 text-[10px] uppercase tracking-wider sticky left-0 bg-gray-900 ${row.color}`}>
                      {row.label}
                    </td>
                    {FISCAL_MONTHS.map((m) => {
                      const eff = getEfficiency(m, row.getter(m))
                      return (
                        <td key={m} className={`text-center py-1.5 font-medium ${
                          eff !== null ? row.color : 'text-gray-700'
                        }`}>
                          {eff !== null ? `${eff}%` : '—'}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── Chart ── */}
        {(() => {
          const chartData = FISCAL_MONTHS.map((m) => {
            const cap = getEffectiveCapacity(m)
            return {
              month: monthDisplay(m),
              backlog: getBacklogTotal(m),
              forecast: getForecastTotal(m),
              nonCharge: getNCTotal(m),
              capacity: cap > 0 ? cap : null,
            }
          })

          return (
            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden mt-6">
              <div className="px-4 py-3 border-b border-gray-800">
                <p className="text-white text-sm font-medium">Manpower loading — monthly</p>
                <p className="text-gray-500 text-xs">Stacked bars: backlog + forecast + non-charge · Line: capacity ceiling</p>
              </div>
              <div className="p-4">
                <ResponsiveContainer width="100%" height={320}>
                  <ComposedChart data={chartData} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
                    <CartesianGrid stroke="#1f2937" strokeDasharray="3 3" />
                    <XAxis
                      dataKey="month"
                      tick={{ fill: '#9ca3af', fontSize: 11 }}
                      axisLine={{ stroke: '#374151' }}
                      tickLine={{ stroke: '#374151' }}
                    />
                    <YAxis
                      tick={{ fill: '#9ca3af', fontSize: 11 }}
                      axisLine={{ stroke: '#374151' }}
                      tickLine={{ stroke: '#374151' }}
                    />
                    <Tooltip
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      content={({ active, payload, label }: any) => {
                        if (!active || !payload?.length) return null
                        const p = payload[0].payload
                        const total = (p.backlog ?? 0) + (p.forecast ?? 0) + (p.nonCharge ?? 0)
                        const blEff = total > 0 ? ((p.backlog / total) * 100).toFixed(1) : '—'
                        return (
                          <div className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-xs shadow-xl">
                            <p className="text-gray-200 font-medium mb-1.5">{label}</p>
                            <p className="text-emerald-400">Backlog: {p.backlog}h</p>
                            <p className="text-pink-400">Forecast: {p.forecast}h</p>
                            <p className="text-gray-400">Non-charge: {p.nonCharge}h</p>
                            {p.capacity != null && <p className="text-gray-300">Capacity: {p.capacity}h</p>}
                            <p className="text-gray-400 mt-1 border-t border-gray-700 pt-1">Total: {total}h · BL utilisation: {blEff}%</p>
                          </div>
                        )
                      }}
                    />
                    <Legend
                      wrapperStyle={{ fontSize: '11px', color: '#9ca3af' }}
                      formatter={(value: string) => {
                        if (value === 'backlog') return 'Backlog & New Projects'
                        if (value === 'forecast') return 'Forecast Projects'
                        if (value === 'nonCharge') return 'Non-Charge Hours'
                        return value
                      }}
                    />
                    <Bar dataKey="backlog" stackId="load" fill="#34d399" radius={[2, 2, 0, 0]} />
                    <Bar dataKey="forecast" stackId="load" fill="#f59e0b" radius={[2, 2, 0, 0]} />
                    <Bar dataKey="nonCharge" stackId="load" fill="#6b7280" radius={[2, 2, 0, 0]} />
                    <Line
                      type="monotone"
                      dataKey="capacity"
                      stroke="#fbbf24"
                      strokeWidth={2}
                      dot={{ fill: '#fbbf24', r: 3 }}
                      connectNulls={false}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>
          )
        })()}
      </>
    )
  }

  function ProjectsContent() {
    return (
      <>

        {/* ── Filter ── */}
        <div className="flex items-center gap-2 mb-4">
          {(['backlog', 'forecast', 'all'] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setFilter(mode)}
              className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                filter === mode
                  ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                  : 'bg-gray-800 border-gray-700 text-gray-400 hover:text-gray-300'
              }`}
            >
              {mode === 'all' ? 'View All' : mode === 'backlog' ? 'Backlog & New Projects' : 'Forecast Projects'}
            </button>
          ))}
        </div>

        {/* ── Backlog & New Projects ── */}
        {(filter === 'backlog' || filter === 'all') && renderProjectTable('Backlog & New Projects', backlogProjects, FISCAL_MONTHS)}

        {/* ── Forecast Projects ── */}
        {(filter === 'forecast' || filter === 'all') && renderProjectTable('Forecast Projects', forecastProjects, FISCAL_MONTHS)}

        {/* ── Non-Charge Hours ── */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden mb-6">
          <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
            <div>
              <p className="text-white text-sm font-medium">Non-Charge Hours</p>
              <p className="text-gray-500 text-xs">Type hours per category per month</p>
            </div>
            <p className="text-gray-500 text-xs">
              {ncStatus === 'saving' ? '⏳ Saving...' : ncStatus === 'unsaved' ? '● Unsaved' : ncStatus === 'error' ? '✕ Save failed' : ''}
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-gray-800/50">
                  <th className="text-left text-gray-400 font-normal px-4 py-2 w-44 sticky left-0 bg-gray-800/50 z-10">Category</th>
                  {FISCAL_MONTHS.map((m) => (
                    <th key={m} className="text-center font-normal py-2 px-1 min-w-[72px] text-gray-400">{monthDisplay(m)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {NC_CATEGORIES.map((cat) => (
                  <tr key={cat} className="border-t border-gray-800 hover:bg-gray-800/20">
                    <td className="px-4 py-1.5 text-gray-400 text-xs sticky left-0 bg-gray-900">
                      {NC_LABELS[cat]}
                    </td>
                    {FISCAL_MONTHS.map((m) => {
                      const val = ncEntries[cat]?.[m]
                      return (
                        <td key={m} className="p-0">
                          <input
                            type="number" min={0}
                            value={val ?? ''}
                            onChange={(e) => {
                              const clamped = e.target.value === '' || isNaN(parseInt(e.target.value)) ? 0 : Math.max(0, parseInt(e.target.value))
                              setNcEntries((prev) => {
                                const next = { ...prev }
                                if (!next[cat]) next[cat] = {}
                                next[cat] = { ...next[cat], [m]: clamped }
                                return next
                              })
                              setNcStatus('unsaved')
                              if (ncDebounceRef.current) clearTimeout(ncDebounceRef.current)
                              ncDebounceRef.current = setTimeout(async () => {
                                try {
                                  setNcStatus('saving')
                                  await saveNonCharge({ data: { category: cat, month: m, hours: clamped } })
                                  setNcStatus('saved')
                                } catch { setNcStatus('error') }
                              }, 600)
                            }}
                            placeholder="—"
                            className="w-full text-center py-1.5 px-1 bg-transparent text-xs text-blue-300 outline-none focus:bg-gray-800 rounded transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          />
                        </td>
                      )
                    })}
                  </tr>
                ))}
                {/* Total NC row */}
                <tr className="border-t border-gray-700 bg-gray-800/30">
                  <td className="px-4 py-1.5 text-gray-500 text-[10px] uppercase tracking-wider sticky left-0 bg-gray-800/30">
                    Total Non-Charge
                  </td>
                  {FISCAL_MONTHS.map((m) => {
                    const total = NC_CATEGORIES.reduce((sum, cat) => sum + (ncEntries[cat]?.[m] ?? 0), 0)
                    return (
                      <td key={m} className={`text-center py-1.5 font-medium ${total > 0 ? 'text-white' : 'text-gray-700'}`}>
                        {total > 0 ? total : '—'}
                      </td>
                    )
                  })}
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div className="px-4 py-3 border-t border-gray-800 flex items-center justify-between">
          <p className="text-gray-600 text-xs">
            <span className="text-blue-300">Blue</span> = manual estimate ·{' '}
            <span className="text-amber-300">Amber</span> = actual (pending approval) ·{' '}
            <span className="text-white">White</span> = actual (approved)
          </p>
          <p className="text-gray-500 text-xs">Fiscal year April 2026 – March 2027</p>
        </div>
      </>
    )
  }

  function PeopleContent() {
    return (
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 text-center">
        <p className="text-gray-500 text-sm">Employee efficiency data coming soon</p>
      </div>
    )
  }

  if (loading) {
    return <p className="text-gray-500 text-sm">Loading manpower data...</p>
  }

  return (
    <div>
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-white text-lg font-medium">Analytics</h1>
          <p className="text-gray-500 text-sm mt-0.5">Fiscal year Apr 2026 – Mar 2027</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-gray-500">
            {saveStatus === 'saving' ? '⏳ Saving...' : saveStatus === 'unsaved' ? '● Unsaved' : saveStatus === 'error' ? '✕ Save failed' : ''}
          </span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 mb-6 border-b border-gray-800">
        {(['overview', 'projects', 'people'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`text-xs px-4 py-2.5 border-b-2 transition-colors capitalize ${
              activeTab === tab ? 'border-amber-400 text-amber-400' : 'border-transparent text-gray-500 hover:text-gray-300'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {activeTab === 'overview' && <OverviewContent />}
      {activeTab === 'projects' && <ProjectsContent />}
      {activeTab === 'people' && <PeopleContent />}
    </div>
  )
}
