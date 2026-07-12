import * as XLSX from 'xlsx'

const DAYS = Array.from({ length: 30 }, (_, i) => i + 1)
const WEEKENDS = [1, 2, 8, 9, 15, 16, 22, 23, 29, 30]

export type EngineerData = {
  id: string
  name: string
  role: string
  entries: Record<string, Record<number, number>>
  projects: string[]
}

function buildSheet(engineers: EngineerData[], month: string) {
  const rows: (string | number)[][] = []

  // top header row — month label then day numbers
  const headerRow: (string | number)[] = [
    'Engineer', 'ID', 'Role', 'Project', month,
    ...DAYS.map((d) => WEEKENDS.includes(d) ? '' : d),
    'Total Hours', 'Man-Days',
  ]
  rows.push(headerRow)

  for (const engineer of engineers) {
    for (const project of engineer.projects) {
      const row: (string | number)[] = [
        engineer.name,
        engineer.id,
        engineer.role,
        project,
        '', // empty cell under month label
        ...DAYS.map((d) => {
          if (WEEKENDS.includes(d)) return '-'
          const val = engineer.entries[project]?.[d] ?? 0
          return val > 0 ? val : ''
        }),
      ]

      const total = DAYS.reduce((sum, d) => {
        if (WEEKENDS.includes(d)) return sum
        return sum + (engineer.entries[project]?.[d] ?? 0)
      }, 0)

      row.push(total)
      row.push(parseFloat((total / 8).toFixed(2)))
      rows.push(row)
    }

    // blank separator row between engineers
    rows.push([])
  }

  return rows
}

export function exportSingleEngineer(engineer: EngineerData, month: string) {
  const rows = buildSheet([engineer], month)
  const ws = XLSX.utils.aoa_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, engineer.name.slice(0, 31))
  XLSX.writeFile(wb, `timesheet_${engineer.id}_${month}.xlsx`)
}

export function exportAllApproved(engineers: EngineerData[], month: string) {
  const rows = buildSheet(engineers, month)
  const ws = XLSX.utils.aoa_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, `All Engineers ${month}`)
  XLSX.writeFile(wb, `timesheet_consolidated_${month}.xlsx`)
}