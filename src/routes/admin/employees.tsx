import { createFileRoute } from '@tanstack/react-router'
import { useState, useEffect } from 'react'
import { createServerFn } from '@tanstack/react-start'
import { loadAllUsers, createUserRecord, deleteUser } from '../../db/queries'

export const Route = createFileRoute('/admin/employees')({
  component: EmployeesPage,
})

const fetchUsers = createServerFn().handler(async () => {
  return loadAllUsers()
})

const addEmployee = createServerFn()
  .validator((data: {
    name: string
    email: string
    employeeNumber: string
    position: string
    role: string
    manDayRate: number
  }) => data)
  .handler(async ({ data }) => {
    await createUserRecord({ id: data.employeeNumber, ...data })
  })

const removeEmployee = createServerFn()
  .validator((data: { id: string }) => data)
  .handler(async ({ data }) => {
    await deleteUser(data.id)
  })

type User = {
  id: string
  name: string
  email: string
  employeeNumber: string
  position: string
  role: string
  manDayRate: number
  createdAt: string | null
}

export default function EmployeesPage() {
  const [users, setUsers] = useState<User[]>([])
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null)
  const [form, setForm] = useState({
    name: '', email: '', employeeNumber: '', position: '', role: 'engineer', manDayRate: '',
  })

  useEffect(() => {
    fetchUsers().then((u) => setUsers(u as User[]))
  }, [])

  async function handleAdd() {
    if (!form.name || !form.email || !form.employeeNumber || !form.position) return
    setSaving(true)
    await addEmployee({
      data: {
        name: form.name,
        email: form.email,
        employeeNumber: form.employeeNumber,
        position: form.position,
        role: form.role,
        manDayRate: parseFloat(form.manDayRate) || 0,
      },
    })
    const updated = await fetchUsers()
    setUsers(updated as User[])
    setForm({ name: '', email: '', employeeNumber: '', position: '', role: 'engineer', manDayRate: '' })
    setShowForm(false)
    setSaving(false)
  }

  async function handleRemove(id: string) {
    await removeEmployee({ data: { id } })
    setUsers(prev => prev.filter((u) => u.id !== id))
  }

  function initials(name: string) {
    return name.split(' ').map((n) => n[0]).join('').slice(0, 2)
  }

  return (
    <div>
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-white text-lg font-medium">Employees</h1>
          <p className="text-gray-500 text-sm mt-0.5">{users.length} staff members</p>
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="text-xs bg-amber-500 hover:bg-amber-400 text-gray-950 font-medium px-4 py-2 rounded-lg transition-colors"
        >
          + Add employee
        </button>
      </div>

      {showForm && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 mb-6">
          <h2 className="text-white text-sm font-medium mb-4">New employee</h2>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="text-gray-500 text-xs mb-1.5 block">Full name</label>
              <input
                value={form.name}
                onChange={(e) => setForm(p => ({ ...p, name: e.target.value }))}
                placeholder="Ahmad Razif"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-600 outline-none focus:border-gray-500 transition-colors"
              />
            </div>
            <div>
              <label className="text-gray-500 text-xs mb-1.5 block">Email</label>
              <input
                value={form.email}
                onChange={(e) => setForm(p => ({ ...p, email: e.target.value }))}
                placeholder="ahmad@rmafiventures.com"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-600 outline-none focus:border-gray-500 transition-colors"
              />
            </div>
            <div>
              <label className="text-gray-500 text-xs mb-1.5 block">Employee ID</label>
              <input
                value={form.employeeNumber}
                onChange={(e) => setForm(p => ({ ...p, employeeNumber: e.target.value }))}
                placeholder="E-012"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-600 outline-none focus:border-gray-500 transition-colors"
              />
            </div>
            <div>
              <label className="text-gray-500 text-xs mb-1.5 block">Position</label>
              <input
                value={form.position}
                onChange={(e) => setForm(p => ({ ...p, position: e.target.value }))}
                placeholder="Solar Engineer"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-600 outline-none focus:border-gray-500 transition-colors"
              />
            </div>
            <div>
              <label className="text-gray-500 text-xs mb-1.5 block">Role</label>
              <select
                value={form.role}
                onChange={(e) => setForm(p => ({ ...p, role: e.target.value }))}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-gray-500 transition-colors"
              >
                <option value="engineer">Engineer</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <div>
              <label className="text-gray-500 text-xs mb-1.5 block">Man-day rate (RM)</label>
              <input
                type="number"
                value={form.manDayRate}
                onChange={(e) => setForm(p => ({ ...p, manDayRate: e.target.value }))}
                placeholder="850"
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
              onClick={handleAdd}
              disabled={saving}
              className="text-xs bg-amber-500 hover:bg-amber-400 text-gray-950 font-medium px-4 py-2 rounded-lg transition-colors"
            >
              {saving ? 'Saving...' : 'Add employee'}
            </button>
          </div>
        </div>
      )}

      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-800/40 text-gray-500 text-xs font-normal">
              <th className="text-left px-4 py-2.5">Employee</th>
              <th className="text-left px-4 py-2.5">ID</th>
              <th className="text-left px-4 py-2.5">Position</th>
              <th className="text-left px-4 py-2.5">Role</th>
              <th className="text-left px-4 py-2.5">Rate (RM/day)</th>
              <th className="text-left px-4 py-2.5">Email</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {users.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-600 text-sm">
                  No employees yet. Add your first one above.
                </td>
              </tr>
            ) : (
              users.map((u) => (
                <tr key={u.id} className="border-t border-gray-800 hover:bg-gray-800/20 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-full bg-gray-700 flex items-center justify-center text-gray-300 text-xs font-medium flex-shrink-0">
                        {initials(u.name)}
                      </div>
                      <p className="text-white text-xs font-medium">{u.name}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{u.employeeNumber}</td>
                  <td className="px-4 py-3 text-gray-400 text-xs">{u.position}</td>
                  <td className="px-4 py-3">
                    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${
                      u.role === 'admin'
                        ? 'text-amber-400 bg-amber-900/30 border-amber-800'
                        : 'text-gray-400 bg-gray-800 border-gray-700'
                    }`}>
                      {u.role}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-400 text-xs">{u.manDayRate}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{u.email}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => setConfirmRemove(u.id)}
                      className="text-xs text-gray-600 hover:text-red-400 transition-colors"
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {confirmRemove && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 w-full max-w-sm">
            <h3 className="text-white text-sm font-medium mb-2">Remove employee</h3>
            <p className="text-gray-400 text-sm mb-6">
              Are you sure you want to remove this employee? This will also delete all their timesheet entries and cannot be undone.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setConfirmRemove(null)}
                className="text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 px-4 py-2 rounded-lg border border-gray-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  await handleRemove(confirmRemove)
                  setConfirmRemove(null)
                }}
                className="text-xs bg-red-900/50 hover:bg-red-900 text-red-400 px-4 py-2 rounded-lg border border-red-800 transition-colors"
              >
                Yes, remove
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}