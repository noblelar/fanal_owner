import { spawn } from 'node:child_process'
import { resolve } from 'node:path'

const remixCliPath = resolve(
  process.cwd(),
  'node_modules',
  '@remix-run',
  'dev',
  'dist',
  'cli.js'
)

const child = spawn(
  process.execPath,
  [remixCliPath, 'vite:dev', '--host', '127.0.0.1', '--port', '4173'],
  {
    stdio: 'inherit',
    env: {
      ...process.env,
      NODE_ENV: 'development',
      FANAL_OWNER_API_BASE_URL: 'http://127.0.0.1:4174',
      COOKIE_SECURE: 'false',
      JWT_SECRET: 'fanal-owner-e2e-session-secret',
    },
  }
)

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal)
  else process.exit(code ?? 0)
})

function shutdown(signal) {
  child.kill(signal)
}

process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))
