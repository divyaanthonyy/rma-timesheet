import { createFileRoute } from '@tanstack/react-router'
import { useState, useEffect } from 'react'
import { createServerFn } from '@tanstack/react-start'
import {
  loadAllProjects,
  loadAllUsers,
  createProject,
  assignProjectToUser,
  removeProjectAssignment,
  updateAssignmentDuration,
  loadAllUserProjectAssignments,
} from '../../db/queries'
import { nanoid } from 'nanoid'
import { currentMonth, normalizeMonth, isValidRange } from '../../lib/month'

export const Route = createFileRoute('/admin/projects')({
  component: ProjectsPage,
})

const fetchProjects = createServerFn().handler(async () => loadAllProjects())
const fetchUsers = createServerFn().handler(async () => loadAllUsers())
const fetchAllAssignments = createServerFn().handler(async () => loadAllUserProjectAssignments())

const addProject = createServerFn()
  .validator((data: { name: string; client: string }) => data)
  .handler(async ({ data }) => {
    await createProject({ id: nanoid(), name: data.name, client: data.client })
  })

const assignProject = createServerFn()
  .validator((data: { userId: string; projectId: string; startMonth: string; endMonth?: string | null }) => data)
  .handler(async ({ data }) => {
    const start = normalizeMonth(data.startMonth)
    const end = data.endMonth ? normalizeMonth(data.endMonth) : null
    if (!start || (data.endMonth && !end) || !isValidRange(start, end)) {
      throw new Error('Invalid month range')
    }
    await assignProjectToUser(data.userId, data.projectId, start, end)
  })

const unassignProject = createServerFn()
  .validator((data: { userId: string; projectId: string }) => data)
  .handler(async ({ data }) => {
    await removeProjectAssignment(data.userId, data.projectId)
  })

const updateDuration = createServerFn()
  .validator((data: { userId: string; projectId: string; startMonth: string; endMonth?: string | null }) => data)
  .handler(async ({ data }) => {
    const start = normalizeMonth(data.startMonth)
    const end = data.endMonth ? normalizeMonth(data.endMonth) : null
    if (!start || (data.endMonth && !end) || !isValidRange(start, end)) {
      throw new Error('Invalid month range')
    }
    await updateAssignmentDuration(data.userId, data.projectId, start, end)
  })

type Project = { id: string; name: string; client: string | null; active: boolean | null; createdAt: string | null }
type User = { id: string; name: string; employeeNumber: string; position: string; role: string; email: string; manDayRate: number; createdAt: string | null }
type Assignment = { userId: string; projectId: string; projectName: string; userName: string; startMonth: string; endMonth: string | null }

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [selectedProject, setSelectedProject] = useState<string | null>(null)
  const [form, setForm] = useState({ name: '', client: '' })
  const [editUser, setEditUser] = useState<string | null>(null)
  const [startMonth, setStartMonth] = useState('')
  const [endMonth, setEndMonth] = useState('')
  const [rangeError, setRangeError] = useState('')

  useEffect(() => {
    setStartMonth((v) => v || currentMonth())
  }, [])

  async function reload() {
    const [p, u, a] = await Promise.all([fetchProjects(), fetchUsers(), fetchAllAssignments()])
    setProjects(p as Project[])
    setUsers(u as User[])
    setAssignments(a as Assignment[])
  }

  useEffect(() => { reload() }, [])

  async function handleAddProject() {
    if (!form.name) return
    setSaving(true)
    await addProject({ data: { name: form.name, client: form.client } })
    await reload()
    setForm({ name: '', client: '' })
    setShowForm(false)
    setSaving(false)
  }

  function getAssignment(userId: string, projectId: string) {
    return assignments.find((a) => a.userId === userId && a.projectId === projectId)
  }

  async function handleAssign(userId: string, projectId: string) {
    const start = normalizeMonth(startMonth)
    const end = endMonth ? normalizeMonth(endMonth) : null
    if (!start) { setRangeError('Start month must look like 2026-07'); return }
    if (endMonth && !end) { setRangeError('End month must look like 2026-09'); return }
    if (!isValidRange(start, end)) { setRangeError('End month cannot be before the start month'); return }
    setRangeError('')
    await assignProject({ data: { userId, projectId, startMonth: start, endMonth: end } })
    setEditUser(null)
    setStartMonth(currentMonth())
    setEndMonth('')
    await reload()
  }

  async function handleUpdate(userId: string, projectId: string) {
    const start = normalizeMonth(startMonth)
    const end = endMonth ? normalizeMonth(endMonth) : null
    if (!start) { setRangeError('Start month must look like 2026-07'); return }
    if (endMonth && !end) { setRangeError('End month must look like 2026-09'); return }
    if (!isValidRange(start, end)) { setRangeError('End month cannot be before the start month'); return }
    setRangeError('')
    await updateDuration({ data: { userId, projectId, startMonth: start, endMonth: end } })
    setEditUser(null)
    setStartMonth(currentMonth())
    setEndMonth('')
    await reload()
  }

  async function handleRemove(userId: string, projectId: string) {
    await unassignProject({ data: { userId, projectId } })
    setEditUser(null)
    await reload()
  }

  function startEdit(assignment: Assignment) {
    setEditUser(assignment.userId)
    setStartMonth(assignment.startMonth)
    setEndMonth(assignment.endMonth ?? '')
  }

  function cancelEdit() {
    setEditUser(null)
    setStartMonth(currentMonth())
    setEndMonth('')
    setRangeError('')
  }

  function initials(name: string) {
    return name.split(' ').map((n) => n[0]).join('').slice(0, 2)
  }

  const engineers = users.filter((u) => u.role === 'engineer')
  const activeProject = projects.find((p) => p.id === selectedProject)

  return (
    <div>
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-white text-lg font-medium">Projects</h1>
          <p className="text-gray-500 text-sm mt-0.5">{projects.length} projects</p>
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="text-xs bg-amber-500 hover:bg-amber-400 text-gray-950 font-medium px-4 py-2 rounded-lg transition-colors"
        >
          + New project
        </button>
      </div>

      {showForm && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 mb-6">
          <h2 className="text-white text-sm font-medium mb-4">New project</h2>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="text-gray-500 text-xs mb-1.5 block">Project name</label>
              <input
                value={form.name}
                onChange={(e) => setForm(p => ({ ...p, name: e.target.value }))}
                placeholder="SEDA-KL01"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-600 outline-none focus:border-gray-500 transition-colors"
              />
            </div>
            <div>
              <label className="text-gray-500 text-xs mb-1.5 block">Client</label>
              <input
                value={form.client}
                onChange={(e) => setForm(p => ({ ...p, client: e.target.value }))}
                placeholder="SEDA"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-600 outline-none focus:border-gray-500 transition-colors"
              />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => setShowForm(false)}
              className="text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 px-4 py-2 rounded-lg border border-gray-700 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleAddProject}
              disabled={saving}
              className="text-xs bg-amber-500 hover:bg-amber-400 text-gray-950 font-medium px-4 py-2 rounded-lg transition-colors"
            >
              {saving ? 'Saving...' : 'Create project'}
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-6">
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-800">
            <p className="text-white text-sm font-medium">All projects</p>
            <p className="text-gray-600 text-xs mt-0.5">Click a project to manage assignments</p>
          </div>
          <div className="divide-y divide-gray-800">
            {projects.length === 0 ? (
              <p className="text-gray-600 text-sm px-4 py-6 text-center">No projects yet.</p>
            ) : (
              projects.map((p) => {
                const assignedCount = assignments.filter((a) => a.projectId === p.id).length
                return (
                  <button
                    key={p.id}
                    onClick={() => { setSelectedProject(p.id === selectedProject ? null : p.id); cancelEdit() }}
                    className={`w-full text-left px-4 py-3 transition-colors ${
                      selectedProject === p.id ? 'bg-gray-800' : 'hover:bg-gray-800/40'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-white text-xs font-medium">{p.name}</p>
                        <p className="text-gray-600 text-[10px] mt-0.5">{p.client ?? '—'}</p>
                      </div>
                      <span className="text-[10px] text-gray-500 bg-gray-800 border border-gray-700 px-2 py-0.5 rounded-full">
                        {assignedCount} engineer{assignedCount !== 1 ? 's' : ''}
                      </span>
                    </div>
                  </button>
                )
              })
            )}
          </div>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-800">
            <p className="text-white text-sm font-medium">
              {activeProject ? `Assign engineers — ${activeProject.name}` : 'Select a project'}
            </p>
            <p className="text-gray-600 text-xs mt-0.5">
              {activeProject ? 'Set start month and optional end month for each engineer' : 'Click a project on the left to manage its engineers'}
            </p>
          </div>
          {rangeError && (
            <p className="text-red-400 text-xs px-4 py-2 border-b border-gray-800 bg-red-950/20">{rangeError}</p>
          )}
          <div className="divide-y divide-gray-800">
            {!activeProject ? (
              <p className="text-gray-600 text-sm px-4 py-6 text-center">No project selected.</p>
            ) : engineers.length === 0 ? (
              <p className="text-gray-600 text-sm px-4 py-6 text-center">No engineers found.</p>
            ) : (
              engineers.map((u) => {
                const assignment = getAssignment(u.id, activeProject.id)
                const assigned = !!assignment
                const editing = editUser === u.id
                return (
                  <div key={u.id} className="flex items-center justify-between px-4 py-3 hover:bg-gray-800/40 transition-colors">
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-full bg-gray-700 flex items-center justify-center text-gray-300 text-xs font-medium flex-shrink-0">
                        {initials(u.name)}
                      </div>
                      <div>
                        <p className="text-white text-xs font-medium">{u.name}</p>
                        <p className="text-gray-600 text-[10px]">{u.employeeNumber} · {u.position}</p>
                        {assigned && !editing && (
                          <p className="text-gray-500 text-[10px] mt-0.5">
                            {assignment.startMonth} → {assignment.endMonth ?? 'ongoing'}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {editing ? (
                        <>
                          <input
                            value={startMonth}
                            onChange={(e) => setStartMonth(e.target.value)}
                            placeholder="2026-07"
                            className="w-20 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-white text-xs placeholder-gray-600 outline-none focus:border-gray-500"
                          />
                          <span className="text-gray-600 text-xs">→</span>
                          <input
                            value={endMonth}
                            onChange={(e) => setEndMonth(e.target.value)}
                            placeholder="ongoing"
                            className="w-20 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-white text-xs placeholder-gray-600 outline-none focus:border-gray-500"
                          />
                          <button
                            onClick={() => assigned ? handleUpdate(u.id, activeProject.id) : handleAssign(u.id, activeProject.id)}
                            className="text-xs px-3 py-1.5 rounded-lg border border-emerald-800 text-emerald-400 bg-emerald-900/30 hover:bg-emerald-800/40 transition-colors"
                          >
                            {assigned ? 'Save' : 'Assign'}
                          </button>
                          <button
                            onClick={cancelEdit}
                            className="text-xs px-3 py-1.5 rounded-lg border border-gray-700 text-gray-400 bg-gray-800 hover:text-gray-300 transition-colors"
                          >
                            Cancel
                          </button>
                        </>
                      ) : assigned ? (
                        <>
                          <button
                            onClick={() => startEdit(assignment!)}
                            className="text-xs px-3 py-1.5 rounded-lg border border-gray-700 text-gray-400 bg-gray-800 hover:text-amber-400 hover:border-amber-800 transition-colors"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleRemove(u.id, activeProject.id)}
                            className="text-xs px-3 py-1.5 rounded-lg border border-gray-700 text-gray-400 bg-gray-800 hover:text-red-400 hover:border-red-800 transition-colors"
                          >
                            Remove
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => { setEditUser(u.id); setStartMonth(currentMonth()); setEndMonth(''); setRangeError('') }}
                          className="text-xs px-3 py-1.5 rounded-lg border border-gray-700 text-gray-400 bg-gray-800 hover:text-emerald-400 hover:border-emerald-800 transition-colors"
                        >
                          Assign
                        </button>
                      )}
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>
      </div>
    </div>
  )
}