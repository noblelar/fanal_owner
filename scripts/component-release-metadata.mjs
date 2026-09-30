import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const SEMVER_PATTERN =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/
const REVISION_PATTERN = /^[0-9a-f]{40}$/
const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/

export const COMPONENT_RELEASE_SCHEMA_VERSION = 1

export const COMPONENT_RELEASE_COMPONENTS = Object.freeze({
  api: Object.freeze({
    repository: 'noblelar/fanalAPI',
    imageRepository: 'docker.io/fanalarkgroup/fanalapi',
  }),
  main: Object.freeze({
    repository: 'noblelar/fanal_main',
    imageRepository: 'docker.io/fanalarkgroup/fanal',
  }),
  owner: Object.freeze({
    repository: 'noblelar/fanal_owner',
    imageRepository: 'docker.io/fanalarkgroup/fanal_owner',
  }),
})

const METADATA_KEYS = [
  'schema_version',
  'component',
  'repository',
  'branch',
  'workflow_run_id',
  'workflow_run_attempt',
  'workflow_run_url',
  'version',
  'revision',
  'image',
  'created_at',
]

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasExactKeys(value, expected) {
  if (!isRecord(value)) return false
  const actual = Object.keys(value).sort()
  const sortedExpected = [...expected].sort()
  return actual.length === sortedExpected.length && actual.every((key, index) => key === sortedExpected[index])
}

function isCanonicalIsoTimestamp(value) {
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) return false
  return new Date(value).toISOString() === value
}

export function validateComponentReleaseMetadata(metadata) {
  const issues = []

  if (!hasExactKeys(metadata, METADATA_KEYS)) {
    issues.push('metadata-keys-invalid')
    return issues
  }

  if (metadata.schema_version !== COMPONENT_RELEASE_SCHEMA_VERSION) {
    issues.push('schema-version-unsupported')
  }

  const contract = COMPONENT_RELEASE_COMPONENTS[metadata.component]
  if (!contract) {
    issues.push('component-invalid')
    return issues
  }

  if (metadata.repository !== contract.repository) issues.push('repository-invalid')
  if (metadata.branch !== 'master') issues.push('branch-must-be-master')
  if (!Number.isSafeInteger(metadata.workflow_run_id) || metadata.workflow_run_id <= 0) {
    issues.push('workflow-run-id-invalid')
  }
  if (!Number.isSafeInteger(metadata.workflow_run_attempt) || metadata.workflow_run_attempt <= 0) {
    issues.push('workflow-run-attempt-invalid')
  }

  const expectedRunUrl = `https://github.com/${contract.repository}/actions/runs/${metadata.workflow_run_id}`
  if (metadata.workflow_run_url !== expectedRunUrl) issues.push('workflow-run-url-invalid')
  if (typeof metadata.version !== 'string' || !SEMVER_PATTERN.test(metadata.version)) {
    issues.push('version-invalid')
  }
  if (typeof metadata.revision !== 'string' || !REVISION_PATTERN.test(metadata.revision)) {
    issues.push('revision-invalid')
  }

  const expectedImagePrefix = `${contract.imageRepository}@`
  const digest = typeof metadata.image === 'string' && metadata.image.startsWith(expectedImagePrefix)
    ? metadata.image.slice(expectedImagePrefix.length)
    : ''
  if (!DIGEST_PATTERN.test(digest)) issues.push('image-must-use-approved-repository-digest')
  if (!isCanonicalIsoTimestamp(metadata.created_at)) issues.push('created-at-invalid')

  return issues
}

export function buildComponentReleaseMetadata(values) {
  return {
    schema_version: COMPONENT_RELEASE_SCHEMA_VERSION,
    component: values.component,
    repository: values.repository,
    branch: values.branch,
    workflow_run_id: Number(values.workflowRunId),
    workflow_run_attempt: Number(values.workflowRunAttempt),
    workflow_run_url: values.workflowRunUrl,
    version: values.version,
    revision: values.revision,
    image: values.image,
    created_at: values.createdAt,
  }
}

function requiredEnvironmentValue(name) {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is required`)
  return value
}

async function main() {
  const metadata = buildComponentReleaseMetadata({
    component: requiredEnvironmentValue('COMPONENT_RELEASE_COMPONENT'),
    repository: requiredEnvironmentValue('COMPONENT_RELEASE_REPOSITORY'),
    branch: requiredEnvironmentValue('COMPONENT_RELEASE_BRANCH'),
    workflowRunId: requiredEnvironmentValue('COMPONENT_RELEASE_WORKFLOW_RUN_ID'),
    workflowRunAttempt: requiredEnvironmentValue('COMPONENT_RELEASE_WORKFLOW_RUN_ATTEMPT'),
    workflowRunUrl: requiredEnvironmentValue('COMPONENT_RELEASE_WORKFLOW_RUN_URL'),
    version: requiredEnvironmentValue('COMPONENT_RELEASE_VERSION'),
    revision: requiredEnvironmentValue('COMPONENT_RELEASE_REVISION'),
    image: requiredEnvironmentValue('COMPONENT_RELEASE_IMAGE'),
    createdAt: process.env.COMPONENT_RELEASE_CREATED_AT || new Date().toISOString(),
  })

  const issues = validateComponentReleaseMetadata(metadata)
  if (issues.length > 0) {
    throw new Error(`Component release metadata is invalid: ${issues.join(', ')}`)
  }

  const outputPath = resolve(
    process.env.COMPONENT_RELEASE_OUTPUT || 'release-artifacts/component-release.json'
  )
  await mkdir(dirname(outputPath), { recursive: true })
  await writeFile(outputPath, `${JSON.stringify(metadata, null, 2)}\n`, 'utf8')
  process.stdout.write(`Validated component release metadata written to ${outputPath}\n`)
}

const invokedModule = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : ''
if (import.meta.url === invokedModule) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  })
}
