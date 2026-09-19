const SEMVER_PATTERN =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/
const STABLE_SEMVER_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/
const REVISION_PATTERN = /^[0-9a-f]{40}$/
const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/

export const PLATFORM_RELEASE_SCHEMA_VERSION = 1

export const PLATFORM_COMPONENTS = Object.freeze({
  api: Object.freeze({ repository: 'docker.io/fanalarkgroup/fanalapi' }),
  main: Object.freeze({ repository: 'docker.io/fanalarkgroup/fanal' }),
  owner: Object.freeze({ repository: 'docker.io/fanalarkgroup/fanal_owner' }),
})

const ROOT_KEYS = [
  'schemaVersion',
  'platformVersion',
  'components',
  'compatibility',
  'rolloutPolicy',
]
const COMPONENT_KEYS = ['image', 'version', 'revision']
const COMPATIBILITY_KEYS = ['apiContractMajor', 'databaseMigrationPolicy']
const ROLLOUT_KEYS = ['initialStage', 'schoolSelector', 'activation']

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasExactKeys(value, expected) {
  if (!isRecord(value)) return false
  const actual = Object.keys(value).sort()
  return actual.length === expected.length && actual.every((key, index) => key === [...expected].sort()[index])
}

export function validatePlatformReleaseManifest(manifest) {
  const issues = []

  if (!hasExactKeys(manifest, ROOT_KEYS)) {
    issues.push('manifest-root-keys-invalid')
    return issues
  }
  if (manifest.schemaVersion !== PLATFORM_RELEASE_SCHEMA_VERSION) {
    issues.push('schema-version-unsupported')
  }
  if (typeof manifest.platformVersion !== 'string' || !STABLE_SEMVER_PATTERN.test(manifest.platformVersion)) {
    issues.push('platform-version-must-be-stable-semver')
  }

  if (!hasExactKeys(manifest.components, Object.keys(PLATFORM_COMPONENTS))) {
    issues.push('component-set-invalid')
  } else {
    for (const [componentName, contract] of Object.entries(PLATFORM_COMPONENTS)) {
      const component = manifest.components[componentName]
      if (!hasExactKeys(component, COMPONENT_KEYS)) {
        issues.push(`${componentName}-keys-invalid`)
        continue
      }
      if (typeof component.version !== 'string' || !SEMVER_PATTERN.test(component.version)) {
        issues.push(`${componentName}-version-invalid`)
      }
      if (typeof component.revision !== 'string' || !REVISION_PATTERN.test(component.revision)) {
        issues.push(`${componentName}-revision-invalid`)
      }
      const expectedPrefix = `${contract.repository}@`
      const digest = typeof component.image === 'string' && component.image.startsWith(expectedPrefix)
        ? component.image.slice(expectedPrefix.length)
        : ''
      if (!DIGEST_PATTERN.test(digest)) {
        issues.push(`${componentName}-image-must-use-approved-repository-digest`)
      }
    }
  }

  if (!hasExactKeys(manifest.compatibility, COMPATIBILITY_KEYS)) {
    issues.push('compatibility-keys-invalid')
  } else {
    if (manifest.compatibility.apiContractMajor !== 1) {
      issues.push('api-contract-major-unsupported')
    }
    if (manifest.compatibility.databaseMigrationPolicy !== 'backward-compatible-only') {
      issues.push('database-migration-policy-invalid')
    }
  }

  if (!hasExactKeys(manifest.rolloutPolicy, ROLLOUT_KEYS)) {
    issues.push('rollout-policy-keys-invalid')
  } else {
    if (manifest.rolloutPolicy.initialStage !== 'test') issues.push('initial-rollout-stage-must-be-test')
    if (manifest.rolloutPolicy.schoolSelector !== 'authenticated-school-id') {
      issues.push('school-selector-invalid')
    }
    if (manifest.rolloutPolicy.activation !== 'manual') issues.push('rollout-activation-must-be-manual')
  }

  return issues
}

export function buildPlatformReleaseManifest(values) {
  return {
    schemaVersion: PLATFORM_RELEASE_SCHEMA_VERSION,
    platformVersion: values.platformVersion,
    components: {
      api: {
        image: values.apiImage,
        version: values.apiVersion,
        revision: values.apiRevision,
      },
      main: {
        image: values.mainImage,
        version: values.mainVersion,
        revision: values.mainRevision,
      },
      owner: {
        image: values.ownerImage,
        version: values.ownerVersion,
        revision: values.ownerRevision,
      },
    },
    compatibility: {
      apiContractMajor: 1,
      databaseMigrationPolicy: 'backward-compatible-only',
    },
    rolloutPolicy: {
      initialStage: 'test',
      schoolSelector: 'authenticated-school-id',
      activation: 'manual',
    },
  }
}
