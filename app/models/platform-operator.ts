// This model mirrors the platform-operator payload returned by the owner-management API.
export type PlatformOperator = {
  id: string
  email: string
  firstName: string
  lastName: string
  displayName?: string | null
  roles: string[]
  isActive: boolean
  createdAt?: string
  invitationSentAt?: string | null
  invitationAcceptedAt?: string | null
  lastLoginAt?: string | null
  requiresPasswordSetup: boolean
}
