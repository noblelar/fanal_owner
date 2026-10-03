import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildPlatformReleaseDispatch,
  createRecentDispatchGuard,
  findWorkflowRunByRequestId,
  githubDispatchFailure,
} from '../app/utils/platform-release-dispatch.js'
import {
  findActivePlatformOperation,
  resolveTrustedComponentSelection,
} from '../app/utils/platform-release-action.js'

const requestId = '123e4567-e89b-42d3-a456-426614174000'
const manifest = {
  schemaVersion: 1,
  platformVersion: '1.2.0',
  components: {
    api: {
      image: `docker.io/fanalarkgroup/fanalapi@sha256:${'a'.repeat(64)}`,
      revision: '1'.repeat(40),
      version: '1.1.0',
    },
    main: {
      image: `docker.io/fanalarkgroup/fanal@sha256:${'b'.repeat(64)}`,
      revision: '2'.repeat(40),
      version: '1.1.0',
    },
    owner: {
      image: `docker.io/fanalarkgroup/fanal_owner@sha256:${'c'.repeat(64)}`,
      revision: '3'.repeat(40),
      version: '1.2.0',
    },
  },
  compatibility: { apiContractMajor: 1, databaseMigrationPolicy: 'backward-compatible' },
  rolloutPolicy: { activation: 'manual', initialStage: 'test', schoolSelector: 'school-id' },
}

test('dispatch inputs are generated only from the validated server manifest', () => {
  const dispatch = buildPlatformReleaseDispatch('deploy-candidate', manifest, requestId)
  assert.equal(dispatch.body.ref, 'master')
  assert.deepEqual(dispatch.body.inputs, {
    operation: 'deploy-candidate',
    platform_version: '1.2.0',
    api_image: manifest.components.api.image,
    api_version: '1.1.0',
    api_revision: manifest.components.api.revision,
    main_image: manifest.components.main.image,
    main_version: '1.1.0',
    main_revision: manifest.components.main.revision,
    owner_image: manifest.components.owner.image,
    owner_version: '1.2.0',
    owner_revision: manifest.components.owner.revision,
    confirm_operation: 'true',
    release_request_id: requestId,
  })
})

test('verification and promotion reuse the same immutable manifest coordinates', () => {
  for (const operation of ['verify-candidate', 'promote-candidate']) {
    const dispatch = buildPlatformReleaseDispatch(operation, manifest, requestId)
    assert.equal(dispatch.body.inputs.operation, operation)
    assert.equal(dispatch.body.inputs.api_image, manifest.components.api.image)
    assert.equal(dispatch.body.inputs.main_revision, manifest.components.main.revision)
    assert.equal(dispatch.body.inputs.owner_version, manifest.components.owner.version)
  }
  assert.throws(
    () => buildPlatformReleaseDispatch('rollback-candidate', manifest, requestId),
    /supported release operation/
  )
})

test('tampered and stale browser selections cannot become release coordinates', () => {
  const catalog = {
    stable: null,
    components: {
      api: { candidates: [{ artifactId: 41, ...manifest.components.api }] },
    },
  }
  assert.deepEqual(
    resolveTrustedComponentSelection(catalog, 'api', 'artifact:41'),
    manifest.components.api
  )
  assert.equal(resolveTrustedComponentSelection(catalog, 'api', 'artifact:999'), null)
  assert.equal(resolveTrustedComponentSelection(catalog, 'api', manifest.components.api.image), null)
})

test('duplicate and concurrent operations are blocked deterministically', () => {
  const guard = createRecentDispatchGuard(300_000)
  assert.equal(guard.reserve('same-manifest', 1_000), true)
  assert.equal(guard.reserve('same-manifest', 2_000), false)
  assert.equal(guard.reserve('same-manifest', 301_001), true)
  assert.equal(
    findActivePlatformOperation([{ status: 'completed' }, { status: 'in_progress', runId: 7 }])?.runId,
    7
  )
})

test('GitHub failures are safe and actionable', () => {
  assert.match(githubDispatchFailure(403).message, /Actions: read and write/)
  assert.equal(githubDispatchFailure(403).status, 503)
  assert.equal(githubDispatchFailure(422).status, 409)
  assert.doesNotMatch(githubDispatchFailure(500).message, /token|private key/i)
})

test('request IDs correlate the accepted dispatch to its workflow run', () => {
  const run = findWorkflowRunByRequestId(
    [
      { id: 10, display_title: 'unrelated', html_url: 'https://example.test/10' },
      { id: 11, display_title: `Fanal deploy-candidate 1.2.0 · ${requestId}`, html_url: 'https://example.test/11' },
    ],
    requestId
  )
  assert.equal(run?.id, 11)
  assert.throws(
    () => buildPlatformReleaseDispatch('deploy-candidate', manifest, 'not-a-uuid'),
    /valid release request ID/
  )
})
