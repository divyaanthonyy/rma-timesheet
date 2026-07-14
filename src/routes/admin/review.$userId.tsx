/* eslint-disable @typescript-eslint/no-unnecessary-condition */
import { createFileRoute, Link, useParams } from '@tanstack/react-router'
import { useState, useEffect } from 'react'
import { createServerFn } from '@tanstack/react-start'
import { getRequestHeaders } from '@tanstack/react-start/server'
import { auth } from '../../lib/auth'
import { exportSingleEngineer } from '../../utils/export'
import { updateTimesheetStatus, loadTimesheetStatus, loadEntriesForMonth, loadUserProjects, getUserById, loadTimesheetHistory, getUserByEmail, loadLeaveDaysForMonth } from '../../db/queries'
import { currentMonth, monthMeta, monthLabel as fmtMonth } from '../../lib/month'
import { formatHistoryTimestamp, getHistoryEventMeta } from '../../lib/timesheet-history'

export const Route = createFileRoute('/admin/review/$userId')({
  component: ReviewPage,
})

type Status = 'submitted' | 'approved' | 'returned'

const STATUS_STYLES: Record<Status, string> = {
  submitted: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
  approved:  'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
  returned:  'text-red-400 bg-red-500/10 border-red-500/20',
}

const STATUS_LABELS: Record<Status, string> = {
  submitted: 'Submitted',
  approved:  'Approved',
  returned:  'Returned',
}

const getCurrentAdmin = createServerFn().handler(async () => {
  const headers = getRequestHeaders()
  const session = await auth.api.getSession({ headers })
  if (!session) return null
  return getUserByEmail(session.user.email)
})

const approveTimesheet = createServerFn()
  .validator((data: { userId: string; month: string; actorId: string; actorName: string }) => data)
  .handler(async ({ data }) => {
    await updateTimesheetStatus(data.userId, data.month, 'approved', undefined, { userId: data.actorId, name: data.actorName })
  })

const returnTimesheet = createServerFn()
  .validator((data: { userId: string; note: string; month: string; actorId: string; actorName: string }) => data)
  .handler(async ({ data }) => {
    await updateTimesheetStatus(data.userId, data.month, 'returned', data.note, { userId: data.actorId, name: data.actorName })
  })

const unapproveTimesheet = createServerFn()
  .validator((data: { userId: string; month: string; actorId: string; actorName: string }) => data)
  .handler(async ({ data }) => {
    await updateTimesheetStatus(data.userId, data.month, 'submitted', undefined, { userId: data.actorId, name: data.actorName })
  })

const fetchHistory = createServerFn()
  .validator((data: { userId: string; month: string }) => data)
  .handler(async ({ data }) => {
    return loadTimesheetHistory(data.userId, data.month)
  })

const fetchLeaveDays = createServerFn()
  .validator((data: { userId: string; month: string }) => data)
  .handler(async ({ data }) => {
    return loadLeaveDaysForMonth(data.userId, data.month)
  })

const fetchTimesheetStatus = createServerFn()
  .validator((data: { userId: string; month: string }) => data)
  .handler(async ({ data }) => {
    return loadTimesheetStatus(data.userId, data.month)
  })

const fetchEngineerEntries = createServerFn()
  .validator((data: { userId: string; month: string }) => data)
  .handler(async ({ data }) => {
    return loadEntriesForMonth(data.userId, data.month)
  })

const fetchEngineerProjects = createServerFn()
  .validator((data: { userId: string; month: string }) => data)
  .handler(async ({ data }) => {
    return loadUserProjects(data.userId, data.month)
  })

const fetchEngineer = createServerFn()
  .validator((data: { userId: string }) => data)
  .handler(async ({ data }) => {
    return getUserById(data.userId)
  })

function ReviewPage() {
  const { userId } = useParams({ from: '/admin/review/$userId' })
  const [engineer, setEngineer] = useState<{ name: string; position: string } | null | 'loading'>('loading')
  const [status, setStatus] = useState<Status>('submitted')
  const [returnNote, setReturnNote] = useState('')
  const [showReturnInput, setShowReturnInput] = useState(false)
  const [entries, setEntries] = useState<Record<string, Record<number, number>>>({})
  const [realProjects, setRealProjects] = useState<{ id: string; name: string }[]>([])
  const [history, setHistory] = useState<Array<{ id: string; eventType: string; note: string | null; createdAt: string | null; performedByUserId: string | null; performedByName: string | null }>>([])
  const [leaveDays, setLeaveDays] = useState<Record<number, 'full' | 'half'>>({})
  // month is computed in the browser after mount — never during SSR.
  const [month, setMonth] = useState<string | null>(null)

  useEffect(() => {
    setMonth(currentMonth())
  }, [])

  useEffect(() => {
    if (!month) return
    fetchEngineer({ data: { userId } }).then((u) => {
      setEngineer(u as { name: string; position: string } | null)
    })

    fetchTimesheetStatus({ data: { userId, month } }).then((result) => {
      if (result) {
        setStatus(result.status as Status)
        setReturnNote(result.returnNote ?? '')
      }
    })

    fetchEngineerEntries({ data: { userId, month } }).then((dbEntries) => {
      const shaped: Record<string, Record<number, number>> = {}
      for (const entry of dbEntries) {
        const day = parseInt(entry.date.split('-')[2])
        if (!shaped[entry.projectId]) shaped[entry.projectId] = {}
        shaped[entry.projectId][day] = entry.hours
      }
      setEntries(shaped)
    })

    fetchEngineerProjects({ data: { userId, month } }).then((p) => {
      setRealProjects(p)
    })

    fetchHistory({ data: { userId, month } }).then((h) => {
      setHistory(h)
    })

    fetchLeaveDays({ data: { userId, month } }).then((ld) => {
      const leaveMap: Record<number, 'full' | 'half'> = {}
      for (const entry of ld) {
        const day = parseInt(entry.date.split('-')[2])
        leaveMap[day] = entry.type as 'full' | 'half'
      }
      setLeaveDays(leaveMap)
    })
  }, [userId, month])

  function getProjectTotal(projectId: string) {
    return Object.values(entries[projectId] ?? {}).reduce((a, b) => a + b, 0)
  }

  function getDayTotal(day: number) {
    return realProjects.reduce((sum, p) => sum + (entries[p.id]?.[day] ?? 0), 0)
  }

  const { days: DAYS, weekends: WEEKENDS } = month ? monthMeta(month) : { days: [] as number[], weekends: [] as number[] }
  const totalHours = realProjects.reduce((sum, p) => sum + getProjectTotal(p.id), 0)

  const monthLabel = fmtMonth(month)

  if (engineer === 'loading' || !month) {
    return (
      <div className="text-gray-500 text-sm p-6">
        Loading...
      </div>
    )
  }

  if (!engineer) {
    return (
      <div className="text-gray-500 text-sm p-6">
        Engineer {userId} not found.
      </div>
    )
  }

  async function handleApprove() {
    if (!month) return
    const admin = await getCurrentAdmin()
    await approveTimesheet({ data: { userId, month, actorId: admin?.id ?? '', actorName: admin?.name ?? 'Unknown' } })
    setStatus('approved')
    setShowReturnInput(false)
    const h = await fetchHistory({ data: { userId, month } })
    setHistory(h)
  }

  async function handleReturn() {
    if (!month) return
    const admin = await getCurrentAdmin()
    await returnTimesheet({ data: { userId, note: returnNote, month, actorId: admin?.id ?? '', actorName: admin?.name ?? 'Unknown' } })
    setStatus('returned')
    setShowReturnInput(false)
    const h = await fetchHistory({ data: { userId, month } })
    setHistory(h)
  }

  async function handleUnapprove() {
    if (!month) return
    const admin = await getCurrentAdmin()
    await unapproveTimesheet({ data: { userId, month, actorId: admin?.id ?? '', actorName: admin?.name ?? 'Unknown' } })
    setStatus('submitted')
    const h = await fetchHistory({ data: { userId, month } })
    setHistory(h)
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <Link
          to="/admin/dashboard"
          className="text-gray-500 hover:text-gray-300 text-sm transition-colors"
        >
          ← Back
        </Link>
        <span className="text-gray-700">/</span>
        <p className="text-gray-400 text-sm">Review · {engineer.name}</p>
      </div>

      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-white text-lg font-medium">{engineer.name}</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            {userId} · {engineer.position} · {monthLabel}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-xs border px-3 py-1 rounded-full ${STATUS_STYLES[status]}`}>
            {STATUS_LABELS[status]}
          </span>
          {status !== 'approved' && (
            <button
              onClick={() => setShowReturnInput((v) => !v)}
              className="text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 px-3 py-1.5 rounded-lg border border-gray-700 transition-colors"
            >
              Return ↩
            </button>
          )}
          {status !== 'approved' ? (
            <button
              onClick={handleApprove}
              className="text-xs bg-emerald-600 hover:bg-emerald-500 text-white font-medium px-3 py-1.5 rounded-lg transition-colors"
            >
              Approve ✓
            </button>
          ) : (
            <button
              onClick={handleUnapprove}
              className="text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 px-3 py-1.5 rounded-lg border border-gray-700 transition-colors"
            >
              Unapprove
            </button>
          )}
          <button
            onClick={() =>
              exportSingleEngineer(
                {
                  id: userId,
                  name: engineer.name,
                  role: engineer.position,
                  entries,
                  projects: realProjects.map((p) => p.name),
                },
                monthLabel.replace(' ', '-')
              )
            }
            className="text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 px-3 py-1.5 rounded-lg border border-gray-700 transition-colors"
          >
            Export ↓
          </button>
        </div>
      </div>

      {showReturnInput && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 mb-6 flex gap-3">
          <input
            type="text"
            value={returnNote}
            onChange={(e) => setReturnNote(e.target.value)}
            placeholder="Add a note for the engineer..."
            className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-600 outline-none focus:border-gray-500 transition-colors"
          />
          <button
            onClick={handleReturn}
            className="text-xs bg-red-900/50 hover:bg-red-900 text-red-400 px-3 py-1.5 rounded-lg border border-red-800 transition-colors"
          >
            Send back
          </button>
        </div>
      )}

      {status === 'returned' && returnNote && (
        <div className="bg-red-950/30 border border-red-900/50 rounded-xl p-4 mb-6 flex items-start gap-3">
          <span className="text-red-400 text-xs mt-0.5">↩</span>
          <div>
            <p className="text-red-400 text-xs font-medium mb-1">Returned with note</p>
            <p className="text-red-300 text-sm">{returnNote}</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-4 gap-3 mb-6">
        {[
          { label: 'Total hours', value: `${totalHours}h` },
          { label: 'Man-days',    value: (totalHours / 8).toFixed(1) },
          { label: 'Projects',    value: realProjects.length },
          { label: 'Period',      value: monthLabel },
        ].map((s) => (
          <div key={s.label} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <p className="text-gray-500 text-xs mb-1">{s.label}</p>
            <p className="text-white text-xl font-medium">{s.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
          <div>
            <p className="text-white text-sm font-medium">Hours log</p>
            <p className="text-gray-500 text-xs">Read-only · {monthLabel}</p>
          </div>
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
                      className={`text-center font-normal py-2 px-1 min-w-[28px] relative ${
                        WEEKENDS.includes(d) ? 'text-gray-700' : leaveType ? '' : 'text-gray-400'
                      } ${
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
              {realProjects.map((project, pi) => (
                <tr key={project.id} className="border-t border-gray-800">
                  <td
                    className={`px-4 py-1.5 font-medium sticky left-0 bg-gray-900 ${
                      pi === 0 ? 'text-emerald-400' : 'text-purple-400'
                    }`}
                  >
                    {project.name}
                  </td>
                  {DAYS.map((d) => {
                    const val = entries[project.id]?.[d]
                    const isWeekend = WEEKENDS.includes(d)
                    const isLeave = leaveDays[d]
                    return (
                      <td
                        key={d}
                        className={`text-center py-1.5 px-0.5 ${
                          isWeekend
                            ? 'bg-gray-800/30 text-gray-700'
                            : isLeave
                            ? isLeave === 'full' ? 'bg-sky-900/20 text-sky-600' : 'bg-sky-900/10 text-sky-700'
                            : val
                            ? pi === 0 ? 'text-emerald-300 bg-emerald-900/20'
                            : 'text-purple-300 bg-purple-900/20'
                            : 'text-gray-700'
                        }`}
                      >
                        {isWeekend ? '' : isLeave ? (isLeave === 'full' ? 'LEAVE' : '½ DAY') : val ?? '—'}
                      </td>
                    )
                  })}
                  <td className="text-center text-white font-medium bg-gray-800/40 px-3">
                    {getProjectTotal(project.id)}
                  </td>
                </tr>
              ))}

              {realProjects.length > 0 && (
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
              )}
            </tbody>
          </table>
          </div>
        </div>

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