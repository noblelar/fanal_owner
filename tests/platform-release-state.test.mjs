import assert from 'node:assert/strict'
import test from 'node:test'
import {
  derivePlatformReleaseLineage,
  manifestsMatch,
} from '../app/utils/platform-release-state.js'

function run(runId, operation, createdAt, conclusion = 'success') {
  return { conclusion, createdAt, operation, runId }
}

test('keeps the latest promotion stable while tracking a newer deployment', () => {
  const lineage = derivePlatformReleaseLineage([
    run(10, 'promote-candidate', '2026-10-01T10:00:00Z'),
    run(11, 'deploy-candidate', '2026-10-02T10:00:00Z'),
  ])

  assert.equal(lineage.promotionRun.runId, 10)
  assert.equal(lineage.deploymentRun.runId, 11)
  assert.equal(lineage.verificationRun, null)
})

test('binds verification only to the newest deployment after promotion', () => {
  const lineage = derivePlatformReleaseLineage([
    run(10, 'promote-candidate', '2026-10-01T10:00:00Z'),
    run(11, 'verify-candidate', '2026-10-02T09:00:00Z'),
    run(12, 'deploy-candidate', '2026-10-02T10:00:00Z'),
    run(13, 'verify-candidate', '2026-10-02T11:00:00Z'),
    run(14, 'deploy-candidate', '2026-10-02T12:00:00Z'),
  ])

  assert.equal(lineage.deploymentRun.runId, 14)
  assert.equal(lineage.verificationRun, null)
})

test('a successful promotion closes the earlier candidate lifecycle', () => {
  const lineage = derivePlatformReleaseLineage([
    run(20, 'deploy-candidate', '2026-10-02T10:00:00Z'),
    run(21, 'verify-candidate', '2026-10-02T11:00:00Z'),
    run(22, 'promote-candidate', '2026-10-02T12:00:00Z'),
  ])

  assert.equal(lineage.promotionRun.runId, 22)
  assert.equal(lineage.deploymentRun, null)
  assert.equal(lineage.verificationRun, null)
})

test('failed operations never advance lifecycle state', () => {
  const lineage = derivePlatformReleaseLineage([
    run(30, 'deploy-candidate', '2026-10-02T10:00:00Z'),
    run(31, 'verify-candidate', '2026-10-02T11:00:00Z', 'failure'),
    run(32, 'promote-candidate', '2026-10-02T12:00:00Z', 'failure'),
  ])

  assert.equal(lineage.deploymentRun.runId, 30)
  assert.equal(lineage.verificationRun, null)
  assert.equal(lineage.promotionRun, null)
})

test('a successful rollback closes the candidate without replacing stable promotion evidence', () => {
  const lineage = derivePlatformReleaseLineage([
    run(40, 'promote-candidate', '2026-10-01T10:00:00Z'),
    run(41, 'deploy-candidate', '2026-10-02T10:00:00Z'),
    run(42, 'rollback-candidate', '2026-10-02T11:00:00Z'),
  ])

  assert.equal(lineage.promotionRun.runId, 40)
  assert.equal(lineage.rollbackRun.runId, 42)
  assert.equal(lineage.deploymentRun, null)
})

test('manifest comparison rejects any changed immutable coordinate', () => {
  const manifest = {
    platformVersion: '1.2.0',
    components: { api: { version: '1.1.0' } },
  }
  assert.equal(manifestsMatch(manifest, structuredClone(manifest)), true)
  assert.equal(
    manifestsMatch(manifest, {
      ...manifest,
      components: { api: { version: '1.1.1' } },
    }),
    false
  )
})
