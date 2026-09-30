import assert from 'node:assert/strict'
import test from 'node:test'
import { strToU8, zipSync } from 'fflate'

import { parseComponentReleaseArtifact } from '../app/utils/component-release-artifact.server.js'
import {
  buildComponentReleaseMetadata,
  COMPONENT_RELEASE_COMPONENTS,
} from '../scripts/component-release-metadata.mjs'

function releaseFixture(overrides = {}) {
  const contract = COMPONENT_RELEASE_COMPONENTS.api
  const metadata = buildComponentReleaseMetadata({
    component: 'api',
    repository: contract.repository,
    branch: 'master',
    workflowRunId: 123456789,
    workflowRunAttempt: 2,
    workflowRunUrl: `https://github.com/${contract.repository}/actions/runs/123456789`,
    version: '1.2.3',
    revision: 'a'.repeat(40),
    image: `${contract.imageRepository}@sha256:${'d'.repeat(64)}`,
    createdAt: '2026-09-30T12:00:00.000Z',
    ...overrides,
  })
  const archive = zipSync({
    'component-release.json': strToU8(JSON.stringify(metadata)),
  })
  const expected = {
    artifactName: 'component-release-api-123456789-2',
    component: 'api',
    headBranch: 'master',
    headSha: 'a'.repeat(40),
    repository: contract.repository,
    workflowRunId: 123456789,
    workflowRunUrl: `https://github.com/${contract.repository}/actions/runs/123456789`,
  }
  return { archive, expected, metadata }
}

test('extracts a validated metadata document from a trusted artifact', () => {
  const { archive, expected, metadata } = releaseFixture()
  assert.deepEqual(parseComponentReleaseArtifact(archive, expected), metadata)
})

test('rejects an artifact whose Git revision differs from the successful workflow run', () => {
  const { archive, expected } = releaseFixture()
  assert.throws(
    () => parseComponentReleaseArtifact(archive, { ...expected, headSha: 'b'.repeat(40) }),
    /revision-mismatch/
  )
})

test('rejects an artifact name that is not bound to the run attempt', () => {
  const { archive, expected } = releaseFixture()
  assert.throws(
    () => parseComponentReleaseArtifact(archive, { ...expected, artifactName: 'component-release-api-123456789-1' }),
    /artifact-name-mismatch/
  )
})

test('rejects archives without exactly one component release document', () => {
  const { expected } = releaseFixture()
  const archive = zipSync({ 'unrelated.json': strToU8('{}') })
  assert.throws(
    () => parseComponentReleaseArtifact(archive, expected),
    /metadata-file-count-invalid/
  )
})
