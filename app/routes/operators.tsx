import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from '@remix-run/node'
import { json, redirect } from '@remix-run/node'
import { Form, Link, useActionData, useLoaderData, useNavigation } from '@remix-run/react'
import { FeedbackAlert } from '~/components/feedback-alert'
import type { PlatformOperator } from '~/models/platform-operator'
import { didPlatformAuthChange } from '~/utils/platform-auth.server'
import {
  createPlatformAdmin,
  createPlatformOwner,
  listPlatformOperators,
  removePlatformAdmin,
  resendPlatformOperatorInvite,
} from '~/utils/platform-operators.server'
import {
  clearPlatformAuthState,
  requirePlatformAuthState,
  savePlatformAuthState,
} from '~/utils/session.server'
import { buildFanalMeta } from '~/utils/site-meta'

type LoaderData = {
  canManageAdmins: boolean
  currentUserId: string
  currentUserRoles: string[]
  error?: string
  isOwner: boolean
  operators: PlatformOperator[]
}

type ActionData = {
  error?: string
  fields?: Record<string, string>
  intent?: string
  success?: string
}

export const meta: MetaFunction = () => buildFanalMeta('Platform Operators')

// This helper keeps the owner-session cookie fresh whenever the API rotates platform tokens.
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

// This helper keeps owner-only UI and actions aligned with the platform-owner role contract.
function isPlatformOwner(authState: Awaited<ReturnType<typeof requirePlatformAuthState>>) {
  return authState.user.roles.includes('PLATFORM_OWNER')
}

// This helper identifies whether the signed-in operator can manage admin-level platform access.
function canManagePlatformAdmins(authState: Awaited<ReturnType<typeof requirePlatformAuthState>>) {
  return authState.user.roles.some((role) => role === 'PLATFORM_OWNER' || role === 'PLATFORM_ADMIN')
}

// This helper keeps nullable dates readable across the operator cards.
function formatDate(value?: string | null) {
  if (!value) {
    return 'Not available'
  }

  return new Date(value).toLocaleString()
}

// This helper gives each operator card a stable display label even when no custom display name exists.
function getOperatorDisplayName(operator: PlatformOperator) {
  return operator.displayName?.trim() || `${operator.firstName} ${operator.lastName}`.trim() || operator.email
}

// This helper turns invite status into a clear badge so invited operators do not look fully active yet.
function getOperatorStatus(operator: PlatformOperator) {
  if (operator.requiresPasswordSetup) {
    return {
      className: 'bg-sky-100 text-sky-900',
      label: 'Invite pending',
    }
  }

  if (operator.isActive) {
    return {
      className: 'bg-emerald-100 text-emerald-900',
      label: 'Active',
    }
  }

  return {
    className: 'bg-amber-100 text-amber-900',
    label: 'Inactive',
  }
}

// This helper scopes form repopulation to the form that just failed.
function getSubmittedField(
  actionData: ActionData | undefined,
  intent: string,
  fieldName: string
) {
  if (actionData?.intent !== intent) {
    return ''
  }

  return actionData.fields?.[fieldName] ?? ''
}

export async function loader({ request }: LoaderFunctionArgs) {
  const authState = await requirePlatformAuthState(request)
  const canManageAdmins = canManagePlatformAdmins(authState)
  const isOwner = isPlatformOwner(authState)

  if (!canManageAdmins) {
    return json<LoaderData>(
      {
        canManageAdmins: false,
        currentUserId: authState.user.id,
        currentUserRoles: authState.user.roles,
        error: 'Only platform owners and platform admins can manage operator access.',
        isOwner,
        operators: [],
      },
      { status: 403 }
    )
  }

  let activeAuthState = authState
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

  const headers = await buildAuthHeaders(request, authState, activeAuthState)

  if (!operatorsResult.ok) {
    return json<LoaderData>(
      {
        canManageAdmins: true,
        currentUserId: activeAuthState.user.id,
        currentUserRoles: activeAuthState.user.roles,
        error: operatorsResult.error,
        isOwner: activeAuthState.user.roles.includes('PLATFORM_OWNER'),
        operators: [],
      },
      { headers, status: operatorsResult.status >= 400 ? operatorsResult.status : 500 }
    )
  }

  return json<LoaderData>(
    {
      canManageAdmins: true,
      currentUserId: activeAuthState.user.id,
      currentUserRoles: activeAuthState.user.roles,
      isOwner: activeAuthState.user.roles.includes('PLATFORM_OWNER'),
      operators: operatorsResult.data,
    },
    { headers }
  )
}

export async function action({ request }: ActionFunctionArgs) {
  const authState = await requirePlatformAuthState(request)

  if (!canManagePlatformAdmins(authState)) {
    return json<ActionData>(
      {
        intent: 'forbidden',
        error: 'Only platform owners and platform admins can manage operator access.',
      },
      { status: 403 }
    )
  }

  const formData = await request.formData()
  const intent = String(formData.get('_intent') ?? '').trim()
  const fields = Object.fromEntries([...formData.entries()].map(([key, value]) => [key, String(value)]))

  let result:
    | Awaited<ReturnType<typeof createPlatformAdmin>>
    | Awaited<ReturnType<typeof createPlatformOwner>>
    | Awaited<ReturnType<typeof removePlatformAdmin>>
    | Awaited<ReturnType<typeof resendPlatformOperatorInvite>>
    | null = null

  switch (intent) {
    case 'create_owner':
      if (!isPlatformOwner(authState)) {
        return json<ActionData>(
          {
            intent,
            error: 'Only a platform owner can create another owner account.',
            fields,
          },
          { status: 403 }
        )
      }

      result = await createPlatformOwner(authState, {
        email: String(formData.get('email') ?? '').trim(),
        firstName: String(formData.get('firstName') ?? '').trim(),
        lastName: String(formData.get('lastName') ?? '').trim(),
        displayName: String(formData.get('displayName') ?? '').trim() || undefined,
      })
      break
    case 'create_admin':
      result = await createPlatformAdmin(authState, {
        email: String(formData.get('email') ?? '').trim(),
        firstName: String(formData.get('firstName') ?? '').trim(),
        lastName: String(formData.get('lastName') ?? '').trim(),
        displayName: String(formData.get('displayName') ?? '').trim() || undefined,
      })
      break
    case 'resend_invite':
      result = await resendPlatformOperatorInvite(
        authState,
        String(formData.get('operatorId') ?? '').trim()
      )
      break
    case 'remove_admin':
      result = await removePlatformAdmin(authState, String(formData.get('operatorId') ?? '').trim())
      break
    default:
      return json<ActionData>(
        {
          intent,
          error: 'Choose a valid platform operator action before submitting.',
          fields,
        },
        { status: 400 }
      )
  }

  if (!result.ok && result.status === 401 && !result.authState) {
    return redirect('/login', {
      headers: {
        'Set-Cookie': await clearPlatformAuthState(request),
      },
    })
  }

  const headers = await buildAuthHeaders(request, authState, result.authState)

  if (!result.ok) {
    return json<ActionData>(
      {
        intent,
        error: result.error,
        fields,
      },
      {
        headers,
        status: result.status >= 400 ? result.status : 400,
      }
    )
  }

  return json<ActionData>(
    {
      intent,
      success: result.data.message,
    },
    { headers }
  )
}

export default function OperatorsRoute() {
  const { canManageAdmins, currentUserId, currentUserRoles, error, isOwner, operators } =
    useLoaderData<typeof loader>()
  const actionData = useActionData<typeof action>()
  const navigation = useNavigation()
  const isSubmitting = navigation.state === 'submitting'
  const ownerCount = operators.filter((operator) => operator.roles.includes('PLATFORM_OWNER')).length
  const adminCount = operators.filter((operator) => operator.roles.includes('PLATFORM_ADMIN')).length
  const currentUserIsOwner = currentUserRoles.includes('PLATFORM_OWNER')

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,_#f5f1e7_0%,_#ffffff_35%,_#eef4f1_100%)] px-6 py-8 text-slate-900">
      <div className="mx-auto max-w-6xl space-y-8">
        <header className="flex flex-col gap-4 rounded-[2rem] border border-slate-200 bg-white p-8 shadow-[0_30px_90px_rgba(15,23,42,0.08)] md:flex-row md:items-end md:justify-between">
          <div className="space-y-3">
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-emerald-700">
              Platform operators
            </p>
            <div>
              <h1 className="text-4xl font-black tracking-tight text-slate-950">
                Manage owner and admin access
              </h1>
              <p className="mt-2 max-w-3xl text-base leading-7 text-slate-600">
                Platform owners can add owners and admins. Platform admins can add and remove admins,
                but they cannot create owners or elevate themselves.
              </p>
            </div>
          </div>

          <Link
            to="/dashboard"
            className="inline-flex items-center justify-center rounded-2xl border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
          >
            Back to dashboard
          </Link>
        </header>

        {error ? (
          <FeedbackAlert
            tone="error"
            title="Operator management unavailable"
            message={error}
          />
        ) : null}

        {actionData?.success ? (
          <FeedbackAlert
            tone="success"
            title="Operator update saved"
            message={actionData.success}
          />
        ) : null}

        {!canManageAdmins ? null : (
          <>
            {!isOwner ? (
              <FeedbackAlert
                tone="info"
                title="Admin access mode"
                message="You can create and remove platform admins here. Owner creation remains visible only to platform owners."
              />
            ) : null}

            <section className="rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-[0_20px_60px_rgba(15,23,42,0.06)]">
              <div className="flex flex-col gap-4 border-b border-slate-200 pb-5 md:flex-row md:items-end md:justify-between">
                <div>
                  <h2 className="text-xl font-bold text-slate-950">Current platform operators</h2>
                  <p className="mt-1 text-sm text-slate-600">
                    These accounts live completely outside school tenancy and govern the platform directly.
                  </p>
                </div>
                <div className="flex flex-wrap gap-3 text-sm text-slate-500">
                  <span>{operators.length === 1 ? '1 operator account' : `${operators.length} operator accounts`}</span>
                  <span>{ownerCount} owner{ownerCount === 1 ? '' : 's'}</span>
                  <span>{adminCount} admin{adminCount === 1 ? '' : 's'}</span>
                </div>
              </div>

              <div className="mt-6 grid gap-4 lg:grid-cols-2">
                {operators.map((operator) => {
                  const isAdminOnly =
                    operator.roles.includes('PLATFORM_ADMIN') &&
                    !operator.roles.includes('PLATFORM_OWNER')
                  const isCurrentUser = operator.id === currentUserId
                  const status = getOperatorStatus(operator)
                  const canResendInvite =
                    operator.requiresPasswordSetup &&
                    (!operator.roles.includes('PLATFORM_OWNER') || currentUserIsOwner)

                  return (
                    <article
                      key={operator.id}
                      className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-5"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <h3 className="text-lg font-bold text-slate-950">
                            {getOperatorDisplayName(operator)}
                          </h3>
                          <p className="mt-1 text-sm text-slate-600">{operator.email}</p>
                        </div>
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-semibold ${status.className}`}
                        >
                          {status.label}
                        </span>
                      </div>

                      <div className="mt-4 flex flex-wrap gap-2">
                        {operator.roles.map((role) => (
                          <span
                            key={role}
                            className={`rounded-full px-3 py-1 text-xs font-semibold ${
                              role === 'PLATFORM_OWNER'
                                ? 'bg-slate-950 text-white'
                                : 'bg-emerald-100 text-emerald-900'
                            }`}
                          >
                            {role}
                          </span>
                        ))}
                      </div>

                      <dl className="mt-4 grid gap-3 text-sm text-slate-600 md:grid-cols-2">
                        <div className="rounded-2xl bg-white px-4 py-3">
                          <dt className="font-semibold text-slate-500">Created</dt>
                          <dd className="mt-1 text-slate-900">{formatDate(operator.createdAt)}</dd>
                        </div>
                        <div className="rounded-2xl bg-white px-4 py-3">
                          <dt className="font-semibold text-slate-500">Last login</dt>
                          <dd className="mt-1 text-slate-900">{formatDate(operator.lastLoginAt)}</dd>
                        </div>
                        <div className="rounded-2xl bg-white px-4 py-3">
                          <dt className="font-semibold text-slate-500">Invite sent</dt>
                          <dd className="mt-1 text-slate-900">{formatDate(operator.invitationSentAt)}</dd>
                        </div>
                        <div className="rounded-2xl bg-white px-4 py-3">
                          <dt className="font-semibold text-slate-500">Password created</dt>
                          <dd className="mt-1 text-slate-900">
                            {formatDate(operator.invitationAcceptedAt)}
                          </dd>
                        </div>
                      </dl>

                      <div className="mt-4 space-y-3">
                        {operator.requiresPasswordSetup ? (
                          <FeedbackAlert
                            tone="info"
                            title="Invite pending"
                            message="This operator still needs to open the invite email, create a password, and sign in for the first time."
                          />
                        ) : null}

                        {isAdminOnly ? (
                          <FeedbackAlert
                            tone="info"
                            title="Admin-managed account"
                            message={
                              isCurrentUser
                                ? 'This is your current platform admin session. Self-removal is blocked for safety.'
                                : 'Owners and admins can remove this admin account if platform access should end.'
                            }
                          />
                        ) : (
                          <FeedbackAlert
                            tone="warning"
                            title="Owner-protected account"
                            message="Owner accounts stay protected here so platform authority cannot be removed accidentally."
                          />
                        )}

                        {canResendInvite ? (
                          <>
                            {actionData?.intent === 'resend_invite' &&
                            actionData.error &&
                            actionData.fields?.operatorId === operator.id ? (
                              <FeedbackAlert
                                tone="error"
                                title="Invite resend failed"
                                message={actionData.error}
                              />
                            ) : null}

                            <Form method="post">
                              <input type="hidden" name="_intent" value="resend_invite" />
                              <input type="hidden" name="operatorId" value={operator.id} />
                              <button
                                type="submit"
                                disabled={isSubmitting}
                                className="inline-flex items-center justify-center rounded-2xl border border-sky-300 px-4 py-3 text-sm font-semibold text-sky-900 transition hover:border-sky-400 hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                {isSubmitting &&
                                navigation.formData?.get('_intent') === 'resend_invite' &&
                                navigation.formData?.get('operatorId') === operator.id
                                  ? 'Resending invite...'
                                  : 'Resend invite'}
                              </button>
                            </Form>
                          </>
                        ) : null}

                        {isAdminOnly ? (
                          <>
                            {actionData?.intent === 'remove_admin' && actionData.error ? (
                              <FeedbackAlert
                                tone="error"
                                title="Admin removal failed"
                                message={actionData.error}
                              />
                            ) : null}

                            <Form method="post">
                              <input type="hidden" name="_intent" value="remove_admin" />
                              <input type="hidden" name="operatorId" value={operator.id} />
                              <button
                                type="submit"
                                disabled={isSubmitting || isCurrentUser}
                                className="inline-flex items-center justify-center rounded-2xl border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-800 transition hover:border-slate-400 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                {isSubmitting &&
                                navigation.formData?.get('_intent') === 'remove_admin' &&
                                navigation.formData?.get('operatorId') === operator.id
                                  ? 'Removing admin...'
                                  : 'Remove admin'}
                              </button>
                            </Form>
                          </>
                        ) : null}
                      </div>
                    </article>
                  )
                })}
              </div>
            </section>

            <section className={`grid gap-6 ${isOwner ? 'lg:grid-cols-2' : ''}`}>
              <article className="rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-[0_20px_60px_rgba(15,23,42,0.06)]">
                <h2 className="text-xl font-bold text-slate-950">Create platform admin</h2>
                <p className="mt-3 text-sm leading-6 text-slate-600">
                  Use this for people who should help manage the platform, but should not have owner-level authority. They will receive an email invite to create their own password.
                </p>

                {actionData?.intent === 'create_admin' && actionData.error ? (
                  <FeedbackAlert
                    tone="error"
                    title="Platform admin not created"
                    message={actionData.error}
                    className="mt-6"
                  />
                ) : null}

                <Form method="post" className="mt-6 space-y-4">
                  <input type="hidden" name="_intent" value="create_admin" />
                  <div className="grid gap-4 md:grid-cols-2">
                    <label className="space-y-2">
                      <span className="text-sm font-medium text-slate-700">First name</span>
                      <input
                        name="firstName"
                        defaultValue={getSubmittedField(actionData, 'create_admin', 'firstName')}
                        className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm outline-none transition focus:border-emerald-500"
                        required
                      />
                    </label>
                    <label className="space-y-2">
                      <span className="text-sm font-medium text-slate-700">Last name</span>
                      <input
                        name="lastName"
                        defaultValue={getSubmittedField(actionData, 'create_admin', 'lastName')}
                        className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm outline-none transition focus:border-emerald-500"
                        required
                      />
                    </label>
                  </div>
                  <label className="block space-y-2">
                    <span className="text-sm font-medium text-slate-700">Display name</span>
                    <input
                      name="displayName"
                      defaultValue={getSubmittedField(actionData, 'create_admin', 'displayName')}
                      className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm outline-none transition focus:border-emerald-500"
                      placeholder="Optional display name"
                    />
                  </label>
                  <label className="block space-y-2">
                    <span className="text-sm font-medium text-slate-700">Email address</span>
                    <input
                      type="email"
                      name="email"
                      defaultValue={getSubmittedField(actionData, 'create_admin', 'email')}
                      className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm outline-none transition focus:border-emerald-500"
                      required
                    />
                  </label>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="inline-flex items-center justify-center rounded-2xl bg-emerald-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {isSubmitting && navigation.formData?.get('_intent') === 'create_admin'
                      ? 'Sending admin invite...'
                      : 'Send platform admin invite'}
                  </button>
                </Form>
              </article>

              {isOwner ? (
                <article className="rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-[0_20px_60px_rgba(15,23,42,0.06)]">
                  <h2 className="text-xl font-bold text-slate-950">Create platform owner</h2>
                  <p className="mt-3 text-sm leading-6 text-slate-600">
                    Only an existing platform owner can add another owner. Use this sparingly, because owner accounts carry ultimate authority. The invited owner will finish setup from email.
                  </p>

                  {actionData?.intent === 'create_owner' && actionData.error ? (
                    <FeedbackAlert
                      tone="error"
                      title="Platform owner not created"
                      message={actionData.error}
                      className="mt-6"
                    />
                  ) : null}

                  <Form method="post" className="mt-6 space-y-4">
                    <input type="hidden" name="_intent" value="create_owner" />
                    <div className="grid gap-4 md:grid-cols-2">
                      <label className="space-y-2">
                        <span className="text-sm font-medium text-slate-700">First name</span>
                        <input
                          name="firstName"
                          defaultValue={getSubmittedField(actionData, 'create_owner', 'firstName')}
                          className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm outline-none transition focus:border-emerald-500"
                          required
                        />
                      </label>
                      <label className="space-y-2">
                        <span className="text-sm font-medium text-slate-700">Last name</span>
                        <input
                          name="lastName"
                          defaultValue={getSubmittedField(actionData, 'create_owner', 'lastName')}
                          className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm outline-none transition focus:border-emerald-500"
                          required
                        />
                      </label>
                    </div>
                    <label className="block space-y-2">
                      <span className="text-sm font-medium text-slate-700">Display name</span>
                      <input
                        name="displayName"
                        defaultValue={getSubmittedField(actionData, 'create_owner', 'displayName')}
                        className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm outline-none transition focus:border-emerald-500"
                        placeholder="Optional display name"
                      />
                    </label>
                    <label className="block space-y-2">
                      <span className="text-sm font-medium text-slate-700">Email address</span>
                      <input
                        type="email"
                        name="email"
                        defaultValue={getSubmittedField(actionData, 'create_owner', 'email')}
                        className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm outline-none transition focus:border-emerald-500"
                        required
                      />
                    </label>
                    <FeedbackAlert
                      tone="warning"
                      title="Owner-level authority"
                      message="This account will be able to create other owners, create admins, and govern schools across the platform."
                      className="mt-2"
                    />

                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="inline-flex items-center justify-center rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-70"
                    >
                      {isSubmitting && navigation.formData?.get('_intent') === 'create_owner'
                        ? 'Sending owner invite...'
                        : 'Send platform owner invite'}
                    </button>
                  </Form>
                </article>
              ) : null}
            </section>

            <section className="rounded-[1.75rem] border border-amber-200 bg-amber-50 p-6 shadow-[0_20px_60px_rgba(245,158,11,0.08)]">
              <h2 className="text-xl font-bold text-amber-950">Management rules</h2>
              <ul className="mt-4 space-y-3 text-sm leading-6 text-amber-900">
                <li>Only the CLI can bootstrap the very first platform owner.</li>
                <li>Owners can invite other owners and invite admins.</li>
                <li>Admins can invite and remove admins, but they cannot create owner accounts.</li>
                <li>Invited operators create their own passwords from the email setup link before first login.</li>
                <li>Your current admin session cannot remove itself from this console accidentally.</li>
              </ul>
              <p className="mt-4 text-xs font-medium uppercase tracking-[0.2em] text-amber-800">
                Current roles: {currentUserRoles.join(', ')}
              </p>
            </section>
          </>
        )}
      </div>
    </main>
  )
}
