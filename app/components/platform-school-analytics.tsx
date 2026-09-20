import type { ReactNode, SVGProps } from 'react'
import type { PlatformSchoolAnalytics } from '~/models/platform-school-analytics'

type PlatformSchoolAnalyticsProps = {
  analytics?: PlatformSchoolAnalytics
  error?: string
  isRefreshing: boolean
  onRefresh: () => void
}

type MetricCardProps = {
  accentClassName: string
  caption: string
  icon: ReactNode
  label: string
  testId: string
  value: number
}

const numberFormatter = new Intl.NumberFormat('en-GB')
const dateTimeFormatter = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  month: 'short',
  timeZone: 'UTC',
  timeZoneName: 'short',
  year: 'numeric',
})

function formatDateTime(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'Not available' : dateTimeFormatter.format(date)
}

function pluralize(value: number, singular: string, plural = `${singular}s`) {
  return `${numberFormatter.format(value)} ${value === 1 ? singular : plural}`
}

function getInitials(displayName: string) {
  const initials = displayName
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('')

  return initials || 'SU'
}

function MetricCard({ accentClassName, caption, icon, label, testId, value }: MetricCardProps) {
  return (
    <div className="relative overflow-hidden rounded-[1.5rem] border border-slate-200 bg-white p-5 shadow-[0_18px_45px_rgba(15,23,42,0.05)]">
      <div className={`absolute inset-x-0 top-0 h-1 ${accentClassName}`} />
      <div className="flex items-start justify-between gap-4">
        <div>
          <dt className="text-sm font-semibold text-slate-600">{label}</dt>
          <dd data-testid={testId} className="mt-3 text-3xl font-bold tracking-tight text-slate-950 tabular-nums">
            {numberFormatter.format(value)}
          </dd>
        </div>
        <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-slate-700">
          {icon}
        </div>
      </div>
      <p className="mt-3 text-xs leading-5 text-slate-500">{caption}</p>
    </div>
  )
}

function AnalyticsLoadingState() {
  return (
    <section
      aria-busy="true"
      aria-label="Loading school analytics"
      className="rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-[0_20px_60px_rgba(15,23,42,0.06)]"
    >
      <div className="animate-pulse space-y-6">
        <div className="h-6 w-48 rounded-full bg-slate-200" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((item) => (
            <div key={item} className="h-36 rounded-[1.5rem] bg-slate-100" />
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="h-56 rounded-[1.5rem] bg-slate-100" />
          <div className="h-56 rounded-[1.5rem] bg-slate-100" />
        </div>
      </div>
    </section>
  )
}

export function PlatformSchoolAnalyticsPanel({
  analytics,
  error,
  isRefreshing,
  onRefresh,
}: PlatformSchoolAnalyticsProps) {
  if (!analytics && !error) {
    return <AnalyticsLoadingState />
  }

  if (!analytics) {
    return (
      <section className="rounded-[1.75rem] border border-rose-200 bg-rose-50 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.04)]">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-rose-700">
              Analytics unavailable
            </p>
            <h2 className="mt-2 text-xl font-bold text-rose-950">School figures could not be loaded</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-rose-900">
              {error || 'The analytics service did not return data for this school.'}
            </p>
          </div>
          <button
            type="button"
            onClick={onRefresh}
            disabled={isRefreshing}
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-2xl bg-rose-800 px-4 py-3 text-sm font-semibold text-white transition hover:bg-rose-700 disabled:cursor-wait disabled:opacity-70"
          >
            <RefreshIcon className={isRefreshing ? 'size-4 animate-spin' : 'size-4'} />
            {isRefreshing ? 'Trying again...' : 'Try again'}
          </button>
        </div>
      </section>
    )
  }

  const largestRoleCount = Math.max(1, ...analytics.staffByRole.map((item) => item.count))
  const latestLogin = analytics.latestLogin

  return (
    <section aria-labelledby="school-analytics-heading" className="space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700">
            Live school data
          </p>
          <h2 id="school-analytics-heading" className="mt-2 text-2xl font-bold tracking-tight text-slate-950">
            School analytics
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            A current snapshot of people, pending admissions, and user access for this school.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-xs text-slate-500">
            Updated{' '}
            <time dateTime={analytics.generatedAtUtc}>{formatDateTime(analytics.generatedAtUtc)}</time>
          </p>
          <button
            type="button"
            onClick={onRefresh}
            disabled={isRefreshing}
            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-900 disabled:cursor-wait disabled:opacity-70"
          >
            <RefreshIcon className={isRefreshing ? 'size-4 animate-spin' : 'size-4'} />
            {isRefreshing ? 'Refreshing...' : 'Refresh data'}
          </button>
        </div>
      </div>

      <div aria-live="polite" className="sr-only">
        {isRefreshing ? 'Refreshing school analytics.' : 'School analytics are up to date.'}
      </div>

      <dl className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          accentClassName="bg-emerald-500"
          caption={pluralize(analytics.staffByRole.length, 'role represented', 'roles represented')}
          icon={<StaffIcon className="size-5" />}
          label="Total staff"
          testId="analytics-total-staff"
          value={analytics.totalStaff}
        />
        <MetricCard
          accentClassName="bg-sky-500"
          caption="Profiles with enrolled status"
          icon={<StudentIcon className="size-5" />}
          label="Enrolled students"
          testId="analytics-enrolled-students"
          value={analytics.totalEnrolledStudents}
        />
        <MetricCard
          accentClassName="bg-violet-500"
          caption="Registered parent profiles"
          icon={<ParentIcon className="size-5" />}
          label="Parents"
          testId="analytics-total-parents"
          value={analytics.totalParents}
        />
        <MetricCard
          accentClassName="bg-amber-500"
          caption="Application groups still in progress"
          icon={<ApplicationIcon className="size-5" />}
          label="Pending applications"
          testId="analytics-pending-applications"
          value={analytics.pendingApplications}
        />
      </dl>

      <div className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
        <article className="rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-[0_20px_60px_rgba(15,23,42,0.05)]">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-lg font-bold text-slate-950">Staff by role</h3>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                The current distribution across staff profiles.
              </p>
            </div>
            <span className="rounded-full bg-emerald-100 px-3 py-1.5 text-xs font-semibold text-emerald-900">
              {pluralize(analytics.totalStaff, 'person', 'people')}
            </span>
          </div>

          {analytics.staffByRole.length === 0 ? (
            <div className="mt-6 rounded-[1.25rem] border border-dashed border-slate-300 bg-slate-50 px-5 py-8 text-center">
              <p className="text-sm font-semibold text-slate-800">No staff profiles recorded</p>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                Role totals will appear here after staff are added to the school.
              </p>
            </div>
          ) : (
            <ul className="mt-6 space-y-4">
              {analytics.staffByRole.map((role) => {
                const barWidth = `${Math.max(8, Math.round((role.count / largestRoleCount) * 100))}%`

                return (
                  <li key={role.role}>
                    <div className="flex items-center justify-between gap-4 text-sm">
                      <span className="font-semibold text-slate-800">{role.label}</span>
                      <span className="font-bold text-slate-950 tabular-nums">
                        {numberFormatter.format(role.count)}
                      </span>
                    </div>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-emerald-500"
                        style={{ width: barWidth }}
                        role="progressbar"
                        aria-label={`${role.label}: ${pluralize(role.count, 'staff member')}`}
                        aria-valuemin={0}
                        aria-valuemax={largestRoleCount}
                        aria-valuenow={role.count}
                      />
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </article>

        <article className="relative overflow-hidden rounded-[1.75rem] bg-slate-950 p-6 text-white shadow-[0_22px_65px_rgba(15,23,42,0.2)]">
          <div className="absolute -right-16 -top-16 size-48 rounded-full bg-emerald-400/10 blur-2xl" />
          <div className="relative">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-2xl bg-white/10 text-emerald-300">
                <ActivityIcon className="size-5" />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-emerald-300">
                  Recent activity
                </p>
                <h3 className="mt-1 text-lg font-bold">Latest successful login</h3>
              </div>
            </div>

            {latestLogin ? (
              <div className="mt-8">
                <div className="flex items-center gap-4">
                  <div className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-emerald-400 text-lg font-bold text-emerald-950">
                    {getInitials(latestLogin.displayName)}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-base font-semibold text-white">{latestLogin.displayName}</p>
                    <p className="mt-1 text-sm text-slate-300">{latestLogin.roleLabel}</p>
                  </div>
                </div>
                <div className="mt-6 rounded-[1.25rem] border border-white/10 bg-white/5 px-4 py-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-400">
                    Signed in at
                  </p>
                  <time
                    dateTime={latestLogin.occurredAtUtc}
                    className="mt-2 block text-sm font-semibold text-slate-100"
                  >
                    {formatDateTime(latestLogin.occurredAtUtc)}
                  </time>
                </div>
              </div>
            ) : (
              <div className="mt-8 rounded-[1.25rem] border border-dashed border-white/20 bg-white/5 px-5 py-8 text-center">
                <p className="text-sm font-semibold text-white">No successful login recorded yet</p>
                <p className="mt-2 text-xs leading-5 text-slate-400">
                  This will update after a school-linked user completes a successful sign-in.
                </p>
              </div>
            )}
          </div>
        </article>
      </div>
    </section>
  )
}

function StaffIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  )
}

function StudentIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="m3 10 9-5 9 5-9 5-9-5Z" />
      <path d="M7 12.5V17c3 2 7 2 10 0v-4.5M21 10v6" />
    </svg>
  )
}

function ParentIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <circle cx="8" cy="8" r="3" />
      <circle cx="17" cy="10" r="2.5" />
      <path d="M2.5 20a5.5 5.5 0 0 1 11 0M13 20a4 4 0 0 1 8 0" />
    </svg>
  )
}

function ApplicationIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="M6 3h9l4 4v14H6V3Z" />
      <path d="M14 3v5h5M9 12h6M9 16h6" />
    </svg>
  )
}

function ActivityIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  )
}

function RefreshIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="M20 7h-5V2M4 17h5v5" />
      <path d="M6.1 9A7 7 0 0 1 18.5 6.5L20 7M4 17l1.5.5A7 7 0 0 0 17.9 15" />
    </svg>
  )
}
