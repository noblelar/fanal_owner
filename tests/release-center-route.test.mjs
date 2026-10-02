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
const composerSource = await readFile(
  new URL('../app/components/platform-release-composer.tsx', import.meta.url),
  'utf8'
)

test('the Release Center requires an authenticated Owner or Admin role', () => {
  assert.match(routeSource, /requirePlatformAuthState\(request\)/)
  assert.match(routeSource, /PLATFORM_OWNER/)
  assert.match(routeSource, /PLATFORM_ADMIN/)
  assert.match(routeSource, /status: 403/)
})

test('Phase 3 composition remains a GET-only preview with no mutation action', () => {
  assert.doesNotMatch(routeSource, /export\s+(?:async\s+)?function\s+action/)
  assert.doesNotMatch(routeSource, /method=["']post["']/i)
  assert.doesNotMatch(routeSource, /deploy-candidate|promote-candidate|rollback-candidate/)
  assert.match(composerSource, /<Form method="get"/)
  assert.doesNotMatch(composerSource, /method=["']post["']/i)
  assert.match(composerSource, /Preview only/)
})

test('catalog access stays server-side and uses short-lived installation credentials', () => {
  assert.match(catalogSource, /getGitHubCatalogInstallationToken/)
  assert.match(appAuthSource, /installations\/\$\{encodeURIComponent\(installationId\)\}\/access_tokens/)
  assert.match(appAuthSource, /GITHUB_CATALOG_PRIVATE_KEY_FILE/)
  assert.doesNotMatch(routeSource, /GITHUB_CATALOG_PRIVATE_KEY_FILE/)
})
