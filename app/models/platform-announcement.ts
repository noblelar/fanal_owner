export type AnnouncementEnumValue = number | string

export type AnnouncementStatusName = 'Scheduled' | 'Published' | 'Expired' | 'Suspended' | 'Deleted'
export type AnnouncementPriorityName = 'Normal' | 'Important' | 'Urgent'
export type AnnouncementTargetTypeName =
  | 'AllPlatformUsers'
  | 'School'
  | 'WholeSchool'
  | 'Role'
  | 'User'
  | 'Class'
  | 'ClassParents'
  | 'Department'
  | 'DepartmentParents'
  | 'Program'
  | 'ProgramParents'
  | 'Section'
  | 'SectionParents'

export type AnnouncementTargetOption = {
  id: string
  label: string
}

export type PlatformAnnouncementComposerOptions = {
  availableTargetTypes: AnnouncementEnumValue[]
  availableRoles: string[]
  schools: AnnouncementTargetOption[]
  classes: AnnouncementTargetOption[]
  departments: AnnouncementTargetOption[]
  programs: AnnouncementTargetOption[]
}

export type PlatformAnnouncementListItem = {
  announcementId: string
  scope: AnnouncementEnumValue
  status: AnnouncementEnumValue
  priority: AnnouncementEnumValue
  title: string
  category: string
  createdByDisplayName: string
  createdByRole: string
  requiresAcknowledgement: boolean
  version: number
  publishAt: string
  publishedAt?: string | null
  expiresAt: string
  createdAt: string
  updatedAt: string
  deletedAt?: string | null
  targetCount: number
  recipientCount: number
  readCount: number
  acknowledgedCount: number
  attachmentCount: number
  isSuspendedForCurrentSchool: boolean
  canEdit: boolean
  canDelete: boolean
  canSuspend: boolean
  canRestore: boolean
  canViewAcknowledgements: boolean
}

export type PlatformAnnouncementDetail = PlatformAnnouncementListItem & {
  body: string
  targets: PlatformAnnouncementTarget[]
}

export type PlatformAnnouncementTarget = {
  announcementTargetId: string
  targetType: AnnouncementEnumValue
  targetId?: string | null
  schoolId?: string | null
  targetLabel: string
  targetRole?: string | null
  createdAt: string
}

export type PlatformAnnouncementPagedResult<T> = {
  page: number
  pageSize: number
  totalCount: number
  items: T[]
}

export const statusNames: AnnouncementStatusName[] = [
  'Scheduled',
  'Published',
  'Expired',
  'Suspended',
  'Deleted',
]

export const priorityNames: AnnouncementPriorityName[] = ['Normal', 'Important', 'Urgent']

export const targetTypeNames: AnnouncementTargetTypeName[] = [
  'AllPlatformUsers',
  'School',
  'WholeSchool',
  'Role',
  'User',
  'Class',
  'ClassParents',
  'Department',
  'DepartmentParents',
  'Program',
  'ProgramParents',
  'Section',
  'SectionParents',
]

export const priorityPayload: Record<AnnouncementPriorityName, number> = {
  Normal: 0,
  Important: 1,
  Urgent: 2,
}

export const targetTypePayload: Record<AnnouncementTargetTypeName, number> = {
  AllPlatformUsers: 0,
  School: 1,
  WholeSchool: 2,
  Role: 3,
  User: 4,
  Class: 5,
  ClassParents: 6,
  Department: 7,
  DepartmentParents: 8,
  Program: 9,
  ProgramParents: 10,
  Section: 11,
  SectionParents: 12,
}

export function normalizeAnnouncementEnumName<T extends string>(
  value: AnnouncementEnumValue,
  names: readonly T[],
  fallback: T
) {
  if (typeof value === 'number') {
    return names[value] ?? fallback
  }

  return names.find((name) => name.toLowerCase() === value.toLowerCase()) ?? fallback
}
