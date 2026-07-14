import { createFileRoute } from '@tanstack/react-router'
import { useState, useEffect } from 'react'
import { createServerFn } from '@tanstack/react-start'
import {
  loadAllProjects,
  loadAllUsers,
  createProject,
  updateProject,
  deleteProject,
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
  .validator((data: { name: string; client: string; rfJobCode?: string | null; category?: string | null; startMonth?: string | null; endMonth?: string | null }) => data)
  .handler(async ({ data }) => {
    await createProject({ id: nanoid(), name: data.name, client: data.client, rfJobCode: data.rfJobCode, category: data.category, startMonth: data.startMonth, endMonth: data.endMonth })
  })

const updateProjectFn = createServerFn()
  .validator((data: { id: string; name: string; client: string; rfJobCode?: string | null; category?: string | null; startMonth?: string | null; endMonth?: string | null }) => data)
  .handler(async ({ data }) => {
    await updateProject(data)
  })

const removeProjectFn = createServerFn()
  .validator((data: { id: string }) => data)
  .handler(async ({ data }) => {
    await deleteProject(data.id)
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

type Project = { id: string; name: string; client: string | null; rfJobCode: string | null; category: string | null; startMonth: string | null; endMonth: string | null; active: boolean | null; createdAt: string | null }
type User = { id: string; name: string; employeeNumber: string; position: string; role: string; email: string; manDayRate: number; isEngineer: boolean | null; createdAt: string | null }
type Assignment = { userId: string; projectId: string; projectName: string; userName: string; startMonth: string; endMonth: string | null }

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [selectedProject, setSelectedProject] = useState<string | null>(null)
  const [editProject, setEditProject] = useState<Project | null>(null)
  const [editForm, setEditForm] = useState({ name: '', client: '', rfJobCode: '', category: 'backlog', startMonth: '', endMonth: '' })
  const [confirmDelete, setConfirmDelete] = useState<Project | null>(null)
  const [filter, setFilter] = useState<'all' | 'backlog' | 'forecast'>('all')
  const [form, setForm] = useState({ name: '', client: '', rfJobCode: '', category: 'backlog', startMonth: '', endMonth: '' })
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
    await addProject({ data: { name: form.name, client: form.client, rfJobCode: form.rfJobCode || null, category: form.category, startMonth: form.startMonth || null, endMonth: form.endMonth || null } })
    await reload()
    setForm({ name: '', client: '', rfJobCode: '', category: 'backlog', startMonth: '', endMonth: '' })
    setShowForm(false)
    setSaving(false)
  }

  async function handleEditSave() {
    if (!editProject || !editForm.name) return
    await updateProjectFn({ data: { id: editProject.id, name: editForm.name, client: editForm.client, rfJobCode: editForm.rfJobCode || null, category: editForm.category, startMonth: editForm.startMonth || null, endMonth: editForm.endMonth || null } })
    setEditProject(null)
    setEditForm({ name: '', client: '', rfJobCode: '', category: 'backlog', startMonth: '', endMonth: '' })
    await reload()
  }

  async function handleDeleteProject() {
    if (!confirmDelete) return
    await removeProjectFn({ data: { id: confirmDelete.id } })
    setConfirmDelete(null)
    if (selectedProject === confirmDelete.id) setSelectedProject(null)
    await reload()
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

  const engineers = users.filter((u) => u.role === 'engineer' || u.isEngineer)
  const filteredProjects = filter === 'all' ? projects : projects.filter((p) => p.category === filter)
  const activeProject = projects.find((p) => p.id === selectedProject)

  return (
    <div>
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-white text-lg font-medium">Projects</h1>
          <p className="text-gray-500 text-sm mt-0.5">{filteredProjects.length} project{filteredProjects.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="flex items-center gap-2">
          {(['all', 'backlog', 'forecast'] as const).map((mode) => (
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
          <button
            onClick={() => setShowForm((v) => !v)}
            className="text-xs bg-amber-500 hover:bg-amber-400 text-gray-950 font-medium px-4 py-1.5 rounded-lg transition-colors"
          >
            + New project
          </button>
        </div>
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
            <div>
              <label className="text-gray-500 text-xs mb-1.5 block">RF Job Code</label>
              <input
                value={form.rfJobCode}
                onChange={(e) => setForm(p => ({ ...p, rfJobCode: e.target.value }))}
                placeholder="RF-2026-001"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-600 outline-none focus:border-gray-500 transition-colors"
              />
            </div>
            <div>
              <label className="text-gray-500 text-xs mb-1.5 block">Category</label>
              <select
                value={form.category}
                onChange={(e) => setForm(p => ({ ...p, category: e.target.value }))}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-gray-500 transition-colors"
              >
                <option value="backlog">Backlog & New Projects</option>
                <option value="forecast">Forecast Projects</option>
              </select>
            </div>
            <div>
              <label className="text-gray-500 text-xs mb-1.5 block">Start month</label>
              <input
                value={form.startMonth}
                onChange={(e) => setForm(p => ({ ...p, startMonth: e.target.value }))}
                placeholder="2026-01"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-600 outline-none focus:border-gray-500 transition-colors"
              />
            </div>
            <div>
              <label className="text-gray-500 text-xs mb-1.5 block">End month</label>
              <input
                value={form.endMonth}
                onChange={(e) => setForm(p => ({ ...p, endMonth: e.target.value }))}
                placeholder="2026-12 (blank = ongoing)"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-600 outline-none focus:border-gray-500 transition-colors"
              />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => { setShowForm(false); setForm({ name: '', client: '', rfJobCode: '', category: 'backlog', startMonth: '', endMonth: '' }) }}
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

      <div className={`grid gap-6 ${activeProject ? 'grid-cols-2' : 'grid-cols-1'}`}>
        <div className={`bg-gray-900 border rounded-xl overflow-hidden transition-colors ${
          activeProject ? 'border-gray-800' : 'border-gray-700'
        }`}>
          <div className="px-4 py-3 border-b border-gray-800">
            <p className="text-white text-sm font-medium">All projects</p>
            <p className="text-gray-600 text-xs mt-0.5">{activeProject ? 'Click a project to manage assignments' : 'Select a project to manage engineers'}</p>
          </div>
          <div className="divide-y divide-gray-800">
            {filteredProjects.length === 0 ? (
              <p className="text-gray-600 text-sm px-4 py-6 text-center">{projects.length === 0 ? 'No projects yet.' : 'No projects match this filter.'}</p>
            ) : (
              filteredProjects.map((p) => {
                const assignedCount = assignments.filter((a) => a.projectId === p.id).length
                const isSelected = selectedProject === p.id
                return (
                  <div
                    key={p.id}
                    className={`group flex items-center justify-between px-4 py-3 transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-amber-900/20 border-l-2 border-amber-400'
                        : 'hover:bg-gray-800/40 border-l-2 border-transparent'
                    }`}
                    onClick={() => { setSelectedProject(isSelected ? null : p.id); cancelEdit() }}
                  >
                    <div className="w-full text-left">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className={`text-xs font-medium ${isSelected ? 'text-amber-400' : 'text-white'}`}>{p.name}</p>
                          <p className="text-gray-600 text-[10px] mt-0.5">{p.client ?? '—'} {p.rfJobCode ? `· ${p.rfJobCode}` : ''}</p>
                        </div>
                        <span className="text-xs text-gray-400 bg-gray-800 border border-gray-700 px-2.5 py-0.5 rounded-full">
                          {assignedCount} engineer{assignedCount !== 1 ? 's' : ''}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 ml-2 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          setEditProject(p)
                          setEditForm({ name: p.name, client: p.client ?? '', rfJobCode: p.rfJobCode ?? '', category: p.category ?? 'backlog', startMonth: p.startMonth ?? '', endMonth: p.endMonth ?? '' })
                        }}
                        className="text-[10px] text-gray-600 hover:text-white transition-colors shrink-0"
                      >
                        Edit
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); setConfirmDelete(p) }}
                        className="text-[10px] text-gray-600 hover:text-red-400 transition-colors shrink-0"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>

        {activeProject && (
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
        )}
      </div>

      {confirmDelete && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 w-full max-w-sm">
            <h3 className="text-white text-sm font-medium mb-2">Delete project</h3>
            <p className="text-gray-400 text-sm mb-6">
              Are you sure you want to delete <span className="text-white font-medium">{confirmDelete.name}</span>?
              This will also remove all engineer assignments and timesheet entries for this project.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setConfirmDelete(null)}
                className="text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 px-4 py-2 rounded-lg border border-gray-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteProject}
                className="text-xs bg-red-900/50 hover:bg-red-900 text-red-400 px-4 py-2 rounded-lg border border-red-800 transition-colors"
              >
                Yes, delete
              </button>
            </div>
          </div>
        </div>
      )}

      {editProject && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 w-full max-w-lg">
            <h3 className="text-white text-sm font-medium mb-4">Edit project</h3>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div className="col-span-2">
                <label className="text-gray-500 text-xs mb-1.5 block">Project name</label>
                <input
                  value={editForm.name}
                  onChange={(e) => setEditForm(p => ({ ...p, name: e.target.value }))}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-gray-500 transition-colors"
                />
              </div>
              <div className="col-span-2">
                <label className="text-gray-500 text-xs mb-1.5 block">Client</label>
                <input
                  value={editForm.client}
                  onChange={(e) => setEditForm(p => ({ ...p, client: e.target.value }))}
                  placeholder="SEDA"
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-600 outline-none focus:border-gray-500 transition-colors"
                />
              </div>
              <div>
                <label className="text-gray-500 text-xs mb-1.5 block">RF Job Code</label>
                <input
                  value={editForm.rfJobCode}
                  onChange={(e) => setEditForm(p => ({ ...p, rfJobCode: e.target.value }))}
                  placeholder="RF-2026-001"
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-600 outline-none focus:border-gray-500 transition-colors"
                />
              </div>
              <div>
                <label className="text-gray-500 text-xs mb-1.5 block">Category</label>
                <select
                  value={editForm.category}
                  onChange={(e) => setEditForm(p => ({ ...p, category: e.target.value }))}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-gray-500 transition-colors"
                >
                  <option value="backlog">Backlog & New Projects</option>
                  <option value="forecast">Forecast Projects</option>
                </select>
              </div>
              <div>
                <label className="text-gray-500 text-xs mb-1.5 block">Start month</label>
                <input
                  value={editForm.startMonth}
                  onChange={(e) => setEditForm(p => ({ ...p, startMonth: e.target.value }))}
                  placeholder="2026-01"
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-600 outline-none focus:border-gray-500 transition-colors"
                />
              </div>
              <div>
                <label className="text-gray-500 text-xs mb-1.5 block">End month</label>
                <input
                  value={editForm.endMonth}
                  onChange={(e) => setEditForm(p => ({ ...p, endMonth: e.target.value }))}
                  placeholder="2026-12 (blank = ongoing)"
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-600 outline-none focus:border-gray-500 transition-colors"
                />
              </div>
            </div>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => { setEditProject(null); setEditForm({ name: '', client: '', rfJobCode: '', category: 'backlog', startMonth: '', endMonth: '' }) }}
                className="text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 px-4 py-2 rounded-lg border border-gray-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleEditSave}
                className="text-xs bg-amber-500 hover:bg-amber-400 text-gray-950 font-medium px-4 py-2 rounded-lg transition-colors"
              >
                Save changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}