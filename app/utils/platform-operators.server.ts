import type { PlatformAuthPayload, PlatformApiResult } from '~/utils/platform-auth.server'
import { callPlatformApi } from '~/utils/platform-auth.server'
import type { PlatformOperator } from '~/models/platform-operator'

type PlatformOperatorMutationResponse = {
  message: string
  user: PlatformOperator
}

type PlatformOperatorDeleteResponse = {
  message: string
}

// This payload matches the shared invite form fields used by owners and admins.
type CreatePlatformOperatorPayload = {
  email: string
  firstName: string
  lastName: string
  displayName?: string
}

// This helper loads the live platform operator list from the phase-four API surface.
export function listPlatformOperators(authState: PlatformAuthPayload) {
  return callPlatformApi<PlatformOperator[]>(authState, '/api/platform/operators')
}

// This helper lets only platform owners invite additional owner accounts.
export function createPlatformOwner(
  authState: PlatformAuthPayload,
  payload: CreatePlatformOperatorPayload
): Promise<PlatformApiResult<PlatformOperatorMutationResponse>> {
  return callPlatformApi<PlatformOperatorMutationResponse>(authState, '/api/platform/operators/owners', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

// This helper lets owners and admins invite platform admins without elevating to owner.
export function createPlatformAdmin(
  authState: PlatformAuthPayload,
  payload: CreatePlatformOperatorPayload
): Promise<PlatformApiResult<PlatformOperatorMutationResponse>> {
  return callPlatformApi<PlatformOperatorMutationResponse>(
    authState,
    '/api/platform/operators/admins',
    {
      method: 'POST',
      body: JSON.stringify(payload),
    }
  )
}

// This helper resends an operator invite when the platform account still needs first-time password setup.
export function resendPlatformOperatorInvite(
  authState: PlatformAuthPayload,
  operatorId: string
): Promise<PlatformApiResult<PlatformOperatorMutationResponse>> {
  return callPlatformApi<PlatformOperatorMutationResponse>(
    authState,
    `/api/platform/operators/${operatorId}/resend-invite`,
    {
      method: 'POST',
    }
  )
}

// This helper removes platform-admin access while leaving owner accounts protected on the API.
export function removePlatformAdmin(
  authState: PlatformAuthPayload,
  operatorId: string
): Promise<PlatformApiResult<PlatformOperatorDeleteResponse>> {
  return callPlatformApi<PlatformOperatorDeleteResponse>(
    authState,
    `/api/platform/operators/admins/${operatorId}`,
    {
      method: 'DELETE',
    }
  )
}
