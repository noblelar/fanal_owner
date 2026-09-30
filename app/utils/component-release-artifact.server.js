import { strFromU8, unzipSync } from 'fflate'

import { validateComponentReleaseMetadata } from '../../scripts/component-release-metadata.mjs'

const MAX_ARTIFACT_BYTES = 2 * 1024 * 1024
const MAX_METADATA_BYTES = 64 * 1024

function invalidArtifact(message) {
  throw new Error(`Invalid component release artifact: ${message}`)
}

export function parseComponentReleaseArtifact(archiveBytes, expected) {
  if (!(archiveBytes instanceof Uint8Array) || archiveBytes.byteLength > MAX_ARTIFACT_BYTES) {
    invalidArtifact('archive-size-invalid')
  }

  let files
  try {
    files = unzipSync(archiveBytes, {
      filter(file) {
        return file.name.endsWith('component-release.json') && file.originalSize <= MAX_METADATA_BYTES
      },
    })
  } catch {
    invalidArtifact('archive-unreadable')
  }

  const metadataEntries = Object.entries(files).filter(([name]) =>
    name.endsWith('component-release.json')
  )
  if (metadataEntries.length !== 1) invalidArtifact('metadata-file-count-invalid')

  let metadata
  try {
    metadata = JSON.parse(strFromU8(metadataEntries[0][1]))
  } catch {
    invalidArtifact('metadata-json-invalid')
  }

  const issues = validateComponentReleaseMetadata(metadata)
  if (issues.length > 0) invalidArtifact(issues.join(','))

  const expectedArtifactName = `component-release-${expected.component}-${expected.workflowRunId}-${metadata.workflow_run_attempt}`
  if (expected.artifactName !== expectedArtifactName) invalidArtifact('artifact-name-mismatch')
  if (metadata.component !== expected.component) invalidArtifact('component-mismatch')
  if (metadata.repository !== expected.repository) invalidArtifact('repository-mismatch')
  if (metadata.workflow_run_id !== expected.workflowRunId) invalidArtifact('workflow-run-id-mismatch')
  if (metadata.workflow_run_url !== expected.workflowRunUrl) invalidArtifact('workflow-run-url-mismatch')
  if (metadata.branch !== 'master' || expected.headBranch !== 'master') {
    invalidArtifact('branch-mismatch')
  }
  if (metadata.revision !== expected.headSha) invalidArtifact('revision-mismatch')

  return metadata
}
