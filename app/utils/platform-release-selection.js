import {
  buildPlatformReleaseManifest,
  validatePlatformReleaseManifest,
} from '../../scripts/platform-release-contract.mjs'

const COMPONENTS = ['api', 'main', 'owner']
const STABLE_SEMVER_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/
const SEMVER_PATTERN =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/
const BUMP_RANK = { none: 0, patch: 1, minor: 2, major: 3 }

function parseSemver(value) {
  const match = typeof value === 'string' ? SEMVER_PATTERN.exec(value) : null
  if (!match) return null
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4] ? match[4].split('.') : [],
  }
}

function comparePrerelease(left, right) {
  if (left.length === 0 && right.length === 0) return 0
  if (left.length === 0) return 1
  if (right.length === 0) return -1

  const length = Math.max(left.length, right.length)
  for (let index = 0; index < length; index += 1) {
    if (left[index] === undefined) return -1
    if (right[index] === undefined) return 1
    if (left[index] === right[index]) continue
    const leftNumber = /^\d+$/.test(left[index]) ? Number(left[index]) : null
    const rightNumber = /^\d+$/.test(right[index]) ? Number(right[index]) : null
    if (leftNumber !== null && rightNumber !== null) return leftNumber < rightNumber ? -1 : 1
    if (leftNumber !== null) return -1
    if (rightNumber !== null) return 1
    return left[index] < right[index] ? -1 : 1
  }
  return 0
}

export function compareSemanticVersions(leftValue, rightValue) {
  const left = parseSemver(leftValue)
  const right = parseSemver(rightValue)
  if (!left || !right) throw new Error('Cannot compare invalid Semantic Versions.')

  for (const key of ['major', 'minor', 'patch']) {
    if (left[key] !== right[key]) return left[key] < right[key] ? -1 : 1
  }
  return comparePrerelease(left.prerelease, right.prerelease)
}

function classifyVersionBump(previousVersion, nextVersion) {
  const previous = parseSemver(previousVersion)
  const next = parseSemver(nextVersion)
  if (!previous || !next) return 'none'
  if (next.major !== previous.major) return 'major'
  if (next.minor !== previous.minor) return 'minor'
  return 'patch'
}

function incrementStableVersion(value, bump) {
  const match = STABLE_SEMVER_PATTERN.exec(value)
  if (!match) throw new Error('The current platform version must be stable SemVer.')
  const major = Number(match[1])
  const minor = Number(match[2])
  const patch = Number(match[3])
  if (bump === 'major') return `${major + 1}.0.0`
  if (bump === 'minor') return `${major}.${minor + 1}.0`
  return `${major}.${minor}.${patch + 1}`
}

export function getPlatformVersionOptions(stableManifest) {
  if (!stableManifest) {
    return [{ bump: 'initial', label: 'Initial platform release', version: '1.0.0' }]
  }
  if (validatePlatformReleaseManifest(stableManifest).length > 0) return []
  return [
    { bump: 'patch', label: 'Patch', version: incrementStableVersion(stableManifest.platformVersion, 'patch') },
    { bump: 'minor', label: 'Minor', version: incrementStableVersion(stableManifest.platformVersion, 'minor') },
    { bump: 'major', label: 'Major', version: incrementStableVersion(stableManifest.platformVersion, 'major') },
  ]
}

function emptyChange(component, selected) {
  return {
    bump: 'none',
    changed: false,
    component,
    fromVersion: null,
    toVersion: selected?.version || 'Not selected',
  }
}

export function composePlatformReleaseCandidate({
  components,
  requestedPlatformVersion = 'auto',
  stableManifest,
}) {
  const issues = []
  const warnings = []
  const versionOptions = getPlatformVersionOptions(stableManifest)
  const changes = {}

  if (stableManifest) {
    const stableIssues = validatePlatformReleaseManifest(stableManifest)
    if (stableIssues.length > 0) {
      issues.push({
        code: 'stable-manifest-invalid',
        message: 'The current stable platform manifest failed validation, so composition is blocked.',
      })
    }
  }

  let requiredBump = stableManifest ? 'none' : 'initial'
  for (const component of COMPONENTS) {
    const selected = components?.[component]
    if (!selected) {
      changes[component] = emptyChange(component, selected)
      issues.push({
        code: 'component-selection-required',
        component,
        message: `Select a trusted ${component} build before previewing the candidate.`,
      })
      continue
    }

    const stable = stableManifest?.components?.[component] || null
    if (!stable) {
      changes[component] = {
        bump: 'major',
        changed: true,
        component,
        fromVersion: null,
        toVersion: selected.version,
      }
      continue
    }

    const versionOrder = compareSemanticVersions(selected.version, stable.version)
    const artifactChanged = selected.image !== stable.image || selected.revision !== stable.revision
    if (versionOrder < 0) {
      issues.push({
        code: 'component-version-regression',
        component,
        message: `${component} ${selected.version} is older than stable ${stable.version}.`,
      })
    }
    if (versionOrder === 0 && artifactChanged) {
      issues.push({
        code: 'component-version-not-advanced',
        component,
        message: `${component} changed its image or revision without advancing version ${stable.version}.`,
      })
    }
    if (versionOrder > 0 && !artifactChanged) {
      warnings.push({
        code: 'component-version-only-change',
        component,
        message: `${component} advances to ${selected.version} but retains the stable image and revision.`,
      })
    }

    const bump = versionOrder > 0 ? classifyVersionBump(stable.version, selected.version) : 'none'
    const changed = versionOrder !== 0 || artifactChanged
    changes[component] = {
      bump,
      changed,
      component,
      fromVersion: stable.version,
      toVersion: selected.version,
    }
    if (BUMP_RANK[bump] > BUMP_RANK[requiredBump]) requiredBump = bump
  }

  if (stableManifest && !COMPONENTS.some((component) => changes[component]?.changed)) {
    issues.push({
      code: 'candidate-has-no-changes',
      message: 'The candidate is identical to the current stable platform release.',
    })
  }

  const recommendedBump = requiredBump === 'none' ? 'patch' : requiredBump
  const recommendedOption =
    versionOptions.find((option) => option.bump === recommendedBump) || versionOptions[0]
  const requestedOption =
    requestedPlatformVersion === 'auto'
      ? recommendedOption
      : versionOptions.find((option) => option.version === requestedPlatformVersion)

  if (!requestedOption) {
    issues.push({
      code: 'platform-version-not-generated',
      message: 'Select one of the generated platform versions.',
    })
  } else if (
    requiredBump !== 'initial' &&
    BUMP_RANK[requestedOption.bump] < BUMP_RANK[requiredBump]
  ) {
    issues.push({
      code: 'platform-version-bump-too-small',
      message: `Platform ${requestedOption.version} is too small for the selected ${requiredBump} component change.`,
    })
  }

  const selectedPlatformVersion = requestedOption?.version || requestedPlatformVersion
  let manifest = null
  if (COMPONENTS.every((component) => components?.[component]) && requestedOption) {
    manifest = buildPlatformReleaseManifest({
      platformVersion: selectedPlatformVersion,
      apiImage: components.api.image,
      apiVersion: components.api.version,
      apiRevision: components.api.revision,
      mainImage: components.main.image,
      mainVersion: components.main.version,
      mainRevision: components.main.revision,
      ownerImage: components.owner.image,
      ownerVersion: components.owner.version,
      ownerRevision: components.owner.revision,
    })
    const manifestIssues = validatePlatformReleaseManifest(manifest)
    if (manifestIssues.length > 0) {
      issues.push({
        code: 'candidate-manifest-invalid',
        message: `The generated platform manifest is invalid: ${manifestIssues.join(', ')}.`,
      })
      manifest = null
    }
  }

  return {
    changes,
    issues,
    manifest: issues.length === 0 ? manifest : null,
    recommendedBump,
    recommendedPlatformVersion: recommendedOption?.version || '1.0.0',
    selectedPlatformVersion,
    versionOptions,
    warnings,
  }
}
