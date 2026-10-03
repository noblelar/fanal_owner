const OWNER_REPOSITORY = 'noblelar/fanal_owner'
const PLATFORM_WORKFLOW = 'platform-release.yml'
const REQUEST_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
export const releaseDispatchOperations = [
  'deploy-candidate',
  'verify-candidate',
  'promote-candidate',
]
const releaseDispatchOperationSet = new Set(releaseDispatchOperations)

export function isValidReleaseRequestId(requestId) {
  return typeof requestId === 'string' && REQUEST_ID_PATTERN.test(requestId)
}

export function buildPlatformReleaseDispatch(operation, manifest, requestId) {
  if (!releaseDispatchOperationSet.has(operation)) {
    throw new Error('A supported release operation is required.')
  }
  if (!isValidReleaseRequestId(requestId)) {
    throw new Error('A valid release request ID is required.')
  }

  const components = manifest?.components
  if (!manifest?.platformVersion || !components?.api || !components?.main || !components?.owner) {
    throw new Error('A complete platform release manifest is required.')
  }

  return {
    body: {
      ref: 'master',
      inputs: {
        operation,
        platform_version: manifest.platformVersion,
        api_image: components.api.image,
        api_version: components.api.version,
        api_revision: components.api.revision,
        main_image: components.main.image,
        main_version: components.main.version,
        main_revision: components.main.revision,
        owner_image: components.owner.image,
        owner_version: components.owner.version,
        owner_revision: components.owner.revision,
        confirm_operation: 'true',
        release_request_id: requestId,
      },
    },
    repository: OWNER_REPOSITORY,
    url: `https://api.github.com/repos/${OWNER_REPOSITORY}/actions/workflows/${PLATFORM_WORKFLOW}/dispatches`,
    workflowUrl: `https://github.com/${OWNER_REPOSITORY}/actions/workflows/${PLATFORM_WORKFLOW}`,
  }
}

export function findWorkflowRunByRequestId(workflowRuns, requestId) {
  if (!Array.isArray(workflowRuns) || !isValidReleaseRequestId(requestId)) return null
  return (
    workflowRuns.find(
      (run) =>
        typeof run?.display_title === 'string' &&
        run.display_title.includes(requestId) &&
        typeof run?.html_url === 'string' &&
        Number.isSafeInteger(run?.id)
    ) ?? null
  )
}

export function githubDispatchFailure(status) {
  if (status === 401 || status === 403) {
    return {
      message:
        'The GitHub Catalog App cannot dispatch the platform workflow. Grant the App Actions: read and write permission, approve the permission change, and reinstall or refresh the installation.',
      status: 503,
    }
  }
  if (status === 404) {
    return {
      message: 'The platform release workflow was not found on the Owner master branch.',
      status: 503,
    }
  }
  if (status === 422) {
    return {
      message:
        'GitHub rejected the generated platform workflow inputs. Refresh the Release Center and retry the current lifecycle action.',
      status: 409,
    }
  }
  return {
    message: `GitHub rejected the platform dispatch request with HTTP ${status}.`,
    status: 503,
  }
}

export function createRecentDispatchGuard(windowMilliseconds) {
  const reservations = new Map()
  return {
    release(key) {
      reservations.delete(key)
    },
    reserve(key, now = Date.now()) {
      for (const [reservedKey, expiresAt] of reservations) {
        if (expiresAt <= now) reservations.delete(reservedKey)
      }
      if (reservations.has(key)) return false
      reservations.set(key, now + windowMilliseconds)
      return true
    },
  }
}
