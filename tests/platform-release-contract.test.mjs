import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildPlatformReleaseManifest,
  validatePlatformReleaseManifest,
} from '../scripts/platform-release-contract.mjs'

const values = {
  platformVersion: '1.0.0',
  apiImage: `docker.io/fanalarkgroup/fanalapi@sha256:${'a'.repeat(64)}`,
  apiVersion: '1.2.3',
  apiRevision: '1'.repeat(40),
  mainImage: `docker.io/fanalarkgroup/fanal@sha256:${'b'.repeat(64)}`,
  mainVersion: '2.3.4',
  mainRevision: '2'.repeat(40),
  ownerImage: `docker.io/fanalarkgroup/fanal_owner@sha256:${'c'.repeat(64)}`,
  ownerVersion: '3.4.5',
  ownerRevision: '3'.repeat(40),
}

test('builds a deterministic, test-first platform manifest', () => {
  const manifest = buildPlatformReleaseManifest(values)
  assert.deepEqual(validatePlatformReleaseManifest(manifest), [])
  assert.equal(manifest.platformVersion, '1.0.0')
  assert.deepEqual(manifest.rolloutPolicy, {
    initialStage: 'test',
    schoolSelector: 'authenticated-school-id',
    activation: 'manual',
  })
})

test('rejects mutable tags, unknown repositories, and shortened revisions', () => {
  const mutable = buildPlatformReleaseManifest({
    ...values,
    apiImage: 'docker.io/fanalarkgroup/fanalapi:latest',
    mainRevision: 'abc123',
    ownerImage: `docker.io/another/fanal_owner@sha256:${'c'.repeat(64)}`,
  })
  assert.deepEqual(validatePlatformReleaseManifest(mutable), [
    'api-image-must-use-approved-repository-digest',
    'main-revision-invalid',
    'owner-image-must-use-approved-repository-digest',
  ])
})

test('rejects prerelease platform versions and unsafe compatibility policy', () => {
  const manifest = buildPlatformReleaseManifest({ ...values, platformVersion: '1.0.0-rc.1' })
  manifest.compatibility.databaseMigrationPolicy = 'destructive-allowed'
  assert.deepEqual(validatePlatformReleaseManifest(manifest), [
    'platform-version-must-be-stable-semver',
    'database-migration-policy-invalid',
  ])
})

test('rejects additional fields so tenant identifiers cannot enter the manifest', () => {
  const manifest = buildPlatformReleaseManifest(values)
  manifest.rolloutPolicy.testSchoolIds = ['private-school-id']
  assert.deepEqual(validatePlatformReleaseManifest(manifest), ['rollout-policy-keys-invalid'])
})
