import type { ActionFunctionArgs } from '@remix-run/node'
import { json } from '@remix-run/node'
import { didPlatformAuthChange } from '~/utils/platform-auth.server'
import {
  createPlatformDocumentationUpload,
  discardPlatformDocumentationUpload,
} from '~/utils/platform-documentation.server'
import {
  clearPlatformAuthState,
  getPlatformAuthState,
  savePlatformAuthState,
} from '~/utils/session.server'

function canManageDocumentation(roles: string[]) {
  return roles.some((role) => role === 'PLATFORM_OWNER' || role === 'PLATFORM_ADMIN')
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

export async function action({ request }: ActionFunctionArgs) {
  const authState = await getPlatformAuthState(request)

  if (!authState) {
    return json({ message: 'Sign in to continue.' }, { status: 401 })
  }

  if (!canManageDocumentation(authState.user.roles)) {
    return json(
      { message: 'Only platform owners and platform admins can upload documentation images.' },
      { status: 403 }
    )
  }

  const body = (await request.json().catch(() => null)) as
    | {
        kind?: unknown
        flowId?: unknown
        stepId?: unknown
        assetId?: unknown
      }
    | null

  if (request.method === 'DELETE') {
    if (!body || !isNonEmptyString(body.assetId)) {
      return json({ message: 'A valid pending upload is required.' }, { status: 400 })
    }

    const result = await discardPlatformDocumentationUpload(authState, body.assetId.trim())
    const headers = new Headers()
    if (!result.ok && result.status === 401 && !result.authState) {
      headers.set('Set-Cookie', await clearPlatformAuthState(request))
    } else if (didPlatformAuthChange(authState, result.authState)) {
      headers.set('Set-Cookie', await savePlatformAuthState(request, result.authState!))
    }

    return result.ok
      ? json(result.data, { headers })
      : json({ message: result.error }, { headers, status: result.status })
  }

  if (!body || !isNonEmptyString(body.kind) || !isNonEmptyString(body.flowId)) {
    return json({ message: 'A valid upload target is required.' }, { status: 400 })
  }

  if (body.kind === 'flow-cover') {
    const result = await createPlatformDocumentationUpload(authState, {
      kind: 'flow-cover',
      flowId: body.flowId.trim(),
    })
    return platformUploadResponse(request, authState, result)
  }

  if (body.kind === 'step-image' && isNonEmptyString(body.stepId)) {
    const result = await createPlatformDocumentationUpload(authState, {
        kind: 'step-image',
        flowId: body.flowId.trim(),
        stepId: body.stepId.trim(),
    })
    return platformUploadResponse(request, authState, result)
  }

  return json({ message: 'A valid upload target is required.' }, { status: 400 })
}

async function platformUploadResponse(
  request: Request,
  authState: NonNullable<Awaited<ReturnType<typeof getPlatformAuthState>>>,
  result: Awaited<ReturnType<typeof createPlatformDocumentationUpload>>
) {
  const headers = new Headers()
  if (!result.ok && result.status === 401 && !result.authState) {
    headers.set('Set-Cookie', await clearPlatformAuthState(request))
  } else if (didPlatformAuthChange(authState, result.authState)) {
    headers.set('Set-Cookie', await savePlatformAuthState(request, result.authState!))
  }

  return result.ok
    ? json(result.data, { headers })
    : json({ message: result.error }, { headers, status: result.status })
}
