export const candidateLifecycleOperations = [
  'deploy-candidate',
  'verify-candidate',
  'promote-candidate',
  'rollback-candidate',
]

const operationSet = new Set(candidateLifecycleOperations)

function runOrder(left, right) {
  const timestampDifference = Date.parse(right.createdAt) - Date.parse(left.createdAt)
  return timestampDifference || right.runId - left.runId
}

function occursAfter(run, reference) {
  if (!reference) return true
  const runTime = Date.parse(run.createdAt)
  const referenceTime = Date.parse(reference.createdAt)
  return runTime > referenceTime || (runTime === referenceTime && run.runId > reference.runId)
}

export function derivePlatformReleaseLineage(runs) {
  const successfulRuns = (Array.isArray(runs) ? runs : [])
    .filter(
      (run) =>
        run?.conclusion === 'success' &&
        operationSet.has(run.operation) &&
        Number.isSafeInteger(run.runId)
    )
    .sort(runOrder)

  const promotionRun =
    successfulRuns.find((run) => run.operation === 'promote-candidate') ?? null
  const rollbackRun =
    successfulRuns.find((run) => run.operation === 'rollback-candidate') ?? null
  const lifecycleBoundary = [promotionRun, rollbackRun].filter(Boolean).sort(runOrder)[0] ?? null
  const deploymentRun =
    successfulRuns.find(
      (run) => run.operation === 'deploy-candidate' && occursAfter(run, lifecycleBoundary)
    ) ?? null
  const verificationRun = deploymentRun
    ? successfulRuns.find(
        (run) =>
          run.operation === 'verify-candidate' && occursAfter(run, deploymentRun)
      ) ?? null
    : null

  return { deploymentRun, promotionRun, rollbackRun, verificationRun }
}

export function manifestsMatch(left, right) {
  return JSON.stringify(left) === JSON.stringify(right)
}
