import { createSign } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { isAbsolute } from 'node:path'

const GITHUB_API_VERSION = '2022-11-28'
const GITHUB_API_URL = 'https://api.github.com'
const TOKEN_REFRESH_SKEW_MS = 60_000
const CATALOG_REPOSITORIES = ['fanalAPI', 'fanal_main', 'fanal_owner']

type GitHubInstallationToken = {
  expiresAt: number
  token: string
}

let cachedInstallationToken: GitHubInstallationToken | null = null
let inFlightInstallationToken: Promise<GitHubInstallationToken> | null = null

export class GitHubCatalogConfigurationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'GitHubCatalogConfigurationError'
  }
}

function requiredConfiguration(name: string) {
  const value = process.env[name]?.trim()
  if (!value) {
    throw new GitHubCatalogConfigurationError(
      'The GitHub release catalog is not configured. Add the catalog GitHub App credentials to the Owner service.'
    )
  }
  return value
}

function encodeBase64Url(value: string | Buffer) {
  return Buffer.from(value).toString('base64url')
}

function createGitHubAppJwt(appId: string, privateKey: string) {
  const now = Math.floor(Date.now() / 1000)
  const header = encodeBase64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const payload = encodeBase64Url(
    JSON.stringify({
      exp: now + 9 * 60,
      iat: now - 60,
      iss: appId,
    })
  )
  const unsignedToken = `${header}.${payload}`
  const signer = createSign('RSA-SHA256')
  signer.update(unsignedToken)
  signer.end()
  return `${unsignedToken}.${encodeBase64Url(signer.sign(privateKey))}`
}

async function createInstallationToken(): Promise<GitHubInstallationToken> {
  const appId = requiredConfiguration('GITHUB_CATALOG_APP_ID')
  const installationId = requiredConfiguration('GITHUB_CATALOG_INSTALLATION_ID')
  const privateKeyFile = requiredConfiguration('GITHUB_CATALOG_PRIVATE_KEY_FILE')

  if (!/^\d+$/.test(appId) || !/^\d+$/.test(installationId) || !isAbsolute(privateKeyFile)) {
    throw new GitHubCatalogConfigurationError(
      'The GitHub release catalog configuration is invalid. Verify the App ID, installation ID, and absolute private-key file path.'
    )
  }

  let privateKey: string
  try {
    privateKey = await readFile(privateKeyFile, 'utf8')
  } catch {
    throw new GitHubCatalogConfigurationError(
      'The GitHub release catalog private-key file cannot be read by the Owner service.'
    )
  }

  if (privateKey.length > 32_768 || !privateKey.includes('PRIVATE KEY')) {
    throw new GitHubCatalogConfigurationError(
      'The GitHub release catalog private-key file is not a valid PEM private key.'
    )
  }

  const appJwt = createGitHubAppJwt(appId, privateKey)
  let response: Response
  try {
    response = await fetch(
      `${GITHUB_API_URL}/app/installations/${encodeURIComponent(installationId)}/access_tokens`,
      {
        method: 'POST',
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${appJwt}`,
          'Content-Type': 'application/json',
          'User-Agent': 'fanal-owner-release-catalog',
          'X-GitHub-Api-Version': GITHUB_API_VERSION,
        },
        body: JSON.stringify({ repositories: CATALOG_REPOSITORIES }),
        signal: AbortSignal.timeout(15_000),
      }
    )
  } catch {
    throw new Error('GitHub could not be reached while creating a release-catalog token.')
  }

  const body = (await response.json().catch(() => null)) as
    | { expires_at?: string; message?: string; token?: string }
    | null

  if (!response.ok || !body?.token || !body.expires_at) {
    throw new Error(
      response.status === 403
        ? 'The GitHub Catalog App is not authorized for the required repositories.'
        : 'GitHub did not issue a valid release-catalog token.'
    )
  }

  const expiresAt = Date.parse(body.expires_at)
  if (!Number.isFinite(expiresAt)) {
    throw new Error('GitHub returned an invalid release-catalog token expiry time.')
  }

  return { expiresAt, token: body.token }
}

export async function getGitHubCatalogInstallationToken() {
  if (
    cachedInstallationToken &&
    cachedInstallationToken.expiresAt - TOKEN_REFRESH_SKEW_MS > Date.now()
  ) {
    return cachedInstallationToken.token
  }

  if (!inFlightInstallationToken) {
    inFlightInstallationToken = createInstallationToken().finally(() => {
      inFlightInstallationToken = null
    })
  }

  cachedInstallationToken = await inFlightInstallationToken
  return cachedInstallationToken.token
}

export const githubCatalogRequestHeaders = Object.freeze({
  Accept: 'application/vnd.github+json',
  'User-Agent': 'fanal-owner-release-catalog',
  'X-GitHub-Api-Version': GITHUB_API_VERSION,
})
