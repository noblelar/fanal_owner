export type PlatformSchoolLifecycleActionOption = {
  action: string
  label: string
  description: string
  tone: string
  requiresNote: boolean
  notePlaceholder: string
  confirmationTitle: string
  confirmationMessage: string
}

export type PlatformSchoolLifecycleState = {
  stage: string
  stageLabel: string
  statusHeadline: string
  statusMessage: string
  approvalStatus: string
  workingStatus: string
  availableActions: string[]
  availableActionOptions: PlatformSchoolLifecycleActionOption[]
}

export type PlatformSchoolActivationState = {
  stage: string
  stageLabel: string
  nextAction: string
  statusHeadline: string
  statusMessage: string
  canLogin: boolean
  emailConfirmed: boolean
  approved: boolean
  needsInitialPasswordSetup: boolean
  approvalStatus: string
}

export type PlatformSchoolSummary = {
  id: string
  schoolName: string
  schoolIndex: number
  crest: string
  country: string
  region: string
  mmd: string
  landmark?: string | null
  phoneNumber: string
  email: string
  emailConfirmed: boolean
  applicationDate: string
  approved: boolean
  approvalDate?: string | null
  approvalStatus: string
  workingStatus: string
  activationState: PlatformSchoolActivationState
  lifecycleState: PlatformSchoolLifecycleState
}

export type PlatformSchoolReview = {
  id: string
  action: string
  note: string
  createdAt: string
}

export type PlatformSchoolLifecycleEvent = {
  id: string
  action: string
  note: string
  actorDisplayName?: string | null
  actorPlatformUserId?: string | null
  createdAt: string
}

export type PlatformSchoolAuditEntry = {
  id: string
  action: string
  note: string
  source: string
  schoolVisibleMessage?: string | null
  actorDisplayName?: string | null
  actorPlatformUserId?: string | null
  createdAt: string
}

export type PlatformSchoolDetails = PlatformSchoolSummary & {
  phoneNumberConfirmed: boolean
  auditTrail: PlatformSchoolAuditEntry[]
}

export const platformSchoolStageOptions = [
  { value: 'submitted', label: 'Submitted' },
  { value: 'email_verified', label: 'Email verified' },
  { value: 'pending_review', label: 'Pending review' },
  { value: 'approved_setup_required', label: 'Approved - setup pending' },
  { value: 'active', label: 'Active' },
  { value: 'suspended', label: 'Suspended' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'blacklisted', label: 'Blacklisted' },
]
