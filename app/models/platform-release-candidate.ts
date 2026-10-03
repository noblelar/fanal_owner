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

export type PlatformReleaseComponent = {
  image: string
  revision: string
  version: string
}

export type PlatformReleaseManifest = {
  schemaVersion: number
  platformVersion: string
  components: Record<ReleaseComponentName, PlatformReleaseComponent>
  compatibility: {
    apiContractMajor: number
    databaseMigrationPolicy: string
  }
  rolloutPolicy: {
    activation: string
    initialStage: string
    schoolSelector: string
  }
}

export type StablePlatformRelease = {
  manifest: PlatformReleaseManifest
  promotedAt: string
  workflowRunId: number
  workflowRunUrl: string
}

export type PlatformReleaseEvidence = {
  completedAt: string
  workflowRunId: number
  workflowRunUrl: string
}

export type ActivePlatformCandidate = {
  deployment: PlatformReleaseEvidence
  manifest: PlatformReleaseManifest
  status: 'deployed' | 'verified'
  verification?: PlatformReleaseEvidence
}

export type ReleaseCandidateIssue = {
  code: string
  component?: ReleaseComponentName
  message: string
}

export type ReleaseComponentChange = {
  bump: 'major' | 'minor' | 'patch' | 'none'
  changed: boolean
  component: ReleaseComponentName
  fromVersion: string | null
  toVersion: string
}

export type PlatformVersionOption = {
  bump: 'major' | 'minor' | 'patch' | 'initial'
  label: string
  version: string
}

export type PlatformReleaseCandidatePreview = {
  changes: Record<ReleaseComponentName, ReleaseComponentChange>
  issues: ReleaseCandidateIssue[]
  manifest: PlatformReleaseManifest | null
  recommendedBump: 'major' | 'minor' | 'patch' | 'initial'
  recommendedPlatformVersion: string
  selectedPlatformVersion: string
  versionOptions: PlatformVersionOption[]
  warnings: ReleaseCandidateIssue[]
}

export type ReadOnlyReleaseCatalog = {
  activeCandidate: ActivePlatformCandidate | null
  candidateError?: string
  components: Record<ReleaseComponentName, ComponentReleaseCatalog>
  history: PlatformReleaseHistoryItem[]
  historyError?: string
  refreshedAt: string
  stable: StablePlatformRelease | null
  stableError?: string
}
