import assert from 'node:assert/strict'
import test from 'node:test'

import {
  COMPONENT_RELEASE_COMPONENTS,
  buildComponentReleaseMetadata,
  validateComponentReleaseMetadata,
} from '../scripts/component-release-metadata.mjs'

const revisions = {
  api: 'a'.repeat(40),
  main: 'b'.repeat(40),
  owner: 'c'.repeat(40),
}

function validMetadata(component = 'api') {
  const contract = COMPONENT_RELEASE_COMPONENTS[component]
  return buildComponentReleaseMetadata({
    component,
    repository: contract.repository,
    branch: 'master',
    workflowRunId: 123456789,
    workflowRunAttempt: 1,
    workflowRunUrl: `https://github.com/${contract.repository}/actions/runs/123456789`,
    version: '1.2.3',
    revision: revisions[component],
    image: `${contract.imageRepository}@sha256:${'d'.repeat(64)}`,
    createdAt: '2026-09-30T12:00:00.000Z',
  })
}

test('accepts exact release metadata for every approved component', () => {
  for (const component of Object.keys(COMPONENT_RELEASE_COMPONENTS)) {
    assert.deepEqual(validateComponentReleaseMetadata(validMetadata(component)), [])
  }
})

test('rejects mutable tags, shortened revisions, and non-master builds', () => {
  const metadata = validMetadata()
  metadata.image = 'docker.io/fanalarkgroup/fanalapi:latest'
  metadata.revision = 'abc123'
  metadata.branch = 'feature/release'

  assert.deepEqual(validateComponentReleaseMetadata(metadata), [
    'branch-must-be-master',
    'revision-invalid',
    'image-must-use-approved-repository-digest',
  ])
})

test('binds the component to its approved source repository and workflow run', () => {
  const metadata = validMetadata('main')
  metadata.repository = 'noblelar/fanal_owner'
  metadata.workflow_run_url = 'https://github.com/noblelar/fanal_owner/actions/runs/123456789'

  assert.deepEqual(validateComponentReleaseMetadata(metadata), [
    'repository-invalid',
    'workflow-run-url-invalid',
  ])
})

test('rejects unexpected fields so the artifact contract cannot drift silently', () => {
  const metadata = { ...validMetadata('owner'), school_id: 'not-allowed' }
  assert.deepEqual(validateComponentReleaseMetadata(metadata), ['metadata-keys-invalid'])
})
