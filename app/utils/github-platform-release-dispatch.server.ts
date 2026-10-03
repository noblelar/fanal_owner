import { createHash } from 'node:crypto'
import type { PlatformReleaseManifest } from '~/models/platform-release-candidate'
import {
  getGitHubCatalogInstallationToken,
  githubCatalogRequestHeaders,
} from '~/utils/github-app.server'
import {
  buildPlatformReleaseDispatch,
  createRecentDispatchGuard,
  findWorkflowRunByRequestId,
  githubDispatchFailure,
} from '~/utils/platform-release-dispatch.js'

export type PlatformReleaseDispatchOperation =
  | 'deploy-candidate'
  | 'verify-candidate'
  | 'promote-candidate'

const DUPLICATE_WINDOW_MS = 5 * 60 * 1000
const DISCOVERY_ATTEMPTS = 4
const DISCOVERY_DELAY_MS = 750

type WorkflowRun = {
  display_title?: string
  html_url?: string
  id?: number
}

type WorkflowRunsResponse = {
  workflow_runs?: WorkflowRun[]
}

const recentDispatches = createRecentDispatchGuard(DUPLICATE_WINDOW_MS)

export class PlatformReleaseDispatchError extends Error {
  status: number

  constructor(message: string, status = 503) {
    super(message)
    this.name = 'PlatformReleaseDispatchError'
    this.status = status
  }
}

export function isPlatformReleaseDispatchEnabled() {
  return process.env.GITHUB_CATALOG_DISPATCH_ENABLED?.trim().toLowerCase() === 'true'
}

function dispatchFingerprint(
  operation: PlatformReleaseDispatchOperation,
  manifest: PlatformReleaseManifest
) {
  return createHash('sha256')
    .update(`${operation}\n${JSON.stringify(manifest)}`)
    .digest('hex')
}

function reserveDispatch(
  operation: PlatformReleaseDispatchOperation,
  manifest: PlatformReleaseManifest,
  now = Date.now()
) {
  const key = dispatchFingerprint(operation, manifest)
  if (!recentDispatches.reserve(key, now)) {
    throw new PlatformReleaseDispatchError(
      `This exact ${operation} request was already queued recently. Wait for the existing workflow run instead of dispatching it again.`,
      409
    )
  }
  return key
}

function delay(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

async function discoverWorkflowRun(
  token: string,
  requestId: string,
  workflowUrl: string
) {
  const query = new URLSearchParams({
    branch: 'master',
    event: 'workflow_dispatch',
    per_page: '20',
  })
  const runsUrl = `https://api.github.com/repos/noblelar/fanal_owner/actions/workflows/platform-release.yml/runs?${query}`

  for (let attempt = 0; attempt < DISCOVERY_ATTEMPTS; attempt += 1) {
    if (attempt > 0) await delay(DISCOVERY_DELAY_MS)
    try {
      const response = await fetch(runsUrl, {
        headers: {
          ...githubCatalogRequestHeaders,
          Authorization: `Bearer ${token}`,
        },
        signal: AbortSignal.timeout(15_000),
      })
      if (!response.ok) continue
      const body = (await response.json()) as WorkflowRunsResponse
      const run = findWorkflowRunByRequestId(body.workflow_runs ?? [], requestId)
      if (run) {
        return { runId: run.id as number, runUrl: run.html_url as string }
      }
    } catch {
      // Dispatch succeeded. Discovery is best effort and must not cause a second dispatch.
    }
  }

  return { runId: null, runUrl: workflowUrl }
}

export async function dispatchPlatformReleaseOperation(options: {
  operation: PlatformReleaseDispatchOperation
  manifest: PlatformReleaseManifest
  requestId: string
}) {
  if (!isPlatformReleaseDispatchEnabled()) {
    throw new PlatformReleaseDispatchError(
      'Release dispatch is disabled on this Owner service. Set GITHUB_CATALOG_DISPATCH_ENABLED=true only after the production release path is ready.',
      503
    )
  }

  const dispatch = buildPlatformReleaseDispatch(
    options.operation,
    options.manifest,
    options.requestId
  )
  const reservationKey = reserveDispatch(options.operation, options.manifest)
  let token: string
  try {
    token = await getGitHubCatalogInstallationToken()
  } catch (error) {
    recentDispatches.release(reservationKey)
    throw error
  }

  let response: Response
  try {
    response = await fetch(dispatch.url, {
      method: 'POST',
      headers: {
        ...githubCatalogRequestHeaders,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(dispatch.body),
      signal: AbortSignal.timeout(20_000),
    })
  } catch {
    throw new PlatformReleaseDispatchError(
      'GitHub did not confirm the dispatch request. Check the Actions page before retrying because the workflow may still have been queued.',
      503
    )
  }

  if (!response.ok) {
    recentDispatches.release(reservationKey)
    const failure = githubDispatchFailure(response.status)
    throw new PlatformReleaseDispatchError(failure.message, failure.status)
  }

  const discovered = await discoverWorkflowRun(token, options.requestId, dispatch.workflowUrl)
  return {
    ...discovered,
    requestId: options.requestId,
  }
}
