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
  downloadArtifactArchive,
  GitHubCatalogRequestError,
  githubCatalogErrorDetails,
  githubJsonRequest,
  isGitHubCatalogRequestError,
  listWorkflowRunArtifacts,
} from '~/utils/github-catalog-client.server.js'
import {
  derivePlatformReleaseLineage,
  manifestsMatch,
} from '~/utils/platform-release-state.js'

const DEFAULT_CACHE_SECONDS = 60
const DEFAULT_MAX_CANDIDATES = 10
const DEFAULT_MAX_COMPONENT_RUNS_TO_SCAN = 20
const MAX_WORKFLOW_RUNS = 50
const CATALOG_REQUEST_CONCURRENCY = 5

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

function getMaximumComponentRunsToScan() {
  return boundedInteger(
    process.env.GITHUB_CATALOG_MAX_RUNS_SCANNED,
    DEFAULT_MAX_COMPONENT_RUNS_TO_SCAN,
    10,
    MAX_WORKFLOW_RUNS
  )
}

function repositoryApiPath(repository: string, suffix: string) {
  const [owner, name] = repository.split('/')
  if (!owner || !name) throw new Error('A configured GitHub repository is invalid.')
  return `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}${suffix}`
}

async function githubJson<T>(path: string, token: string) {
  return (await githubJsonRequest(path, token, githubCatalogRequestHeaders)) as T
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

  return response.workflow_runs
    .filter(
      (run) =>
        run.conclusion === 'success' &&
        run.event === 'push' &&
        run.head_branch === 'master' &&
        Number.isSafeInteger(run.run_attempt) &&
        run.run_attempt > 0 &&
        /^[0-9a-f]{40}$/.test(run.head_sha)
    )
    .sort((left, right) => Date.parse(right.created_at) - Date.parse(left.created_at))
}

function emptyIssueCounts() {
  return {
    artifactDownloadsFailed: 0,
    artifactValidationFailed: 0,
    expiredArtifacts: 0,
    workflowArtifactLookupsFailed: 0,
  }
}

function logCatalogFailure(
  error: unknown,
  context: Record<string, number | string | null | undefined>
) {
  const details = githubCatalogErrorDetails(error)
  const validationReason =
    error instanceof Error
      ? /^(?:Invalid component release artifact|Invalid platform release artifact): ([a-z0-9,-]+)$/.exec(
          error.message
        )?.[1]
      : undefined
  console.warn(
    'release_catalog_failure',
    JSON.stringify({
      ...context,
      code: details.code,
      reason: validationReason,
      status: details.status,
    })
  )
}

async function loadComponentCatalog(component: ReleaseComponentName, token: string) {
  const configuration = componentConfigurations[component]
  const successfulRuns = (
    await listSuccessfulBuildRuns(configuration.repository, token)
  ).slice(0, getMaximumComponentRunsToScan())
  const maximumCandidates = getMaximumCandidates()
  const candidates: ComponentReleaseCandidate[] = []
  const issueCounts = emptyIssueCounts()
  let skippedArtifactCount = 0

  for (
    let offset = 0;
    offset < successfulRuns.length && candidates.length < maximumCandidates;
    offset += CATALOG_REQUEST_CONCURRENCY
  ) {
    const batch = successfulRuns.slice(offset, offset + CATALOG_REQUEST_CONCURRENCY)
    const artifactResults = await Promise.all(
      batch.map(async (run) => {
        try {
          const artifacts = (await listWorkflowRunArtifacts(
            configuration.repository,
            run.id,
            token,
            githubCatalogRequestHeaders
          )) as GitHubArtifact[]
          return { artifacts, error: null, run }
        } catch (error) {
          return { artifacts: [] as GitHubArtifact[], error, run }
        }
      })
    )

    for (const result of artifactResults) {
      if (candidates.length >= maximumCandidates) break
      const { run } = result
      if (result.error) {
        issueCounts.workflowArtifactLookupsFailed += 1
        logCatalogFailure(result.error, {
          component,
          repository: configuration.repository,
          stage: 'workflow_artifact_lookup',
          workflowRunId: run.id,
        })
        continue
      }

      const expectedArtifactName = `component-release-${component}-${run.id}-${run.run_attempt}`
      const matchingArtifacts = result.artifacts.filter(
        (artifact) => artifact.name === expectedArtifactName
      )
      if (matchingArtifacts.length > 1) {
        issueCounts.artifactValidationFailed += matchingArtifacts.length
        skippedArtifactCount += matchingArtifacts.length
        logCatalogFailure(new Error('ambiguous component release artifacts'), {
          artifactName: expectedArtifactName,
          component,
          repository: configuration.repository,
          stage: 'artifact_correlation',
          workflowRunId: run.id,
        })
        continue
      }
      const artifact = matchingArtifacts[0]
      if (!artifact) continue
      if (artifact.expired) {
        issueCounts.expiredArtifacts += 1
        skippedArtifactCount += 1
        logCatalogFailure(
          new GitHubCatalogRequestError(
            'github_artifact_expired',
            'The component release artifact has expired.'
          ),
          {
            artifactId: artifact.id,
            artifactName: artifact.name,
            component,
            repository: configuration.repository,
            stage: 'artifact_expiry',
            workflowRunId: run.id,
          }
        )
        continue
      }

      let archive: Uint8Array
      try {
        archive = await downloadArtifactArchive(
          configuration.repository,
          artifact.id,
          token,
          githubCatalogRequestHeaders
        )
      } catch (error) {
        issueCounts.artifactDownloadsFailed += 1
        skippedArtifactCount += 1
        logCatalogFailure(error, {
          artifactId: artifact.id,
          artifactName: artifact.name,
          component,
          repository: configuration.repository,
          stage: 'artifact_download',
          workflowRunId: run.id,
        })
        continue
      }

      try {
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
      } catch (error) {
        issueCounts.artifactValidationFailed += 1
        skippedArtifactCount += 1
        logCatalogFailure(error, {
          artifactId: artifact.id,
          artifactName: artifact.name,
          component,
          repository: configuration.repository,
          stage: 'artifact_validation',
          workflowRunId: run.id,
        })
      }
    }
  }

  return {
    candidates,
    component,
    issueCounts,
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
    logCatalogFailure(error, {
      component,
      repository: configuration.repository,
      stage: 'component_catalog_load',
    })
    return {
      candidates: [],
      component,
      error: error instanceof Error ? error.message : 'This component catalog is unavailable.',
      issueCounts: emptyIssueCounts(),
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

function platformDetailsFromTitle(title: string | undefined) {
  const match = /^Fanal (deploy-candidate|verify-candidate|promote-candidate|rollback-candidate)(?:\s+(\d+\.\d+\.\d+))?\b/.exec(
    title || ''
  )
  return {
    operation: platformOperation(match?.[1]),
    platformVersion: match?.[2] || null,
  }
}

async function findPlatformRunEvidence(
  run: GitHubWorkflowRun,
  expectedOperation: ManifestPlatformReleaseOperation,
  repository: string,
  token: string
) {
  const artifacts = (await listWorkflowRunArtifacts(
    repository,
    run.id,
    token,
    githubCatalogRequestHeaders
  )) as GitHubArtifact[]
  const matches = artifacts
    .map((artifact) => ({ artifact, details: artifactOperation(artifact, run.id) }))
    .filter(
      (
        value
      ): value is {
        artifact: GitHubArtifact
        details: { operation: ManifestPlatformReleaseOperation; platformVersion: string }
      } => value.details?.operation === expectedOperation
    )

  if (matches.length > 1) {
    throw new Error('Ambiguous platform release evidence was returned for one workflow run.')
  }
  const match = matches[0]
  if (!match || match.artifact.expired) return null
  return {
    artifact: match.artifact,
    operation: expectedOperation,
    platformVersion: match.details.platformVersion,
  } satisfies PlatformRunEvidence
}

async function parseRunManifest(
  run: GitHubWorkflowRun,
  evidence: PlatformRunEvidence,
  repository: string,
  token: string
) {
  const archive = await downloadArtifactArchive(
    repository,
    evidence.artifact.id,
    token,
    githubCatalogRequestHeaders
  )
  return parsePlatformReleaseArtifact(archive, {
    artifactName: evidence.artifact.name,
    operation: evidence.operation,
    workflowRunId: run.id,
  })
}

function platformEvidenceFailureMessage(
  error: unknown,
  evidence: 'candidate' | 'promotion' | 'verification'
) {
  if (isGitHubCatalogRequestError(error)) {
    if (error.code === 'github_artifact_unavailable') {
      if (evidence === 'promotion') {
        return 'The latest successful promotion artifact is unavailable or expired, so the current stable platform cannot be verified.'
      }
      if (evidence === 'verification') {
        return 'The latest verification artifact is unavailable or expired, so promotion is blocked.'
      }
      return 'The active deployment artifact is unavailable or expired, so its exact candidate cannot be verified or promoted.'
    }
    if (evidence === 'promotion') {
      return 'The latest successful promotion artifact could not be loaded from GitHub, so release operations are blocked.'
    }
    if (evidence === 'verification') {
      return 'The latest verification artifact could not be loaded from GitHub, so promotion is blocked.'
    }
    return 'The active candidate artifact could not be loaded from GitHub, so verification and promotion are blocked.'
  }
  if (evidence === 'promotion') {
    return 'The latest successful promotion manifest failed validation, so release operations are blocked.'
  }
  if (evidence === 'verification') {
    return 'The latest verification manifest failed validation, so promotion is blocked.'
  }
  return 'The active candidate evidence failed validation, so verification and promotion are blocked.'
}

async function loadPlatformReleaseState(token: string) {
  const query = new URLSearchParams({
    branch: 'master',
    event: 'workflow_dispatch',
    per_page: String(MAX_WORKFLOW_RUNS),
  })
  const repository = componentConfigurations.owner.repository
  const response = await githubJson<GitHubWorkflowRunsResponse>(
    repositoryApiPath(
      repository,
      `/actions/workflows/platform-release.yml/runs?${query.toString()}`
    ),
    token
  )

  const history = response.workflow_runs.map(
    (run): PlatformReleaseHistoryItem => {
      const titleDetails = platformDetailsFromTitle(run.display_title)
      return {
        actor: run.actor?.login || 'Unknown operator',
        conclusion: run.conclusion,
        createdAt: run.created_at,
        displayTitle: run.display_title || `Platform workflow run #${run.run_number}`,
        operation:
          platformOperation(optionalInput(run.inputs, 'operation')) || titleDetails.operation,
        platformVersion:
          optionalInput(run.inputs, 'platform_version') || titleDetails.platformVersion,
        runId: run.id,
        runNumber: run.run_number,
        runUrl: run.html_url,
        status: run.status,
        updatedAt: run.updated_at,
      }
    }
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
    if (!run) {
      stableError =
        'The latest successful promotion artifact is unavailable or expired, so the current stable platform cannot be verified.'
    } else {
      try {
        const evidence = await findPlatformRunEvidence(
          run,
          'promote-candidate',
          repository,
          token
        )
        if (!evidence) {
          throw new GitHubCatalogRequestError(
            'github_artifact_unavailable',
            'The promotion artifact is unavailable or expired.'
          )
        }
        const manifest = await parseRunManifest(run, evidence, repository, token)
        stable = {
          manifest,
          promotedAt: run.updated_at,
          workflowRunId: run.id,
          workflowRunUrl: run.html_url,
        }
      } catch (error) {
        logCatalogFailure(error, {
          operation: 'promote-candidate',
          repository,
          stage: isGitHubCatalogRequestError(error)
            ? 'platform_evidence_retrieval'
            : 'platform_evidence_validation',
          workflowRunId: run.id,
        })
        stableError = platformEvidenceFailureMessage(error, 'promotion')
      }
    }
  }

  let activeCandidate: ActivePlatformCandidate | null = null
  let candidateError: string | undefined
  if (lineage.deploymentRun) {
    const deploymentRun = runsById.get(lineage.deploymentRun.runId)
    if (!deploymentRun) {
      candidateError =
        'The active deployment artifact is unavailable or expired, so its exact candidate cannot be verified or promoted.'
    } else {
      try {
        const deploymentEvidence = await findPlatformRunEvidence(
          deploymentRun,
          'deploy-candidate',
          repository,
          token
        )
        if (!deploymentEvidence) {
          throw new GitHubCatalogRequestError(
            'github_artifact_unavailable',
            'The deployment artifact is unavailable or expired.'
          )
        }
        const manifest = await parseRunManifest(
          deploymentRun,
          deploymentEvidence,
          repository,
          token
        )
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
          if (!verificationRun) {
            candidateError =
              'The latest verification artifact is unavailable or expired, so promotion is blocked.'
          } else {
            const verificationEvidence = await findPlatformRunEvidence(
              verificationRun,
              'verify-candidate',
              repository,
              token
            )
            if (!verificationEvidence) {
              throw new GitHubCatalogRequestError(
                'github_artifact_unavailable',
                'The verification artifact is unavailable or expired.'
              )
            }
            const verifiedManifest = await parseRunManifest(
              verificationRun,
              verificationEvidence,
              repository,
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
      } catch (error) {
        const evidenceType = activeCandidate ? 'verification' : 'candidate'
        logCatalogFailure(error, {
          operation: evidenceType === 'verification' ? 'verify-candidate' : 'deploy-candidate',
          repository,
          stage: isGitHubCatalogRequestError(error)
            ? 'platform_evidence_retrieval'
            : 'platform_evidence_validation',
          workflowRunId:
            evidenceType === 'verification'
              ? lineage.verificationRun?.runId
              : deploymentRun.id,
        })
        candidateError = platformEvidenceFailureMessage(error, evidenceType)
        if (evidenceType === 'candidate') activeCandidate = null
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
    logCatalogFailure(error, {
      repository: componentConfigurations.owner.repository,
      stage: 'platform_catalog_load',
    })
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
