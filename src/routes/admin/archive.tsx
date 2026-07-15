import { createFileRoute } from '@tanstack/react-router'
import { useState, useEffect } from 'react'
import { createServerFn } from '@tanstack/react-start'
import { loadAllSnapshots, loadSnapshot, getUserById, loadEntriesForMonth, loadUserProjects } from '../../db/queries'
import { monthLabel } from '../../lib/month'

export const Route = createFileRoute('/admin/archive')({
  component: ArchivePage,
})

const fetchSnapshots = createServerFn().handler(async () => loadAllSnapshots())

const fetchSnapshot = createServerFn()
  .validator((data: { month: string }) => data)
  .handler(async ({ data }) => loadSnapshot(data.month))

const fetchEngineerTimesheet = createServerFn()
  .validator((data: { userId: string; month: string }) => data)
  .handler(async ({ data }) => {
    const entries = await loadEntriesForMonth(data.userId, data.month)
    const projects = await loadUserProjects(data.userId, data.month)
    const user = await getUserById(data.userId)
    return { entries, projects, user }
  })

type SnapshotRow = { id: string; month: string; closedAt: string; closedBy: string | null; capacityHours: number; backlogHours: number; forecastHours: number; nonChargeHours: number; totalLoadingHours: number; backlogPct: number | null; forecastPct: number | null; nonChargePct: number | null }
type ReopenRow = { id: string; month: string; reopenedBy: string | null; reopenedAt: string; reason: string }
type EmpStat = { id: string; userId: string | null; userName: string; capacityHours: number; billableHours: number; nonChargeHours: number; efficiencyPct: number | null; timesheetStatus: string | null }

function ArchivePage() {
  const [level, setLevel] = useState<1 | 2 | 3>(1)
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null)
  const [, setSelectedEmp] = useState<string | null>(null)
  const [snapshots, setSnapshots] = useState<SnapshotRow[]>([])
  const [reopenLogs, setReopenLogs] = useState<ReopenRow[]>([])
  const [snapshot, setSnapshot] = useState<{ snapshot: SnapshotRow; projectHours: { projectName: string; category: string; hours: number; source: string }[]; employeeStats: EmpStat[]; reopenLogs: ReopenRow[] } | null>(null)
  const [timesheetData, setTimesheetData] = useState<{ entries: { projectId: string; date: string; hours: number }[]; projects: { id: string; name: string }[]; user: { name: string; position: string } | null } | null>(null)
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [searchFilter, setSearchFilter] = useState('')

  useEffect(() => {
    fetchSnapshots().then((d) => {
      setSnapshots(d.snapshots as SnapshotRow[])
      setReopenLogs(d.reopenLogs as ReopenRow[])
    })
  }, [])

  const reopenMap: Record<string, ReopenRow[]> = {}
  for (const log of reopenLogs) {
    if (!reopenMap[log.month]) reopenMap[log.month] = []
    reopenMap[log.month].push(log)
  }

  async function openMonth(month: string) {
    setSelectedMonth(month)
    const d = await fetchSnapshot({ data: { month } })
    setSnapshot(d as typeof snapshot)
    setSelectedEmp(null)
    setTimesheetData(null)
    setLevel(2)
  }

  function openEmployee(userId: string) {
    if (!selectedMonth) return
    setSelectedEmp(userId)
    fetchEngineerTimesheet({ data: { userId, month: selectedMonth } }).then((d) => {
      setTimesheetData(d as typeof timesheetData)
    })
    setLevel(3)
  }

  function back() {
    if (level === 3) { setLevel(2); setTimesheetData(null) }
    else if (level === 2) { setLevel(1); setSnapshot(null) }
  }

  function monthHasTimesheets(month: string) {
    // Jul 2026 onward has timesheet data
    return month >= '2026-07'
  }

  // ── L1: Month list ──
  if (level === 1) {
    return (
      <div>
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-white text-lg font-medium">Archive</h1>
            <p className="text-gray-500 text-sm mt-0.5">{snapshots.length} closed month{snapshots.length !== 1 ? 's' : ''}</p>
          </div>
        </div>
        {snapshots.length === 0 ? (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center">
            <p className="text-gray-500 text-sm">No months have been closed yet.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {snapshots.map((s) => {
              const logs = reopenMap[s.month] || []
              const hasTS = monthHasTimesheets(s.month)
              return (
                <div
                  key={s.id}
                  onClick={() => openMonth(s.month)}
                  className="bg-gray-900 border border-gray-800 rounded-xl p-4 hover:bg-gray-800/40 cursor-pointer transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-white text-sm font-medium">{monthLabel(s.month)}</p>
                      {hasTS ? (
                        <p className="text-gray-400 text-xs mt-1">
                          {s.totalLoadingHours}h loaded ·{' '}
                          {s.backlogPct != null ? `${s.backlogPct.toFixed(1)}% backlog` : '—'} ·{' '}
                          {s.forecastPct != null ? `${s.forecastPct.toFixed(1)}% forecast` : '—'}
                        </p>
                      ) : (
                        <p className="text-amber-400/70 text-xs mt-1">Analytics only — no timesheet detail</p>
                      )}
                      <p className="text-gray-600 text-[10px] mt-1">
                        Closed {new Date(s.closedAt).toLocaleDateString()} · Capacity {s.capacityHours}h
                      </p>
                    </div>
                    <span className="text-gray-500 text-xs">→</span>
                  </div>
                  {logs.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-gray-800 space-y-0.5">
                      {logs.map((log) => (
                        <p key={log.id} className="text-amber-500/70 text-[10px]">
                          Reopened {new Date(log.reopenedAt).toLocaleDateString()} — {log.reason}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  // ── L2: Month detail ──
  if (level === 2 && snapshot) {
    const s = snapshot.snapshot
    const employeeStats = snapshot.employeeStats.filter((e) => {
      if (statusFilter !== 'all' && e.timesheetStatus !== statusFilter) return false
      if (searchFilter && !e.userName.toLowerCase().includes(searchFilter.toLowerCase())) return false
      return true
    })
    const hasTS = monthHasTimesheets(s.month)

    return (
      <div>
        <button onClick={back} className="text-gray-500 hover:text-gray-300 text-sm mb-4 transition-colors">← Back to Archive</button>
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-white text-lg font-medium">{monthLabel(s.month)}</h1>
            <p className="text-gray-500 text-xs mt-0.5">Closed {new Date(s.closedAt).toLocaleDateString()}</p>
          </div>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-4 gap-3 mb-6">
          {[
            { label: 'Capacity', value: `${s.capacityHours}h` },
            { label: 'Total Loading', value: `${s.totalLoadingHours}h` },
            { label: 'Backlog', value: s.backlogPct != null ? `${s.backlogPct.toFixed(1)}%` : '—' },
            { label: 'Forecast', value: s.forecastPct != null ? `${s.forecastPct.toFixed(1)}%` : '—' },
          ].map((m) => (
            <div key={m.label} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <p className="text-gray-500 text-xs mb-1">{m.label}</p>
              <p className="text-white text-xl font-medium">{m.value}</p>
            </div>
          ))}
        </div>

        {/* Reopen history */}
        {snapshot.reopenLogs.length > 0 && (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 mb-6">
            <p className="text-gray-500 text-[10px] uppercase tracking-wider mb-2">Reopen history</p>
            {snapshot.reopenLogs.map((log) => (
              <p key={log.id} className="text-amber-400/70 text-xs">
                {new Date(log.reopenedAt).toLocaleDateString()} — {log.reason}
              </p>
            ))}
          </div>
        )}

        {/* Filters */}
        {hasTS && (
          <div className="flex items-center gap-2 mb-4">
            <input
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              placeholder="Search engineer..."
              className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-white text-xs placeholder-gray-600 outline-none focus:border-gray-500 flex-1 max-w-xs"
            />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-white text-xs outline-none focus:border-gray-500"
            >
              <option value="all">All statuses</option>
              <option value="approved">Approved</option>
              <option value="submitted">Submitted</option>
              <option value="returned">Returned</option>
              <option value="draft">Not submitted</option>
            </select>
          </div>
        )}

        {/* Employee roster */}
        {hasTS ? (
          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-800/40 text-gray-500 text-xs font-normal">
                  <th className="text-left px-4 py-2.5">Engineer</th>
                  <th className="text-left px-4 py-2.5">Status</th>
                  <th className="text-left px-4 py-2.5">Capacity</th>
                  <th className="text-left px-4 py-2.5">Billable</th>
                  <th className="text-left px-4 py-2.5">Non-charge</th>
                  <th className="text-left px-4 py-2.5">Efficiency</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {employeeStats.length === 0 ? (
                  <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-600 text-sm">No engineers match filters.</td></tr>
                ) : (
                  employeeStats.map((emp) => (
                    <tr key={emp.id} className="border-t border-gray-800 hover:bg-gray-800/20 transition-colors">
                      <td className="px-4 py-3 text-white text-xs font-medium">{emp.userName}</td>
                      <td className="px-4 py-3">
                        <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${
                          emp.timesheetStatus === 'approved' ? 'text-emerald-400 bg-emerald-900/30 border-emerald-800' :
                          emp.timesheetStatus === 'submitted' ? 'text-amber-400 bg-amber-900/30 border-amber-800' :
                          emp.timesheetStatus === 'returned' ? 'text-red-400 bg-red-900/30 border-red-800' :
                          'text-gray-400 bg-gray-800 border-gray-700'
                        }`}>
                          {emp.timesheetStatus ?? 'Not submitted'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-300 text-xs">{emp.capacityHours}h</td>
                      <td className={`px-4 py-3 text-xs ${emp.billableHours > 0 ? 'text-white' : 'text-gray-600'}`}>{emp.billableHours > 0 ? `${emp.billableHours}h` : '—'}</td>
                      <td className="px-4 py-3 text-gray-400 text-xs">{emp.nonChargeHours > 0 ? `${emp.nonChargeHours}h` : '—'}</td>
                      <td className={`px-4 py-3 text-xs font-medium ${emp.efficiencyPct != null ? (emp.efficiencyPct >= 100 ? 'text-emerald-400' : 'text-amber-400') : 'text-gray-600'}`}>
                        {emp.efficiencyPct != null ? `${emp.efficiencyPct.toFixed(1)}%` : '—'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {emp.userId && (
                          <button onClick={() => openEmployee(emp.userId!)} className="text-xs text-gray-400 hover:text-white transition-colors">
                            View
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center">
            <p className="text-gray-500 text-sm">No timesheet detail available for this month.</p>
          </div>
        )}
      </div>
    )
  }

  // ── L3: Individual timesheet ──
  if (level === 3 && timesheetData) {
    const { entries, projects, user } = timesheetData
    const [y, m] = selectedMonth!.split('-').map(Number)
    const daysInMonth = new Date(y, m, 0).getDate()
    const days = Array.from({ length: daysInMonth }, (_, i) => i + 1)
    const weekends = days.filter((d) => { const g = new Date(y, m - 1, d).getDay(); return g === 0 || g === 6 })

    const entriesMap: Record<string, Record<number, number>> = {}
    for (const entry of entries) {
      const day = parseInt(entry.date.split('-')[2])
      if (!entriesMap[entry.projectId]) entriesMap[entry.projectId] = {}
      entriesMap[entry.projectId][day] = entry.hours
    }

    function getDayTotal(day: number) {
      return projects.reduce((sum, p) => sum + (entriesMap[p.id]?.[day] ?? 0), 0)
    }
    function getProjectTotal(pid: string) {
      return Object.values(entriesMap[pid] ?? {}).reduce((a, b) => a + b, 0)
    }

    return (
      <div>
        <button onClick={back} className="text-gray-500 hover:text-gray-300 text-sm mb-4 transition-colors">← Back to month</button>
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-white text-lg font-medium">{user?.name ?? 'Engineer'}</h1>
            <p className="text-gray-500 text-sm mt-0.5">{selectedMonth?.replace('-', ' ')} · {user?.position ?? ''}</p>
          </div>
          <span className="text-xs border px-3 py-1 rounded-full text-gray-500 bg-gray-800 border-gray-700">Archived — read-only</span>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-gray-800/50">
                  <th className="text-left text-gray-400 font-normal px-4 py-2 w-32 sticky left-0 bg-gray-800/50">Project</th>
                  {days.map((d) => (
                    <th key={d} className={`text-center font-normal py-2 px-1 min-w-[28px] ${weekends.includes(d) ? 'text-gray-700' : 'text-gray-400'}`}>{d}</th>
                  ))}
                  <th className="text-center text-gray-400 font-normal px-3 py-2 w-14">Total</th>
                </tr>
              </thead>
              <tbody>
                {projects.length === 0 ? (
                  <tr><td colSpan={days.length + 2} className="px-4 py-8 text-center text-gray-600 text-sm">No projects assigned.</td></tr>
                ) : (
                  projects.map((project, pi) => (
                    <tr key={project.id} className="border-t border-gray-800">
                      <td className={`px-4 py-1.5 font-medium sticky left-0 bg-gray-900 ${pi === 0 ? 'text-emerald-400' : pi === 1 ? 'text-purple-400' : pi === 2 ? 'text-blue-400' : 'text-amber-400'}`}>
                        {project.name}
                      </td>
                      {days.map((d) => {
                        const isWeekend = weekends.includes(d)
                        const val = entriesMap[project.id]?.[d]
                        return (
                          <td key={d} className={`text-center py-1.5 px-0.5 ${isWeekend ? 'bg-gray-800/30 text-gray-700' : val ? 'text-white' : 'text-gray-700'}`}>
                            {isWeekend ? '' : val ?? '—'}
                          </td>
                        )
                      })}
                      <td className="text-center text-white font-medium bg-gray-800/40 px-3">{getProjectTotal(project.id)}</td>
                    </tr>
                  ))
                )}
                <tr className="border-t border-gray-700 bg-gray-800/30">
                  <td className="px-4 py-1.5 text-gray-500 text-[10px] uppercase tracking-wider sticky left-0 bg-gray-800/30">Daily total</td>
                  {days.map((d) => {
                    const total = getDayTotal(d)
                    const isWeekend = weekends.includes(d)
                    return (
                      <td key={d} className={`text-center py-1.5 font-medium ${isWeekend ? 'text-gray-700' : total > 0 ? 'text-white' : 'text-gray-700'}`}>
                        {isWeekend ? '' : total > 0 ? total : '—'}
                      </td>
                    )
                  })}
                  <td className="text-center text-amber-400 font-medium px-3">{projects.reduce((s, p) => s + getProjectTotal(p.id), 0)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    )
  }

  return null
}
