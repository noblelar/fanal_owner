import { Form, useNavigation } from '@remix-run/react'
import { FeedbackAlert } from '~/components/feedback-alert'
import {
  releaseComponentNames,
  type PlatformReleaseCandidatePreview,
  type PlatformVersionOption,
  type ReadOnlyReleaseCatalog,
  type ReleaseComponentName,
} from '~/models/platform-release-candidate'

type PlatformReleaseComposerProps = {
  canDispatch: boolean
  catalog: ReadOnlyReleaseCatalog
  csrfToken: string
  dispatchEnabled: boolean
  platformVersionSelection: string
  preview: PlatformReleaseCandidatePreview | null
  previewRequested: boolean
  selections: Record<ReleaseComponentName, string>
  versionOptions: PlatformVersionOption[]
}

const componentLabels: Record<ReleaseComponentName, string> = {
  api: 'Fanal API',
  main: 'Fanal Main',
  owner: 'Fanal Owner',
}

function shortRevision(value: string) {
  return value.slice(0, 12)
}

function bumpBadgeClass(bump: string) {
  switch (bump) {
    case 'major':
      return 'bg-rose-100 text-rose-900'
    case 'minor':
      return 'bg-sky-100 text-sky-900'
    case 'patch':
      return 'bg-emerald-100 text-emerald-900'
    default:
      return 'bg-slate-100 text-slate-700'
  }
}

export function PlatformReleaseComposer({
  canDispatch,
  catalog,
  csrfToken,
  dispatchEnabled,
  platformVersionSelection,
  preview,
  previewRequested,
  selections,
  versionOptions,
}: PlatformReleaseComposerProps) {
  const compositionBlocked = Boolean(
    catalog.stableError || catalog.candidateError || catalog.activeCandidate
  )

  return (
    <section
      className="rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-[0_20px_60px_rgba(15,23,42,0.06)]"
      aria-labelledby="candidate-composer-heading"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">
            Phase 5
          </p>
          <h2 id="candidate-composer-heading" className="mt-2 text-2xl font-black tracking-tight text-slate-950">
            Compose a release candidate
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            Select trusted component builds, preview a validated platform manifest, and submit it to the protected deployment workflow when every guard passes.
          </p>
        </div>
        <span className="rounded-full bg-sky-100 px-3 py-1 text-xs font-bold text-sky-950">
          Lifecycle aware
        </span>
      </div>

      {catalog.activeCandidate ? (
        <FeedbackAlert
          tone="info"
          title="Candidate composition paused"
          message={`Platform ${catalog.activeCandidate.manifest.platformVersion} is currently ${catalog.activeCandidate.status}. Complete its verification and promotion lifecycle before composing another candidate.`}
          className="mt-5"
        />
      ) : catalog.candidateError ? (
        <FeedbackAlert
          tone="warning"
          title="Candidate composition paused"
          message={catalog.candidateError}
          className="mt-5"
        />
      ) : catalog.stable ? (
        <div className="mt-5 rounded-[1.4rem] border border-emerald-200 bg-emerald-50/70 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-800">
                Verified stable platform
              </p>
              <p className="mt-1 text-2xl font-black text-emerald-950">
                {catalog.stable.manifest.platformVersion}
              </p>
            </div>
            <a
              href={catalog.stable.workflowRunUrl}
              target="_blank"
              rel="noreferrer"
              className="text-sm font-bold text-emerald-900 underline decoration-emerald-400 underline-offset-4"
            >
              Promotion evidence ↗
            </a>
          </div>
        </div>
      ) : catalog.stableError ? (
        <FeedbackAlert
          tone="warning"
          title="Candidate composition paused"
          message={catalog.stableError}
          className="mt-5"
        />
      ) : (
        <FeedbackAlert
          tone="info"
          title="Initial coordinated release"
          message="No promoted platform manifest was found. A complete three-component selection will start at platform version 1.0.0."
          className="mt-5"
        />
      )}

      <Form method="get" className="mt-6 space-y-5">
        <input type="hidden" name="preview" value="1" />
        <div className="grid gap-5 xl:grid-cols-3">
          {releaseComponentNames.map((component) => {
            const componentCatalog = catalog.components[component]
            const stableComponent = catalog.stable?.manifest.components[component]
            return (
              <label key={component} className="space-y-2">
                <span className="text-sm font-bold text-slate-800">
                  {componentLabels[component]}
                </span>
                <select
                  key={selections[component]}
                  name={component}
                  defaultValue={selections[component]}
                  disabled={compositionBlocked}
                  className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-emerald-500 disabled:cursor-not-allowed disabled:bg-slate-100"
                >
                  {!stableComponent && componentCatalog.candidates.length === 0 ? (
                    <option value="">No trusted builds available</option>
                  ) : null}
                  {stableComponent ? (
                    <option value="stable">
                      Keep stable {stableComponent.version} · {shortRevision(stableComponent.revision)}
                    </option>
                  ) : null}
                  {componentCatalog.candidates.map((candidate) => (
                    <option
                      key={`${candidate.workflowRunId}-${candidate.workflowRunAttempt}`}
                      value={`artifact:${candidate.artifactId}`}
                    >
                      {candidate.version} · {shortRevision(candidate.revision)} · run #{candidate.workflowRunId}
                    </option>
                  ))}
                </select>
                <span className="block text-xs leading-5 text-slate-500">
                  Values come from validated GitHub artifacts; images and revisions cannot be typed manually.
                </span>
              </label>
            )
          })}
        </div>

        <label className="block max-w-xl space-y-2">
          <span className="text-sm font-bold text-slate-800">Platform version</span>
          <select
            key={platformVersionSelection}
            name="platformVersion"
            defaultValue={platformVersionSelection}
            disabled={compositionBlocked}
            className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-emerald-500 disabled:cursor-not-allowed disabled:bg-slate-100"
          >
            <option value="auto">Automatic — use the required safe increment</option>
            {versionOptions.map((option) => (
              <option key={option.version} value={option.version}>
                {option.label}: {option.version}
              </option>
            ))}
          </select>
          <span className="block text-xs leading-5 text-slate-500">
            The server rejects a platform increment smaller than the largest selected component change.
          </span>
        </label>

        <button
          type="submit"
          disabled={compositionBlocked}
          className="inline-flex items-center justify-center rounded-2xl bg-emerald-900 px-5 py-3 text-sm font-bold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          Preview candidate
        </button>
      </Form>

      {previewRequested && !preview && compositionBlocked ? null : preview ? (
        <CandidatePreview
          canDispatch={canDispatch}
          csrfToken={csrfToken}
          dispatchEnabled={dispatchEnabled}
          platformVersionSelection={platformVersionSelection}
          preview={preview}
          selections={selections}
        />
      ) : null}
    </section>
  )
}

function CandidatePreview({
  canDispatch,
  csrfToken,
  dispatchEnabled,
  platformVersionSelection,
  preview,
  selections,
}: {
  canDispatch: boolean
  csrfToken: string
  dispatchEnabled: boolean
  platformVersionSelection: string
  preview: PlatformReleaseCandidatePreview
  selections: Record<ReleaseComponentName, string>
}) {
  const isValid = preview.issues.length === 0 && preview.manifest
  const navigation = useNavigation()
  const isDispatching =
    navigation.state === 'submitting' &&
    navigation.formData?.get('_intent') === 'deploy-candidate'

  return (
    <div className="mt-8 border-t border-slate-200 pt-6" aria-live="polite">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
            Deterministic preview
          </p>
          <h3 className="mt-2 text-xl font-black text-slate-950">
            Platform {preview.selectedPlatformVersion}
          </h3>
          <p className="mt-1 text-sm text-slate-600">
            Recommended: {preview.recommendedPlatformVersion} ({preview.recommendedBump})
          </p>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-bold ${isValid ? 'bg-emerald-100 text-emerald-900' : 'bg-rose-100 text-rose-900'}`}>
          {isValid ? 'Valid preview' : 'Blocked'}
        </span>
      </div>

      {preview.issues.length > 0 ? (
        <div className="mt-5 rounded-[1.4rem] border border-rose-200 bg-rose-50 p-4 text-rose-950">
          <p className="font-bold">Resolve these release blockers</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
            {preview.issues.map((issue) => (
              <li key={`${issue.code}-${issue.component || 'platform'}`}>{issue.message}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {preview.warnings.length > 0 ? (
        <div className="mt-5 rounded-[1.4rem] border border-amber-200 bg-amber-50 p-4 text-amber-950">
          <p className="font-bold">Review these warnings</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
            {preview.warnings.map((warning) => (
              <li key={`${warning.code}-${warning.component || 'platform'}`}>{warning.message}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mt-5 grid gap-4 md:grid-cols-3">
        {releaseComponentNames.map((component) => {
          const change = preview.changes[component]
          return (
            <article key={component} className="rounded-[1.3rem] border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="font-bold text-slate-900">{componentLabels[component]}</p>
                <span className={`rounded-full px-3 py-1 text-xs font-bold ${bumpBadgeClass(change.bump)}`}>
                  {change.bump}
                </span>
              </div>
              <p className="mt-3 text-sm text-slate-600">
                {change.fromVersion || 'Initial'} <span aria-hidden="true">→</span>{' '}
                <span className="font-bold text-slate-900">{change.toVersion}</span>
              </p>
            </article>
          )
        })}
      </div>

      {preview.manifest ? (
        <div className="mt-5 overflow-hidden rounded-[1.4rem] border border-slate-200">
          <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
            <p className="font-bold text-slate-900">Generated platform manifest</p>
            <p className="mt-1 text-xs text-slate-500">Exact immutable values; no deployment has occurred.</p>
          </div>
          <div className="divide-y divide-slate-100">
            {releaseComponentNames.map((component) => {
              const value = preview.manifest!.components[component]
              return (
                <div key={component} className="grid gap-2 px-4 py-4 text-sm md:grid-cols-[7rem_7rem_minmax(0,1fr)]">
                  <span className="font-bold text-slate-900">{componentLabels[component]}</span>
                  <span className="text-slate-700">{value.version}</span>
                  <div className="min-w-0 space-y-1 font-mono text-xs text-slate-600">
                    <p className="break-all">{value.revision}</p>
                    <p className="break-all">{value.image}</p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ) : null}

      {isValid ? (
        <div className="mt-6 rounded-[1.4rem] border border-slate-200 bg-slate-50 p-5">
          <p className="font-black text-slate-950">Deploy this candidate</p>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            The server will reload the GitHub catalog, re-resolve every artifact ID, regenerate this manifest, and reject stale or altered values. A successful request still waits for approval in <code>platform_release_env</code>.
          </p>

          {!canDispatch ? (
            <FeedbackAlert
              tone="warning"
              title="Owner authorization required"
              message="PLATFORM_ADMIN users may inspect releases, but only a PLATFORM_OWNER can dispatch a candidate."
              className="mt-4"
            />
          ) : !dispatchEnabled ? (
            <FeedbackAlert
              tone="warning"
              title="Dispatch is disabled"
              message="Set GITHUB_CATALOG_DISPATCH_ENABLED=true on the Owner service only after the production GitHub App permission and deployment path are ready."
              className="mt-4"
            />
          ) : (
            <Form method="post" className="mt-5 space-y-4">
              <input type="hidden" name="_intent" value="deploy-candidate" />
              <input type="hidden" name="_csrf" value={csrfToken} />
              <input type="hidden" name="api" value={selections.api} />
              <input type="hidden" name="main" value={selections.main} />
              <input type="hidden" name="owner" value={selections.owner} />
              <input
                type="hidden"
                name="platformVersion"
                value={platformVersionSelection}
              />
              <label className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
                <input
                  type="checkbox"
                  name="confirmOperation"
                  value="deploy-candidate"
                  required
                  className="mt-1 h-4 w-4 accent-emerald-900"
                />
                <span>
                  I confirm that platform {preview.selectedPlatformVersion} should be queued for candidate deployment using these exact immutable component builds.
                </span>
              </label>
              <button
                type="submit"
                disabled={isDispatching}
                className="inline-flex items-center justify-center rounded-2xl bg-emerald-900 px-5 py-3 text-sm font-bold text-white transition hover:bg-emerald-800 disabled:cursor-wait disabled:bg-slate-400"
              >
                {isDispatching ? 'Queueing candidate…' : 'Queue deploy candidate'}
              </button>
            </Form>
          )}
        </div>
      ) : null}
    </div>
  )
}
