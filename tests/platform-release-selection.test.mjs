import assert from 'node:assert/strict'
import test from 'node:test'

import { composePlatformReleaseCandidate } from '../app/utils/platform-release-selection.js'
import { buildPlatformReleaseManifest } from '../scripts/platform-release-contract.mjs'

function component(imageRepository, version, revisionCharacter, digestCharacter) {
  return {
    image: `${imageRepository}@sha256:${digestCharacter.repeat(64)}`,
    version,
    revision: revisionCharacter.repeat(40),
  }
}

function stableManifest() {
  return buildPlatformReleaseManifest({
    platformVersion: '1.4.2',
    apiImage: `docker.io/fanalarkgroup/fanalapi@sha256:${'a'.repeat(64)}`,
    apiVersion: '1.2.3',
    apiRevision: '1'.repeat(40),
    mainImage: `docker.io/fanalarkgroup/fanal@sha256:${'b'.repeat(64)}`,
    mainVersion: '1.3.4',
    mainRevision: '2'.repeat(40),
    ownerImage: `docker.io/fanalarkgroup/fanal_owner@sha256:${'c'.repeat(64)}`,
    ownerVersion: '1.1.0',
    ownerRevision: '3'.repeat(40),
  })
}

test('recommends the highest Semantic Version change across selected components', () => {
  const stable = stableManifest()
  const preview = composePlatformReleaseCandidate({
    stableManifest: stable,
    requestedPlatformVersion: 'auto',
    components: {
      api: component('docker.io/fanalarkgroup/fanalapi', '1.2.4', '4', 'd'),
      main: component('docker.io/fanalarkgroup/fanal', '1.4.0', '5', 'e'),
      owner: stable.components.owner,
    },
  })

  assert.deepEqual(preview.issues, [])
  assert.equal(preview.recommendedBump, 'minor')
  assert.equal(preview.recommendedPlatformVersion, '1.5.0')
  assert.equal(preview.manifest.platformVersion, '1.5.0')
})

test('blocks changed artifacts that reuse the stable component version', () => {
  const stable = stableManifest()
  const preview = composePlatformReleaseCandidate({
    stableManifest: stable,
    components: {
      ...stable.components,
      owner: component('docker.io/fanalarkgroup/fanal_owner', '1.1.0', '9', 'f'),
    },
  })

  assert.equal(preview.manifest, null)
  assert.ok(preview.issues.some((issue) => issue.code === 'component-version-not-advanced'))
})

test('blocks a platform version smaller than the selected component change', () => {
  const stable = stableManifest()
  const preview = composePlatformReleaseCandidate({
    stableManifest: stable,
    requestedPlatformVersion: '1.4.3',
    components: {
      ...stable.components,
      api: component('docker.io/fanalarkgroup/fanalapi', '2.0.0', '8', 'e'),
    },
  })

  assert.equal(preview.manifest, null)
  assert.ok(preview.issues.some((issue) => issue.code === 'platform-version-bump-too-small'))
})

test('blocks a candidate that is identical to the current stable platform', () => {
  const stable = stableManifest()
  const preview = composePlatformReleaseCandidate({
    stableManifest: stable,
    components: stable.components,
  })

  assert.equal(preview.manifest, null)
  assert.ok(preview.issues.some((issue) => issue.code === 'candidate-has-no-changes'))
})

test('supports a first coordinated platform release at version 1.0.0', () => {
  const preview = composePlatformReleaseCandidate({
    stableManifest: null,
    components: {
      api: component('docker.io/fanalarkgroup/fanalapi', '1.0.0', '1', 'a'),
      main: component('docker.io/fanalarkgroup/fanal', '1.0.0', '2', 'b'),
      owner: component('docker.io/fanalarkgroup/fanal_owner', '1.0.0', '3', 'c'),
    },
  })

  assert.deepEqual(preview.issues, [])
  assert.equal(preview.recommendedBump, 'initial')
  assert.equal(preview.manifest.platformVersion, '1.0.0')
})
