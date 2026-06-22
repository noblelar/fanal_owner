export const documentationValidationRules = {
  sectionSlugMaxLength: 50,
  slugMaxLength: 100,
  titleMaxLength: 160,
  audienceMaxLength: 80,
  summaryMaxLength: 2_000,
  descriptionMaxLength: 12_000,
  routeHintMaxLength: 255,
  urlMaxLength: 2_048,
  stepBodyMaxLength: 12_000,
  imageAltMaxLength: 255,
  imageCaptionMaxLength: 1_000,
  revisionStatusMaxLength: 32,
} as const

export const documentationErrorCodes = {
  validationFailed: 'documentation_validation_failed',
  versionConflict: 'documentation_version_conflict',
  notFound: 'documentation_not_found',
  revisionNotEditable: 'documentation_revision_not_editable',
  publishBlocked: 'documentation_publish_blocked',
  orderConflict: 'documentation_order_conflict',
} as const

export type PlatformDocumentationRevisionStatus =
  | 'draft'
  | 'published'
  | 'superseded'

export type PlatformDocumentationRevision = {
  id: string
  flowId: string
  versionNumber: number
  status: PlatformDocumentationRevisionStatus
  title: string
  basedOnRevisionId?: string | null
  version: number
  createdByPlatformUserId?: string | null
  publishedByPlatformUserId?: string | null
  createdAt: string
  updatedAt: string
  publishedAt?: string | null
}

export type PlatformDocumentationPublishBlocker = {
  code: string
  message: string
  field?: string | null
  stepId?: string | null
}

export type PlatformDocumentationError = {
  code: string
  message: string
  fieldErrors: Record<string, string[]>
  publishBlockers: PlatformDocumentationPublishBlocker[]
  expectedVersion?: number | null
  currentVersion?: number | null
}

export type PlatformDocumentationStepOrderRequest = {
  expectedVersion: number
  orderedStepIds: string[]
}
