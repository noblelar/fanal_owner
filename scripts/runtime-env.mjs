import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const RELEVANT_ENV_KEYS = [
  'NODE_ENV',
  'HOST',
  'PORT',
  'FANAL_OWNER_API_BASE_URL',
  'COOKIE_SECURE',
  'CLOUDINARY_CLOUD_NAME',
  'CLOUDINARY_BASE_FOLDER',
  'JWT_SECRET',
  'CLOUDINARY_API_KEY',
  'CLOUDINARY_API_SECRET',
  'PLATFORM_OWNER_SESSION_SECRET',
  'SESSION_SECRET',
]

const SECRET_ENV_KEYS = new Set([
  'JWT_SECRET',
  'CLOUDINARY_API_KEY',
  'CLOUDINARY_API_SECRET',
  'PLATFORM_OWNER_SESSION_SECRET',
  'SESSION_SECRET',
])

function formatEnvValue(key, value) {
  if (!value) {
    return '(not set)'
  }

  if (SECRET_ENV_KEYS.has(key)) {
    return '[redacted]'
  }

  return value
}

export function loadDotEnvFile(filePath) {
  if (!existsSync(filePath)) {
    return false
  }

  const content = readFileSync(filePath, 'utf8')

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim()

    // This keeps comments and blank lines from affecting the runtime environment.
    if (!line || line.startsWith('#')) {
      continue
    }

    const separatorIndex = line.indexOf('=')
    if (separatorIndex < 0) {
      continue
    }

    const key = line.slice(0, separatorIndex).trim()
    if (!key || process.env[key]) {
      continue
    }

    let value = line.slice(separatorIndex + 1).trim()

    // This removes optional surrounding quotes so values behave the same as a shell-loaded .env file.
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }

    process.env[key] = value
  }

  return true
}

export function loadLocalEnvFiles() {
  const envFiles = ['.env', '.env.local'].map((fileName) => resolve(process.cwd(), fileName))
  const loadedFiles = envFiles.filter((filePath) => loadDotEnvFile(filePath))

  return loadedFiles
}

export function logRelevantEnvVars(mode, loadedFiles = []) {
  const startupMode = mode || process.env.NODE_ENV || 'unknown'
  const loadedFilesLabel =
    loadedFiles.length > 0
      ? loadedFiles.map((filePath) => filePath.split(/[/\\]/).pop()).join(', ')
      : 'none'

  console.log(`[fanal_owner] Starting server in ${startupMode} mode`)
  console.log(`[fanal_owner] Loaded env files: ${loadedFilesLabel}`)

  for (const key of RELEVANT_ENV_KEYS) {
    console.log(`[fanal_owner] env ${key}=${formatEnvValue(key, process.env[key])}`)
  }
}
