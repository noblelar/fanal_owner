import { createCookieSessionStorage, redirect } from '@remix-run/node'
import type { PlatformAuthPayload } from '~/utils/platform-auth.server'

const SESSION_KEY = 'platform-auth'

function getSessionSecret() {
  const configuredSecret =
    process.env.JWT_SECRET ??
    process.env.PLATFORM_OWNER_SESSION_SECRET ??
    process.env.SESSION_SECRET ??
    (process.env.NODE_ENV === 'production'
      ? null
      : 'platform-owner-dev-session-secret-change-me')

  if (!configuredSecret) {
    throw new Error('JWT_SECRET must be configured for fanal_owner.')
  }

  return configuredSecret
}

function getSessionStorage() {
  return createCookieSessionStorage({
    cookie: {
      name: '__fanal_platform_session',
      httpOnly: true,
      path: '/',
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      secrets: [getSessionSecret()],
      maxAge: 60 * 60 * 24 * 7,
    },
  })
}

export async function getPlatformSession(cookieHeader: string | null) {
  return getSessionStorage().getSession(cookieHeader)
}

export async function commitPlatformSession(session: Awaited<ReturnType<typeof getPlatformSession>>) {
  return getSessionStorage().commitSession(session)
}

export async function destroyPlatformSession(session: Awaited<ReturnType<typeof getPlatformSession>>) {
  return getSessionStorage().destroySession(session)
}

export async function getPlatformAuthState(request: Request) {
  const session = await getPlatformSession(request.headers.get('Cookie'))
  return (session.get(SESSION_KEY) as PlatformAuthPayload | undefined) ?? null
}

export async function savePlatformAuthState(request: Request, authState: PlatformAuthPayload) {
  const session = await getPlatformSession(request.headers.get('Cookie'))
  session.set(SESSION_KEY, authState)
  return commitPlatformSession(session)
}

export async function clearPlatformAuthState(request: Request) {
  const session = await getPlatformSession(request.headers.get('Cookie'))
  return destroyPlatformSession(session)
}

export async function requirePlatformAuthState(request: Request) {
  const authState = await getPlatformAuthState(request)
  if (!authState) {
    throw redirect('/login')
  }

  return authState
}
