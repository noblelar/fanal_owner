import { randomBytes, timingSafeEqual } from 'node:crypto'
import { commitPlatformSession, getPlatformSession } from '~/utils/session.server'

const RELEASE_CSRF_SESSION_KEY = 'release-csrf-token'
const CSRF_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/

function matchesToken(expected: string, submitted: string) {
  if (!CSRF_TOKEN_PATTERN.test(expected) || !CSRF_TOKEN_PATTERN.test(submitted)) {
    return false
  }

  const expectedBytes = Buffer.from(expected)
  const submittedBytes = Buffer.from(submitted)
  return (
    expectedBytes.length === submittedBytes.length &&
    timingSafeEqual(expectedBytes, submittedBytes)
  )
}

export async function getOrCreateReleaseCsrfToken(request: Request) {
  const session = await getPlatformSession(request.headers.get('Cookie'))
  const existingToken = session.get(RELEASE_CSRF_SESSION_KEY)
  if (typeof existingToken === 'string' && CSRF_TOKEN_PATTERN.test(existingToken)) {
    return { token: existingToken, setCookie: null }
  }

  const token = randomBytes(32).toString('base64url')
  session.set(RELEASE_CSRF_SESSION_KEY, token)
  return {
    token,
    setCookie: await commitPlatformSession(session),
  }
}

export async function verifyReleaseCsrfToken(request: Request, submittedToken: unknown) {
  if (typeof submittedToken !== 'string') return false
  const session = await getPlatformSession(request.headers.get('Cookie'))
  const expectedToken = session.get(RELEASE_CSRF_SESSION_KEY)
  return typeof expectedToken === 'string' && matchesToken(expectedToken, submittedToken)
}
