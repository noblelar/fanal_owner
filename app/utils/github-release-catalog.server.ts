import type {
  ComponentReleaseCandidate,
  ComponentReleaseCatalog,
  PlatformReleaseHistoryItem,
  ReadOnlyReleaseCatalog,
  ReleaseComponentName,
  StablePlatformRelease,
} from '~/models/platform-release-candidate'
import {
  parseComponentReleaseArtifact,
  parsePlatformReleaseArtifact,
} from '~/utils/component-release-artifact.server.js'
import {
  getGitHubCatalogInstallationToken,
  githubCatalogRequestHeaders,
} from '~/utils/github-app.server'

const GITHUB_API_URL = 'https://api.github.com'
const DEFAULT_CACHE_SECONDS = 60
const DEFAULT_MAX_CANDIDATES = 10
const MAX_WORKFLOW_RUNS = 50
const MAX_REPOSITORY_ARTIFACTS = 100

const componentConfigurations: Record<
  ReleaseComponentName,
  { label: string; repository: string }
> = {
  api: { label: 'Fanal API', repository: 'noblelar/fanalAPI' },
  main: { label: 'Fanal Main', repository: 'noblelar/fanal_main' },
  owner: { label: 'Fanal Owner', repository: 'noblelar/fanal_owner' },
}

type GitHubWorkflowRun = {
  actor?: { login?: string }
  conclusion: string | null
  created_at: string
  display_title?: string
  event: string
  head_branch: string | null
  head_sha: string
  html_url: string
  id: number
  inputs?: Record<string, boolean | number | string | null>
  run_attempt: number
  run_number: number
  status: string
  updated_at: string
}

type GitHubWorkflowRunsResponse = {
  workflow_runs: GitHubWorkflowRun[]
}

type GitHubArtifact = {
  archive_download_url: string
  created_at: string
  expired: boolean
  expires_at: string | null
  id: number
  name: string
  workflow_run?: {
    head_branch: string | null
    head_sha: string
    id: number
  } | null
}

type GitHubArtifactsResponse = {
  artifacts: GitHubArtifact[]
}

type CachedCatalog = {
  expiresAt: number
  value: ReadOnlyReleaseCatalog
}

let cachedCatalog: CachedCatalog | null = null
let inFlightCatalog: Promise<ReadOnlyReleaseCatalog> | null = null

function boundedInteger(value: string | undefined, fallback: number, minimum: number, maximum: number) {
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed >= minimum && parsed <= maximum
    ? parsed
    : fallback
}

function getCacheDurationMs() {
  return (
    boundedInteger(
      process.env.GITHUB_CATALOG_CACHE_SECONDS,
      DEFAULT_CACHE_SECONDS,
      15,
      300
    ) * 1000
  )
}

function getMaximumCandidates() {
  return boundedInteger(
    process.env.GITHUB_CATALOG_MAX_CANDIDATES,
    DEFAULT_MAX_CANDIDATES,
    1,
    20
  )
}

function repositoryApiPath(repository: string, suffix: string) {
  const [owner, name] = repository.split('/')
  if (!owner || !name) throw new Error('A configured GitHub repository is invalid.')
  return `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}${suffix}`
}

async function githubResponse(pathOrUrl: string, token: string) {
  const url = pathOrUrl.startsWith('https://') ? pathOrUrl : `${GITHUB_API_URL}${pathOrUrl}`
  let response: Response
  try {
    response = await fetch(url, {
      headers: {
        ...githubCatalogRequestHeaders,
        Authorization: `Bearer ${token}`,
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(20_000),
    })
  } catch {
    throw new Error('GitHub could not be reached while loading the release catalog.')
  }

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new Error('The GitHub Catalog App is not authorized to read release artifacts.')
    }
    if (response.status === 404) {
      throw new Error('A configured GitHub repository or workflow could not be found.')
    }
    if (response.status === 429) {
      throw new Error('GitHub temporarily rate-limited the release catalog. Please retry shortly.')
    }
    throw new Error(`GitHub release-catalog request failed with HTTP ${response.status}.`)
  }

  return response
}

async function githubJson<T>(path: string, token: string) {
  const response = await githubResponse(path, token)
  return (await response.json()) as T
}

async function githubBytes(url: string, token: string) {
  const response = await githubResponse(url, token)
  return new Uint8Array(await response.arrayBuffer())
}

async function listSuccessfulBuildRuns(repository: string, token: string) {
  const query = new URLSearchParams({
    branch: 'master',
    event: 'push',
    per_page: String(MAX_WORKFLOW_RUNS),
    status: 'success',
  })
  const response = await githubJson<GitHubWorkflowRunsResponse>(
    repositoryApiPath(repository, `/actions/workflows/aws.yml/runs?${query.toString()}`),
    token
  )

  return new Map(
    response.workflow_runs
      .filter(
        (run) =>
          run.conclusion === 'success' &&
          run.event === 'push' &&
          run.head_branch === 'master' &&
          /^[0-9a-f]{40}$/.test(run.head_sha)
      )
      .map((run) => [run.id, run])
  )
}

async function listRepositoryArtifacts(repository: string, token: string) {
  const query = new URLSearchParams({ per_page: String(MAX_REPOSITORY_ARTIFACTS) })
  const response = await githubJson<GitHubArtifactsResponse>(
    repositoryApiPath(repository, `/actions/artifacts?${query.toString()}`),
    token
  )
  return response.artifacts
}

async function loadComponentCatalog(component: ReleaseComponentName, token: string) {
  const configuration = componentConfigurations[component]
  const [successfulRuns, artifacts] = await Promise.all([
    listSuccessfulBuildRuns(configuration.repository, token),
    listRepositoryArtifacts(configuration.repository, token),
  ])
  const maximumCandidates = getMaximumCandidates()
  const matchingArtifacts = artifacts
    .filter(
      (artifact) =>
        !artifact.expired &&
        artifact.name.startsWith(`component-release-${component}-`) &&
        artifact.workflow_run?.id &&
        successfulRuns.has(artifact.workflow_run.id)
    )
    .sort((left, right) => Date.parse(right.created_at) - Date.parse(left.created_at))
    .slice(0, maximumCandidates * 2)

  const candidates: ComponentReleaseCandidate[] = []
  let skippedArtifactCount = 0

  for (const artifact of matchingArtifacts) {
    if (candidates.length >= maximumCandidates) break
    const run = successfulRuns.get(artifact.workflow_run!.id)
    if (!run) continue

    try {
      const archive = await githubBytes(artifact.archive_download_url, token)
      const metadata = parseComponentReleaseArtifact(archive, {
        artifactName: artifact.name,
        component,
        headBranch: run.head_branch,
        headSha: run.head_sha,
        repository: configuration.repository,
        workflowRunId: run.id,
        workflowRunUrl: run.html_url,
      })

      candidates.push({
        artifactId: artifact.id,
        artifactName: artifact.name,
        artifactExpiresAt: artifact.expires_at,
        branch: 'master',
        component,
        createdAt: metadata.created_at,
        image: metadata.image,
        repository: metadata.repository,
        revision: metadata.revision,
        version: metadata.version,
        workflowRunAttempt: metadata.workflow_run_attempt,
        workflowRunId: metadata.workflow_run_id,
        workflowRunUrl: metadata.workflow_run_url,
      })
    } catch {
      skippedArtifactCount += 1
    }
  }

  return {
    candidates,
    component,
    label: configuration.label,
    repository: configuration.repository,
    skippedArtifactCount,
  } satisfies ComponentReleaseCatalog
}

async function loadComponentCatalogSafely(component: ReleaseComponentName, token: string) {
  try {
    return await loadComponentCatalog(component, token)
  } catch (error) {
    const configuration = componentConfigurations[component]
    return {
      candidates: [],
      component,
      error: error instanceof Error ? error.message : 'This component catalog is unavailable.',
      label: configuration.label,
      repository: configuration.repository,
      skippedArtifactCount: 0,
    } satisfies ComponentReleaseCatalog
  }
}

function optionalInput(inputs: GitHubWorkflowRun['inputs'], name: string) {
  const value = inputs?.[name]
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function artifactOperation(artifact: GitHubArtifact, runId: number) {
  const match = /^fanal-platform-(.+)-(deploy-candidate|verify-candidate|promote-candidate)-(\d+)$/.exec(
    artifact.name
  )
  return match && Number(match[3]) === runId
    ? { operation: match[2], platformVersion: match[1] }
    : null
}

async function loadPlatformReleaseState(token: string) {
  const query = new URLSearchParams({
    branch: 'master',
    event: 'workflow_dispatch',
    per_page: '20',
  })
  const repository = componentConfigurations.owner.repository
  const [response, artifacts] = await Promise.all([
    githubJson<GitHubWorkflowRunsResponse>(
      repositoryApiPath(
        repository,
        `/actions/workflows/platform-release.yml/runs?${query.toString()}`
      ),
      token
    ),
    listRepositoryArtifacts(repository, token),
  ])
  const artifactEvidence = new Map<number, { artifact: GitHubArtifact; operation: string; platformVersion: string }>()
  for (const artifact of artifacts) {
    const runId = artifact.workflow_run?.id
    if (!runId || artifact.expired) continue
    const evidence = artifactOperation(artifact, runId)
    if (evidence) artifactEvidence.set(runId, { artifact, ...evidence })
  }

  const history = response.workflow_runs.map(
    (run): PlatformReleaseHistoryItem => ({
      actor: run.actor?.login || 'Unknown operator',
      conclusion: run.conclusion,
      createdAt: run.created_at,
      displayTitle: run.display_title || `Platform workflow run #${run.run_number}`,
      operation: optionalInput(run.inputs, 'operation') || artifactEvidence.get(run.id)?.operation || null,
      platformVersion:
        optionalInput(run.inputs, 'platform_version') ||
        artifactEvidence.get(run.id)?.platformVersion ||
        null,
      runId: run.id,
      runNumber: run.run_number,
      runUrl: run.html_url,
      status: run.status,
      updatedAt: run.updated_at,
    })
  )

  const successfulRuns = response.workflow_runs
    .filter((run) => run.conclusion === 'success')
    .sort((left, right) => Date.parse(right.created_at) - Date.parse(left.created_at))
  const latestSuccessfulRun = successfulRuns[0]
  if (!latestSuccessfulRun) {
    return { history, stable: null as StablePlatformRelease | null }
  }

  const latestEvidence = artifactEvidence.get(latestSuccessfulRun.id)
  const latestOperation =
    optionalInput(latestSuccessfulRun.inputs, 'operation') || latestEvidence?.operation || null
  if (latestOperation !== 'promote-candidate') {
    const readableOperation = latestOperation || 'an operation without complete manifest evidence'
    return {
      history,
      stable: null as StablePlatformRelease | null,
      stableError: `The latest successful platform operation is ${readableOperation}. Candidate composition is paused until the current stable manifest is confirmed by a successful promotion.`,
    }
  }

  if (!latestEvidence || latestEvidence.operation !== 'promote-candidate') {
    return {
      history,
      stable: null as StablePlatformRelease | null,
      stableError:
        'The latest successful promotion artifact is unavailable or expired, so the current stable platform cannot be verified.',
    }
  }

  try {
    const archive = await githubBytes(latestEvidence.artifact.archive_download_url, token)
    const manifest = parsePlatformReleaseArtifact(archive, {
      artifactName: latestEvidence.artifact.name,
      workflowRunId: latestSuccessfulRun.id,
    })
    return {
      history,
      stable: {
        manifest,
        promotedAt: latestSuccessfulRun.updated_at,
        workflowRunId: latestSuccessfulRun.id,
        workflowRunUrl: latestSuccessfulRun.html_url,
      } satisfies StablePlatformRelease,
    }
  } catch {
    return {
      history,
      stable: null as StablePlatformRelease | null,
      stableError:
        'The latest successful promotion manifest failed validation, so candidate composition is blocked.',
    }
  }
}

async function loadCatalog() {
  const token = await getGitHubCatalogInstallationToken()
  const [api, main, owner] = await Promise.all([
    loadComponentCatalogSafely('api', token),
    loadComponentCatalogSafely('main', token),
    loadComponentCatalogSafely('owner', token),
  ])

  let history: PlatformReleaseHistoryItem[] = []
  let historyError: string | undefined
  let stable: StablePlatformRelease | null = null
  let stableError: string | undefined
  try {
    const releaseState = await loadPlatformReleaseState(token)
    history = releaseState.history
    stable = releaseState.stable
    stableError = releaseState.stableError
  } catch (error) {
    historyError = error instanceof Error ? error.message : 'Platform release history is unavailable.'
    stableError = 'The current stable platform could not be verified from GitHub release evidence.'
  }

  return {
    components: { api, main, owner },
    history,
    historyError,
    refreshedAt: new Date().toISOString(),
    stable,
    stableError,
  } satisfies ReadOnlyReleaseCatalog
}

export async function getReadOnlyReleaseCatalog(options?: { forceRefresh?: boolean }) {
  if (options?.forceRefresh) cachedCatalog = null

  if (cachedCatalog && cachedCatalog.expiresAt > Date.now()) {
    return cachedCatalog.value
  }

  if (!inFlightCatalog) {
    inFlightCatalog = loadCatalog().finally(() => {
      inFlightCatalog = null
    })
  }

  const value = await inFlightCatalog
  cachedCatalog = {
    expiresAt: Date.now() + getCacheDurationMs(),
    value,
  }
  return value
}
