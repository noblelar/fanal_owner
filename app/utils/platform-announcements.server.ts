import type {
  PlatformAnnouncementComposerOptions,
  PlatformAnnouncementDetail,
  PlatformAnnouncementListItem,
  PlatformAnnouncementPagedResult,
} from '~/models/platform-announcement'
import type { PlatformApiResult, PlatformAuthPayload } from '~/utils/platform-auth.server'
import { callPlatformApi } from '~/utils/platform-auth.server'

type AnnouncementLifecycleResult = {
  announcementId: string
  status: number | string
  version: number
  recipientCount: number
  notificationCount: number
  publishAt: string
  publishedAt?: string | null
  expiresAt: string
}

export type PlatformAnnouncementPayload = {
  title: string
  body: string
  category: string
  priority: number
  publishAt?: string
  expiresAt?: string
  requiresAcknowledgement: boolean
  targets?: Array<{
    targetType: number
    targetId?: string
    schoolId?: string
    targetRole?: string
    targetLabel?: string
  }>
  changeSummary?: string
}

export function getPlatformAnnouncementComposerOptions(
  authState: PlatformAuthPayload
): Promise<PlatformApiResult<PlatformAnnouncementComposerOptions>> {
  return callPlatformApi<PlatformAnnouncementComposerOptions>(
    authState,
    '/api/announcements/platform/composer-options'
  )
}

export function listPlatformAnnouncements(
  authState: PlatformAuthPayload,
  filters?: { search?: string; status?: string }
): Promise<PlatformApiResult<PlatformAnnouncementPagedResult<PlatformAnnouncementListItem>>> {
  const params = new URLSearchParams({
    page: '1',
    pageSize: '50',
    includeExpired: 'true',
  })

  if (filters?.search?.trim()) {
    params.set('search', filters.search.trim())
  }

  if (filters?.status?.trim() && filters.status !== 'All') {
    params.set('status', filters.status.trim())
  }

  return callPlatformApi<PlatformAnnouncementPagedResult<PlatformAnnouncementListItem>>(
    authState,
    `/api/announcements/platform?${params.toString()}`
  )
}

export function getPlatformAnnouncement(
  authState: PlatformAuthPayload,
  announcementId: string
): Promise<PlatformApiResult<PlatformAnnouncementDetail>> {
  return callPlatformApi<PlatformAnnouncementDetail>(
    authState,
    `/api/announcements/platform/${announcementId}`
  )
}

export function createPlatformAnnouncement(
  authState: PlatformAuthPayload,
  payload: PlatformAnnouncementPayload
): Promise<PlatformApiResult<AnnouncementLifecycleResult>> {
  return callPlatformApi<AnnouncementLifecycleResult>(authState, '/api/announcements/platform', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function updatePlatformAnnouncement(
  authState: PlatformAuthPayload,
  announcementId: string,
  payload: PlatformAnnouncementPayload
): Promise<PlatformApiResult<AnnouncementLifecycleResult>> {
  return callPlatformApi<AnnouncementLifecycleResult>(
    authState,
    `/api/announcements/platform/${announcementId}`,
    {
      method: 'PUT',
      body: JSON.stringify(payload),
    }
  )
}

export function deletePlatformAnnouncement(
  authState: PlatformAuthPayload,
  announcementId: string
): Promise<PlatformApiResult<AnnouncementLifecycleResult>> {
  return callPlatformApi<AnnouncementLifecycleResult>(
    authState,
    `/api/announcements/platform/${announcementId}`,
    {
      method: 'DELETE',
    }
  )
}
