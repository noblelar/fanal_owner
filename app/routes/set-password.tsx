import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from '@remix-run/node'
import { json } from '@remix-run/node'
import { Form, Link, useActionData, useLoaderData, useNavigation } from '@remix-run/react'
import { FeedbackAlert } from '~/components/feedback-alert'
import { completePlatformInvite } from '~/utils/platform-auth.server'
import { buildFanalMeta } from '~/utils/site-meta'

type LoaderData = {
  token: string
}

type ActionData = {
  error?: string
  passwordError?: string
  success?: string
  token?: string
}

export const meta: MetaFunction = () => buildFanalMeta('Set Platform Password')

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url)

  return json<LoaderData>({
    token: url.searchParams.get('token')?.trim() ?? '',
  })
}

export async function action({ request }: ActionFunctionArgs) {
  const formData = await request.formData()
  const token = String(formData.get('token') ?? '').trim()
  const password = String(formData.get('password') ?? '')
  const confirmPassword = String(formData.get('confirmPassword') ?? '')

  if (!token) {
    return json<ActionData>(
      {
        error: 'This invite link is missing its token. Ask a platform owner or admin to resend your invite.',
      },
      { status: 400 }
    )
  }

  if (!password || !confirmPassword) {
    return json<ActionData>(
      {
        error: 'Enter and confirm your new password to finish platform setup.',
        token,
      },
      { status: 400 }
    )
  }

  if (password.length < 8) {
    return json<ActionData>(
      {
        passwordError:
          'Use at least 8 characters, including uppercase, lowercase, and a number.',
        token,
      },
      { status: 400 }
    )
  }

  if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password)) {
    return json<ActionData>(
      {
        passwordError:
          'Use at least 8 characters, including uppercase, lowercase, and a number.',
        token,
      },
      { status: 400 }
    )
  }

  if (password !== confirmPassword) {
    return json<ActionData>(
      {
        passwordError: 'The password confirmation does not match. Please try again.',
        token,
      },
      { status: 400 }
    )
  }

  const result = await completePlatformInvite(token, password)
  if (!result.ok) {
    return json<ActionData>(
      {
        error: result.error,
        token,
      },
      { status: result.status >= 400 ? result.status : 400 }
    )
  }

  return json<ActionData>({
    success: result.message,
  })
}

export default function SetPasswordRoute() {
  const { token } = useLoaderData<typeof loader>()
  const actionData = useActionData<typeof action>()
  const navigation = useNavigation()
  const isSubmitting = navigation.state === 'submitting'
  const activeToken = actionData?.token ?? token
  const isSuccessful = Boolean(actionData?.success)
  const isTokenMissing = !activeToken && !isSuccessful

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_#fff8e8_0%,_#fff_42%,_#f3efe6_100%)] px-6 py-12 text-slate-900">
      <div className="mx-auto flex min-h-[80vh] max-w-5xl items-center">
        <div className="grid w-full gap-10 rounded-[2rem] border border-slate-200 bg-white/90 p-8 shadow-[0_30px_90px_rgba(15,23,42,0.08)] backdrop-blur md:grid-cols-[1.15fr_0.85fr] md:p-12">
          <section className="space-y-6">
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-amber-700">
              Platform Invite
            </p>
            <div className="space-y-4">
              <h1 className="max-w-xl text-4xl font-black leading-tight text-slate-950 md:text-5xl">
                Create your platform password to finish setup.
              </h1>
              <p className="max-w-xl text-base leading-7 text-slate-600">
                This page completes the invite for a platform owner or platform admin account. Once your
                password is saved, you can sign in from the owner console immediately.
              </p>
            </div>
            <div className="grid gap-3 text-sm text-slate-600">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                Your invite email is single-use. If it has expired, ask an existing platform owner or
                admin to resend it.
              </div>
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
                Use a password you can keep securely. This account governs the platform outside school
                tenancy.
              </div>
            </div>
          </section>

          <section className="rounded-[1.75rem] border border-slate-200 bg-slate-950 p-6 text-white shadow-[0_20px_70px_rgba(15,23,42,0.35)] md:p-8">
            <div className="space-y-2">
              <h2 className="text-2xl font-bold">Set platform password</h2>
              <p className="text-sm leading-6 text-slate-300">
                Save your password once, then return to the login screen to access the owner console.
              </p>
            </div>

            {actionData?.error ? (
              <FeedbackAlert
                tone="error"
                title="Unable to complete invite"
                message={actionData.error}
                className="mt-6 border-rose-500/40 bg-rose-500/10 text-rose-100"
              />
            ) : null}

            {actionData?.passwordError ? (
              <FeedbackAlert
                tone="error"
                title="Check your password"
                message={actionData.passwordError}
                className="mt-6 border-rose-500/40 bg-rose-500/10 text-rose-100"
              />
            ) : null}

            {actionData?.success ? (
              <div className="mt-6 space-y-4">
                <FeedbackAlert
                  tone="success"
                  title="Password created"
                  message={actionData.success}
                  className="border-emerald-500/30 bg-emerald-500/10 text-emerald-100"
                />

                <Link
                  to="/login"
                  className="inline-flex w-full items-center justify-center rounded-2xl bg-amber-400 px-4 py-3 text-sm font-bold text-slate-950 transition hover:bg-amber-300"
                >
                  Continue to platform login
                </Link>
              </div>
            ) : isTokenMissing ? (
              <div className="mt-6 space-y-4">
                <FeedbackAlert
                  tone="warning"
                  title="Invite link incomplete"
                  message="Open this page from the invite email, or ask a platform owner or admin to resend the invite."
                  className="border-amber-500/30 bg-amber-500/10 text-amber-100"
                />

                <Link
                  to="/login"
                  className="inline-flex w-full items-center justify-center rounded-2xl border border-slate-700 px-4 py-3 text-sm font-semibold text-slate-100 transition hover:border-slate-500 hover:bg-slate-900"
                >
                  Back to platform login
                </Link>
              </div>
            ) : (
              <Form method="post" className="mt-6 space-y-5">
                <input type="hidden" name="token" value={activeToken} />

                <label className="block space-y-2">
                  <span className="text-sm font-medium text-slate-200">New password</span>
                  <input
                    className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-base text-white outline-none transition focus:border-amber-400"
                    type="password"
                    name="password"
                    autoComplete="new-password"
                    required
                  />
                  <p className="text-xs text-slate-400">
                    Use at least 8 characters with uppercase, lowercase, and a number.
                  </p>
                </label>

                <label className="block space-y-2">
                  <span className="text-sm font-medium text-slate-200">Confirm password</span>
                  <input
                    className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-base text-white outline-none transition focus:border-amber-400"
                    type="password"
                    name="confirmPassword"
                    autoComplete="new-password"
                    required
                  />
                </label>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="inline-flex w-full items-center justify-center rounded-2xl bg-amber-400 px-4 py-3 text-sm font-bold text-slate-950 transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:bg-amber-200"
                >
                  {isSubmitting ? 'Saving platform password...' : 'Create platform password'}
                </button>
              </Form>
            )}
          </section>
        </div>
      </div>
    </main>
  )
}
