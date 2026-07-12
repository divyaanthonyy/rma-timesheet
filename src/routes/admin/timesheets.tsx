import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/admin/timesheets')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/admin/timesheets"!</div>
}
