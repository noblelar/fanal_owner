import { readFile } from 'node:fs/promises'

import { validatePlatformReleaseManifest } from './platform-release-contract.mjs'

const manifestPath = process.argv[2]
if (!manifestPath) {
  console.error('Usage: node scripts/validate-platform-release.mjs <manifest.json>')
  process.exit(64)
}

let manifest
try {
  manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
} catch (error) {
  console.error(`Could not read platform release manifest: ${error.message}`)
  process.exit(66)
}

const issues = validatePlatformReleaseManifest(manifest)
if (issues.length > 0) {
  console.error(`Platform release manifest is invalid: ${issues.join(', ')}`)
  process.exit(65)
}

console.log(
  JSON.stringify(
    {
      valid: true,
      platformVersion: manifest.platformVersion,
      componentVersions: Object.fromEntries(
        Object.entries(manifest.components).map(([name, component]) => [name, component.version])
      ),
      rolloutInitialStage: manifest.rolloutPolicy.initialStage,
    },
    null,
    2
  )
)
