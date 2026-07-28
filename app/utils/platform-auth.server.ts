export type PlatformSessionUser = {
  id: string
  email: string
  firstName: string
  lastName: string
  displayName: string
  roles: string[]
  isActive: boolean
  createdAt?: string
  lastLoginAt?: string | null
  sourceUserProfileId?: string | null
  sourceSchoolId?: string | null
}

export type PlatformAuthPayload = {
  accessToken: string
  refreshToken: string
  user: PlatformSessionUser
}

export type PlatformApiResult<T> =
  | {
      ok: true
      status: number
      data: T
      authState: PlatformAuthPayload
    }
  | {
      ok: false
      status: number
      error: string
      details?: unknown
      authState?: PlatformAuthPayload
    }

type PlatformApiError = {
  code?: string
  message?: string
}

function isMessageBody(value: unknown): value is PlatformApiError {
  return typeof value === 'object' && value !== null
}

const DEFAULT_HEADERS = {
  'Content-Type': 'application/json',
  Accept: 'application/json',
}

function authenticationHeaders(request?: Request) {
  const headers = new Headers(DEFAULT_HEADERS)
  const realIp = request?.headers.get('x-real-ip')?.trim()
  const forwardedIp = request?.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  const clientIp = realIp || forwardedIp

  if (clientIp && /^[0-9a-f:.]+$/i.test(clientIp)) {
    headers.set('X-Forwarded-For', clientIp)
  }

  return headers
}

export function getPlatformApiBaseUrl() {
  return process.env.FANAL_OWNER_API_BASE_URL ?? null
}

export async function loginPlatformUser(email: string, password: string, request?: Request) {
  const baseUrl = getPlatformApiBaseUrl()
  if (!baseUrl) {
    return {
      ok: false as const,
      status: 500,
      error: 'Platform API URL is not configured. Set FANAL_OWNER_API_BASE_URL.',
    }
  }

  let response: Response
  try {
    response = await fetch(`${baseUrl}/api/platform/auth/login`, {
      method: 'POST',
      headers: authenticationHeaders(request),
      body: JSON.stringify({ email, password }),
      cache: 'no-store',
      signal: AbortSignal.timeout(30_000),
    })
  } catch {
    return {
      ok: false as const,
      status: 503,
      error: 'The platform sign-in service is unavailable. Please try again shortly.',
    }
  }

  const body = (await response.json().catch(() => null)) as
    | PlatformAuthPayload
    | PlatformApiError
    | null

  if (!response.ok || !body || !('accessToken' in body) || !('refreshToken' in body) || !('user' in body)) {
    const retryAfter = response.headers.get('retry-after') ?? undefined
    const retryAfterSeconds = Number(retryAfter)
    const retryMessage =
      Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
        ? `Too many sign-in attempts. Please try again in about ${Math.max(
            1,
            Math.ceil(retryAfterSeconds / 60)
          )} minute(s).`
        : 'Too many sign-in attempts. Please wait a few minutes and try again.'
    return {
      ok: false as const,
      status: response.status,
      retryAfter,
      error:
        (response.status === 429
          ? retryMessage
          : body && 'message' in body && typeof body.message === 'string' && body.message) ||
        'Unable to sign in to the platform right now.',
    }
  }

  return {
    ok: true as const,
    payload: body,
  }
}

export async function completePlatformInvite(token: string, newPassword: string, request?: Request) {
  const baseUrl = getPlatformApiBaseUrl()
  if (!baseUrl) {
    return {
      ok: false as const,
      status: 500,
      error: 'Platform API URL is not configured. Set FANAL_OWNER_API_BASE_URL.',
    }
  }

  const response = await fetch(`${baseUrl}/api/platform/auth/accept-invite`, {
    method: 'POST',
    headers: authenticationHeaders(request),
    body: JSON.stringify({ token, newPassword }),
    cache: 'no-store',
    signal: AbortSignal.timeout(30_000),
  })

  const body = (await response.json().catch(() => null)) as
    | { message?: string }
    | null

  if (!response.ok) {
    return {
      ok: false as const,
      status: response.status,
      error: body?.message || 'Unable to complete the platform invite right now.',
    }
  }

  return {
    ok: true as const,
    message: body?.message || 'Your platform password has been created successfully.',
  }
}

export async function fetchPlatformUser(accessToken: string) {
  const baseUrl = getPlatformApiBaseUrl()
  if (!baseUrl) {
    return {
      ok: false as const,
      status: 500,
      error: 'Platform API URL is not configured for session validation.',
    }
  }

  const response = await fetch(`${baseUrl}/api/platform/auth/me`, {
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
  })

  const body = (await response.json().catch(() => null)) as
    | { user?: PlatformSessionUser; message?: string }
    | null

  if (!response.ok || !body?.user) {
    return {
      ok: false as const,
      status: response.status,
      error: body?.message || 'Unable to validate the platform session.',
    }
  }

  return {
    ok: true as const,
    user: body.user,
  }
}

export async function refreshPlatformAuth(refreshToken: string) {
  const baseUrl = getPlatformApiBaseUrl()
  if (!baseUrl) {
    return {
      ok: false as const,
      status: 500,
      error: 'Platform API URL is not configured for session refresh.',
    }
  }

  const response = await fetch(`${baseUrl}/api/platform/auth/refresh-token`, {
    method: 'POST',
    headers: DEFAULT_HEADERS,
    body: JSON.stringify({ refreshToken }),
  })

  const body = (await response.json().catch(() => null)) as
    | PlatformAuthPayload
    | PlatformApiError
    | null

  if (!response.ok || !body || !('accessToken' in body) || !('refreshToken' in body) || !('user' in body)) {
    return {
      ok: false as const,
      status: response.status,
      error:
        (body && 'message' in body && typeof body.message === 'string' && body.message) ||
        'Unable to refresh the platform session.',
    }
  }

  return {
    ok: true as const,
    payload: body,
  }
}

export async function logoutPlatformUser(refreshToken: string) {
  const baseUrl = getPlatformApiBaseUrl()
  if (!baseUrl) {
    return
  }

  await fetch(`${baseUrl}/api/platform/auth/logout`, {
    method: 'POST',
    headers: DEFAULT_HEADERS,
    body: JSON.stringify({ refreshToken }),
  }).catch(() => null)
}

export async function callPlatformApi<T>(
  authState: PlatformAuthPayload,
  path: string,
  init?: RequestInit
): Promise<PlatformApiResult<T>> {
  const baseUrl = getPlatformApiBaseUrl()
  if (!baseUrl) {
    return {
      ok: false,
      status: 500,
      error: 'Platform API URL is not configured.',
    }
  }

  const makeRequest = async (currentAuthState: PlatformAuthPayload) => {
    const headers = new Headers(init?.headers ?? {})
    headers.set('Accept', 'application/json')
    headers.set('Authorization', `Bearer ${currentAuthState.accessToken}`)

    if (init?.body && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json')
    }

    return fetch(`${baseUrl}${path}`, {
      ...init,
      headers,
    })
  }

  let activeAuthState = authState
  let response = await makeRequest(activeAuthState)

  if (response.status === 401) {
    const refreshResult = await refreshPlatformAuth(activeAuthState.refreshToken)
    if (!refreshResult.ok) {
      return {
        ok: false,
        status: refreshResult.status,
        error: refreshResult.error,
      }
    }

    activeAuthState = refreshResult.payload
    response = await makeRequest(activeAuthState)
  }

  const body = (await response.json().catch(() => null)) as
    | T
    | { message?: string }
    | null

  if (!response.ok || body === null) {
    return {
      ok: false,
      status: response.status,
      error:
        (isMessageBody(body) && typeof body.message === 'string' && body.message) ||
        'Unable to complete the platform request.',
      details: body ?? undefined,
      authState: activeAuthState,
    }
  }

  return {
    ok: true,
    status: response.status,
    data: body as T,
    authState: activeAuthState,
  }
}

export function didPlatformAuthChange(
  originalAuthState: PlatformAuthPayload,
  nextAuthState?: PlatformAuthPayload
) {
  if (!nextAuthState) {
    return false
  }

  return JSON.stringify(originalAuthState) !== JSON.stringify(nextAuthState)
}
