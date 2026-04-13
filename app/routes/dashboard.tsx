import type { LoaderFunctionArgs, MetaFunction } from '@remix-run/node'
import { json, redirect } from '@remix-run/node'
import { Link, useLoaderData } from '@remix-run/react'
import { FeedbackAlert } from '~/components/feedback-alert'
import { PlatformShell } from '~/components/platform-shell'
import type { PlatformSchoolSummary } from '~/models/platform-school'
import {
  fetchPlatformUser,
  getPlatformApiBaseUrl,
  refreshPlatformAuth,
  type PlatformSessionUser,
} from '~/utils/platform-auth.server'
import { listPlatformOperators } from '~/utils/platform-operators.server'
import { listPlatformSchools } from '~/utils/platform-schools.server'
import {
  clearPlatformAuthState,
  requirePlatformAuthState,
  savePlatformAuthState,
} from '~/utils/session.server'
import { buildFanalMeta } from '~/utils/site-meta'

type LoaderData = {
  stats: DashboardStats
  user: PlatformSessionUser
  warning?: string
}

type DashboardStats = {
  activeSchools: number
  adminCount: number
  ownerCount: number
  pendingInvites: number
  pendingReview: number
  rejectedSchools: number
  setupPending: number
  totalOperators: number
  totalSchools: number
}

const emptyStats: DashboardStats = {
  activeSchools: 0,
  adminCount: 0,
  ownerCount: 0,
  pendingInvites: 0,
  pendingReview: 0,
  rejectedSchools: 0,
  setupPending: 0,
  totalOperators: 0,
  totalSchools: 0,
}

export const meta: MetaFunction = () => buildFanalMeta('Platform Dashboard')

async function buildAuthHeaders(
  request: Request,
  originalAuthState: Awaited<ReturnType<typeof requirePlatformAuthState>>,
  nextAuthState?: Awaited<ReturnType<typeof requirePlatformAuthState>>
) {
  if (!nextAuthState || JSON.stringify(originalAuthState) === JSON.stringify(nextAuthState)) {
    return undefined
  }

  return {
    'Set-Cookie': await savePlatformAuthState(request, nextAuthState),
  }
}

function buildSchoolStats(schools: PlatformSchoolSummary[]): Pick<DashboardStats, 'activeSchools' | 'pendingReview' | 'rejectedSchools' | 'setupPending' | 'totalSchools'> {
  return schools.reduce(
    (accumulator, school) => {
      accumulator.totalSchools += 1

      switch (school.lifecycleState.stage) {
        case 'active':
          accumulator.activeSchools += 1
          break
        case 'pending_review':
          accumulator.pendingReview += 1
          break
        case 'approved_setup_required':
          accumulator.setupPending += 1
          break
        case 'rejected':
          accumulator.rejectedSchools += 1
          break
      }

      return accumulator
    },
    {
      activeSchools: 0,
      pendingReview: 0,
      rejectedSchools: 0,
      setupPending: 0,
      totalSchools: 0,
    }
  )
}

function buildOperatorStats(operators: Array<{ roles: string[]; requiresPasswordSetup: boolean }>): Pick<DashboardStats, 'adminCount' | 'ownerCount' | 'pendingInvites' | 'totalOperators'> {
  return operators.reduce(
    (accumulator, operator) => {
      accumulator.totalOperators += 1
      if (operator.requiresPasswordSetup) {
        accumulator.pendingInvites += 1
      }

      if (operator.roles.includes('PLATFORM_OWNER')) {
        accumulator.ownerCount += 1
      }

      if (operator.roles.includes('PLATFORM_ADMIN')) {
        accumulator.adminCount += 1
      }

      return accumulator
    },
    {
      adminCount: 0,
      ownerCount: 0,
      pendingInvites: 0,
      totalOperators: 0,
    }
  )
}

export async function loader({ request }: LoaderFunctionArgs) {
  const authState = await requirePlatformAuthState(request)
  let activeAuthState = authState
  const warnings: string[] = []
  const baseUrl = getPlatformApiBaseUrl()

  if (!baseUrl) {
    return json<LoaderData>({
      stats: emptyStats,
      user: authState.user,
      warning: 'Platform API URL is not configured, so live dashboard summaries are currently unavailable.',
    })
  }

  const meResult = await fetchPlatformUser(authState.accessToken)
  if (meResult.ok) {
    activeAuthState = { ...activeAuthState, user: meResult.user }
  } else if (meResult.status === 401) {
    const refreshResult = await refreshPlatformAuth(authState.refreshToken)
    if (refreshResult.ok) {
      activeAuthState = refreshResult.payload
    } else {
      return redirect('/login', {
        headers: {
          'Set-Cookie': await clearPlatformAuthState(request),
        },
      })
    }
  } else {
    warnings.push(meResult.error)
  }

  let stats = { ...emptyStats }

  const schoolsResult = await listPlatformSchools(activeAuthState)
  if (!schoolsResult.ok && schoolsResult.status === 401 && !schoolsResult.authState) {
    return redirect('/login', {
      headers: {
        'Set-Cookie': await clearPlatformAuthState(request),
      },
    })
  }

  if (schoolsResult.authState) {
    activeAuthState = schoolsResult.authState
  }

  if (schoolsResult.ok) {
    stats = {
      ...stats,
      ...buildSchoolStats(schoolsResult.data.schools),
    }
  } else {
    warnings.push(`School summary unavailable: ${schoolsResult.error}`)
  }

  const operatorsResult = await listPlatformOperators(activeAuthState)
  if (!operatorsResult.ok && operatorsResult.status === 401 && !operatorsResult.authState) {
    return redirect('/login', {
      headers: {
        'Set-Cookie': await clearPlatformAuthState(request),
      },
    })
  }

  if (operatorsResult.authState) {
    activeAuthState = operatorsResult.authState
  }

  if (operatorsResult.ok) {
    stats = {
      ...stats,
      ...buildOperatorStats(operatorsResult.data),
    }
  } else {
    warnings.push(`Operator summary unavailable: ${operatorsResult.error}`)
  }

  const headers = await buildAuthHeaders(request, authState, activeAuthState)

  return json<LoaderData>(
    {
      stats,
      user: activeAuthState.user,
      warning: warnings.length > 0 ? warnings.join(' ') : undefined,
    },
    { headers }
  )
}

function getRoleTone(role: string) {
  return role === 'PLATFORM_OWNER'
    ? 'bg-slate-950 text-white'
    : 'bg-emerald-100 text-emerald-900'
}

export default function DashboardRoute() {
  const { user, stats, warning } = useLoaderData<typeof loader>()

  return (
    <PlatformShell
      eyebrow="Platform console"
      title={`Welcome back, ${user.displayName}`}
      actions={
        <>
          <Link
            to="/schools"
            className="inline-flex items-center justify-center rounded-2xl bg-emerald-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-800"
          >
            Schools
          </Link>
          <Link
            to="/operators"
            className="inline-flex items-center justify-center rounded-2xl border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
          >
            Operators
          </Link>
        </>
      }
    >
      <div className="space-y-6">
        {warning ? (
          <FeedbackAlert
            tone="warning"
            title="Partial dashboard data"
            message={warning}
          />
        ) : null}

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            accent="emerald"
            label="Total schools"
            value={stats.totalSchools}
          />
          <StatCard
            accent="amber"
            label="Setup pending"
            value={stats.setupPending}
          />
          <StatCard
            accent="rose"
            label="Rejected schools"
            value={stats.rejectedSchools}
          />
          <StatCard
            accent="slate"
            label="Operator accounts"
            value={stats.totalOperators}
          />
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.35fr_0.9fr]">
          <div className="grid gap-6">
            <article className="rounded-[1.85rem] border border-slate-200 bg-white p-6 shadow-[0_24px_60px_rgba(15,23,42,0.08)]">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.16em] text-emerald-700">
                    Governance
                  </p>
                  <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-950">
                    School states
                  </h2>
                </div>
                <Link
                  to="/schools"
                  className="text-sm font-semibold text-emerald-700 transition hover:text-emerald-800"
                >
                  Open
                </Link>
              </div>

              <div className="mt-6 grid gap-4 md:grid-cols-2">
                <LaneCard
                  tone="emerald"
                  title="Active schools"
                  count={stats.activeSchools}
                />
                <LaneCard
                  tone="amber"
                  title="Pending review"
                  count={stats.pendingReview}
                />
                <LaneCard
                  tone="sky"
                  title="Approved, setup pending"
                  count={stats.setupPending}
                />
                <LaneCard
                  tone="rose"
                  title="Rejected"
                  count={stats.rejectedSchools}
                />
              </div>
            </article>

            <article className="rounded-[1.85rem] border border-emerald-200 bg-emerald-50 p-6 shadow-[0_24px_60px_rgba(5,150,105,0.10)]">
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-emerald-800">
                Quick routes
              </p>
              <div className="mt-5 grid gap-4 lg:grid-cols-2">
                <QuickRouteCard
                  to="/schools"
                  title="School governance"
                />
                <QuickRouteCard
                  to="/operators"
                  title="Platform operators"
                />
              </div>
            </article>
          </div>

          <div className="grid gap-6 content-start">
            <article className="rounded-[1.85rem] border border-slate-200 bg-white p-6 shadow-[0_24px_60px_rgba(15,23,42,0.08)]">
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-500">
                Platform identity
              </p>
              <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-950">
                {user.displayName}
              </h2>
              <p className="mt-2 text-sm text-slate-600">{user.email}</p>

              <div className="mt-5 flex flex-wrap gap-2">
                {user.roles.map((role) => (
                  <span
                    key={role}
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${getRoleTone(role)}`}
                  >
                    {role}
                  </span>
                ))}
              </div>

              <div className="mt-6 rounded-[1.35rem] bg-slate-50 p-4">
                <p className="text-sm font-semibold text-slate-900">Status</p>
                <p className="mt-2 text-sm text-slate-600">
                  {user.isActive ? 'Active' : 'Inactive'}
                </p>
              </div>
            </article>

            <article className="rounded-[1.85rem] border border-slate-200 bg-white p-6 shadow-[0_24px_60px_rgba(15,23,42,0.08)]">
              <div className="flex items-end justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-500">
                    Operators
                  </p>
                  <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-950">
                    Access
                  </h2>
                </div>
                <Link
                  to="/operators"
                  className="text-sm font-semibold text-emerald-700 transition hover:text-emerald-800"
                >
                  Open
                </Link>
              </div>

              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                <MiniStat label="Owners" value={stats.ownerCount} />
                <MiniStat label="Admins" value={stats.adminCount} />
                <MiniStat label="Invite pending" value={stats.pendingInvites} />
                <MiniStat label="Total operators" value={stats.totalOperators} />
              </div>
            </article>

          </div>
        </section>
      </div>
    </PlatformShell>
  )
}

function StatCard({
  label,
  value,
  accent,
}: {
  label: string
  value: number
  accent: 'amber' | 'emerald' | 'rose' | 'slate'
}) {
  const accents = {
    amber: 'border-amber-200 bg-amber-50 text-amber-950',
    emerald: 'border-emerald-200 bg-emerald-50 text-emerald-950',
    rose: 'border-rose-200 bg-rose-50 text-rose-950',
    slate: 'border-slate-200 bg-slate-50 text-slate-950',
  }

  return (
    <article className={`rounded-[1.65rem] border p-5 shadow-[0_20px_45px_rgba(15,23,42,0.06)] ${accents[accent]}`}>
      <p className="text-sm font-semibold uppercase tracking-[0.16em] opacity-80">{label}</p>
      <p className="mt-4 text-4xl font-black tracking-tight">{value}</p>
    </article>
  )
}

function LaneCard({
  title,
  count,
  tone,
}: {
  title: string
  count: number
  tone: 'amber' | 'emerald' | 'rose' | 'sky'
}) {
  const tones = {
    amber: 'border-amber-200 bg-amber-50',
    emerald: 'border-emerald-200 bg-emerald-50',
    rose: 'border-rose-200 bg-rose-50',
    sky: 'border-sky-200 bg-sky-50',
  }

  return (
    <div className={`rounded-[1.45rem] border p-5 ${tones[tone]}`}>
      <div className="flex items-start justify-between gap-4">
        <p className="text-sm font-semibold text-slate-900">{title}</p>
        <span className="inline-flex min-w-[3.25rem] items-center justify-center rounded-full bg-white px-3 py-2 text-lg font-black text-slate-950 shadow-sm">
          {count}
        </span>
      </div>
    </div>
  )
}

function QuickRouteCard({
  to,
  title,
}: {
  to: string
  title: string
}) {
  return (
    <Link
      to={to}
      className="block rounded-[1.4rem] border border-emerald-200 bg-white/88 p-4 transition hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-[0_18px_32px_rgba(5,150,105,0.12)]"
    >
      <p className="text-base font-semibold text-slate-950">{title}</p>
      <p className="mt-4 text-sm font-semibold text-emerald-700">Open</p>
    </Link>
  )
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-[1.3rem] bg-slate-50 p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{label}</p>
      <p className="mt-3 text-3xl font-black tracking-tight text-slate-950">{value}</p>
    </div>
  )
}
