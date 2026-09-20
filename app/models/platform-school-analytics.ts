export type PlatformSchoolStaffRoleBreakdown = {
  role: string
  label: string
  count: number
}

export type PlatformSchoolLatestLogin = {
  userId: string
  displayName: string
  role: string
  roleLabel: string
  occurredAtUtc: string
}

// This contract mirrors the dedicated owner API and remains separate from school-admin analytics.
export type PlatformSchoolAnalytics = {
  schoolId: string
  totalStaff: number
  staffByRole: PlatformSchoolStaffRoleBreakdown[]
  totalEnrolledStudents: number
  totalParents: number
  pendingApplications: number
  latestLogin: PlatformSchoolLatestLogin | null
  generatedAtUtc: string
}
