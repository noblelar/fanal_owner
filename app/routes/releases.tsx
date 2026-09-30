import type { LoaderFunctionArgs, MetaFunction } from '@remix-run/node'
import { json } from '@remix-run/node'
import { Link, useLoaderData } from '@remix-run/react'
import { FeedbackAlert } from '~/components/feedback-alert'
import { PlatformShell } from '~/components/platform-shell'
import {
  releaseComponentNames,
  type ComponentReleaseCandidate,
  type PlatformReleaseHistoryItem,
  type ReadOnlyReleaseCatalog,
} from '~/models/platform-release-candidate'
import { getReadOnlyReleaseCatalog } from '~/utils/github-release-catalog.server'
import { requirePlatformAuthState } from '~/utils/session.server'
import { buildFanalMeta } from '~/utils/site-meta'

type LoaderData = {
  catalog: ReadOnlyReleaseCatalog | null
  error?: string
  viewerRoles: string[]
}

const releaseViewerRoles = new Set(['PLATFORM_OWNER', 'PLATFORM_ADMIN'])

export const meta: MetaFunction = () => buildFanalMeta('Release Center')

export async function loader({ request }: LoaderFunctionArgs) {
  const authState = await requirePlatformAuthState(request)
  if (!authState.user.roles.some((role) => releaseViewerRoles.has(role))) {
    throw new Response('You are not authorized to view platform releases.', { status: 403 })
  }

  const forceRefresh = new URL(request.url).searchParams.get('refresh') === '1'
  try {
    const catalog = await getReadOnlyReleaseCatalog({ forceRefresh })
    return json<LoaderData>({
      catalog,
      viewerRoles: authState.user.roles,
    })
  } catch (error) {
    return json<LoaderData>({
      catalog: null,
      error:
        error instanceof Error
          ? error.message
          : 'The GitHub release catalog is currently unavailable.',
      viewerRoles: authState.user.roles,
    })
  }
}

const utcDateTime = new Intl.DateTimeFormat('en-GB', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'UTC',
})

function formatDateTime(value: string | null | undefined) {
  if (!value) return 'Not available'
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) ? `${utcDateTime.format(timestamp)} UTC` : 'Not available'
}

function shortRevision(revision: string) {
  return revision.slice(0, 12)
}

function imageDigest(image: string) {
  return image.split('@')[1] || image
}

function historyStatus(item: PlatformReleaseHistoryItem) {
  return item.conclusion || item.status
}

function historyStatusClass(item: PlatformReleaseHistoryItem) {
  switch (historyStatus(item)) {
    case 'success':
      return 'bg-emerald-100 text-emerald-900'
    case 'failure':
    case 'cancelled':
    case 'timed_out':
      return 'bg-rose-100 text-rose-900'
    case 'in_progress':
    case 'queued':
    case 'waiting':
      return 'bg-amber-100 text-amber-900'
    default:
      return 'bg-slate-100 text-slate-800'
  }
}

function CandidateCard({ candidate }: { candidate: ComponentReleaseCandidate }) {
  return (
    <article className="rounded-[1.4rem] border border-slate-200 bg-slate-50/70 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
            Version
          </p>
          <p className="mt-1 text-xl font-black tracking-tight text-slate-950">
            {candidate.version}
          </p>
        </div>
        <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-900">
          Successful master build
        </span>
      </div>

      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="font-medium text-slate-500">Revision</dt>
          <dd className="mt-1 font-mono text-xs text-slate-900" title={candidate.revision}>
            {shortRevision(candidate.revision)}
          </dd>
        </div>
        <div>
          <dt className="font-medium text-slate-500">Published</dt>
          <dd className="mt-1 text-slate-900">{formatDateTime(candidate.createdAt)}</dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="font-medium text-slate-500">Immutable image digest</dt>
          <dd
            className="mt-1 break-all font-mono text-xs leading-5 text-slate-900"
            title={candidate.image}
          >
            {imageDigest(candidate.image)}
          </dd>
        </div>
        <div>
          <dt className="font-medium text-slate-500">Artifact expires</dt>
          <dd className="mt-1 text-slate-900">
            {formatDateTime(candidate.artifactExpiresAt)}
          </dd>
        </div>
        <div>
          <dt className="font-medium text-slate-500">Workflow attempt</dt>
          <dd className="mt-1 text-slate-900">#{candidate.workflowRunAttempt}</dd>
        </div>
      </dl>

      <a
        href={candidate.workflowRunUrl}
        target="_blank"
        rel="noreferrer"
        className="mt-4 inline-flex items-center text-sm font-bold text-emerald-800 underline decoration-emerald-300 underline-offset-4 hover:text-emerald-950"
      >
        Open successful build
        <span aria-hidden="true" className="ml-1">↗</span>
      </a>
    </article>
  )
}

export default function ReleasesRoute() {
  const { catalog, error, viewerRoles } = useLoaderData<typeof loader>()
  const componentCatalogs = catalog
    ? releaseComponentNames.map((component) => catalog.components[component])
    : []
  const candidateCount = componentCatalogs.reduce(
    (total, component) => total + component.candidates.length,
    0
  )
  const availableComponentCount = componentCatalogs.filter(
    (component) => component.candidates.length > 0
  ).length

  return (
    <PlatformShell
      eyebrow="Release governance"
      title="Release Center"
      description="Inspect trusted API, Main, and Owner builds before composing a coordinated platform release."
      actions={
        <Link
          to="/releases?refresh=1"
          reloadDocument
          className="inline-flex items-center justify-center rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-emerald-400 hover:text-emerald-800"
        >
          Refresh catalog
        </Link>
      }
    >
      <div className="space-y-8">
        <FeedbackAlert
          tone="info"
          title="Read-only release catalog"
          message="Phase 2 does not deploy, verify, promote, or roll back software. Candidate selection and release controls will be introduced in later phases."
        />

        {error ? (
          <FeedbackAlert
            tone="warning"
            title="Release catalog unavailable"
            message={error}
          />
        ) : null}

        {catalog ? (
          <>
            <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Release catalog summary">
              <SummaryCard label="Available components" value={`${availableComponentCount}/3`} />
              <SummaryCard label="Trusted builds" value={String(candidateCount)} />
              <SummaryCard label="Platform runs" value={String(catalog.history.length)} />
              <SummaryCard label="Last refreshed" value={formatDateTime(catalog.refreshedAt)} compact />
            </section>

            <section className="space-y-5" aria-labelledby="component-builds-heading">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">
                  Successful build artifacts
                </p>
                <h2 id="component-builds-heading" className="mt-2 text-2xl font-black tracking-tight text-slate-950">
                  Available component versions
                </h2>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
                  Every entry below was produced by a successful push to the component&apos;s master branch and passed the immutable metadata contract.
                </p>
              </div>

              <div className="grid gap-6 xl:grid-cols-3">
                {componentCatalogs.map((component) => (
                  <section
                    key={component.component}
                    className="rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-[0_20px_60px_rgba(15,23,42,0.06)]"
                    aria-labelledby={`${component.component}-catalog-heading`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h3 id={`${component.component}-catalog-heading`} className="text-xl font-black text-slate-950">
                          {component.label}
                        </h3>
                        <p className="mt-1 text-xs text-slate-500">{component.repository}</p>
                      </div>
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">
                        {component.candidates.length} build{component.candidates.length === 1 ? '' : 's'}
                      </span>
                    </div>

                    {component.error ? (
                      <FeedbackAlert
                        tone="warning"
                        title={`${component.label} unavailable`}
                        message={component.error}
                        className="mt-4"
                      />
                    ) : null}

                    {component.skippedArtifactCount > 0 ? (
                      <p className="mt-4 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-950">
                        {component.skippedArtifactCount} artifact{component.skippedArtifactCount === 1 ? ' was' : 's were'} excluded because validation failed.
                      </p>
                    ) : null}

                    <div className="mt-5 space-y-4">
                      {component.candidates.length > 0 ? (
                        component.candidates.map((candidate) => (
                          <CandidateCard
                            key={`${candidate.workflowRunId}-${candidate.workflowRunAttempt}`}
                            candidate={candidate}
                          />
                        ))
                      ) : (
                        <div className="rounded-[1.4rem] border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center">
                          <p className="font-semibold text-slate-800">No selectable builds yet</p>
                          <p className="mt-2 text-sm leading-6 text-slate-600">
                            Merge the Phase 1 workflow into master and complete one successful build to publish this component&apos;s first metadata artifact.
                          </p>
                        </div>
                      )}
                    </div>
                  </section>
                ))}
              </div>
            </section>

            <section
              className="rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-[0_20px_60px_rgba(15,23,42,0.06)]"
              aria-labelledby="release-history-heading"
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">
                    GitHub Actions evidence
                  </p>
                  <h2 id="release-history-heading" className="mt-2 text-2xl font-black tracking-tight text-slate-950">
                    Recent platform operations
                  </h2>
                </div>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">
                  {catalog.history.length} runs
                </span>
              </div>

              {catalog.historyError ? (
                <FeedbackAlert
                  tone="warning"
                  title="Platform history unavailable"
                  message={catalog.historyError}
                  className="mt-5"
                />
              ) : null}

              <div className="mt-5 overflow-x-auto">
                {catalog.history.length > 0 ? (
                  <table className="min-w-full border-separate border-spacing-0 text-left text-sm">
                    <thead>
                      <tr className="text-xs uppercase tracking-[0.14em] text-slate-500">
                        <th className="border-b border-slate-200 px-3 py-3 font-semibold">Operation</th>
                        <th className="border-b border-slate-200 px-3 py-3 font-semibold">Version</th>
                        <th className="border-b border-slate-200 px-3 py-3 font-semibold">Status</th>
                        <th className="border-b border-slate-200 px-3 py-3 font-semibold">Operator</th>
                        <th className="border-b border-slate-200 px-3 py-3 font-semibold">Started</th>
                        <th className="border-b border-slate-200 px-3 py-3 font-semibold">Evidence</th>
                      </tr>
                    </thead>
                    <tbody>
                      {catalog.history.map((item) => (
                        <tr key={item.runId}>
                          <td className="border-b border-slate-100 px-3 py-4 font-semibold text-slate-900">
                            {item.operation || item.displayTitle}
                          </td>
                          <td className="border-b border-slate-100 px-3 py-4 text-slate-700">
                            {item.platformVersion || '—'}
                          </td>
                          <td className="border-b border-slate-100 px-3 py-4">
                            <span className={`rounded-full px-3 py-1 text-xs font-bold ${historyStatusClass(item)}`}>
                              {historyStatus(item)}
                            </span>
                          </td>
                          <td className="border-b border-slate-100 px-3 py-4 text-slate-700">
                            {item.actor}
                          </td>
                          <td className="border-b border-slate-100 px-3 py-4 text-slate-700">
                            {formatDateTime(item.createdAt)}
                          </td>
                          <td className="border-b border-slate-100 px-3 py-4">
                            <a
                              href={item.runUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="font-bold text-emerald-800 underline decoration-emerald-300 underline-offset-4 hover:text-emerald-950"
                            >
                              Run #{item.runNumber}
                              <span aria-hidden="true" className="ml-1">↗</span>
                            </a>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="rounded-[1.4rem] border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center">
                    <p className="font-semibold text-slate-800">No platform operations found</p>
                    <p className="mt-2 text-sm text-slate-600">
                      Coordinated platform workflow runs will appear here when available.
                    </p>
                  </div>
                )}
              </div>
            </section>

            <p className="text-xs text-slate-500">
              Access: {viewerRoles.join(', ')}. Catalog data is cached briefly to protect GitHub API limits.
            </p>
          </>
        ) : null}
      </div>
    </PlatformShell>
  )
}

function SummaryCard({ label, value, compact = false }: { label: string; value: string; compact?: boolean }) {
  return (
    <article className="rounded-[1.5rem] border border-slate-200 bg-white p-5 shadow-[0_16px_40px_rgba(15,23,42,0.05)]">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{label}</p>
      <p className={`mt-2 font-black tracking-tight text-slate-950 ${compact ? 'text-sm leading-6' : 'text-3xl'}`}>
        {value}
      </p>
    </article>
  )
}
