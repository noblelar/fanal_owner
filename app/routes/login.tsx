import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from '@remix-run/node'
import { json, redirect } from '@remix-run/node'
import { Form, useActionData, useNavigation } from '@remix-run/react'
import { FeedbackAlert } from '~/components/feedback-alert'
import { buildFanalMeta } from '~/utils/site-meta'
import { loginPlatformUser } from '~/utils/platform-auth.server'
import { getPlatformAuthState, savePlatformAuthState } from '~/utils/session.server'

type ActionData = {
  formError?: string
  email?: string
}

export const meta: MetaFunction = () => buildFanalMeta('Platform Login')

export async function loader({ request }: LoaderFunctionArgs) {
  const authState = await getPlatformAuthState(request)
  if (authState) {
    throw redirect('/dashboard')
  }

  return null
}

export async function action({ request }: ActionFunctionArgs) {
  const formData = await request.formData()
  const email = String(formData.get('email') ?? '').trim()
  const password = String(formData.get('password') ?? '')

  if (!email || !password) {
    return json<ActionData>(
      { formError: 'Enter both your platform email and password.', email },
      { status: 400 }
    )
  }

  const result = await loginPlatformUser(email, password)
  if (!result.ok) {
    return json<ActionData>(
      { formError: result.error, email },
      { status: result.status >= 400 ? result.status : 400 }
    )
  }

  return redirect('/dashboard', {
    headers: {
      'Set-Cookie': await savePlatformAuthState(request, result.payload),
    },
  })
}

export default function LoginRoute() {
  const actionData = useActionData<typeof action>()
  const navigation = useNavigation()
  const isSubmitting = navigation.state === 'submitting'

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_#fff8e8_0%,_#fff_42%,_#f3efe6_100%)] px-6 py-12 text-slate-900">
      <div className="mx-auto flex min-h-[80vh] max-w-5xl items-center">
        <div className="grid w-full gap-10 rounded-[2rem] border border-slate-200 bg-white/90 p-8 shadow-[0_30px_90px_rgba(15,23,42,0.08)] backdrop-blur md:grid-cols-[1.15fr_0.85fr] md:p-12">
          <section className="space-y-6">
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-amber-700">
              Platform Access
            </p>
            <div className="space-y-4">
              <h1 className="max-w-xl text-4xl font-black leading-tight text-slate-950 md:text-5xl">
                Sign in to manage the software platform, not a school tenant.
              </h1>
              <p className="max-w-xl text-base leading-7 text-slate-600">
                This console is now reserved for external platform operators. Use it to review school
                onboarding, control lifecycle actions, and govern the product at the system level.
              </p>
            </div>
            <div className="grid gap-3 text-sm text-slate-600">
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
                Phase one is live: separate platform users, separate platform auth, and isolated owner
                access.
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                Bootstrap the first owner through the API CLI command before signing in here.
              </div>
            </div>
          </section>

          <section className="rounded-[1.75rem] border border-slate-200 bg-slate-950 p-6 text-white shadow-[0_20px_70px_rgba(15,23,42,0.35)] md:p-8">
            <div className="space-y-2">
              <h2 className="text-2xl font-bold">Platform login</h2>
              <p className="text-sm leading-6 text-slate-300">
                Use your platform owner or platform admin credentials.
              </p>
            </div>

            {actionData?.formError ? (
              <FeedbackAlert
                tone="error"
                title="Unable to sign in"
                message={actionData.formError}
                className="mt-6 border-rose-500/40 bg-rose-500/10 text-rose-100"
              />
            ) : null}

            <Form method="post" className="mt-6 space-y-5">
              <label className="block space-y-2">
                <span className="text-sm font-medium text-slate-200">Email address</span>
                <input
                  className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-base text-white outline-none transition focus:border-amber-400"
                  type="email"
                  name="email"
                  defaultValue={actionData?.email ?? ''}
                  autoComplete="email"
                  required
                />
              </label>

              <label className="block space-y-2">
                <span className="text-sm font-medium text-slate-200">Password</span>
                <input
                  className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-base text-white outline-none transition focus:border-amber-400"
                  type="password"
                  name="password"
                  autoComplete="current-password"
                  required
                />
              </label>

              <button
                type="submit"
                disabled={isSubmitting}
                className="inline-flex w-full items-center justify-center rounded-2xl bg-amber-400 px-4 py-3 text-sm font-bold text-slate-950 transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:bg-amber-200"
              >
                {isSubmitting ? 'Signing in...' : 'Sign in to platform'}
              </button>
            </Form>
          </section>
        </div>
      </div>
    </main>
  )
}
