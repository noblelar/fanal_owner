import { useEffect, useMemo, useState } from 'react'
import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from '@remix-run/node'
import { json, redirect } from '@remix-run/node'
import { Form, Link, useActionData, useLoaderData, useNavigation } from '@remix-run/react'
import { FeedbackAlert } from '~/components/feedback-alert'
import type {
  PlatformSchoolDetails,
  PlatformSchoolLifecycleActionOption,
} from '~/models/platform-school'
import { didPlatformAuthChange } from '~/utils/platform-auth.server'
import {
  getPlatformSchool,
  resendPlatformSchoolApprovalEmail,
  updatePlatformSchoolLifecycle,
} from '~/utils/platform-schools.server'
import {
  clearPlatformAuthState,
  requirePlatformAuthState,
  savePlatformAuthState,
} from '~/utils/session.server'
import { buildFanalMeta } from '~/utils/site-meta'

type LoaderData = {
  error?: string
  school?: PlatformSchoolDetails
}

type ActionData = {
  formError?: string
  formSuccess?: string
  note?: string
  school?: PlatformSchoolDetails
  selectedAction?: string
}

export const meta: MetaFunction<typeof loader> = ({ data }) => {
  const schoolName = data?.school?.schoolName ?? 'School review'

  return buildFanalMeta(schoolName)
}

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

export async function loader({ request, params }: LoaderFunctionArgs) {
  const authState = await requirePlatformAuthState(request)
  const schoolId = params.schoolId

  if (!schoolId) {
    return json<LoaderData>({ error: 'School identifier is missing.' }, { status: 400 })
  }

  const result = await getPlatformSchool(authState, schoolId)

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
      { error: result.error },
      { status: result.status >= 400 ? result.status : 500, headers }
    )
  }

  return json<LoaderData>({ school: result.data.school }, { headers })
}

export async function action({ request, params }: ActionFunctionArgs) {
  const authState = await requirePlatformAuthState(request)
  const schoolId = params.schoolId

  if (!schoolId) {
    return json<ActionData>({ formError: 'School identifier is missing.' }, { status: 400 })
  }

  const formData = await request.formData()
  const intent = String(formData.get('intent') ?? 'update-lifecycle').trim()
  const lifecycleAction = String(formData.get('action') ?? '').trim()
  const note = String(formData.get('note') ?? '').trim()

  // This branch lets platform operators resend the approval/setup email without disturbing the selected lifecycle action on the review page.
  if (intent === 'resend-approval-email') {
    const result = await resendPlatformSchoolApprovalEmail(authState, schoolId)

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
          formError: result.error,
          note,
          selectedAction: lifecycleAction,
        },
        {
          status: result.status >= 400 ? result.status : 400,
          headers,
        }
      )
    }

    return json<ActionData>(
      {
        formSuccess: result.data.message,
        school: result.data.school,
        note,
        selectedAction:
          lifecycleAction ||
          result.data.school.lifecycleState.availableActionOptions[0]?.action ||
          '',
      },
      { headers }
    )
  }

  if (!lifecycleAction) {
    return json<ActionData>(
      {
        formError: 'Choose a lifecycle action before submitting.',
        note,
        selectedAction: lifecycleAction,
      },
      { status: 400 }
    )
  }

  const result = await updatePlatformSchoolLifecycle(authState, schoolId, {
    action: lifecycleAction,
    note,
  })

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
        formError: result.error,
        note,
        selectedAction: lifecycleAction,
      },
      {
        status: result.status >= 400 ? result.status : 400,
        headers,
      }
    )
  }

  return json<ActionData>(
    {
      formSuccess: result.data.message,
      school: result.data.school,
      note: '',
      selectedAction: result.data.school.lifecycleState.availableActionOptions[0]?.action ?? '',
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

  return new Date(value).toLocaleString()
}

function formatAuditSource(source: string) {
  return source === 'legacy_review' ? 'Legacy review' : 'Platform lifecycle event'
}

// This helper keeps lifecycle action cards visually aligned with the tone metadata sent by the API.
function getActionToneClasses(tone: string, selected: boolean) {
  const selectedClasses = selected ? 'ring-2 ring-offset-2 ring-offset-white' : ''

  switch (tone) {
    case 'success':
      return `border-emerald-200 bg-emerald-50 text-emerald-950 hover:border-emerald-300 ${selectedClasses} ring-emerald-500`
    case 'warning':
      return `border-amber-200 bg-amber-50 text-amber-950 hover:border-amber-300 ${selectedClasses} ring-amber-500`
    case 'danger':
      return `border-rose-200 bg-rose-50 text-rose-950 hover:border-rose-300 ${selectedClasses} ring-rose-500`
    default:
      return `border-slate-200 bg-slate-50 text-slate-950 hover:border-slate-300 ${selectedClasses} ring-slate-400`
  }
}

// This helper keeps the primary submit action visually tied to the selected lifecycle decision.
function getActionButtonClasses(tone: string, disabled: boolean) {
  const disabledClasses = disabled
    ? 'cursor-not-allowed bg-slate-300 text-slate-600'
    : ''

  switch (tone) {
    case 'success':
      return `${disabledClasses || 'bg-emerald-900 text-white hover:bg-emerald-800'} inline-flex items-center justify-center rounded-2xl px-4 py-3 text-sm font-semibold transition`
    case 'warning':
      return `${disabledClasses || 'bg-amber-600 text-white hover:bg-amber-500'} inline-flex items-center justify-center rounded-2xl px-4 py-3 text-sm font-semibold transition`
    case 'danger':
      return `${disabledClasses || 'bg-rose-700 text-white hover:bg-rose-600'} inline-flex items-center justify-center rounded-2xl px-4 py-3 text-sm font-semibold transition`
    default:
      return `${disabledClasses || 'bg-slate-950 text-white hover:bg-slate-800'} inline-flex items-center justify-center rounded-2xl px-4 py-3 text-sm font-semibold transition`
  }
}

export default function SchoolDetailsRoute() {
  const loaderData = useLoaderData<typeof loader>()
  const actionData = useActionData<typeof action>()
  const navigation = useNavigation()
  const school = actionData?.school ?? loaderData.school
  const lifecycleOptions = school?.lifecycleState.availableActionOptions ?? []
  const actionSignature = lifecycleOptions.map((option) => option.action).join('|')
  const pendingIntent =
    navigation.state === 'submitting' ? String(navigation.formData?.get('intent') ?? '') : ''
  const pendingAction =
    navigation.state === 'submitting' ? String(navigation.formData?.get('action') ?? '') : ''
  const [selectedAction, setSelectedAction] = useState(
    actionData?.selectedAction ?? lifecycleOptions[0]?.action ?? ''
  )
  const [showCrestPreview, setShowCrestPreview] = useState(Boolean(school?.crest))

  // This sync keeps the selected review action stable after loader refreshes and mutation responses.
  useEffect(() => {
    if (!school) {
      return
    }

    const preferredAction =
      actionData?.selectedAction && lifecycleOptions.some((option) => option.action === actionData.selectedAction)
        ? actionData.selectedAction
        : lifecycleOptions[0]?.action ?? ''

    setSelectedAction((currentAction) =>
      currentAction === preferredAction ? currentAction : preferredAction
    )
  }, [actionData?.selectedAction, actionSignature, lifecycleOptions, school])

  // This sync resets the crest preview state whenever the owner opens a different school or the crest URL changes.
  useEffect(() => {
    setShowCrestPreview(Boolean(school?.crest))
  }, [school?.crest])

  // This memo keeps the note guidance and confirmation copy tied to the currently selected lifecycle action.
  const selectedActionOption = useMemo<PlatformSchoolLifecycleActionOption | null>(() => {
    if (lifecycleOptions.length === 0) {
      return null
    }

    return (
      lifecycleOptions.find((option) => option.action === selectedAction) ??
      lifecycleOptions[0] ??
      null
    )
  }, [lifecycleOptions, selectedAction])

  const showResendApprovalEmail =
    Boolean(school?.approved)
    && Boolean(school?.activationState.needsInitialPasswordSetup)
    && school?.lifecycleState.stage !== 'suspended'
    && school?.lifecycleState.stage !== 'blacklisted'
  const feedbackIsApprovalEmail =
    (actionData?.formError?.toLowerCase().includes('approval email') ?? false) ||
    (actionData?.formError?.toLowerCase().includes('setup email') ?? false) ||
    (actionData?.formSuccess?.toLowerCase().includes('approval email') ?? false) ||
    (actionData?.formSuccess?.toLowerCase().includes('setup email') ?? false)

  if (!school) {
    return (
      <main className="min-h-screen bg-[linear-gradient(180deg,_#f5f1e7_0%,_#ffffff_35%,_#eef4f1_100%)] px-6 py-8 text-slate-900">
        <div className="mx-auto max-w-4xl space-y-6">
          <Link
            to="/schools"
            className="inline-flex items-center justify-center rounded-2xl border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
          >
            Back to schools
          </Link>
          <FeedbackAlert
            tone="error"
            title="Unable to load school"
            message={loaderData.error || 'This school could not be loaded right now.'}
          />
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,_#f5f1e7_0%,_#ffffff_35%,_#eef4f1_100%)] px-6 py-8 text-slate-900">
      <div className="mx-auto max-w-6xl space-y-8">
        <header className="flex flex-col gap-4 rounded-[2rem] border border-slate-200 bg-white p-8 shadow-[0_30px_90px_rgba(15,23,42,0.08)] md:flex-row md:items-end md:justify-between">
          <div className="space-y-3">
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-emerald-700">
              School review
            </p>
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-4xl font-black tracking-tight text-slate-950">
                  {school.schoolName}
                </h1>
                <span
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${getStageBadgeClass(school.lifecycleState.stage)}`}
                >
                  {school.lifecycleState.stageLabel}
                </span>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-800">
                  {school.activationState.stageLabel}
                </span>
                {!school.emailConfirmed ? (
                  <span className="rounded-full bg-rose-100 px-3 py-1 text-xs font-semibold text-rose-900">
                    Email not verified
                  </span>
                ) : null}
              </div>
              <p className="mt-2 max-w-3xl text-base leading-7 text-slate-600">
                {school.lifecycleState.statusMessage}
              </p>
            </div>
          </div>

          <Link
            to="/schools"
            className="inline-flex items-center justify-center rounded-2xl border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
          >
            Back to schools
          </Link>
        </header>

        {loaderData.error ? (
          <FeedbackAlert
            tone="error"
            title="Platform response issue"
            message={loaderData.error}
          />
        ) : null}

        {actionData?.formError ? (
          <FeedbackAlert
            tone="error"
            title={feedbackIsApprovalEmail ? 'Approval email could not be sent' : 'Lifecycle update could not be saved'}
            message={actionData.formError}
          />
        ) : null}

        {actionData?.formSuccess ? (
          <FeedbackAlert
            tone="success"
            title={feedbackIsApprovalEmail ? 'Approval email sent' : 'Lifecycle updated'}
            message={actionData.formSuccess}
          />
        ) : null}

        <section className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
          <article className="rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-[0_20px_60px_rgba(15,23,42,0.06)]">
            <h2 className="text-xl font-bold text-slate-950">School preview</h2>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              Review the school&apos;s profile, onboarding readiness, and current platform state before
              you decide to approve, reject, suspend, or reactivate it.
            </p>

            {/* This crest card lets platform operators visually confirm the uploaded school identity before approving the application. */}
            <div className="mt-6 grid gap-4 lg:grid-cols-[220px_1fr]">
              <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                  Uploaded crest
                </p>
                <div className="mt-3 flex min-h-[180px] items-center justify-center overflow-hidden rounded-[1.25rem] border border-dashed border-slate-300 bg-white p-4">
                  {showCrestPreview && school.crest ? (
                    <img
                      src={school.crest}
                      alt={`${school.schoolName} crest`}
                      className="max-h-[150px] w-auto max-w-full object-contain"
                      onError={() => setShowCrestPreview(false)}
                    />
                  ) : (
                    <div className="space-y-2 text-center text-slate-500">
                      <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-slate-100 text-xl font-bold text-slate-700">
                        {school.schoolName.charAt(0).toUpperCase()}
                      </div>
                      <p className="text-sm font-medium text-slate-700">No crest preview available</p>
                      <p className="text-xs leading-5">
                        The school did not upload a crest, or the stored crest URL could not be loaded.
                      </p>
                    </div>
                  )}
                </div>
              </div>

              <dl className="grid gap-4 text-sm text-slate-600 md:grid-cols-2">
              <div className="rounded-2xl bg-slate-50 px-4 py-3">
                <dt className="font-semibold text-slate-500">School email</dt>
                <dd className="mt-1 text-slate-900">{school.email}</dd>
              </div>
              <div className="rounded-2xl bg-slate-50 px-4 py-3">
                <dt className="font-semibold text-slate-500">Phone number</dt>
                <dd className="mt-1 text-slate-900">{school.phoneNumber || 'Not provided'}</dd>
              </div>
              <div className="rounded-2xl bg-slate-50 px-4 py-3">
                <dt className="font-semibold text-slate-500">School index</dt>
                <dd className="mt-1 text-slate-900">{school.schoolIndex}</dd>
              </div>
              <div className="rounded-2xl bg-slate-50 px-4 py-3">
                <dt className="font-semibold text-slate-500">Application date</dt>
                <dd className="mt-1 text-slate-900">{formatDate(school.applicationDate)}</dd>
              </div>
              <div className="rounded-2xl bg-slate-50 px-4 py-3">
                <dt className="font-semibold text-slate-500">Approval date</dt>
                <dd className="mt-1 text-slate-900">{formatDate(school.approvalDate)}</dd>
              </div>
              <div className="rounded-2xl bg-slate-50 px-4 py-3">
                <dt className="font-semibold text-slate-500">Approval status</dt>
                <dd className="mt-1 text-slate-900">{school.approvalStatus}</dd>
              </div>
              <div className="rounded-2xl bg-slate-50 px-4 py-3">
                <dt className="font-semibold text-slate-500">Working status</dt>
                <dd className="mt-1 text-slate-900">{school.lifecycleState.workingStatus}</dd>
              </div>
              <div className="rounded-2xl bg-slate-50 px-4 py-3">
                <dt className="font-semibold text-slate-500">Country / region</dt>
                <dd className="mt-1 text-slate-900">
                  {[school.country, school.region].filter(Boolean).join(' / ') || 'Not provided'}
                </dd>
              </div>
              <div className="rounded-2xl bg-slate-50 px-4 py-3">
                <dt className="font-semibold text-slate-500">Municipal district</dt>
                <dd className="mt-1 text-slate-900">{school.mmd || 'Not provided'}</dd>
              </div>
              <div className="rounded-2xl bg-slate-50 px-4 py-3">
                <dt className="font-semibold text-slate-500">Landmark</dt>
                <dd className="mt-1 text-slate-900">{school.landmark || 'Not provided'}</dd>
              </div>
              <div className="rounded-2xl bg-slate-50 px-4 py-3">
                <dt className="font-semibold text-slate-500">Email verification</dt>
                <dd className="mt-1 text-slate-900">
                  {school.emailConfirmed ? 'Verified' : 'Not verified yet'}
                </dd>
              </div>
              <div className="rounded-2xl bg-slate-50 px-4 py-3">
                <dt className="font-semibold text-slate-500">Phone confirmation</dt>
                <dd className="mt-1 text-slate-900">
                  {school.phoneNumberConfirmed ? 'Confirmed' : 'Not confirmed'}
                </dd>
              </div>
              </dl>
            </div>

            {/* This review summary keeps lifecycle and activation guidance visible before any platform decision is made. */}
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <div className="rounded-[1.5rem] border border-emerald-200 bg-emerald-50 p-5">
                <h3 className="text-sm font-semibold uppercase tracking-[0.12em] text-emerald-800">
                  Lifecycle summary
                </h3>
                <p className="mt-3 text-base font-semibold text-emerald-950">
                  {school.lifecycleState.statusHeadline}
                </p>
                <p className="mt-2 text-sm leading-6 text-emerald-900">
                  {school.lifecycleState.statusMessage}
                </p>
              </div>
              <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-5">
                <h3 className="text-sm font-semibold uppercase tracking-[0.12em] text-slate-700">
                  Activation summary
                </h3>
                <p className="mt-3 text-base font-semibold text-slate-950">
                  {school.activationState.statusHeadline}
                </p>
                <p className="mt-2 text-sm leading-6 text-slate-700">
                  {school.activationState.statusMessage}
                </p>
                <p className="mt-3 text-sm font-medium text-slate-900">
                  Next step: {school.activationState.nextAction}
                </p>
                {showResendApprovalEmail ? (
                  <Form method="post" action={`/schools/${school.id}`} className="mt-4">
                    {/* This hidden intent keeps the resend-approval action separate from lifecycle updates while reusing the same route action. */}
                    <input type="hidden" name="intent" value="resend-approval-email" />
                    <input type="hidden" name="action" value={selectedActionOption?.action ?? ''} />
                    <button
                      type="submit"
                      disabled={navigation.state === 'submitting'}
                      className="inline-flex items-center justify-center rounded-2xl border border-emerald-300 px-4 py-2 text-sm font-semibold text-emerald-800 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-70"
                    >
                      {pendingIntent === 'resend-approval-email'
                        ? 'Resending approval email...'
                        : 'Resend approval email'}
                    </button>
                  </Form>
                ) : null}
              </div>
            </div>
          </article>

          <article className="rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-[0_20px_60px_rgba(15,23,42,0.06)]">
            <h2 className="text-xl font-bold text-slate-950">Review decision</h2>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              Select one available lifecycle action, review the confirmation message, and attach any
              internal note that should remain with the platform audit trail.
            </p>

            {lifecycleOptions.length === 0 ? (
              <FeedbackAlert
                tone="info"
                title="No direct lifecycle action available"
                message="This school is currently view-only from the platform console."
                className="mt-6"
              />
            ) : (
              <div className="mt-6 space-y-6">
                {/* This action picker is fully driven by API-provided lifecycle metadata so the owner console stays in sync with backend validation. */}
                <div className="space-y-3">
                  {lifecycleOptions.map((option) => {
                    const isSelected = option.action === selectedActionOption?.action

                    return (
                      <button
                        key={option.action}
                        type="button"
                        onClick={() => setSelectedAction(option.action)}
                        className={`w-full rounded-[1.5rem] border px-4 py-4 text-left transition ${getActionToneClasses(option.tone, isSelected)}`}
                      >
                        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                          <div className="space-y-1">
                            <p className="text-sm font-semibold">{option.label}</p>
                            <p className="text-sm leading-6 opacity-90">{option.description}</p>
                          </div>
                          <span
                            className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] ${
                              isSelected ? 'bg-white/80 text-slate-950' : 'bg-white/60 text-slate-700'
                            }`}
                          >
                            {isSelected ? 'Selected' : 'Choose action'}
                          </span>
                        </div>
                      </button>
                    )
                  })}
                </div>

                {selectedActionOption ? (
                  <Form method="post" action={`/schools/${school.id}`} className="space-y-5">
                    <input type="hidden" name="intent" value="update-lifecycle" />
                    <input type="hidden" name="action" value={selectedActionOption.action} />

                    <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-5">
                      <p className="text-sm font-semibold uppercase tracking-[0.08em] text-slate-600">
                        Selected action
                      </p>
                      <p className="mt-3 text-base font-semibold text-slate-950">
                        {selectedActionOption.label}
                      </p>
                      <p className="mt-2 text-sm leading-6 text-slate-700">
                        {selectedActionOption.description}
                      </p>
                    </div>

                    <label className="block space-y-2">
                      <span className="text-sm font-medium text-slate-700">Decision note</span>
                      <textarea
                        name="note"
                        rows={5}
                        defaultValue={actionData?.note ?? ''}
                        placeholder={selectedActionOption.notePlaceholder}
                        className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-emerald-500"
                      />
                    </label>

                    {selectedActionOption.requiresNote ? (
                      <FeedbackAlert
                        tone="warning"
                        title="A review note is required"
                        message="This lifecycle action cannot be saved without an internal note explaining the decision."
                      />
                    ) : null}

                    {/* This confirmation panel makes the action impact explicit before the platform operator submits a decision. */}
                    <div className="rounded-[1.5rem] border border-slate-200 bg-white p-5">
                      <p className="text-sm font-semibold uppercase tracking-[0.08em] text-slate-600">
                        Confirmation
                      </p>
                      <p className="mt-3 text-base font-semibold text-slate-950">
                        {selectedActionOption.confirmationTitle}
                      </p>
                      <p className="mt-2 text-sm leading-6 text-slate-700">
                        {selectedActionOption.confirmationMessage}
                      </p>
                    </div>

                    <button
                      type="submit"
                      disabled={navigation.state === 'submitting'}
                      className={getActionButtonClasses(
                        selectedActionOption.tone,
                        navigation.state === 'submitting'
                      )}
                    >
                      {pendingAction === selectedActionOption.action
                        ? 'Saving...'
                        : selectedActionOption.label}
                    </button>
                  </Form>
                ) : null}
              </div>
            )}
          </article>
        </section>

        <section className="rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-[0_20px_60px_rgba(15,23,42,0.06)]">
          <h2 className="text-xl font-bold text-slate-950">Platform audit trail</h2>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            Every platform lifecycle action now records a dedicated audit event with actor context, while
            older legacy review notes remain visible so the full school history stays readable.
          </p>
          {school.auditTrail.length === 0 ? (
            <FeedbackAlert
              tone="info"
              title="No audit history yet"
              message="Lifecycle updates and any older legacy review entries will appear here once the first decision is recorded."
              className="mt-6"
            />
          ) : (
            <div className="mt-6 space-y-4">
              {school.auditTrail.map((entry) => (
                <div key={entry.id} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold uppercase tracking-[0.08em] text-slate-900">
                        {entry.action.replace('_', ' ')}
                      </p>
                      <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-emerald-900">
                        {formatAuditSource(entry.source)}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500">{formatDate(entry.createdAt)}</p>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-slate-700">{entry.note}</p>
                  {entry.schoolVisibleMessage ? (
                    <div className="mt-3 rounded-2xl bg-white px-4 py-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                        School-facing message
                      </p>
                      <p className="mt-1 text-sm leading-6 text-slate-700">
                        {entry.schoolVisibleMessage}
                      </p>
                    </div>
                  ) : null}
                  <p className="mt-2 text-xs text-slate-500">
                    Recorded by {entry.actorDisplayName || 'Platform operator'}
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  )
}
