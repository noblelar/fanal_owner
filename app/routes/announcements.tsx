import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from '@remix-run/node'
import { json, redirect } from '@remix-run/node'
import { Form, Link, useActionData, useLoaderData, useNavigation } from '@remix-run/react'
import { FeedbackAlert } from '~/components/feedback-alert'
import { PlatformShell } from '~/components/platform-shell'
import type {
  AnnouncementPriorityName,
  AnnouncementTargetTypeName,
  PlatformAnnouncementComposerOptions,
  PlatformAnnouncementDetail,
  PlatformAnnouncementListItem,
} from '~/models/platform-announcement'
import {
  normalizeAnnouncementEnumName,
  priorityNames,
  priorityPayload,
  statusNames,
  targetTypePayload,
} from '~/models/platform-announcement'
import { didPlatformAuthChange } from '~/utils/platform-auth.server'
import type { PlatformAuthPayload } from '~/utils/platform-auth.server'
import {
  createPlatformAnnouncement,
  deletePlatformAnnouncement,
  getPlatformAnnouncement,
  getPlatformAnnouncementComposerOptions,
  listPlatformAnnouncements,
  updatePlatformAnnouncement,
} from '~/utils/platform-announcements.server'
import {
  clearPlatformAuthState,
  requirePlatformAuthState,
  savePlatformAuthState,
} from '~/utils/session.server'
import { buildFanalMeta } from '~/utils/site-meta'

type LoaderData = {
  announcements: PlatformAnnouncementListItem[]
  composerOptions: PlatformAnnouncementComposerOptions
  editAnnouncement?: PlatformAnnouncementDetail | null
  error?: string
  search: string
  status: string
  total: number
}

type ActionData = {
  error?: string
  success?: string
  intent?: string
}

const defaultComposerOptions: PlatformAnnouncementComposerOptions = {
  availableTargetTypes: [],
  availableRoles: [],
  schools: [],
  classes: [],
  departments: [],
  programs: [],
}

export const meta: MetaFunction = () => buildFanalMeta('Platform Announcements')

async function buildAuthHeaders(
  request: Request,
  originalAuthState: PlatformAuthPayload,
  nextAuthState?: PlatformAuthPayload
) {
  if (!didPlatformAuthChange(originalAuthState, nextAuthState)) {
    return undefined
  }

  return {
    'Set-Cookie': await savePlatformAuthState(request, nextAuthState!),
  }
}

function isAnnouncementManager(authState: PlatformAuthPayload) {
  return authState.user.roles.some(
    (role) => role === 'PLATFORM_OWNER' || role === 'PLATFORM_ADMIN'
  )
}

function formatDateTime(value?: string | null) {
  if (!value) return 'Not set'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Not set'
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

function toDateTimeLocalValue(value?: string | null) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const offset = date.getTimezoneOffset()
  return new Date(date.getTime() - offset * 60 * 1000).toISOString().slice(0, 16)
}

function dateTimeLocalToIso(value: FormDataEntryValue | null) {
  const rawValue = String(value ?? '').trim()
  if (!rawValue) return undefined
  const date = new Date(rawValue)
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString()
}

function normalizeStatus(value: PlatformAnnouncementListItem['status']) {
  return normalizeAnnouncementEnumName(value, statusNames, 'Scheduled')
}

function normalizePriority(value: PlatformAnnouncementListItem['priority']) {
  return normalizeAnnouncementEnumName(value, priorityNames, 'Normal')
}

function buildTargetPayload(formData: FormData) {
  const targetType = String(formData.get('targetType') ?? 'AllPlatformUsers') as AnnouncementTargetTypeName
  const schoolId = String(formData.get('schoolId') ?? '').trim()
  const targetRole = String(formData.get('targetRole') ?? '').trim()

  if (targetType === 'School') {
    return [
      {
        targetType: targetTypePayload.School,
        targetId: schoolId || undefined,
        schoolId: schoolId || undefined,
        targetLabel: schoolId ? `School ${schoolId}` : 'School',
      },
    ]
  }

  if (targetType === 'WholeSchool') {
    return [
      {
        targetType: targetTypePayload.WholeSchool,
        schoolId: schoolId || undefined,
        targetLabel: schoolId ? `Whole school ${schoolId}` : 'Whole school',
      },
    ]
  }

  if (targetType === 'Role') {
    return [
      {
        targetType: targetTypePayload.Role,
        targetRole: targetRole || undefined,
        targetLabel: targetRole || 'Role',
      },
    ]
  }

  return [
    {
      targetType: targetTypePayload.AllPlatformUsers,
      targetLabel: 'All platform users',
    },
  ]
}

function buildAnnouncementPayload(formData: FormData, includeTargets: boolean) {
  const priority = String(formData.get('priority') ?? 'Normal') as AnnouncementPriorityName
  const requiresAcknowledgement = priority === 'Urgent' || formData.get('requiresAcknowledgement') === 'on'
  const changeSummary = String(formData.get('changeSummary') ?? '').trim()

  return {
    title: String(formData.get('title') ?? '').trim(),
    body: String(formData.get('body') ?? '').trim(),
    category: String(formData.get('category') ?? '').trim() || 'General',
    priority: priorityPayload[priority] ?? priorityPayload.Normal,
    publishAt: dateTimeLocalToIso(formData.get('publishAt')),
    expiresAt: dateTimeLocalToIso(formData.get('expiresAt')),
    requiresAcknowledgement,
    ...(includeTargets ? { targets: buildTargetPayload(formData) } : {}),
    ...(changeSummary ? { changeSummary } : {}),
  }
}

export async function loader({ request }: LoaderFunctionArgs) {
  const authState = await requirePlatformAuthState(request)
  if (!isAnnouncementManager(authState)) {
    return json<LoaderData>(
      {
        announcements: [],
        composerOptions: defaultComposerOptions,
        error: 'Only platform owners and platform admins can manage platform announcements.',
        search: '',
        status: 'All',
        total: 0,
      },
      { status: 403 }
    )
  }

  const url = new URL(request.url)
  const search = url.searchParams.get('search') ?? ''
  const status = url.searchParams.get('status') ?? 'All'
  const editId = url.searchParams.get('edit')

  let activeAuthState = authState
  const optionsResult = await getPlatformAnnouncementComposerOptions(activeAuthState)
  if (!optionsResult.ok && optionsResult.status === 401 && !optionsResult.authState) {
    return redirect('/login', {
      headers: {
        'Set-Cookie': await clearPlatformAuthState(request),
      },
    })
  }

  if (optionsResult.authState) {
    activeAuthState = optionsResult.authState
  }

  const listResult = await listPlatformAnnouncements(activeAuthState, { search, status })
  if (!listResult.ok && listResult.status === 401 && !listResult.authState) {
    return redirect('/login', {
      headers: {
        'Set-Cookie': await clearPlatformAuthState(request),
      },
    })
  }

  if (listResult.authState) {
    activeAuthState = listResult.authState
  }

  let editAnnouncement: PlatformAnnouncementDetail | null = null
  let editError: string | undefined
  if (editId) {
    const detailResult = await getPlatformAnnouncement(activeAuthState, editId)
    if (detailResult.authState) {
      activeAuthState = detailResult.authState
    }

    if (detailResult.ok) {
      editAnnouncement = detailResult.data
    } else {
      editError = detailResult.error
    }
  }

  const headers = await buildAuthHeaders(request, authState, activeAuthState)
  const error =
    (!optionsResult.ok ? optionsResult.error : undefined) ||
    (!listResult.ok ? listResult.error : undefined) ||
    editError

  return json<LoaderData>(
    {
      announcements: listResult.ok ? listResult.data.items : [],
      composerOptions: optionsResult.ok ? optionsResult.data : defaultComposerOptions,
      editAnnouncement,
      error,
      search,
      status,
      total: listResult.ok ? listResult.data.totalCount : 0,
    },
    { headers, status: error ? 500 : 200 }
  )
}

export async function action({ request }: ActionFunctionArgs) {
  const authState = await requirePlatformAuthState(request)
  if (!isAnnouncementManager(authState)) {
    return json<ActionData>(
      {
        intent: 'forbidden',
        error: 'Only platform owners and platform admins can manage platform announcements.',
      },
      { status: 403 }
    )
  }

  const formData = await request.formData()
  const intent = String(formData.get('_intent') ?? '').trim()
  const announcementId = String(formData.get('announcementId') ?? '').trim()

  const result =
    intent === 'create'
      ? await createPlatformAnnouncement(authState, buildAnnouncementPayload(formData, true))
      : intent === 'update'
        ? await updatePlatformAnnouncement(
            authState,
            announcementId,
            buildAnnouncementPayload(formData, false)
          )
        : intent === 'delete'
          ? await deletePlatformAnnouncement(authState, announcementId)
          : null

  if (!result) {
    return json<ActionData>(
      {
        intent,
        error: 'Choose a valid announcement action before submitting.',
      },
      { status: 400 }
    )
  }

  if (!result.ok && result.status === 401 && !result.authState) {
    return redirect('/login', {
      headers: {
        'Set-Cookie': await clearPlatformAuthState(request),
      },
    })
  }

  const headers = await buildAuthHeaders(request, authState, result.authState)

  if (!result.ok) {
    return json<ActionData>(
      {
        intent,
        error: result.error,
      },
      { headers, status: result.status >= 400 ? result.status : 400 }
    )
  }

  return json<ActionData>(
    {
      intent,
      success:
        intent === 'create'
          ? 'Platform announcement saved.'
          : intent === 'update'
            ? 'Platform announcement updated.'
            : 'Platform announcement deleted.',
    },
    { headers }
  )
}

export default function AnnouncementsRoute() {
  const { announcements, composerOptions, editAnnouncement, error, search, status, total } =
    useLoaderData<typeof loader>()
  const actionData = useActionData<typeof action>()
  const navigation = useNavigation()
  const isSubmitting = navigation.state === 'submitting'

  return (
    <PlatformShell
      eyebrow="Platform announcements"
      title="Platform announcements"
      description="Publish owner-level updates to platform operators, schools, or selected school user groups."
      actions={
        <Link
          to="/dashboard"
          className="inline-flex items-center justify-center rounded-2xl border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
        >
          Back to dashboard
        </Link>
      }
    >
      <div className="space-y-8">
        {error ? (
          <FeedbackAlert tone="error" title="Announcement workspace unavailable" message={error} />
        ) : null}

        {actionData?.success ? (
          <FeedbackAlert tone="success" title="Announcement saved" message={actionData.success} />
        ) : null}

        {actionData?.error ? (
          <FeedbackAlert tone="error" title="Announcement action failed" message={actionData.error} />
        ) : null}

        <section className="grid gap-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <article className="rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-[0_20px_60px_rgba(15,23,42,0.06)]">
            <h2 className="text-xl font-bold text-slate-950">
              {editAnnouncement ? 'Edit announcement' : 'Create announcement'}
            </h2>
            {editAnnouncement ? (
              <p className="mt-2 text-sm text-slate-600">
                Published audiences are locked; content and timing can still be updated.
              </p>
            ) : null}

            <Form method="post" className="mt-6 space-y-4">
              <input type="hidden" name="_intent" value={editAnnouncement ? 'update' : 'create'} />
              {editAnnouncement ? (
                <input type="hidden" name="announcementId" value={editAnnouncement.announcementId} />
              ) : null}

              <label className="block space-y-2">
                <span className="text-sm font-medium text-slate-700">Title</span>
                <input
                  name="title"
                  defaultValue={editAnnouncement?.title ?? ''}
                  maxLength={200}
                  className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm outline-none transition focus:border-emerald-500"
                  required
                />
              </label>

              <label className="block space-y-2">
                <span className="text-sm font-medium text-slate-700">Body</span>
                <textarea
                  name="body"
                  defaultValue={editAnnouncement?.body ?? ''}
                  maxLength={10000}
                  rows={6}
                  className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm outline-none transition focus:border-emerald-500"
                  required
                />
              </label>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-2">
                  <span className="text-sm font-medium text-slate-700">Category</span>
                  <input
                    name="category"
                    defaultValue={editAnnouncement?.category ?? 'General'}
                    maxLength={80}
                    className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm outline-none transition focus:border-emerald-500"
                  />
                </label>

                <label className="space-y-2">
                  <span className="text-sm font-medium text-slate-700">Priority</span>
                  <select
                    name="priority"
                    defaultValue={
                      editAnnouncement ? normalizePriority(editAnnouncement.priority) : 'Normal'
                    }
                    className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none transition focus:border-emerald-500"
                  >
                    {priorityNames.map((priority) => (
                      <option key={priority} value={priority}>
                        {priority}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-2">
                  <span className="text-sm font-medium text-slate-700">Publish time</span>
                  <input
                    type="datetime-local"
                    name="publishAt"
                    defaultValue={toDateTimeLocalValue(editAnnouncement?.publishAt)}
                    className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm outline-none transition focus:border-emerald-500"
                  />
                </label>

                <label className="space-y-2">
                  <span className="text-sm font-medium text-slate-700">Expiry time</span>
                  <input
                    type="datetime-local"
                    name="expiresAt"
                    defaultValue={toDateTimeLocalValue(editAnnouncement?.expiresAt)}
                    className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm outline-none transition focus:border-emerald-500"
                  />
                </label>
              </div>

              {!editAnnouncement ? (
                <div className="rounded-[1.35rem] border border-slate-200 bg-slate-50 p-4">
                  <h3 className="text-sm font-bold text-slate-950">Audience</h3>
                  <div className="mt-4 grid gap-4 md:grid-cols-2">
                    <label className="space-y-2">
                      <span className="text-sm font-medium text-slate-700">Target type</span>
                      <select
                        name="targetType"
                        defaultValue="AllPlatformUsers"
                        className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none transition focus:border-emerald-500"
                      >
                        <option value="AllPlatformUsers">All platform users</option>
                        <option value="School">School account</option>
                        <option value="WholeSchool">Whole school</option>
                        <option value="Role">Role across schools</option>
                      </select>
                    </label>

                    <label className="space-y-2">
                      <span className="text-sm font-medium text-slate-700">School</span>
                      <select
                        name="schoolId"
                        className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none transition focus:border-emerald-500"
                      >
                        <option value="">All or not applicable</option>
                        {composerOptions.schools.map((school) => (
                          <option key={school.id} value={school.id}>
                            {school.label}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="space-y-2 md:col-span-2">
                      <span className="text-sm font-medium text-slate-700">Role</span>
                      <select
                        name="targetRole"
                        className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none transition focus:border-emerald-500"
                      >
                        <option value="">Select when targeting a role</option>
                        {composerOptions.availableRoles.map((role) => (
                          <option key={role} value={role}>
                            {role}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                </div>
              ) : (
                <label className="block space-y-2">
                  <span className="text-sm font-medium text-slate-700">Change summary</span>
                  <input
                    name="changeSummary"
                    maxLength={1000}
                    className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm outline-none transition focus:border-emerald-500"
                    placeholder="Optional note for the revision history"
                  />
                </label>
              )}

              <label className="flex items-center gap-3 text-sm font-medium text-slate-700">
                <input
                  type="checkbox"
                  name="requiresAcknowledgement"
                  defaultChecked={editAnnouncement?.requiresAcknowledgement ?? false}
                  className="h-4 w-4 rounded border-slate-300 text-emerald-700 focus:ring-emerald-500"
                />
                Requires acknowledgement
              </label>

              <div className="flex flex-wrap gap-3">
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="inline-flex items-center justify-center rounded-2xl bg-emerald-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {isSubmitting ? 'Saving...' : editAnnouncement ? 'Update announcement' : 'Publish or schedule'}
                </button>
                {editAnnouncement ? (
                  <Link
                    to="/announcements"
                    className="inline-flex items-center justify-center rounded-2xl border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
                  >
                    Cancel edit
                  </Link>
                ) : null}
              </div>
            </Form>
          </article>

          <article className="rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-[0_20px_60px_rgba(15,23,42,0.06)]">
            <div className="flex flex-col gap-4 border-b border-slate-200 pb-5 md:flex-row md:items-end md:justify-between">
              <div>
                <h2 className="text-xl font-bold text-slate-950">Published history</h2>
                <p className="mt-1 text-sm text-slate-600">
                  {total === 1 ? '1 announcement found.' : `${total} announcements found.`}
                </p>
              </div>

              <Form method="get" className="flex flex-wrap gap-2">
                <input
                  name="search"
                  defaultValue={search}
                  placeholder="Search announcements"
                  className="h-11 rounded-2xl border border-slate-300 px-4 text-sm outline-none transition focus:border-emerald-500"
                />
                <select
                  name="status"
                  defaultValue={status}
                  className="h-11 rounded-2xl border border-slate-300 bg-white px-4 text-sm outline-none transition focus:border-emerald-500"
                >
                  <option value="All">All statuses</option>
                  {statusNames.map((statusName) => (
                    <option key={statusName} value={statusName}>
                      {statusName}
                    </option>
                  ))}
                </select>
                <button
                  type="submit"
                  className="h-11 rounded-2xl border border-slate-300 px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  Filter
                </button>
              </Form>
            </div>

            <div className="mt-6 space-y-4">
              {announcements.length === 0 ? (
                <div className="rounded-[1.35rem] border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-600">
                  No platform announcements match the current filters.
                </div>
              ) : (
                announcements.map((announcement) => {
                  const announcementStatus = normalizeStatus(announcement.status)
                  const priority = normalizePriority(announcement.priority)

                  return (
                    <article
                      key={announcement.announcementId}
                      className="rounded-[1.35rem] border border-slate-200 bg-slate-50 p-5"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div className="min-w-0">
                          <div className="flex flex-wrap gap-2">
                            <span className="rounded-full bg-slate-950 px-3 py-1 text-xs font-semibold text-white">
                              {announcementStatus}
                            </span>
                            <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-900">
                              {priority}
                            </span>
                            {announcement.requiresAcknowledgement ? (
                              <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-900">
                                Acknowledgement
                              </span>
                            ) : null}
                          </div>
                          <h3 className="mt-3 text-lg font-bold text-slate-950">
                            {announcement.title}
                          </h3>
                          <p className="mt-1 text-sm text-slate-600">
                            {announcement.category} - {announcement.createdByDisplayName}
                          </p>
                        </div>

                        <div className="grid grid-cols-3 gap-2 text-center text-xs text-slate-600">
                          <div className="rounded-2xl bg-white px-3 py-2">
                            <p className="text-base font-bold text-slate-950">
                              {announcement.recipientCount}
                            </p>
                            <p>Recipients</p>
                          </div>
                          <div className="rounded-2xl bg-white px-3 py-2">
                            <p className="text-base font-bold text-slate-950">
                              {announcement.readCount}
                            </p>
                            <p>Read</p>
                          </div>
                          <div className="rounded-2xl bg-white px-3 py-2">
                            <p className="text-base font-bold text-slate-950">
                              {announcement.acknowledgedCount}
                            </p>
                            <p>Ack</p>
                          </div>
                        </div>
                      </div>

                      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4 text-sm text-slate-600">
                        <div className="flex flex-wrap gap-4">
                          <span>Publish: {formatDateTime(announcement.publishAt)}</span>
                          <span>Expires: {formatDateTime(announcement.expiresAt)}</span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {announcement.canEdit ? (
                            <Link
                              to={`/announcements?edit=${announcement.announcementId}`}
                              className="rounded-2xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-white"
                            >
                              Edit
                            </Link>
                          ) : null}
                          {announcement.canDelete ? (
                            <Form method="post">
                              <input type="hidden" name="_intent" value="delete" />
                              <input
                                type="hidden"
                                name="announcementId"
                                value={announcement.announcementId}
                              />
                              <button
                                type="submit"
                                disabled={isSubmitting}
                                className="rounded-2xl border border-red-200 px-4 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-50 disabled:opacity-60"
                              >
                                Delete
                              </button>
                            </Form>
                          ) : null}
                        </div>
                      </div>
                    </article>
                  )
                })
              )}
            </div>
          </article>
        </section>
      </div>
    </PlatformShell>
  )
}
