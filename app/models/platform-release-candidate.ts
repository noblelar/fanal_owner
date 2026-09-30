export const releaseComponentNames = ['api', 'main', 'owner'] as const

export type ReleaseComponentName = (typeof releaseComponentNames)[number]

export type ComponentReleaseCandidate = {
  artifactId: number
  artifactName: string
  artifactExpiresAt: string | null
  branch: 'master'
  component: ReleaseComponentName
  createdAt: string
  image: string
  repository: string
  revision: string
  version: string
  workflowRunAttempt: number
  workflowRunId: number
  workflowRunUrl: string
}

export type ComponentReleaseCatalog = {
  candidates: ComponentReleaseCandidate[]
  component: ReleaseComponentName
  error?: string
  label: string
  repository: string
  skippedArtifactCount: number
}

export type PlatformReleaseHistoryItem = {
  actor: string
  conclusion: string | null
  createdAt: string
  displayTitle: string
  operation: string | null
  platformVersion: string | null
  runId: number
  runNumber: number
  runUrl: string
  status: string
  updatedAt: string
}

export type ReadOnlyReleaseCatalog = {
  components: Record<ReleaseComponentName, ComponentReleaseCatalog>
  history: PlatformReleaseHistoryItem[]
  historyError?: string
  refreshedAt: string
}
