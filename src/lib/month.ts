// Month utilities — single source of truth for 'YYYY-MM' handling.
//
// IMPORTANT: currentMonth() must be called from the BROWSER (inside a
// useEffect), never at module top level. Module scope also runs on the
// server during SSR, and on Cloudflare Workers the clock outside a
// request context is unreliable — computing "the current month" there
// is what caused month-filtered queries to silently return nothing in
// production while working locally.

export function currentMonth(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

// Normalise a user-typed month string to zero-padded 'YYYY-MM'.
// '2026-8' -> '2026-08'. Returns null when the input isn't a valid month.
export function normalizeMonth(raw: string): string | null {
  const m = raw.trim().match(/^(\d{4})-(\d{1,2})$/)
  if (!m) return null
  const year = Number(m[1])
  const month = Number(m[2])
  if (month < 1 || month > 12) return null
  return `${year}-${String(month).padStart(2, '0')}`
}

// Range is valid when there is no end month, or end >= start.
// (Zero-padded 'YYYY-MM' strings compare correctly as text.)
export function isValidRange(startMonth: string, endMonth: string | null): boolean {
  if (!endMonth) return true
  return endMonth >= startMonth
}

// Calendar metadata for a given 'YYYY-MM' month.
export function monthMeta(month: string) {
  const [y, m] = month.split('-').map(Number)
  const lastDay = new Date(y, m, 0).getDate()
  const days = Array.from({ length: lastDay }, (_, i) => i + 1)
  const weekends = days.filter((d) => {
    const g = new Date(y, m - 1, d).getDay()
    return g === 0 || g === 6
  })
  return { days, weekends, lastDay }
}

// '2026-07' -> '2026 07' (existing display convention in the app)
export function monthLabel(month: string | null): string {
  return month ? month.replace('-', ' ') : '—'
}