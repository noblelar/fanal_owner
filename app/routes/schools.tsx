import type { LoaderFunctionArgs, MetaFunction } from '@remix-run/node'
import { json, redirect } from '@remix-run/node'
import { Form, Link, useLoaderData } from '@remix-run/react'
import { FeedbackAlert } from '~/components/feedback-alert'
import { PlatformShell } from '~/components/platform-shell'
import {
  listPlatformSchools,
} from '~/utils/platform-schools.server'
import { didPlatformAuthChange } from '~/utils/platform-auth.server'
import {
  platformSchoolStageOptions,
  type PlatformSchoolSummary,
} from '~/models/platform-school'
import {
  clearPlatformAuthState,
  requirePlatformAuthState,
  savePlatformAuthState,
} from '~/utils/session.server'
import { buildFanalMeta } from '~/utils/site-meta'

type LoaderData = {
  deletedSchoolName?: string
  error?: string
  schools: PlatformSchoolSummary[]
  search: string
  stage: string
  total: number
}

export const meta: MetaFunction = () => buildFanalMeta('School Governance')

async function buildAuthHeaders(
  request: Request,
  originalAuthState: Awaited<ReturnType<typeof requirePlatformAuthState>>,
  nextAuthState?: Awaited<ReturnType<typeof requirePlatformAuthState>>
) {
  if (!didPlatformAuthChange(originalAuthState, nextAuthState)) {
    return undefined
  }

  return {
    'Set-Cookie': await savePlatformAuthState(request, nextAuthState!),
  }
}

export async function loader({ request }: LoaderFunctionArgs) {
  const authState = await requirePlatformAuthState(request)
  const url = new URL(request.url)
  const deletedSchoolName = url.searchParams.get('deletedSchool') ?? undefined
  const search = url.searchParams.get('search') ?? ''
  const stage = url.searchParams.get('stage') ?? ''

  const result = await listPlatformSchools(authState, { search, stage })

  if (!result.ok && result.status === 401 && !result.authState) {
    return redirect('/login', {
      headers: {
        'Set-Cookie': await clearPlatformAuthState(request),
      },
    })
  }

  const headers = await buildAuthHeaders(request, authState, result.authState)

  if (!result.ok) {
    return json<LoaderData>(
      {
        deletedSchoolName,
        error: result.error,
        schools: [],
        search,
        stage,
        total: 0,
      },
      { headers }
    )
  }

  return json<LoaderData>(
      {
        deletedSchoolName,
        schools: result.data.schools,
        total: result.data.total,
        search,
        stage,
    },
    { headers }
  )
}

function getStageBadgeClass(stage: string) {
  switch (stage) {
    case 'active':
      return 'bg-emerald-100 text-emerald-900'
    case 'approved_setup_required':
      return 'bg-sky-100 text-sky-900'
    case 'pending_review':
      return 'bg-amber-100 text-amber-900'
    case 'suspended':
      return 'bg-orange-100 text-orange-900'
    case 'rejected':
      return 'bg-rose-100 text-rose-900'
    case 'blacklisted':
      return 'bg-slate-900 text-white'
    case 'email_verified':
      return 'bg-blue-100 text-blue-900'
    default:
      return 'bg-slate-100 text-slate-800'
  }
}

function formatDate(value?: string | null) {
  if (!value) {
    return 'Not available'
  }

  return new Date(value).toLocaleDateString()
}

export default function SchoolsRoute() {
  const { deletedSchoolName, error, schools, search, stage, total } = useLoaderData<typeof loader>()

  return (
    <PlatformShell
      eyebrow="School governance"
      title="School governance"
      actions={
        <Link
          to="/dashboard"
          className="inline-flex items-center justify-center rounded-2xl border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
        >
          Back to dashboard
        </Link>
      }
    >
      <div className="space-y-8">
        <section className="rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-[0_20px_60px_rgba(15,23,42,0.06)]">
          <Form method="get" className="grid gap-4 md:grid-cols-[1.5fr_1fr_auto]">
            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-700">Search schools</span>
              <input
                type="search"
                name="search"
                defaultValue={search}
                placeholder="Search by school name, email, or index"
                className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-emerald-500"
              />
            </label>

            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-700">Filter by stage</span>
              <select
                name="stage"
                defaultValue={stage}
                className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-emerald-500"
              >
                <option value="">All lifecycle stages</option>
                {platformSchoolStageOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <div className="flex items-end gap-3">
              <button
                type="submit"
                className="inline-flex w-full items-center justify-center rounded-2xl bg-emerald-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-800 md:w-auto"
              >
                Apply filters
              </button>
            </div>
          </Form>
        </section>

        {error ? (
          <FeedbackAlert
            tone="error"
            title="Unable to load school governance"
            message={error}
          />
        ) : null}

        {deletedSchoolName ? (
          <FeedbackAlert
            tone="success"
            title="Rejected school deleted"
            message={`${deletedSchoolName} was removed from the platform successfully.`}
          />
        ) : null}

        {!error ? (
          <section className="rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-[0_20px_60px_rgba(15,23,42,0.06)]">
            <div className="flex flex-col gap-2 border-b border-slate-200 pb-5 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-xl font-bold text-slate-950">Tracked schools</h2>
                <p className="mt-1 text-sm text-slate-600">
                  {total === 1 ? '1 school matches the current filter.' : `${total} schools match the current filter.`}
                </p>
              </div>
            </div>

            {schools.length === 0 ? (
              <FeedbackAlert
                tone="info"
                title="No schools found"
                message="Try a different search term or clear the lifecycle filter to see more schools."
                className="mt-6"
              />
            ) : (
              <div className="mt-6 space-y-4">
                {schools.map((school) => (
                  <article
                    key={school.id}
                    className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-5 transition hover:border-emerald-300 hover:bg-white"
                  >
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="space-y-3">
                        <div className="flex flex-wrap items-center gap-3">
                          <h3 className="text-xl font-bold text-slate-950">{school.schoolName}</h3>
                          <span
                            className={`rounded-full px-3 py-1 text-xs font-semibold ${getStageBadgeClass(school.lifecycleState.stage)}`}
                          >
                            {school.lifecycleState.stageLabel}
                          </span>
                          {!school.emailConfirmed ? (
                            <span className="rounded-full bg-rose-100 px-3 py-1 text-xs font-semibold text-rose-900">
                              Email not verified
                            </span>
                          ) : null}
                        </div>

                        <dl className="grid gap-3 text-sm text-slate-600 md:grid-cols-2 xl:grid-cols-4">
                          <div className="rounded-2xl bg-white px-4 py-3">
                            <dt className="font-semibold text-slate-500">School email</dt>
                            <dd className="mt-1 text-slate-900">{school.email}</dd>
                          </div>
                          <div className="rounded-2xl bg-white px-4 py-3">
                            <dt className="font-semibold text-slate-500">School index</dt>
                            <dd className="mt-1 text-slate-900">{school.schoolIndex}</dd>
                          </div>
                          <div className="rounded-2xl bg-white px-4 py-3">
                            <dt className="font-semibold text-slate-500">Application date</dt>
                            <dd className="mt-1 text-slate-900">{formatDate(school.applicationDate)}</dd>
                          </div>
                          <div className="rounded-2xl bg-white px-4 py-3">
                            <dt className="font-semibold text-slate-500">Working status</dt>
                            <dd className="mt-1 text-slate-900">{school.lifecycleState.workingStatus}</dd>
                          </div>
                        </dl>
                      </div>

                      <div className="flex flex-col gap-3">
                        <div className="flex flex-wrap gap-2">
                          {school.lifecycleState.availableActions.map((action) => (
                            <span
                              key={action}
                              className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.08em] text-emerald-900"
                            >
                              {action.replace('_', ' ')}
                            </span>
                          ))}
                        </div>

                        <Link
                          to={`/schools/${school.id}`}
                          className="inline-flex items-center justify-center rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
                        >
                          Open
                        </Link>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        ) : null}
      </div>
    </PlatformShell>
  )
}
