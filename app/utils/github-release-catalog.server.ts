import type {
  ActivePlatformCandidate,
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
import {
  derivePlatformReleaseLineage,
  manifestsMatch,
} from '~/utils/platform-release-state.js'

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

type PlatformReleaseOperation =
  | 'deploy-candidate'
  | 'verify-candidate'
  | 'promote-candidate'
  | 'rollback-candidate'

type ManifestPlatformReleaseOperation = Exclude<
  PlatformReleaseOperation,
  'rollback-candidate'
>

type PlatformRunEvidence = {
  artifact: GitHubArtifact
  operation: ManifestPlatformReleaseOperation
  platformVersion: string
}

function platformOperation(value: string | null | undefined): PlatformReleaseOperation | null {
  return value === 'deploy-candidate' ||
    value === 'verify-candidate' ||
    value === 'promote-candidate' ||
    value === 'rollback-candidate'
    ? value
    : null
}

function manifestPlatformOperation(
  value: string | null | undefined
): ManifestPlatformReleaseOperation | null {
  const operation = platformOperation(value)
  return operation === 'rollback-candidate' ? null : operation
}

function operationFromTitle(title: string | undefined) {
  const match = /^Fanal (deploy-candidate|verify-candidate|promote-candidate|rollback-candidate)\b/.exec(
    title || ''
  )
  return platformOperation(match?.[1])
}

async function parseRunManifest(
  run: GitHubWorkflowRun,
  evidence: PlatformRunEvidence,
  token: string
) {
  const archive = await githubBytes(evidence.artifact.archive_download_url, token)
  return parsePlatformReleaseArtifact(archive, {
    artifactName: evidence.artifact.name,
    operation: evidence.operation,
    workflowRunId: run.id,
  })
}

async function loadPlatformReleaseState(token: string) {
  const query = new URLSearchParams({
    branch: 'master',
    event: 'workflow_dispatch',
    per_page: String(MAX_WORKFLOW_RUNS),
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
  const artifactEvidence = new Map<number, PlatformRunEvidence>()
  for (const artifact of artifacts) {
    const runId = artifact.workflow_run?.id
    if (!runId || artifact.expired) continue
    const evidence = artifactOperation(artifact, runId)
    const operation = manifestPlatformOperation(evidence?.operation)
    if (evidence && operation) {
      artifactEvidence.set(runId, { artifact, operation, platformVersion: evidence.platformVersion })
    }
  }

  const history = response.workflow_runs.map(
    (run): PlatformReleaseHistoryItem => ({
      actor: run.actor?.login || 'Unknown operator',
      conclusion: run.conclusion,
      createdAt: run.created_at,
      displayTitle: run.display_title || `Platform workflow run #${run.run_number}`,
      operation:
        platformOperation(optionalInput(run.inputs, 'operation')) ||
        artifactEvidence.get(run.id)?.operation ||
        operationFromTitle(run.display_title),
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

  const runsById = new Map(response.workflow_runs.map((run) => [run.id, run]))
  const normalizedRuns = history.map((item) => ({
    conclusion: item.conclusion,
    createdAt: item.createdAt,
    operation: platformOperation(item.operation),
    runId: item.runId,
  }))
  const lineage = derivePlatformReleaseLineage(normalizedRuns)

  let stable: StablePlatformRelease | null = null
  let stableError: string | undefined
  if (lineage.promotionRun) {
    const run = runsById.get(lineage.promotionRun.runId)
    const evidence = artifactEvidence.get(lineage.promotionRun.runId)
    if (!run || !evidence || evidence.operation !== 'promote-candidate') {
      stableError =
        'The latest successful promotion artifact is unavailable or expired, so the current stable platform cannot be verified.'
    } else {
      try {
        const manifest = await parseRunManifest(run, evidence, token)
        stable = {
          manifest,
          promotedAt: run.updated_at,
          workflowRunId: run.id,
          workflowRunUrl: run.html_url,
        }
      } catch {
        stableError =
          'The latest successful promotion manifest failed validation, so release operations are blocked.'
      }
    }
  }

  let activeCandidate: ActivePlatformCandidate | null = null
  let candidateError: string | undefined
  if (lineage.deploymentRun) {
    const deploymentRun = runsById.get(lineage.deploymentRun.runId)
    const deploymentEvidence = artifactEvidence.get(lineage.deploymentRun.runId)
    if (
      !deploymentRun ||
      !deploymentEvidence ||
      deploymentEvidence.operation !== 'deploy-candidate'
    ) {
      candidateError =
        'The active deployment artifact is unavailable or expired, so its exact candidate cannot be verified or promoted.'
    } else {
      try {
        const manifest = await parseRunManifest(deploymentRun, deploymentEvidence, token)
        activeCandidate = {
          deployment: {
            completedAt: deploymentRun.updated_at,
            workflowRunId: deploymentRun.id,
            workflowRunUrl: deploymentRun.html_url,
          },
          manifest,
          status: 'deployed',
        }

        if (lineage.verificationRun) {
          const verificationRun = runsById.get(lineage.verificationRun.runId)
          const verificationEvidence = artifactEvidence.get(lineage.verificationRun.runId)
          if (
            !verificationRun ||
            !verificationEvidence ||
            verificationEvidence.operation !== 'verify-candidate'
          ) {
            candidateError =
              'The latest verification artifact is unavailable or expired, so promotion is blocked.'
          } else {
            const verifiedManifest = await parseRunManifest(
              verificationRun,
              verificationEvidence,
              token
            )
            if (!manifestsMatch(manifest, verifiedManifest)) {
              candidateError =
                'The verification manifest does not match the deployed candidate, so promotion is blocked.'
            } else {
              activeCandidate = {
                ...activeCandidate,
                status: 'verified',
                verification: {
                  completedAt: verificationRun.updated_at,
                  workflowRunId: verificationRun.id,
                  workflowRunUrl: verificationRun.html_url,
                },
              }
            }
          }
        }
      } catch {
        candidateError =
          'The active candidate evidence failed validation, so verification and promotion are blocked.'
        activeCandidate = null
      }
    }
  }

  return { activeCandidate, candidateError, history, stable, stableError }
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
  let activeCandidate: ActivePlatformCandidate | null = null
  let candidateError: string | undefined
  let stable: StablePlatformRelease | null = null
  let stableError: string | undefined
  try {
    const releaseState = await loadPlatformReleaseState(token)
    activeCandidate = releaseState.activeCandidate
    candidateError = releaseState.candidateError
    history = releaseState.history
    stable = releaseState.stable
    stableError = releaseState.stableError
  } catch (error) {
    historyError = error instanceof Error ? error.message : 'Platform release history is unavailable.'
    candidateError = 'The active platform candidate could not be verified from GitHub release evidence.'
    stableError = 'The current stable platform could not be verified from GitHub release evidence.'
  }

  return {
    activeCandidate,
    candidateError,
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
