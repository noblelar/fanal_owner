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
  imageAlt?: string | null
  imageCaption?: string | null
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
  youTubeUrl?: string | null
  videoMode: string
  estimatedReadMinutes?: number | null
  sortOrder: number
  isPublished: boolean
  updatedAt: string
  steps: PlatformDocumentationStep[]
}

export type PlatformDocumentationLibraryResponse = {
  activeSectionSlug: string
  sections: PlatformDocumentationSection[]
  flows: PlatformDocumentationFlowSummary[]
}
