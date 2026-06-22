import type { PlatformApiResult, PlatformAuthPayload } from '~/utils/platform-auth.server'
import { callPlatformApi } from '~/utils/platform-auth.server'
import type {
  PlatformDocumentationFlowDetails,
  PlatformDocumentationLibraryResponse,
  PlatformDocumentationPublishReadiness,
} from '~/models/platform-documentation'
import type {
  PlatformDocumentationRevision,
  PlatformDocumentationStepOrderRequest,
} from '~/models/platform-documentation-contracts'

type PlatformDocumentationFlowResponse = {
  flow: PlatformDocumentationFlowDetails
}

type PlatformDocumentationFlowMutationResponse = {
  message: string
  flow: PlatformDocumentationFlowDetails
}

type PlatformDocumentationRevisionResponse = {
  revisions: PlatformDocumentationRevision[]
}

export type PlatformDocumentationUploadResponse = {
  assetId: string
  uploadUrl: string
  apiKey: string
  timestamp: number
  folder: string
  publicId: string
  signature: string
  allowedFormats: string
  expiresAt: string
}

type PlatformDocumentationFlowDeletionResponse = {
  message: string
  deletedFlowId: string
  sectionSlug: string
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

export function getPlatformDocumentationRevisions(
  authState: PlatformAuthPayload,
  flowId: string
) {
  return callPlatformApi<PlatformDocumentationRevisionResponse>(
    authState,
    `/api/platform/documentation/flows/${flowId}/revisions`
  )
}

export function getPlatformDocumentationPublishReadiness(
  authState: PlatformAuthPayload,
  flowId: string
) {
  return callPlatformApi<PlatformDocumentationPublishReadiness>(
    authState,
    `/api/platform/documentation/flows/${flowId}/publish-readiness`
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
    coverImageAssetId?: string
    youTubeUrl?: string
    videoMode?: string
    estimatedReadMinutes?: number
    expectedVersion?: number
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
  flowId: string,
  expectedVersion: number
): Promise<PlatformApiResult<PlatformDocumentationFlowMutationResponse>> {
  return callPlatformApi<PlatformDocumentationFlowMutationResponse>(
    authState,
    `/api/platform/documentation/flows/${flowId}/publish`,
    {
      method: 'POST',
      body: JSON.stringify({ expectedVersion }),
    }
  )
}

export function createPlatformDocumentationDraft(
  authState: PlatformAuthPayload,
  flowId: string,
  expectedVersion: number
): Promise<PlatformApiResult<PlatformDocumentationFlowMutationResponse>> {
  return callPlatformApi<PlatformDocumentationFlowMutationResponse>(
    authState,
    `/api/platform/documentation/flows/${flowId}/draft`,
    {
      method: 'POST',
      body: JSON.stringify({ expectedVersion }),
    }
  )
}

export function discardPlatformDocumentationDraft(
  authState: PlatformAuthPayload,
  flowId: string,
  expectedVersion: number
): Promise<PlatformApiResult<PlatformDocumentationFlowMutationResponse>> {
  return callPlatformApi<PlatformDocumentationFlowMutationResponse>(
    authState,
    `/api/platform/documentation/flows/${flowId}/draft?expectedVersion=${expectedVersion}`,
    { method: 'DELETE' }
  )
}

export function rollbackPlatformDocumentationFlow(
  authState: PlatformAuthPayload,
  flowId: string,
  revisionId: string,
  expectedVersion: number
): Promise<PlatformApiResult<PlatformDocumentationFlowMutationResponse>> {
  return callPlatformApi<PlatformDocumentationFlowMutationResponse>(
    authState,
    `/api/platform/documentation/flows/${flowId}/rollback`,
    {
      method: 'POST',
      body: JSON.stringify({ revisionId, expectedVersion }),
    }
  )
}

export function unpublishPlatformDocumentationFlow(
  authState: PlatformAuthPayload,
  flowId: string,
  expectedVersion: number
): Promise<PlatformApiResult<PlatformDocumentationFlowMutationResponse>> {
  return callPlatformApi<PlatformDocumentationFlowMutationResponse>(
    authState,
    `/api/platform/documentation/flows/${flowId}/unpublish`,
    {
      method: 'POST',
      body: JSON.stringify({ expectedVersion }),
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
    expectedVersion?: number
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
    imageAssetId?: string
    imageAlt?: string
    imageCaption?: string
    expectedVersion?: number
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
  payload: { stepId: string; direction: 'up' | 'down'; expectedVersion?: number }
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

export function setPlatformDocumentationStepOrder(
  authState: PlatformAuthPayload,
  flowId: string,
  payload: PlatformDocumentationStepOrderRequest
): Promise<PlatformApiResult<PlatformDocumentationFlowMutationResponse>> {
  return callPlatformApi<PlatformDocumentationFlowMutationResponse>(
    authState,
    `/api/platform/documentation/flows/${flowId}/steps/order`,
    {
      method: 'PUT',
      body: JSON.stringify(payload),
    }
  )
}

export function deletePlatformDocumentationStep(
  authState: PlatformAuthPayload,
  stepId: string,
  expectedVersion: number
): Promise<PlatformApiResult<PlatformDocumentationFlowMutationResponse>> {
  return callPlatformApi<PlatformDocumentationFlowMutationResponse>(
    authState,
    `/api/platform/documentation/steps/${stepId}?expectedVersion=${expectedVersion}`,
    {
      method: 'DELETE',
    }
  )
}

export function deletePlatformDocumentationFlow(
  authState: PlatformAuthPayload,
  flowId: string,
  expectedVersion: number
): Promise<PlatformApiResult<PlatformDocumentationFlowDeletionResponse>> {
  return callPlatformApi<PlatformDocumentationFlowDeletionResponse>(
    authState,
    `/api/platform/documentation/flows/${flowId}?expectedVersion=${expectedVersion}`,
    { method: 'DELETE' }
  )
}

export function createPlatformDocumentationUpload(
  authState: PlatformAuthPayload,
  payload: { kind: 'flow-cover' | 'step-image'; flowId: string; stepId?: string }
): Promise<PlatformApiResult<PlatformDocumentationUploadResponse>> {
  return callPlatformApi<PlatformDocumentationUploadResponse>(
    authState,
    '/api/platform/documentation/uploads',
    {
      method: 'POST',
      body: JSON.stringify(payload),
    }
  )
}

export function discardPlatformDocumentationUpload(
  authState: PlatformAuthPayload,
  assetId: string
): Promise<PlatformApiResult<{ message: string }>> {
  return callPlatformApi<{ message: string }>(
    authState,
    `/api/platform/documentation/uploads/${assetId}`,
    { method: 'DELETE' }
  )
}
