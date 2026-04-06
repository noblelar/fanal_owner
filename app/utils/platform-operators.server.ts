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

// This payload matches the shared operator-creation form fields used by owners and admins.
type CreatePlatformOperatorPayload = {
  email: string
  firstName: string
  lastName: string
  displayName?: string
  password: string
}

// This helper loads the live platform operator list from the phase-four API surface.
export function listPlatformOperators(authState: PlatformAuthPayload) {
  return callPlatformApi<PlatformOperator[]>(authState, '/api/platform/operators')
}

// This helper lets only platform owners create additional owner accounts.
export function createPlatformOwner(
  authState: PlatformAuthPayload,
  payload: CreatePlatformOperatorPayload
): Promise<PlatformApiResult<PlatformOperatorMutationResponse>> {
  return callPlatformApi<PlatformOperatorMutationResponse>(authState, '/api/platform/operators/owners', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

// This helper lets owners and admins create platform admins without elevating to owner.
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
