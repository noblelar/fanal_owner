import type { LoaderFunctionArgs, MetaFunction } from '@remix-run/node'
import { json, redirect } from '@remix-run/node'
import { Form, Link, useLoaderData } from '@remix-run/react'
import { FeedbackAlert } from '~/components/feedback-alert'
import {
  fetchPlatformUser,
  getPlatformApiBaseUrl,
  refreshPlatformAuth,
  type PlatformSessionUser,
} from '~/utils/platform-auth.server'
import {
  clearPlatformAuthState,
  requirePlatformAuthState,
  savePlatformAuthState,
} from '~/utils/session.server'
import { buildFanalMeta } from '~/utils/site-meta'

type LoaderData = {
  user: PlatformSessionUser
  warning?: string
}

export const meta: MetaFunction = () => buildFanalMeta('Platform Dashboard')

export async function loader({ request }: LoaderFunctionArgs) {
  const authState = await requirePlatformAuthState(request)
  const baseUrl = getPlatformApiBaseUrl()

  if (!baseUrl) {
    return json<LoaderData>({
      user: authState.user,
      warning: 'Platform API URL is not configured, so live session validation is currently unavailable.',
    })
  }

  const meResult = await fetchPlatformUser(authState.accessToken)
  if (meResult.ok) {
    if (JSON.stringify(meResult.user) !== JSON.stringify(authState.user)) {
      return json<LoaderData>(
        { user: meResult.user },
        {
          headers: {
            'Set-Cookie': await savePlatformAuthState(request, { ...authState, user: meResult.user }),
          },
        }
      )
    }

    return json<LoaderData>({ user: meResult.user })
  }

  if (meResult.status === 401) {
    const refreshResult = await refreshPlatformAuth(authState.refreshToken)
    if (refreshResult.ok) {
      return json<LoaderData>(
        { user: refreshResult.payload.user },
        {
          headers: {
            'Set-Cookie': await savePlatformAuthState(request, refreshResult.payload),
          },
        }
      )
    }

    return redirect('/login', {
      headers: {
        'Set-Cookie': await clearPlatformAuthState(request),
      },
    })
  }

  return json<LoaderData>({
    user: authState.user,
    warning: meResult.error,
  })
}

export default function DashboardRoute() {
  const { user, warning } = useLoaderData<typeof loader>()

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,_#f5f1e7_0%,_#ffffff_35%,_#eef4f1_100%)] px-6 py-8 text-slate-900">
      <div className="mx-auto max-w-6xl space-y-8">
        <header className="flex flex-col gap-4 rounded-[2rem] border border-slate-200 bg-white p-8 shadow-[0_30px_90px_rgba(15,23,42,0.08)] md:flex-row md:items-end md:justify-between">
          <div className="space-y-3">
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-emerald-700">
              Platform console
            </p>
            <div>
              <h1 className="text-4xl font-black tracking-tight text-slate-950">
                Welcome, {user.displayName}
              </h1>
              <p className="mt-2 max-w-2xl text-base leading-7 text-slate-600">
                This account now lives outside school tenancy. School governance and platform-operator
                management both run from this console, without borrowing a school-linked admin identity.
              </p>
            </div>
          </div>

          <Form method="post" action="/logout">
            <button
              type="submit"
              className="inline-flex items-center justify-center rounded-2xl border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
            >
              Sign out
            </button>
          </Form>
        </header>

        {warning ? (
          <FeedbackAlert
            tone="warning"
            title="Platform connection warning"
            message={warning}
          />
        ) : null}

        <section className="grid gap-6 md:grid-cols-[1.1fr_0.9fr]">
          <article className="rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-[0_20px_60px_rgba(15,23,42,0.06)]">
            <h2 className="text-xl font-bold text-slate-950">Platform identity</h2>
            <dl className="mt-6 grid gap-4 text-sm text-slate-600">
              <div className="rounded-2xl bg-slate-50 px-4 py-3">
                <dt className="font-semibold text-slate-500">Email</dt>
                <dd className="mt-1 text-base font-medium text-slate-900">{user.email}</dd>
              </div>
              <div className="rounded-2xl bg-slate-50 px-4 py-3">
                <dt className="font-semibold text-slate-500">Roles</dt>
                <dd className="mt-2 flex flex-wrap gap-2">
                  {user.roles.map((role) => (
                    <span
                      key={role}
                      className="rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-white"
                    >
                      {role}
                    </span>
                  ))}
                </dd>
              </div>
              <div className="rounded-2xl bg-slate-50 px-4 py-3">
                <dt className="font-semibold text-slate-500">Account state</dt>
                <dd className="mt-1 text-base font-medium text-slate-900">
                  {user.isActive ? 'Active platform operator' : 'Inactive'}
                </dd>
              </div>
            </dl>
          </article>

          <article className="rounded-[1.75rem] border border-emerald-200 bg-emerald-50 p-6 shadow-[0_20px_60px_rgba(16,185,129,0.08)]">
            <h2 className="text-xl font-bold text-emerald-950">Platform governance</h2>
            <p className="mt-4 text-sm leading-6 text-emerald-900">
              Phase two moves school lifecycle control into the platform boundary. Review incoming
              applications, approve schools, suspend access, and reactivate tenants from the owner
              console instead of relying on school-linked admin identities.
            </p>
            <div className="mt-6">
              <Link
                to="/schools"
                className="inline-flex items-center justify-center rounded-2xl bg-emerald-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-800"
              >
                Open school governance
              </Link>
            </div>
          </article>
        </section>

        <section className="grid gap-6 md:grid-cols-2">
          <article className="rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-[0_20px_60px_rgba(15,23,42,0.06)]">
            <h2 className="text-xl font-bold text-slate-950">Platform operators</h2>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              Create platform admins, let owners add more owners, and retire admin access safely without
              borrowing any school-linked identity.
            </p>
            <div className="mt-6">
              <Link
                to="/operators"
                className="inline-flex items-center justify-center rounded-2xl border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-800 transition hover:border-slate-400 hover:bg-slate-50"
              >
                Manage platform operators
              </Link>
            </div>
          </article>

          <article className="rounded-[1.75rem] border border-amber-200 bg-amber-50 p-6 shadow-[0_20px_60px_rgba(245,158,11,0.08)]">
            <h2 className="text-xl font-bold text-amber-950">Legacy cutover status</h2>
            <ul className="mt-4 space-y-3 text-sm leading-6 text-amber-900">
              <li>School lifecycle writes now belong under `/api/platform/schools`.</li>
              <li>Legacy owner pages inside `fanal_main` will hand off into this owner console.</li>
              <li>Platform operators are now managed here with owner/admin rules that stay outside school tenancy.</li>
            </ul>
          </article>
        </section>
      </div>
    </main>
  )
}
