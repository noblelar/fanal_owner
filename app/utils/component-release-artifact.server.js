import { strFromU8, unzipSync } from 'fflate'

import { validateComponentReleaseMetadata } from '../../scripts/component-release-metadata.mjs'
import { validatePlatformReleaseManifest } from '../../scripts/platform-release-contract.mjs'

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

export function parsePlatformReleaseArtifact(archiveBytes, expected) {
  if (!(archiveBytes instanceof Uint8Array) || archiveBytes.byteLength > MAX_ARTIFACT_BYTES) {
    throw new Error('Invalid platform release artifact: archive-size-invalid')
  }

  let files
  try {
    files = unzipSync(archiveBytes, {
      filter(file) {
        return file.name.endsWith('platform-release.json') && file.originalSize <= MAX_METADATA_BYTES
      },
    })
  } catch {
    throw new Error('Invalid platform release artifact: archive-unreadable')
  }

  const manifestEntries = Object.entries(files).filter(([name]) =>
    name.endsWith('platform-release.json')
  )
  if (manifestEntries.length !== 1) {
    throw new Error('Invalid platform release artifact: manifest-file-count-invalid')
  }

  let manifest
  try {
    manifest = JSON.parse(strFromU8(manifestEntries[0][1]))
  } catch {
    throw new Error('Invalid platform release artifact: manifest-json-invalid')
  }

  const issues = validatePlatformReleaseManifest(manifest)
  if (issues.length > 0) {
    throw new Error(`Invalid platform release artifact: ${issues.join(',')}`)
  }

  const expectedArtifactName = `fanal-platform-${manifest.platformVersion}-promote-candidate-${expected.workflowRunId}`
  if (expected.artifactName !== expectedArtifactName) {
    throw new Error('Invalid platform release artifact: artifact-name-mismatch')
  }

  return manifest
}
