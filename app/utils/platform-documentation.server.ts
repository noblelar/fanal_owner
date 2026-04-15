import type { PlatformApiResult, PlatformAuthPayload } from '~/utils/platform-auth.server'
import { callPlatformApi } from '~/utils/platform-auth.server'
import type {
  PlatformDocumentationFlowDetails,
  PlatformDocumentationLibraryResponse,
} from '~/models/platform-documentation'

type PlatformDocumentationFlowResponse = {
  flow: PlatformDocumentationFlowDetails
}

type PlatformDocumentationFlowMutationResponse = {
  message: string
  flow: PlatformDocumentationFlowDetails
}

export function getPlatformDocumentationLibrary(
  authState: PlatformAuthPayload,
  filters?: { section?: string; search?: string }
) {
  const params = new URLSearchParams()

  if (filters?.section?.trim()) {
    params.set('section', filters.section.trim())
  }

  if (filters?.search?.trim()) {
    params.set('search', filters.search.trim())
  }

  const query = params.toString()
  const path = query
    ? `/api/platform/documentation/library?${query}`
    : '/api/platform/documentation/library'

  return callPlatformApi<PlatformDocumentationLibraryResponse>(authState, path)
}

export function getPlatformDocumentationFlow(
  authState: PlatformAuthPayload,
  flowId: string
) {
  return callPlatformApi<PlatformDocumentationFlowResponse>(
    authState,
    `/api/platform/documentation/flows/${flowId}`
  )
}

export function createPlatformDocumentationFlow(
  authState: PlatformAuthPayload,
  payload: { sectionSlug: string; title?: string }
): Promise<PlatformApiResult<PlatformDocumentationFlowMutationResponse>> {
  return callPlatformApi<PlatformDocumentationFlowMutationResponse>(
    authState,
    '/api/platform/documentation/flows',
    {
      method: 'POST',
      body: JSON.stringify(payload),
    }
  )
}

export function updatePlatformDocumentationFlow(
  authState: PlatformAuthPayload,
  flowId: string,
  payload: {
    sectionSlug?: string
    title?: string
    audienceLabel?: string
    summary?: string
    description?: string
    routeHint?: string
    coverImageUrl?: string
    youTubeUrl?: string
    videoMode?: string
    estimatedReadMinutes?: number
  }
): Promise<PlatformApiResult<PlatformDocumentationFlowMutationResponse>> {
  return callPlatformApi<PlatformDocumentationFlowMutationResponse>(
    authState,
    `/api/platform/documentation/flows/${flowId}`,
    {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }
  )
}

export function publishPlatformDocumentationFlow(
  authState: PlatformAuthPayload,
  flowId: string
): Promise<PlatformApiResult<PlatformDocumentationFlowMutationResponse>> {
  return callPlatformApi<PlatformDocumentationFlowMutationResponse>(
    authState,
    `/api/platform/documentation/flows/${flowId}/publish`,
    {
      method: 'POST',
    }
  )
}

export function unpublishPlatformDocumentationFlow(
  authState: PlatformAuthPayload,
  flowId: string
): Promise<PlatformApiResult<PlatformDocumentationFlowMutationResponse>> {
  return callPlatformApi<PlatformDocumentationFlowMutationResponse>(
    authState,
    `/api/platform/documentation/flows/${flowId}/unpublish`,
    {
      method: 'POST',
    }
  )
}

export function addPlatformDocumentationStep(
  authState: PlatformAuthPayload,
  flowId: string,
  payload?: {
    title?: string
    body?: string
    imageUrl?: string
    imageAlt?: string
    imageCaption?: string
  }
): Promise<PlatformApiResult<PlatformDocumentationFlowMutationResponse>> {
  return callPlatformApi<PlatformDocumentationFlowMutationResponse>(
    authState,
    `/api/platform/documentation/flows/${flowId}/steps`,
    {
      method: 'POST',
      body: JSON.stringify(payload ?? {}),
    }
  )
}

export function updatePlatformDocumentationStep(
  authState: PlatformAuthPayload,
  stepId: string,
  payload: {
    title?: string
    body?: string
    imageUrl?: string
    imageAlt?: string
    imageCaption?: string
  }
): Promise<PlatformApiResult<PlatformDocumentationFlowMutationResponse>> {
  return callPlatformApi<PlatformDocumentationFlowMutationResponse>(
    authState,
    `/api/platform/documentation/steps/${stepId}`,
    {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }
  )
}

export function reorderPlatformDocumentationSteps(
  authState: PlatformAuthPayload,
  flowId: string,
  payload: { stepId: string; direction: 'up' | 'down' }
): Promise<PlatformApiResult<PlatformDocumentationFlowMutationResponse>> {
  return callPlatformApi<PlatformDocumentationFlowMutationResponse>(
    authState,
    `/api/platform/documentation/flows/${flowId}/steps/reorder`,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    }
  )
}

export function deletePlatformDocumentationStep(
  authState: PlatformAuthPayload,
  stepId: string
): Promise<PlatformApiResult<PlatformDocumentationFlowMutationResponse>> {
  return callPlatformApi<PlatformDocumentationFlowMutationResponse>(
    authState,
    `/api/platform/documentation/steps/${stepId}`,
    {
      method: 'DELETE',
    }
  )
}
