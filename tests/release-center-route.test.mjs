import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const routeSource = await readFile(new URL('../app/routes/releases.tsx', import.meta.url), 'utf8')
const catalogSource = await readFile(
  new URL('../app/utils/github-release-catalog.server.ts', import.meta.url),
  'utf8'
)
const catalogClientSource = await readFile(
  new URL('../app/utils/github-catalog-client.server.js', import.meta.url),
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
const lifecycleSource = await readFile(
  new URL('../app/components/platform-release-lifecycle.tsx', import.meta.url),
  'utf8'
)

test('Release Center viewing requires Owner or Admin while dispatch requires Owner', () => {
  assert.match(routeSource, /requirePlatformAuthState\(request\)/)
  assert.match(routeSource, /PLATFORM_OWNER/)
  assert.match(routeSource, /PLATFORM_ADMIN/)
  assert.match(routeSource, /Only a PLATFORM_OWNER can dispatch/)
  assert.match(routeSource, /, 403\)/)
})

test('Phase 5 lifecycle actions are POST-only, CSRF-protected, and explicitly confirmed', () => {
  assert.match(routeSource, /export async function action/)
  assert.match(routeSource, /request\.method !== 'POST'/)
  assert.match(routeSource, /verifyReleaseCsrfToken/)
  assert.match(routeSource, /confirmOperation/)
  assert.match(composerSource, /<Form method="post"/)
  assert.match(composerSource, /name="_csrf"/)
  assert.match(composerSource, /name="confirmOperation"/)
  assert.match(lifecycleSource, /<Form method="post"/)
  assert.match(lifecycleSource, /name="_csrf"/)
  assert.match(lifecycleSource, /name="confirmOperation"/)
  assert.match(routeSource, /verify-candidate/)
  assert.match(routeSource, /promote-candidate/)
  assert.match(csrfSource, /timingSafeEqual/)
})

test('server reloads trusted artifacts and never accepts raw release coordinates', () => {
  assert.match(routeSource, /getReadOnlyReleaseCatalog\(\{ forceRefresh: true \}\)/)
  assert.match(routeSource, /resolveTrustedComponentSelection/)
  assert.match(routeSource, /composePlatformReleaseCandidate/)
  assert.doesNotMatch(composerSource, /name="(?:api|main|owner)_(?:image|version|revision)"/)
  assert.doesNotMatch(lifecycleSource, /name="(?:api|main|owner)_(?:image|version|revision)"/)
  assert.match(lifecycleSource, /name="candidateRunId"/)
  assert.match(routeSource, /candidate\.manifest/)
  assert.match(dispatchSource, /buildPlatformReleaseDispatch/)
})

test('dispatch fails closed and preserves duplicate and active-run guards', () => {
  assert.match(dispatchSource, /GITHUB_CATALOG_DISPATCH_ENABLED/)
  assert.match(dispatchSource, /reserveDispatch/)
  assert.match(routeSource, /findActivePlatformOperation/)
  assert.match(routeSource, /historyError/)
  assert.match(routeSource, /candidate changed after this page was loaded/i)
  assert.match(routeSource, /must pass verification before promotion/i)
  assert.match(dispatchSource, /options\.operation/)
})

test('catalog preserves stable evidence and derives the active lifecycle independently', () => {
  assert.match(catalogSource, /derivePlatformReleaseLineage/)
  assert.match(catalogSource, /activeCandidate/)
  assert.match(catalogSource, /manifestsMatch/)
  assert.match(lifecycleSource, /Deployment evidence/)
  assert.match(lifecycleSource, /Verification evidence/)
})

test('catalog correlates artifacts per workflow run and classifies archive failures', () => {
  assert.match(catalogSource, /listWorkflowRunArtifacts/)
  assert.doesNotMatch(catalogSource, /listRepositoryArtifacts/)
  assert.match(catalogSource, /artifactDownloadsFailed/)
  assert.match(catalogSource, /artifactValidationFailed/)
  assert.match(catalogClientSource, /redirect: 'manual'/)
  assert.match(catalogClientSource, /redirect: 'error'/)
  assert.match(catalogClientSource, /artifact_response_not_zip/)
  assert.match(catalogClientSource, /Authorization: `Bearer \$\{token\}`/)
})

test('catalog and dispatch credentials remain server-side installation credentials', () => {
  assert.match(catalogSource, /getGitHubCatalogInstallationToken/)
  assert.match(dispatchSource, /getGitHubCatalogInstallationToken/)
  assert.match(appAuthSource, /installations\/\$\{encodeURIComponent\(installationId\)\}\/access_tokens/)
  assert.match(appAuthSource, /GITHUB_CATALOG_PRIVATE_KEY_FILE/)
  assert.doesNotMatch(routeSource, /GITHUB_CATALOG_PRIVATE_KEY_FILE/)
})
