import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const routeSource = await readFile(new URL('../app/routes/releases.tsx', import.meta.url), 'utf8')
const catalogSource = await readFile(
  new URL('../app/utils/github-release-catalog.server.ts', import.meta.url),
  'utf8'
)
const appAuthSource = await readFile(
  new URL('../app/utils/github-app.server.ts', import.meta.url),
  'utf8'
)
const dispatchSource = await readFile(
  new URL('../app/utils/github-platform-release-dispatch.server.ts', import.meta.url),
  'utf8'
)
const csrfSource = await readFile(new URL('../app/utils/csrf.server.ts', import.meta.url), 'utf8')
const composerSource = await readFile(
  new URL('../app/components/platform-release-composer.tsx', import.meta.url),
  'utf8'
)

test('Release Center viewing requires Owner or Admin while dispatch requires Owner', () => {
  assert.match(routeSource, /requirePlatformAuthState\(request\)/)
  assert.match(routeSource, /PLATFORM_OWNER/)
  assert.match(routeSource, /PLATFORM_ADMIN/)
  assert.match(routeSource, /Only a PLATFORM_OWNER can dispatch/)
  assert.match(routeSource, /, 403\)/)
})

test('Phase 4 dispatch is POST-only, CSRF-protected, and explicitly confirmed', () => {
  assert.match(routeSource, /export async function action/)
  assert.match(routeSource, /request\.method !== 'POST'/)
  assert.match(routeSource, /verifyReleaseCsrfToken/)
  assert.match(routeSource, /confirmOperation/)
  assert.match(composerSource, /<Form method="post"/)
  assert.match(composerSource, /name="_csrf"/)
  assert.match(composerSource, /name="confirmOperation"/)
  assert.match(csrfSource, /timingSafeEqual/)
})

test('server reloads trusted artifacts and never accepts raw release coordinates', () => {
  assert.match(routeSource, /getReadOnlyReleaseCatalog\(\{ forceRefresh: true \}\)/)
  assert.match(routeSource, /resolveTrustedComponentSelection/)
  assert.match(routeSource, /composePlatformReleaseCandidate/)
  assert.doesNotMatch(composerSource, /name="(?:api|main|owner)_(?:image|version|revision)"/)
  assert.match(dispatchSource, /buildPlatformReleaseDispatch/)
})

test('dispatch fails closed and preserves duplicate and active-run guards', () => {
  assert.match(dispatchSource, /GITHUB_CATALOG_DISPATCH_ENABLED/)
  assert.match(dispatchSource, /reserveDispatch/)
  assert.match(routeSource, /findActivePlatformOperation/)
  assert.match(routeSource, /historyError/)
})

test('catalog and dispatch credentials remain server-side installation credentials', () => {
  assert.match(catalogSource, /getGitHubCatalogInstallationToken/)
  assert.match(dispatchSource, /getGitHubCatalogInstallationToken/)
  assert.match(appAuthSource, /installations\/\$\{encodeURIComponent\(installationId\)\}\/access_tokens/)
  assert.match(appAuthSource, /GITHUB_CATALOG_PRIVATE_KEY_FILE/)
  assert.doesNotMatch(routeSource, /GITHUB_CATALOG_PRIVATE_KEY_FILE/)
})
