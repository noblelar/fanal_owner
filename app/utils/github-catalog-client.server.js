const GITHUB_API_URL = 'https://api.github.com'
const DEFAULT_TIMEOUT_MS = 20_000
const DEFAULT_MAX_ARCHIVE_BYTES = 2 * 1024 * 1024
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308])

export class GitHubCatalogRequestError extends Error {
  constructor(code, message, options = {}) {
    super(message, options.cause ? { cause: options.cause } : undefined)
    this.name = 'GitHubCatalogRequestError'
    this.code = code
    this.status = options.status ?? null
  }
}

function repositoryApiUrl(repository, suffix) {
  const [owner, name, ...extra] = repository.split('/')
  if (!owner || !name || extra.length > 0) {
    throw new GitHubCatalogRequestError(
      'repository_configuration_invalid',
      'A configured GitHub repository is invalid.'
    )
  }
  return `${GITHUB_API_URL}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}${suffix}`
}

function timeoutSignal(timeoutMs) {
  return AbortSignal.timeout(timeoutMs ?? DEFAULT_TIMEOUT_MS)
}

function requestError(status, operation) {
  if (status === 401) {
    return new GitHubCatalogRequestError(
      'github_authentication_failed',
      'The GitHub Catalog App credentials were rejected.',
      { status }
    )
  }
  if (status === 403) {
    if (operation === 'artifact_storage_download') {
      return new GitHubCatalogRequestError(
        'artifact_storage_download_forbidden',
        'The signed GitHub artifact download was rejected by the storage service.',
        { status }
      )
    }
    return new GitHubCatalogRequestError(
      'github_actions_read_forbidden',
      'The GitHub Catalog App is not authorized to read release artifacts.',
      { status }
    )
  }
  if (status === 404) {
    if (operation === 'artifact_storage_download') {
      return new GitHubCatalogRequestError(
        'artifact_storage_download_not_found',
        'The signed GitHub artifact download is no longer available from the storage service.',
        { status }
      )
    }
    return new GitHubCatalogRequestError(
      'github_resource_not_found',
      'A configured GitHub repository, workflow run, or artifact could not be found.',
      { status }
    )
  }
  if (status === 410) {
    return new GitHubCatalogRequestError(
      'github_artifact_expired',
      'A GitHub release artifact has expired.',
      { status }
    )
  }
  if (status === 429) {
    return new GitHubCatalogRequestError(
      'github_rate_limited',
      'GitHub temporarily rate-limited the release catalog. Please retry shortly.',
      { status }
    )
  }
  return new GitHubCatalogRequestError(
    `github_${operation}_http_error`,
    `GitHub release-catalog ${operation} failed with HTTP ${status}.`,
    { status }
  )
}

async function request(url, init, operation, fetchImpl) {
  let response
  try {
    response = await fetchImpl(url, init)
  } catch (error) {
    const timedOut =
      error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')
    throw new GitHubCatalogRequestError(
      timedOut ? `github_${operation}_timeout` : `github_${operation}_unreachable`,
      timedOut
        ? `GitHub timed out while performing the release-catalog ${operation}.`
        : `GitHub could not be reached while performing the release-catalog ${operation}.`,
      { cause: error }
    )
  }
  return response
}

export async function githubJsonRequest(
  path,
  token,
  requestHeaders,
  options = {}
) {
  const url = path.startsWith('https://') ? path : `${GITHUB_API_URL}${path}`
  const response = await request(
    url,
    {
      headers: {
        ...requestHeaders,
        Authorization: `Bearer ${token}`,
      },
      redirect: 'error',
      signal: timeoutSignal(options.timeoutMs),
    },
    'request',
    options.fetchImpl ?? fetch
  )

  if (!response.ok) throw requestError(response.status, 'request')

  try {
    return await response.json()
  } catch (error) {
    throw new GitHubCatalogRequestError(
      'github_response_json_invalid',
      'GitHub returned an invalid release-catalog response.',
      { cause: error, status: response.status }
    )
  }
}

export async function listWorkflowRunArtifacts(
  repository,
  runId,
  token,
  requestHeaders,
  options = {}
) {
  if (!Number.isSafeInteger(runId) || runId <= 0) {
    throw new GitHubCatalogRequestError(
      'workflow_run_id_invalid',
      'A GitHub workflow run ID is invalid.'
    )
  }
  const path = repositoryApiUrl(
    repository,
    `/actions/runs/${encodeURIComponent(runId)}/artifacts?per_page=100&direction=desc`
  )
  const body = await githubJsonRequest(path, token, requestHeaders, options)
  if (!body || !Array.isArray(body.artifacts)) {
    throw new GitHubCatalogRequestError(
      'github_artifacts_response_invalid',
      'GitHub returned an invalid workflow-artifacts response.'
    )
  }
  return body.artifacts
}

function hasZipSignature(bytes) {
  return (
    bytes.byteLength >= 4 &&
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    ((bytes[2] === 0x03 && bytes[3] === 0x04) ||
      (bytes[2] === 0x05 && bytes[3] === 0x06) ||
      (bytes[2] === 0x07 && bytes[3] === 0x08))
  )
}

async function readArchive(response, maximumBytes) {
  const contentLength = Number(response.headers.get('content-length'))
  if (Number.isFinite(contentLength) && contentLength > maximumBytes) {
    throw new GitHubCatalogRequestError(
      'artifact_archive_too_large',
      'A GitHub release artifact exceeded the permitted archive size.'
    )
  }

  const bytes = new Uint8Array(await response.arrayBuffer())
  if (bytes.byteLength === 0 || bytes.byteLength > maximumBytes) {
    throw new GitHubCatalogRequestError(
      'artifact_archive_size_invalid',
      'A GitHub release artifact has an invalid archive size.'
    )
  }
  if (!hasZipSignature(bytes)) {
    throw new GitHubCatalogRequestError(
      'artifact_response_not_zip',
      'GitHub did not return a ZIP archive for a release artifact.'
    )
  }
  return bytes
}

export async function downloadArtifactArchive(
  repository,
  artifactId,
  token,
  requestHeaders,
  options = {}
) {
  if (!Number.isSafeInteger(artifactId) || artifactId <= 0) {
    throw new GitHubCatalogRequestError(
      'artifact_id_invalid',
      'A GitHub release artifact ID is invalid.'
    )
  }

  const fetchImpl = options.fetchImpl ?? fetch
  const maximumBytes = options.maximumBytes ?? DEFAULT_MAX_ARCHIVE_BYTES
  const apiUrl = repositoryApiUrl(
    repository,
    `/actions/artifacts/${encodeURIComponent(artifactId)}/zip`
  )
  const redirectResponse = await request(
    apiUrl,
    {
      headers: {
        ...requestHeaders,
        Authorization: `Bearer ${token}`,
      },
      redirect: 'manual',
      signal: timeoutSignal(options.timeoutMs),
    },
    'artifact_download',
    fetchImpl
  )

  if (!REDIRECT_STATUSES.has(redirectResponse.status)) {
    if (redirectResponse.ok) {
      throw new GitHubCatalogRequestError(
        'artifact_redirect_missing',
        'GitHub did not return the required artifact-download redirect.',
        { status: redirectResponse.status }
      )
    }
    throw requestError(redirectResponse.status, 'artifact_download')
  }

  const location = redirectResponse.headers.get('location')
  let downloadUrl
  try {
    downloadUrl = location ? new URL(location) : null
  } catch {
    downloadUrl = null
  }
  if (!downloadUrl || downloadUrl.protocol !== 'https:') {
    throw new GitHubCatalogRequestError(
      'artifact_redirect_invalid',
      'GitHub returned an invalid artifact-download redirect.'
    )
  }

  const archiveResponse = await request(
    downloadUrl.toString(),
    {
      headers: {
        Accept: 'application/zip, application/octet-stream;q=0.9',
        'User-Agent': requestHeaders['User-Agent'] || 'fanal-owner-release-catalog',
      },
      redirect: 'error',
      signal: timeoutSignal(options.timeoutMs),
    },
    'artifact_storage_download',
    fetchImpl
  )
  if (!archiveResponse.ok) {
    throw requestError(archiveResponse.status, 'artifact_storage_download')
  }

  return readArchive(archiveResponse, maximumBytes)
}

export function isGitHubCatalogRequestError(error) {
  return error instanceof GitHubCatalogRequestError
}

export function githubCatalogErrorDetails(error) {
  return isGitHubCatalogRequestError(error)
    ? { code: error.code, message: error.message, status: error.status }
    : { code: 'artifact_validation_failed', message: 'Release evidence failed validation.', status: null }
}
