import { writeFile } from 'node:fs/promises'

import {
  buildPlatformReleaseManifest,
  validatePlatformReleaseManifest,
} from './platform-release-contract.mjs'

const outputPath = process.argv[2]
if (!outputPath) {
  console.error('Usage: node scripts/create-platform-release.mjs <output.json>')
  process.exit(64)
}

const manifest = buildPlatformReleaseManifest({
  platformVersion: process.env.PLATFORM_VERSION,
  apiImage: process.env.API_IMAGE,
  apiVersion: process.env.API_VERSION,
  apiRevision: process.env.API_REVISION,
  mainImage: process.env.MAIN_IMAGE,
  mainVersion: process.env.MAIN_VERSION,
  mainRevision: process.env.MAIN_REVISION,
  ownerImage: process.env.OWNER_IMAGE,
  ownerVersion: process.env.OWNER_VERSION,
  ownerRevision: process.env.OWNER_REVISION,
})

const issues = validatePlatformReleaseManifest(manifest)
if (issues.length > 0) {
  console.error(`Platform release manifest is invalid: ${issues.join(', ')}`)
  process.exit(65)
}

await writeFile(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
console.log(`Created validated platform ${manifest.platformVersion} manifest at ${outputPath}`)
