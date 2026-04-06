import { spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function loadDotEnvFile(filePath) {
  if (!existsSync(filePath)) {
    return
  }

  const content = readFileSync(filePath, 'utf8')

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim()

    // This keeps comments and blank lines from affecting the local runtime environment.
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
}

// This bootstraps the local .env files before the production Remix server starts.
loadDotEnvFile(resolve(process.cwd(), '.env'))
loadDotEnvFile(resolve(process.cwd(), '.env.local'))

const remixServeCliPath = resolve(
  process.cwd(),
  'node_modules',
  '@remix-run',
  'serve',
  'dist',
  'cli.js'
)

const serverProcess = spawn(process.execPath, [remixServeCliPath, './build/server/index.js'], {
  stdio: 'inherit',
  env: process.env,
})

serverProcess.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
    return
  }

  process.exit(code ?? 0)
})
