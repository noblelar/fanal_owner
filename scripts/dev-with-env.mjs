import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import { loadLocalEnvFiles, logRelevantEnvVars } from './runtime-env.mjs'

const loadedFiles = loadLocalEnvFiles()

if (!process.env.NODE_ENV) {
  process.env.NODE_ENV = 'development'
}

logRelevantEnvVars('development', loadedFiles)

const remixCliPath = resolve(
  process.cwd(),
  'node_modules',
  '@remix-run',
  'dev',
  'dist',
  'cli.js'
)

const devProcess = spawn(process.execPath, [remixCliPath, 'vite:dev'], {
  stdio: 'inherit',
  env: process.env,
})

devProcess.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
    return
  }

  process.exit(code ?? 0)
})
