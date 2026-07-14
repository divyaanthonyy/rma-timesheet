const EVENT_META: Record<string, { title: string; description: string }> = {
  submitted:   { title: 'Submitted',     description: 'Timesheet submitted for approval' },
  resubmitted: { title: 'Resubmitted',   description: 'Timesheet resubmitted after being returned' },
  approved:    { title: 'Approved',      description: 'Timesheet was approved' },
  returned:    { title: 'Returned',      description: 'Timesheet was returned with notes' },
  unapproved:  { title: 'Unapproved',    description: 'Approval was withdrawn' },
}

export function getHistoryEventMeta(
  eventType: 'submitted' | 'resubmitted' | 'approved' | 'returned' | 'unapproved',
) {
  return EVENT_META[eventType] ?? { title: eventType, description: '' }
}

export function formatHistoryTimestamp(iso: string | null): string {
  if (!iso) return '—'
  try {
    const d = new Date(iso)
    return d.toLocaleString('en-MY', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}
