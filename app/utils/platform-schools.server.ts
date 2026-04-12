import type { PlatformApiResult, PlatformAuthPayload } from '~/utils/platform-auth.server'
import { callPlatformApi } from '~/utils/platform-auth.server'
import type { PlatformSchoolDetails, PlatformSchoolSummary } from '~/models/platform-school'

type PlatformSchoolListResponse = {
  total: number
  schools: PlatformSchoolSummary[]
}

type PlatformSchoolDetailsResponse = {
  school: PlatformSchoolDetails
}

type PlatformSchoolLifecycleUpdateResponse = {
  message: string
  school: PlatformSchoolDetails
}

type PlatformSchoolResendApprovalEmailResponse = {
  message: string
  school: PlatformSchoolDetails
}

type PlatformSchoolProfileUpdateResponse = {
  message: string
  school: PlatformSchoolDetails
}

type PlatformSchoolDeleteResponse = {
  message: string
  schoolName?: string
}

export function listPlatformSchools(
  authState: PlatformAuthPayload,
  filters?: { search?: string; stage?: string }
) {
  const params = new URLSearchParams()

  if (filters?.search?.trim()) {
    params.set('search', filters.search.trim())
  }

  if (filters?.stage?.trim()) {
    params.set('stage', filters.stage.trim())
  }

  const query = params.toString()
  const path = query ? `/api/platform/schools?${query}` : '/api/platform/schools'

  return callPlatformApi<PlatformSchoolListResponse>(authState, path)
}

export function getPlatformSchool(authState: PlatformAuthPayload, schoolId: string) {
  return callPlatformApi<PlatformSchoolDetailsResponse>(authState, `/api/platform/schools/${schoolId}`)
}

export function updatePlatformSchoolLifecycle(
  authState: PlatformAuthPayload,
  schoolId: string,
  payload: { action: string; note?: string }
): Promise<PlatformApiResult<PlatformSchoolLifecycleUpdateResponse>> {
  return callPlatformApi<PlatformSchoolLifecycleUpdateResponse>(
    authState,
    `/api/platform/schools/${schoolId}/lifecycle`,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    }
  )
}

export function resendPlatformSchoolApprovalEmail(
  authState: PlatformAuthPayload,
  schoolId: string
): Promise<PlatformApiResult<PlatformSchoolResendApprovalEmailResponse>> {
  return callPlatformApi<PlatformSchoolResendApprovalEmailResponse>(
    authState,
    `/api/platform/schools/${schoolId}/resend-approval-email`,
    {
      method: 'POST',
    }
  )
}

export function updatePlatformSchoolProfile(
  authState: PlatformAuthPayload,
  schoolId: string,
  payload: {
    schoolName?: string
    schoolIndex?: number
    country?: string
    region?: string
    mmd?: string
    landmark?: string
    phoneNumber?: string
    email?: string
  }
): Promise<PlatformApiResult<PlatformSchoolProfileUpdateResponse>> {
  return callPlatformApi<PlatformSchoolProfileUpdateResponse>(
    authState,
    `/api/platform/schools/${schoolId}/profile`,
    {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }
  )
}

export function deleteRejectedPlatformSchool(
  authState: PlatformAuthPayload,
  schoolId: string
): Promise<PlatformApiResult<PlatformSchoolDeleteResponse>> {
  return callPlatformApi<PlatformSchoolDeleteResponse>(
    authState,
    `/api/platform/schools/${schoolId}`,
    {
      method: 'DELETE',
    }
  )
}
