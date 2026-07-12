import { createFileRoute, Link } from '@tanstack/react-router'
import { useState, useEffect } from 'react'
import { createServerFn } from '@tanstack/react-start'
import { exportAllApproved } from '../../utils/export'
import { loadAllTimesheetStatuses, loadAllUsers, loadAllUserProjects, loadTotalHoursPerUser } from '../../db/queries'

export const Route = createFileRoute('/admin/dashboard')({
  component: AdminDashboard,
})

const MONTH = new Date().toISOString().slice(0, 7)

const STATUS = {
  approved:  { label: 'Approved',      color: 'text-emerald-400 bg-emerald-900/30 border-emerald-800' },
  submitted: { label: 'Submitted',     color: 'text-amber-400 bg-amber-900/30 border-amber-800'       },
  pending:   { label: 'Not submitted', color: 'text-gray-400 bg-gray-800 border-gray-700'             },
  returned:  { label: 'Returned',      color: 'text-red-400 bg-red-900/30 border-red-800'             },
}

function initials(name: string) {
  return name.split(' ').map((n) => n[0]).join('').slice(0, 2)
}

const fetchStatuses = createServerFn().handler(async () => {
  return loadAllTimesheetStatuses(MONTH)
})

const fetchUsers = createServerFn().handler(async () => {
  return loadAllUsers()
})

const fetchAssignments = createServerFn().handler(async () => {
  return loadAllUserProjects(MONTH)
})

const fetchHours = createServerFn().handler(async () => {
  return loadTotalHoursPerUser(MONTH)
})

const debugMonth = createServerFn().handler(async () => {
  return {
    month: new Date().toISOString().slice(0, 7),
    full: new Date().toISOString(),
  }
})

type User = { id: string; name: string; role: string; position: string; employeeNumber: string; email: string; manDayRate: number; createdAt: string | null }
type Assignment = { userId: string; projectId: string; projectName: string }

export default function AdminDashboard() {
  const [statuses, setStatuses] = useState<Record<string, string>>({})
  const [users, setUsers] = useState<User[]>([])
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [hours, setHours] = useState<Record<string, number>>({})

  useEffect(() => {
    fetchStatuses().then((rows) => {
      const map: Record<string, string> = {}
      for (const row of rows) map[row.userId] = row.status
      setStatuses(map)
    })
    fetchUsers().then((u) => setUsers(u as User[]))
    debugMonth().then((d) => console.log('SERVER MONTH:', d.month, '| full:', d.full))

  fetchAssignments()
      .then((a) => {
        console.log('ASSIGNMENTS RESULT:', JSON.stringify(a))
        setAssignments(a as Assignment[])
      }).catch((err) => console.error('ASSIGNMENTS ERROR:', err?.message, err))
    fetchHours().then((h) => {
    console.log('hours from db:', h)
    setHours(h as Record<string, number>)
  })
  .catch((err) => console.error('fetchHours failed:', err))
  }, [])

  const engineers = users
    .filter((u) => u.role === 'engineer')
    .map((u) => ({
      ...u,
      status: statuses[u.id] ?? 'pending',
      hours: hours[u.id] ?? null,
      projects: assignments
        .filter((a) => a.userId === u.id)
        .map((a) => a.projectName),
    }))

  const approved  = engineers.filter((e) => e.status === 'approved').length
  const submitted = engineers.filter((e) => e.status === 'submitted').length
  const pending   = engineers.filter((e) => e.status === 'pending').length

  return (
    <div>
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-white text-lg font-medium">{MONTH.replace('-', ' ')} — Submissions</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            Working period: {MONTH.replace('-', ' ')}
          </p>
        </div>
        <button
          onClick={() =>
            exportAllApproved(
              engineers
                .filter((e) => e.status === 'approved')
                .map((e) => ({
                  id: e.id,
                  name: e.name,
                  role: e.position,
                  projects: e.projects,
                  entries: {},
                })),
              MONTH
            )
          }
          className="text-xs bg-amber-500 hover:bg-amber-400 text-gray-950 font-medium px-4 py-2 rounded-lg transition-colors"
        >
          Export all approved ↓
        </button>
      </div>

      <div className="grid grid-cols-4 gap-3 mb-6">
        {[
          { label: 'Total engineers', value: engineers.length, color: 'text-white'       },
          { label: 'Awaiting review', value: submitted,        color: 'text-amber-400'   },
          { label: 'Approved',        value: approved,         color: 'text-emerald-400' },
          { label: 'Not submitted',   value: pending,          color: 'text-gray-400'    },
        ].map((m) => (
          <div key={m.label} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <p className="text-gray-500 text-xs mb-1">{m.label}</p>
            <p className={`text-xl font-medium ${m.color}`}>{m.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-800">
          <p className="text-white text-sm font-medium">Engineer submissions</p>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-800/40 text-gray-500 text-xs font-normal">
              <th className="text-left px-4 py-2.5">Engineer</th>
              <th className="text-left px-4 py-2.5">Projects</th>
              <th className="text-left px-4 py-2.5">Total hrs</th>
              <th className="text-left px-4 py-2.5">Status</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {engineers.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-600 text-sm">
                  No engineers found.
                </td>
              </tr>
            ) : (
              engineers.map((eng) => {
                const s = STATUS[eng.status as keyof typeof STATUS] ?? STATUS.pending
                return (
                  <tr key={eng.id} className="border-t border-gray-800 hover:bg-gray-800/20 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-full bg-gray-700 flex items-center justify-center text-gray-300 text-xs font-medium flex-shrink-0">
                          {initials(eng.name)}
                        </div>
                        <div>
                          <p className="text-white text-xs font-medium">{eng.name}</p>
                          <p className="text-gray-600 text-[10px]">{eng.employeeNumber} · {eng.position}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1 flex-wrap">
                        {eng.projects.length > 0 ? eng.projects.map((p) => (
                          <span key={p} className="text-[10px] bg-gray-800 text-gray-400 border border-gray-700 px-1.5 py-0.5 rounded">
                            {p}
                          </span>
                        )) : (
                          <span className="text-gray-700 text-[10px]">No projects assigned</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-white text-xs font-medium">
                      {eng.hours !== null ? `${eng.hours}h` : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${s.color}`}>
                        {s.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        to="/admin/review/$userId"
                        params={{ userId: eng.id }}
                        className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                          eng.status === 'pending'
                            ? 'text-gray-600 border-gray-800 cursor-not-allowed pointer-events-none'
                            : 'text-gray-300 border-gray-700 hover:bg-gray-700'
                        }`}
                      >
                        {eng.status === 'approved' ? 'View' : eng.status === 'pending' ? '—' : 'Review'}
                      </Link>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}