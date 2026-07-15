/* eslint-disable @typescript-eslint/no-unnecessary-condition */
import { createFileRoute } from '@tanstack/react-router'
import { useState, useEffect, useRef } from 'react'
import { createServerFn } from '@tanstack/react-start'
import { getRequestHeaders } from '@tanstack/react-start/server'
import { auth } from '../../lib/auth'
import { loadEntriesForMonth, loadUserProjects, upsertEntry, updateTimesheetStatus, loadTimesheetStatus, getUserByEmail, loadTimesheetHistory, loadLeaveDaysForMonth, upsertLeaveDay, deleteLeaveDay, loadOpenPastMonths } from '../../db/queries'
import { formatHistoryTimestamp, getHistoryEventMeta } from '../../lib/timesheet-history'

export const Route = createFileRoute('/engineer/timesheet')({
  component: TimesheetPage,
})

// Dynamic date calculations
const now = new Date()
const MONTH = now.toISOString().slice(0, 7) // YYYY-MM format
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

const DAYS = Array.from(
  { length: new Date(YEAR, MONTH_INDEX + 1, 0).getDate() },
  (_, i) => i + 1
)
const WEEKENDS = getWeekends(YEAR, MONTH_INDEX)

// Server Functions
const getCurrentUser = createServerFn().handler(async () => {
  const headers = getRequestHeaders()
  const session = await auth.api.getSession({ headers })
  if (!session) return null
  return getUserByEmail(session.user.email)
})

const fetchEntries = createServerFn()
  .validator((data: { userId: string }) => data)
  .handler(async ({ data }) => {
    return loadEntriesForMonth(data.userId, MONTH)
  })

const fetchProjects = createServerFn()
  .validator((data: { userId: string }) => data)
  .handler(async ({ data }) => {
    return loadUserProjects(data.userId, MONTH)
  })

const fetchStatus = createServerFn()
  .validator((data: { userId: string }) => data)
  .handler(async ({ data }) => {
    return loadTimesheetStatus(data.userId, MONTH)
  })

const saveEntry = createServerFn()
  .validator((data: { userId: string; projectId: string; date: string; hours: number }) => data)
  .handler(async ({ data }) => {
    await upsertEntry(data.userId, data.projectId, data.date, data.hours)
  })

const fetchHistory = createServerFn()
  .validator((data: { userId: string; month: string }) => data)
  .handler(async ({ data }) => {
    return loadTimesheetHistory(data.userId, data.month)
  })

const fetchOpenPast = createServerFn()
  .validator((data: { userId: string }) => data)
  .handler(async ({ data }) => {
    return loadOpenPastMonths(data.userId)
  })

const submitTimesheetFn = createServerFn()
  .validator((d: { userId: string; month: string }) => d)
  .handler(async ({ data }) => {
    await updateTimesheetStatus(data.userId, data.month, 'submitted')
  })

const fetchLeaveDays = createServerFn()
  .validator((data: { userId: string }) => data)
  .handler(async ({ data }) => {
    return loadLeaveDaysForMonth(data.userId, MONTH)
  })

const saveLeaveDayFn = createServerFn()
  .validator((data: { userId: string; date: string; type: 'full' | 'half' }) => data)
  .handler(async ({ data }) => {
    await upsertLeaveDay(data.userId, data.date, data.type)
  })

const deleteLeaveDayFn = createServerFn()
  .validator((data: { userId: string; date: string }) => data)
  .handler(async ({ data }) => {
    await deleteLeaveDay(data.userId, data.date)
  })

type TimesheetStatus = 'draft' | 'submitted' | 'approved' | 'returned'

type CurrentUser = {
  id: string
  name: string
  email: string
  employeeNumber: string
  position: string
  role: string
  manDayRate: number
  createdAt: string | null
}

export default function TimesheetPage() {
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([])
  const [entries, setEntries] = useState<Record<string, Record<number, number>>>({})
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'unsaved' | 'error'>('saved')
  const [timesheetStatus, setTimesheetStatus] = useState<TimesheetStatus>('draft')
  const [returnNote, setReturnNote] = useState<string | null>(null)
  const [history, setHistory] = useState<Array<{ id: string; eventType: string; note: string | null; createdAt: string | null; performedByUserId: string | null; performedByName: string | null }>>([])
  const [leaveDays, setLeaveDays] = useState<Record<number, 'full' | 'half'>>({})
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; day: number } | null>(null)
  const [openPastMonths, setOpenPastMonths] = useState<{ month: string; status: string }[]>([])
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const loadData = async () => {
      try {
        const user = await getCurrentUser()
        if (!user) {
          window.location.href = '/login?error=unauthorized'
          return
        }
        setCurrentUser(user as CurrentUser)
        const userId = user.id

        // Load all data in parallel
        const [projectsData, entriesData, statusData, historyData, leaveDaysData] = await Promise.all([
          fetchProjects({ data: { userId } }),
          fetchEntries({ data: { userId } }),
          fetchStatus({ data: { userId } }),
          fetchHistory({ data: { userId, month: MONTH } }),
          fetchLeaveDays({ data: { userId } }),
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
          setReturnNote(statusData.returnNote)
        }
        setHistory(historyData)

        const leaveMap: Record<number, 'full' | 'half'> = {}
        for (const ld of leaveDaysData) {
          const day = parseInt(ld.date.split('-')[2])
          leaveMap[day] = ld.type as 'full' | 'half'
        }
        setLeaveDays(leaveMap)
      } catch (error) {
        console.error('Failed to load user data:', error)
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [])

  useEffect(() => {
    if (!currentUser) return
    fetchOpenPast({ data: { userId: currentUser.id } }).then((months) => {
      setOpenPastMonths(months as { month: string; status: string }[])
    })
  }, [currentUser])

  useEffect(() => {
    function handleClick() {
      setContextMenu(null)
    }
    if (contextMenu) {
      document.addEventListener('click', handleClick)
    }
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
      setEntries(prev => ({
        ...prev,
        [projectId]: { ...prev[projectId], [day]: clamped }
      }))
    }

    setSaveStatus('unsaved')
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      try {
        setSaveStatus('saving')
        const date = `${MONTH}-${String(day).padStart(2, '0')}`
        await saveEntry({ data: { userId: currentUser.id, projectId, date, hours: clamped } })
        setSaveStatus('saved')
      } catch {
        setSaveStatus('error')
      }
    }, 600)
  }

  async function handleSubmit() {
    if (!currentUser) return
    await submitTimesheetFn({ data: { userId: currentUser.id, month: MONTH } })
    setTimesheetStatus('submitted')
    setReturnNote(null)
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
  const workedDays = DAYS.filter((d) => !WEEKENDS.includes(d) && getDayTotal(d) > 0).length
  const avgHours = workedDays > 0 ? (totalHours / workedDays).toFixed(1) : '0'
  
  // Safe top project calculation
  const topProject = projects.length > 0
    ? projects.reduce((a, b) => getProjectTotal(a.id) >= getProjectTotal(b.id) ? a : b, projects[0]).name
    : '—'
  
  const today = new Date().getDate()
  const lastDay = new Date(YEAR, MONTH_INDEX + 1, 0).getDate()
  const daysLeft = Math.max(0, lastDay - today)
  const isLocked = timesheetStatus === 'submitted' || timesheetStatus === 'approved'

  const STATUS_BADGE: Record<TimesheetStatus, string> = {
    draft:     'text-gray-400 bg-gray-800 border-gray-700',
    submitted: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
    approved:  'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
    returned:  'text-red-400 bg-red-500/10 border-red-500/20',
  }

  const STATUS_LABEL: Record<TimesheetStatus, string> = {
    draft:     'Draft',
    submitted: 'Submitted',
    approved:  'Approved',
    returned:  'Returned — action required',
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-gray-500 text-sm">Loading your timesheet...</p>
      </div>
    )
  }

  if (!currentUser) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-gray-500 text-sm">Redirecting...</p>
      </div>
    )
  }

  const monthLabel = (m: string) => {
    const [y, mm] = m.split('-')
    const names = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
    return `${names[parseInt(mm) - 1]} ${y}`
  }

  return (
    <div>
      {openPastMonths.length > 0 && (
        <div className="bg-amber-950/20 border border-amber-800/40 rounded-xl p-3 mb-6 flex items-center gap-3 flex-wrap">
          <span className="text-amber-400 text-[10px] font-medium">Pending:</span>
          {openPastMonths.map((m) => (
            <span key={m.month} className="text-amber-300 text-xs">
              {monthLabel(m.month)} — {m.status === 'returned' ? 'returned, needs resubmission' : 'not yet submitted'}
              <span className="text-amber-500 ml-1 cursor-pointer hover:text-amber-300">→</span>
            </span>
          ))}
        </div>
      )}
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
          {(timesheetStatus === 'draft' || timesheetStatus === 'returned') && (
            <button
              onClick={handleSubmit}
              className="text-xs bg-amber-500 hover:bg-amber-400 text-gray-950 font-medium px-3 py-1.5 rounded-lg transition-colors"
            >
              {timesheetStatus === 'returned' ? 'Resubmit →' : 'Submit for approval →'}
            </button>
          )}
          {isLocked && (
            <button
              disabled
              className="text-xs bg-gray-700 text-gray-500 cursor-not-allowed font-medium px-3 py-1.5 rounded-lg"
            >
              {timesheetStatus === 'approved' ? 'Approved ✓' : 'Submitted ✓'}
            </button>
          )}
        </div>
      </div>

      {timesheetStatus === 'returned' && returnNote && (
        <div className="bg-red-950/30 border border-red-900/50 rounded-xl p-4 mb-6 flex items-start gap-3">
          <span className="text-red-400 text-xs mt-0.5">↩</span>
          <div>
            <p className="text-red-400 text-xs font-medium mb-1">Returned by admin — please review and resubmit</p>
            <p className="text-red-300 text-sm">{returnNote}</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-6 gap-3 mb-6">
        {[
          { label: 'Total hours',         value: `${totalHours}h` },
          { label: 'Man-days',            value: (totalHours / 8).toFixed(1) },
          { label: 'Avg hrs / day',       value: `${avgHours}h` },
          { label: 'Top project',         value: topProject },
          { label: 'Days logged',         value: workedDays },
          { label: 'Days left to submit', value: daysLeft },
        ].map((s) => (
          <div key={s.label} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <p className="text-gray-500 text-xs mb-1">{s.label}</p>
            <p className="text-white text-xl font-medium">{s.value}</p>
          </div>
        ))}
      </div>

      <div className="mb-3">
        <p className="text-gray-500 text-xs uppercase tracking-widest">Projects</p>
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
                <th className="text-left text-gray-400 font-normal px-4 py-2 w-32 sticky left-0 bg-gray-800/50">
                  Project
                </th>
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
                  <td
                    className={`px-4 py-1.5 font-medium sticky left-0 bg-gray-900 ${
                      pi === 0 ? 'text-emerald-400' :
                      pi === 1 ? 'text-purple-400' :
                      pi === 2 ? 'text-blue-400' :
                      'text-amber-400'
                    }`}
                  >
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
                            type="number"
                            min={0}
                            max={8}
                            value={val ?? ''}
                            onChange={(e) => handleChange(project.id, d, e.target.value)}
                            placeholder="—"
                            disabled={isLocked}
                            className={`w-full text-center py-1.5 px-0.5 bg-transparent text-xs outline-none focus:bg-gray-800 rounded transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${
                              isLocked
                                ? 'text-gray-600 cursor-not-allowed'
                                : val
                                ? pi === 0 ? 'text-emerald-300'
                                : pi === 1 ? 'text-purple-300'
                                : pi === 2 ? 'text-blue-300'
                                : 'text-amber-300'
                                : 'text-gray-700'
                            }`}
                          />
                        )}
                      </td>
                    )
                  })}
                  <td className="text-center text-white font-medium bg-gray-800/40 px-3">
                    {getProjectTotal(project.id)}
                  </td>
                </tr>
              ))}

              <tr className="border-t border-gray-700 bg-gray-800/30">
                <td className="px-4 py-1.5 text-gray-500 text-[10px] uppercase tracking-wider sticky left-0 bg-gray-800/30">
                  Daily total
                </td>
                {DAYS.map((d) => {
                  const total = getDayTotal(d)
                  const isWeekend = WEEKENDS.includes(d)
                  const isLeave = leaveDays[d]
                  return (
                    <td
                      key={d}
                      className={`text-center py-1.5 font-medium ${
                        isWeekend ? 'text-gray-700' : isLeave ? 'text-sky-500' : total > 0 ? 'text-white' : 'text-gray-700'
                      }`}
                    >
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
            <span className="text-[10px] uppercase tracking-[0.25em] text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-full px-2.5 py-1">
              Activity
            </span>
          </div>
        </div>

        {history.length === 0 ? (
          <div className="px-4 py-6 text-center">
            <p className="text-gray-400 text-sm">No submissions this month</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-800">
            {history.map((item) => {
              const meta = getHistoryEventMeta(item.eventType as 'submitted' | 'resubmitted' | 'approved' | 'returned' | 'unapproved')
              return (
                <div key={item.id} className="px-4 py-3 flex items-start justify-between gap-3">
                  <div>
                    <p className="text-white text-sm font-medium">{meta.title}</p>
                    <p className="text-gray-500 text-xs mt-1">{meta.description}</p>
                    {item.performedByName && (
                      <p className="text-[11px] text-amber-400 mt-1">By {item.performedByName}</p>
                    )}
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