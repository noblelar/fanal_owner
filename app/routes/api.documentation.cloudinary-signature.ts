import type { ActionFunctionArgs } from '@remix-run/node'
import { json } from '@remix-run/node'
import { buildSignedDocumentationUpload } from '~/utils/documentation-cloudinary.server'
import { getPlatformAuthState } from '~/utils/session.server'

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
      }
    | null

  if (!body || !isNonEmptyString(body.kind) || !isNonEmptyString(body.flowId)) {
    return json({ message: 'A valid upload target is required.' }, { status: 400 })
  }

  if (body.kind === 'flow-cover') {
    return json(buildSignedDocumentationUpload({ kind: 'flow-cover', flowId: body.flowId.trim() }))
  }

  if (body.kind === 'step-image' && isNonEmptyString(body.stepId)) {
    return json(
      buildSignedDocumentationUpload({
        kind: 'step-image',
        flowId: body.flowId.trim(),
        stepId: body.stepId.trim(),
      })
    )
  }

  return json({ message: 'A valid upload target is required.' }, { status: 400 })
}
