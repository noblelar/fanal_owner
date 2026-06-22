export type PlatformDocumentationSection = {
  id: string
  slug: string
  title: string
  flowCount: number
}

export type PlatformDocumentationFlowSummary = {
  id: string
  documentationSectionId: string
  sectionSlug: string
  title: string
  audienceLabel?: string | null
  summary: string
  routeHint?: string | null
  isPublished: boolean
  version: number
  draftRevisionId?: string | null
  publishedRevisionId?: string | null
  draftVersionNumber?: number | null
  publishedVersionNumber?: number | null
  hasUnpublishedChanges: boolean
  sortOrder: number
  stepCount: number
  updatedAt: string
}

export type PlatformDocumentationStep = {
  id: string
  stepNumber: number
  title: string
  body: string
  imageUrl?: string | null
  imageAssetId?: string | null
  imageAlt?: string | null
  imageCaption?: string | null
  version: number
}

export type PlatformDocumentationFlowDetails = {
  id: string
  documentationSectionId: string
  sectionSlug: string
  sectionTitle: string
  slug: string
  title: string
  audienceLabel?: string | null
  summary: string
  description?: string | null
  routeHint?: string | null
  coverImageUrl?: string | null
  coverImageAssetId?: string | null
  youTubeUrl?: string | null
  videoMode: string
  estimatedReadMinutes?: number | null
  sortOrder: number
  isPublished: boolean
  version: number
  draftRevisionId?: string | null
  publishedRevisionId?: string | null
  draftVersionNumber?: number | null
  publishedVersionNumber?: number | null
  hasUnpublishedChanges: boolean
  updatedAt: string
  steps: PlatformDocumentationStep[]
}

export type PlatformDocumentationLibraryResponse = {
  activeSectionSlug: string
  sections: PlatformDocumentationSection[]
  flows: PlatformDocumentationFlowSummary[]
}

export type PlatformDocumentationPublishReadiness = {
  flowId: string
  draftRevisionId?: string | null
  flowVersion: number
  isReady: boolean
  blockers: import('./platform-documentation-contracts').PlatformDocumentationPublishBlocker[]
}
