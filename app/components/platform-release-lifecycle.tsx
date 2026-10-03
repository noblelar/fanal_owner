import { Form, useNavigation } from '@remix-run/react'
import { FeedbackAlert } from '~/components/feedback-alert'
import {
  releaseComponentNames,
  type ActivePlatformCandidate,
  type ReleaseComponentName,
} from '~/models/platform-release-candidate'

type PlatformReleaseLifecycleProps = {
  candidate: ActivePlatformCandidate | null
  candidateError?: string
  canDispatch: boolean
  csrfToken: string
  dispatchEnabled: boolean
}

const componentLabels: Record<ReleaseComponentName, string> = {
  api: 'Fanal API',
  main: 'Fanal Main',
  owner: 'Fanal Owner',
}

function shortRevision(value: string) {
  return value.slice(0, 12)
}

export function PlatformReleaseLifecycle({
  candidate,
  candidateError,
  canDispatch,
  csrfToken,
  dispatchEnabled,
}: PlatformReleaseLifecycleProps) {
  const navigation = useNavigation()
  const submittingIntent = navigation.formData?.get('_intent')
  const isSubmitting = navigation.state === 'submitting'

  if (!candidate && !candidateError) return null

  return (
    <section
      className="rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-[0_20px_60px_rgba(15,23,42,0.06)]"
      aria-labelledby="candidate-lifecycle-heading"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">
            Phase 5
          </p>
          <h2 id="candidate-lifecycle-heading" className="mt-2 text-2xl font-black tracking-tight text-slate-950">
            Candidate lifecycle
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            Verification and promotion reuse the exact manifest preserved by the successful deployment workflow. No image, version, or revision is accepted from the browser.
          </p>
        </div>
        {candidate ? (
          <span className={`rounded-full px-3 py-1 text-xs font-bold ${candidate.status === 'verified' ? 'bg-emerald-100 text-emerald-900' : 'bg-amber-100 text-amber-900'}`}>
            {candidate.status === 'verified' ? 'Verified · ready to promote' : 'Deployed · verification required'}
          </span>
        ) : null}
      </div>

      {candidateError ? (
        <FeedbackAlert
          tone="warning"
          title="Candidate lifecycle blocked"
          message={candidateError}
          className="mt-5"
        />
      ) : null}

      {candidate ? (
        <>
          <div className="mt-5 rounded-[1.4rem] border border-slate-200 bg-slate-50 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                  Active platform candidate
                </p>
                <p className="mt-1 text-2xl font-black text-slate-950">
                  {candidate.manifest.platformVersion}
                </p>
              </div>
              <div className="flex flex-wrap gap-3 text-sm font-bold">
                <a
                  href={candidate.deployment.workflowRunUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-emerald-800 underline decoration-emerald-300 underline-offset-4"
                >
                  Deployment evidence ↗
                </a>
                {candidate.verification ? (
                  <a
                    href={candidate.verification.workflowRunUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-emerald-800 underline decoration-emerald-300 underline-offset-4"
                  >
                    Verification evidence ↗
                  </a>
                ) : null}
              </div>
            </div>

            <div className="mt-5 divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200 bg-white">
              {releaseComponentNames.map((component) => {
                const value = candidate.manifest.components[component]
                return (
                  <div key={component} className="grid gap-2 px-4 py-4 text-sm md:grid-cols-[7rem_6rem_minmax(0,1fr)]">
                    <span className="font-bold text-slate-900">{componentLabels[component]}</span>
                    <span className="text-slate-700">{value.version}</span>
                    <div className="min-w-0 space-y-1 font-mono text-xs text-slate-600">
                      <p title={value.revision}>{shortRevision(value.revision)}</p>
                      <p className="break-all">{value.image}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {!canDispatch ? (
            <FeedbackAlert
              tone="warning"
              title="Owner authorization required"
              message="Only a PLATFORM_OWNER can verify or promote this candidate."
              className="mt-5"
            />
          ) : !dispatchEnabled ? (
            <FeedbackAlert
              tone="warning"
              title="Dispatch is disabled"
              message="Candidate lifecycle actions remain unavailable until production dispatch is enabled."
              className="mt-5"
            />
          ) : candidateError ? null : (
            <LifecycleActionForm
              candidate={candidate}
              csrfToken={csrfToken}
              isSubmitting={isSubmitting}
              submittingIntent={submittingIntent}
            />
          )}
        </>
      ) : null}
    </section>
  )
}

function LifecycleActionForm({
  candidate,
  csrfToken,
  isSubmitting,
  submittingIntent,
}: {
  candidate: ActivePlatformCandidate
  csrfToken: string
  isSubmitting: boolean
  submittingIntent: FormDataEntryValue | null | undefined
}) {
  const operation = candidate.status === 'verified' ? 'promote-candidate' : 'verify-candidate'
  const isPromoting = operation === 'promote-candidate'
  const busy = isSubmitting && submittingIntent === operation

  return (
    <Form method="post" className="mt-5 space-y-4">
      <input type="hidden" name="_intent" value={operation} />
      <input type="hidden" name="_csrf" value={csrfToken} />
      <input
        type="hidden"
        name="candidateRunId"
        value={candidate.deployment.workflowRunId}
      />
      <label className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
        <input
          type="checkbox"
          name="confirmOperation"
          value={operation}
          required
          className="mt-1 h-4 w-4 accent-emerald-900"
        />
        <span>
          {isPromoting
            ? `I confirm that the verified platform ${candidate.manifest.platformVersion} candidate should become the stable release.`
            : `I confirm that the deployed platform ${candidate.manifest.platformVersion} candidate should be re-verified using its preserved manifest.`}
        </span>
      </label>
      <button
        type="submit"
        disabled={isSubmitting}
        className="inline-flex items-center justify-center rounded-2xl bg-emerald-900 px-5 py-3 text-sm font-bold text-white transition hover:bg-emerald-800 disabled:cursor-wait disabled:bg-slate-400"
      >
        {busy
          ? isPromoting
            ? 'Queueing promotion…'
            : 'Queueing verification…'
          : isPromoting
            ? 'Queue promote candidate'
            : 'Queue verify candidate'}
      </button>
      <p className="text-xs leading-5 text-slate-500">
        GitHub&apos;s protected <code>platform_release_env</code> approval remains required before the server command runs.
      </p>
    </Form>
  )
}
