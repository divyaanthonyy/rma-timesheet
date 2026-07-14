import { createFileRoute } from '@tanstack/react-router'
import { useState, useEffect, useRef } from 'react'
import { createServerFn } from '@tanstack/react-start'
import { getRequestHeaders } from '@tanstack/react-start/server'
import { auth } from '../../lib/auth'
import { loadEntriesForMonth, loadUserProjects, upsertEntry, updateTimesheetStatus, loadTimesheetStatus, loadTimesheetHistory, getUserByEmail, loadLeaveDaysForMonth, upsertLeaveDay, deleteLeaveDay } from '../../db/queries'
import { formatHistoryTimestamp, getHistoryEventMeta } from '../../lib/timesheet-history'

export const Route = createFileRoute('/admin/timesheet')({
  component: AdminTimesheetPage,
})

const now = new Date()
const MONTH = now.toISOString().slice(0, 7)
const YEAR = now.getFullYear()
const MONTH_INDEX = now.getMonth()

const getWeekends = (year: number, month: number) => {
  const weekends = []
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, month, day)
    if (date.getDay() === 0 || date.getDay() === 6) {
      weekends.push(day)
    }
  }
  return weekends
}

const DAYS = Array.from({ length: new Date(YEAR, MONTH_INDEX + 1, 0).getDate() }, (_, i) => i + 1)
const WEEKENDS = getWeekends(YEAR, MONTH_INDEX)

const getCurrentUser = createServerFn().handler(async () => {
  const headers = getRequestHeaders()
  const session = await auth.api.getSession({ headers })
  if (!session) return null
  return getUserByEmail(session.user.email)
})

const fetchEntries = createServerFn()
  .validator((data: { userId: string }) => data)
  .handler(async ({ data }) => loadEntriesForMonth(data.userId, MONTH))

const fetchProjects = createServerFn()
  .validator((data: { userId: string }) => data)
  .handler(async ({ data }) => loadUserProjects(data.userId, MONTH))

const fetchStatus = createServerFn()
  .validator((data: { userId: string }) => data)
  .handler(async ({ data }) => loadTimesheetStatus(data.userId, MONTH))

const fetchHistory = createServerFn()
  .validator((data: { userId: string; month: string }) => data)
  .handler(async ({ data }) => loadTimesheetHistory(data.userId, data.month))

const saveEntry = createServerFn()
  .validator((data: { userId: string; projectId: string; date: string; hours: number }) => data)
  .handler(async ({ data }) => upsertEntry(data.userId, data.projectId, data.date, data.hours))

const approveTimesheetFn = createServerFn()
  .validator((d: { userId: string; month: string }) => d)
  .handler(async ({ data }) => updateTimesheetStatus(data.userId, data.month, 'approved'))

const unapproveTimesheetFn = createServerFn()
  .validator((d: { userId: string; month: string }) => d)
  .handler(async ({ data }) => updateTimesheetStatus(data.userId, data.month, 'submitted'))

const fetchLeaveDays = createServerFn()
  .validator((data: { userId: string }) => data)
  .handler(async ({ data }) => loadLeaveDaysForMonth(data.userId, MONTH))

const saveLeaveDayFn = createServerFn()
  .validator((data: { userId: string; date: string; type: 'full' | 'half' }) => data)
  .handler(async ({ data }) => upsertLeaveDay(data.userId, data.date, data.type))

const deleteLeaveDayFn = createServerFn()
  .validator((data: { userId: string; date: string }) => data)
  .handler(async ({ data }) => deleteLeaveDay(data.userId, data.date))

type TimesheetStatus = 'draft' | 'approved'

export default function AdminTimesheetPage() {
  const [currentUser, setCurrentUser] = useState<{ id: string; name: string; employeeNumber: string; isEngineer: boolean } | null>(null)
  const [loading, setLoading] = useState(true)
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([])
  const [entries, setEntries] = useState<Record<string, Record<number, number>>>({})
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'unsaved' | 'error'>('saved')
  const [timesheetStatus, setTimesheetStatus] = useState<TimesheetStatus>('draft')
  const [history, setHistory] = useState<Array<{ id: string; eventType: string; note: string | null; createdAt: string | null; performedByUserId: string | null; performedByName: string | null }>>([])
  const [leaveDays, setLeaveDays] = useState<Record<number, 'full' | 'half'>>({})
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; day: number } | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const loadData = async () => {
      try {
        const user = await getCurrentUser()
        if (!user) { window.location.href = '/login?error=unauthorized'; return }
        setCurrentUser(user as { id: string; name: string; employeeNumber: string; isEngineer: boolean })

        if (!user.isEngineer) { setLoading(false); return }

        const userId = user.id
        const [projectsData, entriesData, statusData, historyData] = await Promise.all([
          fetchProjects({ data: { userId } }),
          fetchEntries({ data: { userId } }),
          fetchStatus({ data: { userId } }),
          fetchHistory({ data: { userId, month: MONTH } }),
        ])

        setProjects(projectsData)

        const shaped: Record<string, Record<number, number>> = {}
        for (const entry of entriesData) {
          const day = parseInt(entry.date.split('-')[2])
          if (!shaped[entry.projectId]) shaped[entry.projectId] = {}
          shaped[entry.projectId][day] = entry.hours
        }
        setEntries(shaped)

        if (statusData) {
          setTimesheetStatus(statusData.status as TimesheetStatus)
        }
        setHistory(historyData)

        // Load leave days separately so a failure here doesn't block the timesheet
        try {
          const leaveDaysData = await fetchLeaveDays({ data: { userId } })
          const leaveMap: Record<number, 'full' | 'half'> = {}
          for (const ld of leaveDaysData) {
            const day = parseInt(ld.date.split('-')[2])
            leaveMap[day] = ld.type as 'full' | 'half'
          }
          setLeaveDays(leaveMap)
        } catch {
          // leave days are optional
        }
      } catch (error) {
        console.error('Failed to load timesheet data:', error)
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [])

  useEffect(() => {
    function handleClick() { setContextMenu(null) }
    if (contextMenu) document.addEventListener('click', handleClick)
    return () => document.removeEventListener('click', handleClick)
  }, [contextMenu])

  function handleChange(projectId: string, day: number, raw: string) {
    if (!currentUser) return
    const value = parseInt(raw)
    const clamped = raw === '' || isNaN(value) ? 0 : Math.min(8, Math.max(0, value))

    if (clamped === 0) {
      setEntries(prev => {
        const updated = { ...prev, [projectId]: { ...prev[projectId] } }
        delete updated[projectId][day]
        return updated
      })
    } else {
      setEntries(prev => ({ ...prev, [projectId]: { ...prev[projectId], [day]: clamped } }))
    }

    setSaveStatus('unsaved')
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      try {
        setSaveStatus('saving')
        const date = `${MONTH}-${String(day).padStart(2, '0')}`
        await saveEntry({ data: { userId: currentUser.id, projectId, date, hours: clamped } })
        setSaveStatus('saved')
      } catch { setSaveStatus('error') }
    }, 600)
  }

  async function handleApprove() {
    if (!currentUser) return
    await approveTimesheetFn({ data: { userId: currentUser.id, month: MONTH } })
    setTimesheetStatus('approved')
  }

  async function handleUnapprove() {
    if (!currentUser) return
    await unapproveTimesheetFn({ data: { userId: currentUser.id, month: MONTH } })
    setTimesheetStatus('draft')
  }

  function handleContextMenu(e: React.MouseEvent, day: number) {
    e.preventDefault()
    if (isLocked) return
    setContextMenu({ x: e.clientX, y: e.clientY, day })
  }

  async function handleSetLeave(day: number, type: 'full' | 'half') {
    if (!currentUser) return
    const date = `${MONTH}-${String(day).padStart(2, '0')}`
    await saveLeaveDayFn({ data: { userId: currentUser.id, date, type } })
    setLeaveDays((prev) => ({ ...prev, [day]: type }))
    setContextMenu(null)
  }

  async function handleRemoveLeave(day: number) {
    if (!currentUser) return
    const date = `${MONTH}-${String(day).padStart(2, '0')}`
    await deleteLeaveDayFn({ data: { userId: currentUser.id, date } })
    setLeaveDays((prev) => {
      const next = { ...prev }
      delete next[day]
      return next
    })
    setContextMenu(null)
  }

  function getDayTotal(day: number) {
    return projects.reduce((sum, p) => sum + (entries[p.id]?.[day] ?? 0), 0)
  }

  function getProjectTotal(projectId: string) {
    return Object.values(entries[projectId] ?? {}).reduce((a, b) => a + b, 0)
  }

  const totalHours = projects.reduce((sum, p) => sum + getProjectTotal(p.id), 0)
  const topProject = projects.length > 0 ? projects.reduce((a, b) => getProjectTotal(a.id) >= getProjectTotal(b.id) ? a : b, projects[0]).name : '—'
  const today = new Date().getDate()
  const isLocked = timesheetStatus === 'approved'

  const STATUS_BADGE: Record<TimesheetStatus, string> = {
    draft:    'text-gray-400 bg-gray-800 border-gray-700',
    approved: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
  }

  const STATUS_LABEL: Record<TimesheetStatus, string> = {
    draft:    'Draft',
    approved: 'Approved',
  }

  if (loading) {
    return <p className="text-gray-500 text-sm">Loading your timesheet...</p>
  }

  if (!currentUser) {
    return <p className="text-gray-500 text-sm">Redirecting...</p>
  }

  if (!currentUser.isEngineer) {
    return (
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
        <p className="text-gray-400 text-sm">You do not have engineer timesheet access. Contact an admin to enable it.</p>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-white text-lg font-medium">My timesheet</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            {MONTH.replace('-', ' ')} · {currentUser.name} · {currentUser.employeeNumber}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-xs border px-3 py-1 rounded-full ${STATUS_BADGE[timesheetStatus]}`}>
            {STATUS_LABEL[timesheetStatus]}
          </span>
          {!isLocked ? (
            <button onClick={handleApprove} className="text-xs bg-emerald-600 hover:bg-emerald-500 text-white font-medium px-3 py-1.5 rounded-lg transition-colors">
              Approve ✓
            </button>
          ) : (
            <button onClick={handleUnapprove} className="text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 px-3 py-1.5 rounded-lg border border-gray-700 transition-colors">
              Unapprove
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-6">
        {[
          { label: 'Total hours', value: `${totalHours}h` },
          { label: 'Man-days',    value: (totalHours / 8).toFixed(1) },
          { label: 'Top project', value: topProject },
        ].map((s) => (
          <div key={s.label} className="bg-gray-900 border border-gray-800 rounded-xl p-3">
            <p className="text-gray-500 text-[10px] mb-0.5">{s.label}</p>
            <p className="text-white text-base font-medium">{s.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
          <div>
            <p className="text-white text-sm font-medium">Hours log</p>
            <p className="text-gray-500 text-xs">{MONTH.replace('-', ' ')} · {isLocked ? 'read-only' : 'click any cell to edit'}</p>
          </div>
          <p className="text-gray-500 text-xs">
            {saveStatus === 'saving' ? '⏳ Saving...' : saveStatus === 'unsaved' ? '● Unsaved' : saveStatus === 'error' ? '✕ Save failed' : '💾 Autosaved'}
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-gray-800/50">
                <th className="text-left text-gray-400 font-normal px-4 py-2 w-32 sticky left-0 bg-gray-800/50">Project</th>
                {DAYS.map((d) => {
                  const leaveType = leaveDays[d]
                  return (
                    <th
                      key={d}
                      onContextMenu={(e) => handleContextMenu(e, d)}
                      className={`text-center font-normal py-2 px-1 min-w-[28px] cursor-context-menu relative ${
                        WEEKENDS.includes(d) ? 'text-gray-700' : leaveType ? '' : 'text-gray-400'
                      } ${d === today ? 'text-amber-400' : ''} ${
                        leaveType === 'full' ? 'bg-sky-900/40 text-sky-300' :
                        leaveType === 'half' ? 'bg-sky-900/20 text-sky-400' : ''
                      }`}
                    >
                      {d}
                      {leaveType && (
                        <span className="absolute -top-0.5 -right-0.5 text-[8px] font-bold text-sky-300">
                          {leaveType === 'full' ? 'L' : '½'}
                        </span>
                      )}
                    </th>
                  )
                })}
                <th className="text-center text-gray-400 font-normal px-3 py-2 w-14">Total</th>
              </tr>
            </thead>
            <tbody>
              {projects.map((project, pi) => (
                <tr key={project.id} className="border-t border-gray-800 hover:bg-gray-800/20">
                  <td className={`px-4 py-1.5 font-medium sticky left-0 bg-gray-900 ${pi === 0 ? 'text-emerald-400' : pi === 1 ? 'text-purple-400' : pi === 2 ? 'text-blue-400' : 'text-amber-400'}`}>
                    {project.name}
                  </td>
                  {DAYS.map((d) => {
                    const val = entries[project.id]?.[d]
                    const isWeekend = WEEKENDS.includes(d)
                    const isLeave = leaveDays[d]
                    return (
                      <td key={d} className="p-0">
                        {isWeekend ? (
                          <div className="text-center py-1.5 px-0.5 bg-gray-800/30 text-gray-700" />
                        ) : isLeave ? (
                          <div className={`text-center py-1.5 px-0.5 ${
                            isLeave === 'full' ? 'bg-sky-900/20 text-sky-600' : 'bg-sky-900/10 text-sky-700'
                          }`}>
                            {isLeave === 'full' ? 'LEAVE' : '½ DAY'}
                          </div>
                        ) : (
                          <input
                            type="number" min={0} max={8}
                            value={val ?? ''}
                            onChange={(e) => handleChange(project.id, d, e.target.value)}
                            placeholder="—"
                            disabled={isLocked}
                            className={`w-full text-center py-1.5 px-0.5 bg-transparent text-xs outline-none focus:bg-gray-800 rounded transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${
                              isLocked ? 'text-gray-600 cursor-not-allowed' : val ? pi === 0 ? 'text-emerald-300' : pi === 1 ? 'text-purple-300' : pi === 2 ? 'text-blue-300' : 'text-amber-300' : 'text-gray-700'
                            }`}
                          />
                        )}
                      </td>
                    )
                  })}
                  <td className="text-center text-white font-medium bg-gray-800/40 px-3">{getProjectTotal(project.id)}</td>
                </tr>
              ))}
              <tr className="border-t border-gray-700 bg-gray-800/30">
                <td className="px-4 py-1.5 text-gray-500 text-[10px] uppercase tracking-wider sticky left-0 bg-gray-800/30">Daily total</td>
                {DAYS.map((d) => {
                  const total = getDayTotal(d)
                  const isWeekend = WEEKENDS.includes(d)
                  const isLeave = leaveDays[d]
                  return (
                    <td key={d} className={`text-center py-1.5 font-medium ${isWeekend ? 'text-gray-700' : isLeave ? 'text-sky-500' : total > 0 ? 'text-white' : 'text-gray-700'}`}>
                      {isWeekend ? '' : isLeave ? (isLeave === 'full' ? 'L' : '½') : total > 0 ? total : '—'}
                    </td>
                  )
                })}
                <td className="text-center text-amber-400 font-medium px-3">{totalHours}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="px-4 py-3 border-t border-gray-800 flex items-center justify-between">
          <p className="text-gray-600 text-xs">
            {saveStatus === 'saving' ? '⏳ Saving to database...' : saveStatus === 'unsaved' ? '● Changes not yet saved' : saveStatus === 'error' ? '✕ Failed to save — try again' : '💾 Autosaved to database'}
          </p>
          <p className="text-gray-500 text-xs">Max 8 hrs/day per project · Right-click a date to mark leave</p>
        </div>
      </div>

      {contextMenu && (
        <div
          className="fixed z-50 bg-gray-900 border border-gray-700 rounded-lg shadow-xl py-1 min-w-[160px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button
            onClick={() => handleSetLeave(contextMenu.day, 'full')}
            className="w-full text-left px-3 py-2 text-xs text-gray-300 hover:bg-gray-800 transition-colors"
          >
            Full Day Leave
          </button>
          <button
            onClick={() => handleSetLeave(contextMenu.day, 'half')}
            className="w-full text-left px-3 py-2 text-xs text-gray-300 hover:bg-gray-800 transition-colors"
          >
            Half Day Leave
          </button>
          {leaveDays[contextMenu.day] && (
            <button
              onClick={() => handleRemoveLeave(contextMenu.day)}
              className="w-full text-left px-3 py-2 text-xs text-red-400 hover:bg-gray-800 transition-colors"
            >
              Remove Leave
            </button>
          )}
        </div>
      )}

      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden mt-6">
        <div className="px-4 py-3 border-b border-gray-800 bg-gray-800/40">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-white text-sm font-medium">Submission history</p>
              <p className="text-gray-500 text-xs">A timeline of submissions, approvals, and returns for this month.</p>
            </div>
            <span className="text-[10px] uppercase tracking-[0.25em] text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-full px-2.5 py-1">Activity</span>
          </div>
        </div>
        {history.length === 0 ? (
          <div className="px-4 py-6 text-center"><p className="text-gray-400 text-sm">No submissions this month</p></div>
        ) : (
          <div className="divide-y divide-gray-800">
            {history.map((item) => {
              const meta = getHistoryEventMeta(item.eventType as 'submitted' | 'resubmitted' | 'approved' | 'returned' | 'unapproved')
              return (
                <div key={item.id} className="px-4 py-3 flex items-start justify-between gap-3">
                  <div>
                    <p className="text-white text-sm font-medium">{meta.title}</p>
                    <p className="text-gray-500 text-xs mt-1">{meta.description}</p>
                    {item.performedByName && <p className="text-[11px] text-amber-400 mt-1">By {item.performedByName}</p>}
                  </div>
                  <p className="text-gray-500 text-xs whitespace-nowrap">{formatHistoryTimestamp(item.createdAt)}</p>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
