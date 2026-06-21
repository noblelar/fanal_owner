import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from '@remix-run/node'
import { json, redirect } from '@remix-run/node'
import { Form, Link, useActionData, useBlocker, useLoaderData, useNavigation } from '@remix-run/react'
import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent, ReactNode } from 'react'
import { FeedbackAlert } from '~/components/feedback-alert'
import { PlatformShell } from '~/components/platform-shell'
import type {
  PlatformDocumentationFlowDetails,
  PlatformDocumentationLibraryResponse,
} from '~/models/platform-documentation'
import {
  discardDocumentationImageUpload,
  uploadDocumentationImageToCloudinary,
  type DocumentationImageUploadTarget,
} from '~/utils/documentation-cloudinary.client'
import { didPlatformAuthChange, type PlatformSessionUser } from '~/utils/platform-auth.server'
import {
  addPlatformDocumentationStep,
  createPlatformDocumentationFlow,
  deletePlatformDocumentationFlow,
  deletePlatformDocumentationStep,
  getPlatformDocumentationFlow,
  getPlatformDocumentationLibrary,
  publishPlatformDocumentationFlow,
  reorderPlatformDocumentationSteps,
  unpublishPlatformDocumentationFlow,
  updatePlatformDocumentationFlow,
  updatePlatformDocumentationStep,
} from '~/utils/platform-documentation.server'
import {
  clearPlatformAuthState,
  requirePlatformAuthState,
  savePlatformAuthState,
} from '~/utils/session.server'
import { buildFanalMeta } from '~/utils/site-meta'

const panels = [
  { id: 'overview', label: 'Overview' },
  { id: 'details', label: 'Details' },
  { id: 'steps', label: 'Steps' },
  { id: 'media', label: 'Media' },
] as const

type PanelId = (typeof panels)[number]['id']

type LoaderData = {
  canManageDocumentation: boolean
  error?: string
  flow: PlatformDocumentationFlowDetails | null
  library: PlatformDocumentationLibraryResponse
  panel: PanelId
  search: string
  selectedFlowId: string | null
  user: PlatformSessionUser
}

type ActionData = {
  error?: string
  intent?: string
}

export const meta: MetaFunction = () => buildFanalMeta('Documentation')

async function buildAuthHeaders(
  request: Request,
  originalAuthState: Awaited<ReturnType<typeof requirePlatformAuthState>>,
  nextAuthState?: Awaited<ReturnType<typeof requirePlatformAuthState>>
) {
  if (!didPlatformAuthChange(originalAuthState, nextAuthState)) {
    return undefined
  }

  return {
    'Set-Cookie': await savePlatformAuthState(request, nextAuthState!),
  }
}

function canManageDocumentation(user: PlatformSessionUser) {
  return user.roles.some((role) => role === 'PLATFORM_OWNER' || role === 'PLATFORM_ADMIN')
}

function getPanel(value: string | null): PanelId {
  return panels.some((panel) => panel.id === value)
    ? (value as PanelId)
    : 'overview'
}

function buildUrl(group: string, panel: PanelId, flowId?: string | null, search?: string) {
  const params = new URLSearchParams()

  if (group) {
    params.set('group', group)
  }

  params.set('section', panel)

  if (flowId) {
    params.set('flow', flowId)
  }

  if (search?.trim()) {
    params.set('search', search.trim())
  }

  return `/documentation?${params.toString()}`
}

function formatDate(value?: string | null) {
  if (!value) {
    return 'Not available'
  }

  return new Date(value).toLocaleString()
}

function getActionErrorTitle(intent?: string) {
  switch (intent) {
    case 'create_flow':
      return 'Unable to create flow'
    case 'save_details':
      return 'Unable to save details'
    case 'save_media':
      return 'Unable to save media'
    case 'add_step':
      return 'Unable to add step'
    case 'save_step':
      return 'Unable to save step'
    case 'move_step_up':
    case 'move_step_down':
      return 'Unable to reorder step'
    case 'delete_step':
      return 'Unable to remove step'
    case 'delete_flow':
      return 'Unable to delete flow'
    case 'publish_flow':
      return 'Unable to publish flow'
    case 'unpublish_flow':
      return 'Unable to move flow to draft'
    default:
      return 'Documentation update failed'
  }
}

function parseRequiredFlowId(formData: FormData) {
  return String(formData.get('currentFlowId') ?? '').trim()
}

function getReturnUrl(
  formData: FormData,
  overrides?: {
    group?: string
    panel?: PanelId
    flowId?: string
  }
) {
  const currentGroup = String(formData.get('currentGroup') ?? '').trim()
  const currentPanel = getPanel(String(formData.get('currentPanel') ?? ''))
  const currentFlowId = String(formData.get('currentFlowId') ?? '').trim()
  const currentSearch = String(formData.get('currentSearch') ?? '').trim()

  return buildUrl(
    overrides?.group ?? currentGroup,
    overrides?.panel ?? currentPanel,
    overrides?.flowId ?? currentFlowId,
    currentSearch
  )
}

export async function loader({ request }: LoaderFunctionArgs) {
  const authState = await requirePlatformAuthState(request)
  const canManage = canManageDocumentation(authState.user)
  const url = new URL(request.url)
  const panel = getPanel(url.searchParams.get('section'))
  const requestedGroup = url.searchParams.get('group') ?? ''
  const requestedFlowId = url.searchParams.get('flow')?.trim() ?? ''
  const search = url.searchParams.get('search') ?? ''

  if (!canManage) {
    return json<LoaderData>(
      {
        canManageDocumentation: false,
        flow: null,
        library: {
          activeSectionSlug: '',
          sections: [],
          flows: [],
        },
        panel,
        search,
        selectedFlowId: null,
        user: authState.user,
      },
      { status: 403 }
    )
  }

  let activeAuthState = authState
  const libraryResult = await getPlatformDocumentationLibrary(activeAuthState, {
    section: requestedGroup,
    search,
  })

  if (!libraryResult.ok && libraryResult.status === 401 && !libraryResult.authState) {
    return redirect('/login', {
      headers: {
        'Set-Cookie': await clearPlatformAuthState(request),
      },
    })
  }

  if (libraryResult.authState) {
    activeAuthState = libraryResult.authState
  }

  if (!libraryResult.ok) {
    const headers = await buildAuthHeaders(request, authState, activeAuthState)

    return json<LoaderData>(
      {
        canManageDocumentation: true,
        error: libraryResult.error,
        flow: null,
        library: {
          activeSectionSlug: requestedGroup,
          sections: [],
          flows: [],
        },
        panel,
        search,
        selectedFlowId: null,
        user: activeAuthState.user,
      },
      { headers, status: libraryResult.status >= 400 ? libraryResult.status : 500 }
    )
  }

  const library = libraryResult.data
  const selectedFlowId =
    requestedFlowId && library.flows.some((flow) => flow.id === requestedFlowId)
      ? requestedFlowId
      : library.flows[0]?.id ?? null

  let flow: PlatformDocumentationFlowDetails | null = null
  let error: string | undefined

  if (selectedFlowId) {
    const flowResult = await getPlatformDocumentationFlow(activeAuthState, selectedFlowId)

    if (!flowResult.ok && flowResult.status === 401 && !flowResult.authState) {
      return redirect('/login', {
        headers: {
          'Set-Cookie': await clearPlatformAuthState(request),
        },
      })
    }

    if (flowResult.authState) {
      activeAuthState = flowResult.authState
    }

    if (!flowResult.ok) {
      error = flowResult.error
    } else {
      flow = flowResult.data.flow
    }
  }

  const headers = await buildAuthHeaders(request, authState, activeAuthState)

  return json<LoaderData>(
    {
      canManageDocumentation: true,
      error,
      flow,
      library,
      panel,
      search,
      selectedFlowId,
      user: activeAuthState.user,
    },
    { headers }
  )
}

export async function action({ request }: ActionFunctionArgs) {
  const authState = await requirePlatformAuthState(request)

  if (!canManageDocumentation(authState.user)) {
    return json<ActionData>(
      {
        intent: 'forbidden',
        error: 'Only platform owners and platform admins can manage documentation.',
      },
      { status: 403 }
    )
  }

  const formData = await request.formData()
  const intent = String(formData.get('_intent') ?? '').trim()
  const flowId = parseRequiredFlowId(formData)

  let result:
    | Awaited<ReturnType<typeof createPlatformDocumentationFlow>>
    | Awaited<ReturnType<typeof updatePlatformDocumentationFlow>>
    | Awaited<ReturnType<typeof publishPlatformDocumentationFlow>>
    | Awaited<ReturnType<typeof unpublishPlatformDocumentationFlow>>
    | Awaited<ReturnType<typeof addPlatformDocumentationStep>>
    | Awaited<ReturnType<typeof updatePlatformDocumentationStep>>
    | Awaited<ReturnType<typeof reorderPlatformDocumentationSteps>>
    | Awaited<ReturnType<typeof deletePlatformDocumentationStep>>
    | Awaited<ReturnType<typeof deletePlatformDocumentationFlow>>
    | null = null

  switch (intent) {
    case 'create_flow': {
      const group = String(formData.get('currentGroup') ?? '').trim() || 'overview'
      result = await createPlatformDocumentationFlow(authState, {
        sectionSlug: group,
      })
      break
    }
    case 'save_details': {
      if (!flowId) {
        return json<ActionData>(
          { intent, error: 'Choose a documentation flow before saving details.' },
          { status: 400 }
        )
      }

      result = await updatePlatformDocumentationFlow(authState, flowId, {
        sectionSlug: String(formData.get('sectionSlug') ?? '').trim(),
        audienceLabel: String(formData.get('audienceLabel') ?? ''),
        title: String(formData.get('title') ?? ''),
        routeHint: String(formData.get('routeHint') ?? ''),
        summary: String(formData.get('summary') ?? ''),
      })
      break
    }
    case 'save_media': {
      if (!flowId) {
        return json<ActionData>(
          { intent, error: 'Choose a documentation flow before saving media.' },
          { status: 400 }
        )
      }

      result = await updatePlatformDocumentationFlow(authState, flowId, {
        videoMode: String(formData.get('videoMode') ?? '').trim(),
        youTubeUrl: String(formData.get('youTubeUrl') ?? ''),
        coverImageUrl: String(formData.get('coverImageUrl') ?? ''),
        coverImageAssetId:
          String(formData.get('coverImageAssetId') ?? '').trim() || undefined,
      })
      break
    }
    case 'add_step': {
      if (!flowId) {
        return json<ActionData>(
          { intent, error: 'Choose a documentation flow before adding a step.' },
          { status: 400 }
        )
      }

      result = await addPlatformDocumentationStep(authState, flowId)
      break
    }
    case 'save_step': {
      const stepId = String(formData.get('stepId') ?? '').trim()
      if (!stepId) {
        return json<ActionData>(
          { intent, error: 'Choose a documentation step before saving.' },
          { status: 400 }
        )
      }

      result = await updatePlatformDocumentationStep(authState, stepId, {
        title: String(formData.get('title') ?? ''),
        body: String(formData.get('body') ?? ''),
        imageUrl: String(formData.get('imageUrl') ?? ''),
        imageAssetId: String(formData.get('imageAssetId') ?? '').trim() || undefined,
        imageAlt: String(formData.get('imageAlt') ?? ''),
        imageCaption: String(formData.get('imageCaption') ?? ''),
      })
      break
    }
    case 'move_step_up':
    case 'move_step_down': {
      const stepId = String(formData.get('stepId') ?? '').trim()
      if (!flowId || !stepId) {
        return json<ActionData>(
          { intent, error: 'Choose a documentation step before reordering.' },
          { status: 400 }
        )
      }

      result = await reorderPlatformDocumentationSteps(authState, flowId, {
        stepId,
        direction: intent === 'move_step_up' ? 'up' : 'down',
      })
      break
    }
    case 'delete_step': {
      const stepId = String(formData.get('stepId') ?? '').trim()
      if (!stepId) {
        return json<ActionData>(
          { intent, error: 'Choose a documentation step before removing it.' },
          { status: 400 }
        )
      }

      result = await deletePlatformDocumentationStep(authState, stepId)
      break
    }
    case 'delete_flow': {
      if (!flowId) {
        return json<ActionData>(
          { intent, error: 'Choose a documentation flow before deleting it.' },
          { status: 400 }
        )
      }

      result = await deletePlatformDocumentationFlow(authState, flowId)
      break
    }
    case 'publish_flow': {
      if (!flowId) {
        return json<ActionData>(
          { intent, error: 'Choose a documentation flow before publishing.' },
          { status: 400 }
        )
      }

      result = await publishPlatformDocumentationFlow(authState, flowId)
      break
    }
    case 'unpublish_flow': {
      if (!flowId) {
        return json<ActionData>(
          { intent, error: 'Choose a documentation flow before moving it to draft.' },
          { status: 400 }
        )
      }

      result = await unpublishPlatformDocumentationFlow(authState, flowId)
      break
    }
    default:
      return json<ActionData>(
        {
          intent,
          error: 'Choose a valid documentation action before submitting.',
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
      {
        headers,
        status: result.status >= 400 ? result.status : 400,
      }
    )
  }

  if (intent === 'create_flow') {
    if (!('flow' in result.data)) {
      return json<ActionData>({ intent, error: 'The created flow could not be loaded.' }, { status: 500 })
    }
    return redirect(buildUrl(result.data.flow.sectionSlug, 'details', result.data.flow.id), {
      headers,
    })
  }

  if (intent === 'delete_flow') {
    if (!('sectionSlug' in result.data)) {
      return json<ActionData>({ intent, error: 'The deleted flow response was invalid.' }, { status: 500 })
    }
    return redirect(
      buildUrl(
        result.data.sectionSlug,
        'overview',
        null,
        String(formData.get('currentSearch') ?? '').trim()
      ),
      { headers }
    )
  }

  if (!('flow' in result.data)) {
    return json<ActionData>({ intent, error: 'The documentation response was invalid.' }, { status: 500 })
  }

  const nextPanel =
    intent === 'save_details'
      ? 'details'
      : intent === 'save_media'
        ? 'media'
        : intent === 'publish_flow' || intent === 'unpublish_flow'
          ? getPanel(String(formData.get('currentPanel') ?? ''))
          : 'steps'

  return redirect(
    getReturnUrl(formData, {
      group: result.data.flow.sectionSlug,
      panel: nextPanel,
      flowId: result.data.flow.id,
    }),
    { headers }
  )
}

export default function DocumentationRoute() {
  const {
    canManageDocumentation,
    error,
    flow,
    library,
    panel,
    search,
    selectedFlowId,
  } =
    useLoaderData<typeof loader>()
  const actionData = useActionData<typeof action>()
  const navigation = useNavigation()
  const [stepToDelete, setStepToDelete] = useState<
    { id: string; stepNumber: number; title: string; hasImage: boolean } | null
  >(null)
  const [showFlowDelete, setShowFlowDelete] = useState(false)
  const [flowDeleteConfirmation, setFlowDeleteConfirmation] = useState('')
  const [pendingAssetIds, setPendingAssetIds] = useState<Set<string>>(() => new Set())
  const pendingUploadBlocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      navigation.state === 'idle' &&
      pendingAssetIds.size > 0 &&
      `${currentLocation.pathname}${currentLocation.search}` !==
        `${nextLocation.pathname}${nextLocation.search}`
  )
  const activeSection =
    library.sections.find((section) => section.slug === library.activeSectionSlug) ?? null
  const pendingIntent =
    navigation.state === 'submitting'
      ? String(navigation.formData?.get('_intent') ?? '').trim()
      : ''
  const pendingStepId =
    navigation.state === 'submitting'
      ? String(navigation.formData?.get('stepId') ?? '').trim()
      : ''
  const currentGroup = flow?.sectionSlug || library.activeSectionSlug || activeSection?.slug || 'overview'

  function updatePendingAsset(previousAssetId?: string | null, nextAssetId?: string | null) {
    setPendingAssetIds((current) => {
      const next = new Set(current)
      if (previousAssetId) next.delete(previousAssetId)
      if (nextAssetId) next.add(nextAssetId)
      return next
    })
  }

  useEffect(() => {
    if (pendingAssetIds.size === 0) return

    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warnBeforeUnload)
    return () => {
      window.removeEventListener('beforeunload', warnBeforeUnload)
    }
  }, [pendingAssetIds])

  useEffect(() => {
    if (pendingUploadBlocker.state !== 'blocked') return
    if (!window.confirm('Discard the uploaded image and leave without saving?')) {
      pendingUploadBlocker.reset()
      return
    }

    Promise.allSettled(
      Array.from(pendingAssetIds).map((assetId) => discardDocumentationImageUpload(assetId))
    ).finally(() => pendingUploadBlocker.proceed())
  }, [pendingAssetIds, pendingUploadBlocker])

  useEffect(() => {
    if (!flow) return
    const attachedAssetIds = new Set(
      [flow.coverImageAssetId, ...flow.steps.map((step) => step.imageAssetId)].filter(
        (assetId): assetId is string => Boolean(assetId)
      )
    )
    if (attachedAssetIds.size === 0) return

    setPendingAssetIds((current) => {
      const next = new Set(current)
      attachedAssetIds.forEach((assetId) => next.delete(assetId))
      return next.size === current.size ? current : next
    })
  }, [flow])

  return (
    <PlatformShell
      eyebrow="Platform console"
      title="Documentation"
      actions={
        canManageDocumentation ? (
          <>
            <Form method="post">
              <input type="hidden" name="_intent" value="create_flow" />
              <input type="hidden" name="currentGroup" value={currentGroup} />
              <button
                type="submit"
                disabled={pendingIntent === 'create_flow'}
                className="inline-flex items-center justify-center rounded-2xl bg-emerald-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {pendingIntent === 'create_flow' ? 'Creating flow...' : 'New flow'}
              </button>
            </Form>

            {flow ? (
              <Form method="post">
                <input type="hidden" name="_intent" value={flow.isPublished ? 'unpublish_flow' : 'publish_flow'} />
                <input type="hidden" name="currentGroup" value={flow.sectionSlug} />
                <input type="hidden" name="currentPanel" value={panel} />
                <input type="hidden" name="currentFlowId" value={flow.id} />
                <input type="hidden" name="currentSearch" value={search} />
                <button
                  type="submit"
                  disabled={
                    pendingIntent === 'publish_flow' ||
                    pendingIntent === 'unpublish_flow' ||
                    (!flow.isPublished && pendingAssetIds.size > 0)
                  }
                  className={`inline-flex items-center justify-center rounded-2xl px-4 py-3 text-sm font-semibold transition ${
                    flow.isPublished
                      ? 'border border-slate-300 text-slate-700 hover:border-slate-400 hover:bg-slate-50'
                      : 'bg-slate-950 text-white hover:bg-slate-800'
                  } disabled:cursor-not-allowed disabled:opacity-70`}
                >
                  {pendingIntent === 'publish_flow'
                    ? 'Publishing...'
                    : pendingIntent === 'unpublish_flow'
                      ? 'Moving to draft...'
                      : flow.isPublished
                        ? 'Move to draft'
                        : 'Publish'}
                </button>
              </Form>
            ) : null}
          </>
        ) : null
      }
    >
      <div className="space-y-8">
        {!canManageDocumentation ? (
          <FeedbackAlert
            tone="warning"
            title="Access restricted"
            message="Only platform owners and platform admins can manage documentation."
          />
        ) : null}

        {error ? (
          <FeedbackAlert
            tone="error"
            title="Documentation unavailable"
            message={error}
          />
        ) : null}

        {actionData?.error ? (
          <FeedbackAlert
            tone="error"
            title={getActionErrorTitle(actionData.intent)}
            message={actionData.error}
          />
        ) : null}

        {flow?.isPublished ? (
          <FeedbackAlert
            tone="info"
            title="Published and locked"
            message="Move this flow to draft before changing its details, steps, media, or deleting it."
          />
        ) : null}

        {pendingAssetIds.size > 0 ? (
          <FeedbackAlert
            tone="warning"
            title="Uploaded image not saved"
            message="Save the relevant flow or step to attach the upload. Leaving this page will discard it."
          />
        ) : null}

        {canManageDocumentation ? (
          <>
            <div className="sticky top-[5.75rem] z-10 -mx-1 overflow-x-auto rounded-[1.5rem] border border-slate-200 bg-white/92 p-2 shadow-[0_18px_40px_rgba(15,23,42,0.08)] backdrop-blur-xl">
              <div className="flex min-w-max gap-2">
                {panels.map((item) => (
                  <Link
                    key={item.id}
                    to={buildUrl(currentGroup, item.id, selectedFlowId, search)}
                    className={`inline-flex items-center justify-center rounded-2xl px-4 py-2.5 text-sm font-semibold transition ${
                      item.id === panel
                        ? 'bg-emerald-900 text-white'
                        : 'border border-transparent text-slate-600 hover:border-slate-200 hover:bg-slate-50 hover:text-slate-950'
                    }`}
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            </div>

            <div className="grid gap-6 xl:grid-cols-[18rem_minmax(0,1fr)]">
              <aside className="space-y-4 xl:sticky xl:top-32 xl:h-fit">
                <section className="rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-[0_24px_60px_rgba(15,23,42,0.08)]">
                  <Form method="get">
                    <input type="hidden" name="group" value={library.activeSectionSlug} />
                    <input type="hidden" name="section" value={panel} />
                    {selectedFlowId ? (
                      <input type="hidden" name="flow" value={selectedFlowId} />
                    ) : null}
                    <Field label="Library">
                      <div className="flex gap-2">
                        <input
                          type="search"
                          name="search"
                          defaultValue={search}
                          placeholder="Find a flow"
                          className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-emerald-500 focus:bg-white"
                        />
                        <button
                          type="submit"
                          className="inline-flex items-center justify-center rounded-2xl border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
                        >
                          Search
                        </button>
                      </div>
                    </Field>
                  </Form>

                  <div className="mt-4 grid gap-2">
                    {library.sections.map((item) => (
                      <Link
                        key={item.id}
                        to={buildUrl(item.slug, panel, null, search)}
                        className={`flex items-center justify-between rounded-2xl px-4 py-3 transition ${
                          item.slug === library.activeSectionSlug
                            ? 'bg-emerald-600 text-white shadow-[0_18px_30px_rgba(5,150,105,0.22)]'
                            : 'bg-slate-50 text-slate-800 hover:bg-slate-100'
                        }`}
                      >
                        <span className="text-sm font-semibold">{item.title}</span>
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                            item.slug === library.activeSectionSlug
                              ? 'bg-white/16 text-white'
                              : 'bg-white text-slate-600'
                          }`}
                        >
                          {item.flowCount}
                        </span>
                      </Link>
                    ))}
                  </div>
                </section>

                <section className="max-h-[32rem] overflow-y-auto rounded-[1.75rem] border border-slate-200 bg-white p-4 shadow-[0_24px_60px_rgba(15,23,42,0.08)]">
                  <div className="space-y-2">
                    {library.flows.length > 0 ? (
                      library.flows.map((item) => (
                        <Link
                          key={item.id}
                          to={buildUrl(library.activeSectionSlug, panel, item.id, search)}
                          className={`block rounded-[1.35rem] border px-4 py-3 transition ${
                            item.id === selectedFlowId
                              ? 'border-emerald-200 bg-emerald-50 shadow-[0_18px_28px_rgba(5,150,105,0.10)]'
                              : 'border-transparent bg-slate-50 hover:border-slate-200 hover:bg-white'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-slate-950">
                                {item.title}
                              </p>
                              <p className="mt-1 truncate text-xs text-slate-500">
                                {item.audienceLabel || 'No audience'}
                              </p>
                            </div>
                            <span className="rounded-full bg-white px-2 py-1 text-[11px] font-semibold text-slate-600">
                              {item.isPublished ? 'Published' : 'Draft'}
                            </span>
                          </div>
                        </Link>
                      ))
                    ) : (
                      <div className="rounded-[1.35rem] bg-slate-50 px-4 py-5 text-sm text-slate-500">
                        No flows found.
                      </div>
                    )}
                  </div>
                </section>
              </aside>

              <div className="min-w-0">
                {!flow ? (
                  <section className="mx-auto max-w-5xl rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-[0_20px_60px_rgba(15,23,42,0.06)]">
                    <p className="text-sm text-slate-500">Select a flow.</p>
                  </section>
                ) : null}

                {flow && panel === 'overview' ? (
                  <section className="mx-auto max-w-5xl">
                    <article className="rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-[0_20px_60px_rgba(15,23,42,0.06)]">
                      <h2 className="text-xl font-bold text-slate-950">Flow preview</h2>
                      <div className="mt-4 grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
                        <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-5">
                          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                            Selected flow
                          </p>
                          <h3 className="mt-3 text-3xl font-black tracking-tight text-slate-950">
                            {flow.title}
                          </h3>
                          <p className="mt-4 text-sm leading-6 text-slate-700">
                            {flow.summary || 'No summary yet.'}
                          </p>
                          <div className="mt-5 flex flex-wrap gap-2">
                            <Chip>{flow.sectionTitle}</Chip>
                            <Chip>{flow.audienceLabel || 'No audience'}</Chip>
                            <Chip>{flow.isPublished ? 'Published' : 'Draft'}</Chip>
                          </div>
                        </div>
                        <div className="grid gap-4">
                          <StatCard label="Route" value={flow.routeHint || 'Not set'} />
                          <StatCard
                            label="Video"
                            value={flow.youTubeUrl ? flow.videoMode : 'Not linked'}
                          />
                          <StatCard label="Steps" value={String(flow.steps.length)} />
                          <StatCard label="Updated" value={formatDate(flow.updatedAt)} />
                        </div>
                      </div>
                    </article>
                  </section>
                ) : null}

                {flow && panel === 'details' ? (
                  <section className="mx-auto max-w-5xl">
                    <article className="rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-[0_20px_60px_rgba(15,23,42,0.06)]">
                      <h2 className="text-xl font-bold text-slate-950">Flow details</h2>

                      <Form method="post">
                        <input type="hidden" name="_intent" value="save_details" />
                        <input type="hidden" name="currentGroup" value={flow.sectionSlug} />
                        <input type="hidden" name="currentPanel" value="details" />
                        <input type="hidden" name="currentFlowId" value={flow.id} />
                        <input type="hidden" name="currentSearch" value={search} />

                        <fieldset disabled={flow.isPublished} className="mt-6 space-y-5">
                        <div className="grid gap-4 md:grid-cols-2">
                          <Field label="Section">
                            <select
                              name="sectionSlug"
                              defaultValue={flow.sectionSlug}
                              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-emerald-500 focus:bg-white"
                            >
                              {library.sections.map((section) => (
                                <option key={section.id} value={section.slug}>
                                  {section.title}
                                </option>
                              ))}
                            </select>
                          </Field>

                          <Field label="Audience">
                            <input
                              name="audienceLabel"
                              defaultValue={flow.audienceLabel || ''}
                              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-emerald-500 focus:bg-white"
                            />
                          </Field>

                          <Field label="Title" className="md:col-span-2">
                            <input
                              name="title"
                              defaultValue={flow.title}
                              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-emerald-500 focus:bg-white"
                            />
                          </Field>

                          <Field label="Route hint">
                            <input
                              name="routeHint"
                              defaultValue={flow.routeHint || ''}
                              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-emerald-500 focus:bg-white"
                            />
                          </Field>

                          <Field label="Status">
                            <input
                              readOnly
                              value={flow.isPublished ? 'Published' : 'Draft'}
                              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none"
                            />
                          </Field>

                          <Field label="Summary" className="md:col-span-2">
                            <textarea
                              name="summary"
                              rows={5}
                              defaultValue={flow.summary}
                              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-emerald-500 focus:bg-white"
                            />
                          </Field>
                        </div>

                        <button
                          type="submit"
                          disabled={pendingIntent === 'save_details'}
                          className="inline-flex items-center justify-center rounded-2xl bg-emerald-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-70"
                        >
                          {pendingIntent === 'save_details' ? 'Saving details...' : 'Save details'}
                        </button>
                        </fieldset>
                      </Form>

                      {!flow.isPublished ? (
                        <div className="mt-8 border-t border-rose-100 pt-6">
                          <button
                            type="button"
                            onClick={() => {
                              setFlowDeleteConfirmation('')
                              setShowFlowDelete(true)
                            }}
                            className="rounded-2xl border border-rose-200 px-4 py-3 text-sm font-semibold text-rose-700 transition hover:border-rose-300 hover:bg-rose-50"
                          >
                            Delete flow
                          </button>
                        </div>
                      ) : null}
                    </article>
                  </section>
                ) : null}

                {flow && panel === 'steps' ? (
                  <section className="mx-auto max-w-5xl">
                    <article className="rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-[0_20px_60px_rgba(15,23,42,0.06)]">
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                        <h2 className="text-xl font-bold text-slate-950">Flow steps</h2>

                        <Form method="post">
                          <input type="hidden" name="_intent" value="add_step" />
                          <input type="hidden" name="currentGroup" value={flow.sectionSlug} />
                          <input type="hidden" name="currentPanel" value="steps" />
                          <input type="hidden" name="currentFlowId" value={flow.id} />
                          <input type="hidden" name="currentSearch" value={search} />
                          <button
                            type="submit"
                            disabled={flow.isPublished || pendingIntent === 'add_step'}
                            className="inline-flex items-center justify-center rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800 transition hover:border-emerald-300 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-70"
                          >
                            {pendingIntent === 'add_step' ? 'Adding step...' : 'Add step'}
                          </button>
                        </Form>
                      </div>

                      {flow.steps.length > 0 ? (
                        <div className="mt-6 space-y-4">
                          {flow.steps.map((step, index) => {
                            const stepIsSaving =
                              pendingIntent === 'save_step' && pendingStepId === step.id
                            const stepIsMovingUp =
                              pendingIntent === 'move_step_up' && pendingStepId === step.id
                            const stepIsMovingDown =
                              pendingIntent === 'move_step_down' && pendingStepId === step.id
                            const stepIsDeleting =
                              pendingIntent === 'delete_step' && pendingStepId === step.id

                            return (
                              <Form
                                key={step.id}
                                method="post"
                                className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-5"
                              >
                                <input type="hidden" name="currentGroup" value={flow.sectionSlug} />
                                <input type="hidden" name="currentPanel" value="steps" />
                                <input type="hidden" name="currentFlowId" value={flow.id} />
                                <input type="hidden" name="currentSearch" value={search} />
                                <input type="hidden" name="stepId" value={step.id} />
                                <fieldset disabled={flow.isPublished}>

                                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                                  <div className="flex items-center gap-3">
                                    <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-emerald-600 text-sm font-bold text-white">
                                      {step.stepNumber}
                                    </span>
                                    <p className="text-sm font-semibold text-slate-950">
                                      Step {step.stepNumber}
                                    </p>
                                  </div>

                                  <div className="flex flex-wrap gap-2">
                                    <button
                                      type="submit"
                                      name="_intent"
                                      value="move_step_up"
                                      disabled={index === 0 || stepIsMovingUp}
                                      className="rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-600 disabled:cursor-not-allowed disabled:opacity-40"
                                    >
                                      {stepIsMovingUp ? 'Moving...' : 'Move up'}
                                    </button>
                                    <button
                                      type="submit"
                                      name="_intent"
                                      value="move_step_down"
                                      disabled={index === flow.steps.length - 1 || stepIsMovingDown}
                                      className="rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-600 disabled:cursor-not-allowed disabled:opacity-40"
                                    >
                                      {stepIsMovingDown ? 'Moving...' : 'Move down'}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setStepToDelete({
                                          id: step.id,
                                          stepNumber: step.stepNumber,
                                          title: step.title,
                                          hasImage: Boolean(step.imageUrl),
                                        })
                                      }
                                      disabled={stepIsDeleting}
                                      className="rounded-xl border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-700 disabled:cursor-not-allowed disabled:opacity-40"
                                    >
                                      {stepIsDeleting ? 'Removing...' : 'Remove'}
                                    </button>
                                  </div>
                                </div>

                                <div className="mt-5 grid gap-4">
                                  <Field label="Title">
                                    <input
                                      name="title"
                                      defaultValue={step.title}
                                      className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-emerald-500"
                                    />
                                  </Field>

                                  <Field label="Instruction">
                                    <textarea
                                      name="body"
                                      rows={4}
                                      defaultValue={step.body}
                                      className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-emerald-500"
                                    />
                                  </Field>

                                  <div className="grid gap-4 md:grid-cols-2">
                                    <Field label="Step image" className="md:col-span-2">
                                      <DocumentationImageField
                                        initialUrl={step.imageUrl || ''}
                                        initialAssetId={step.imageAssetId || ''}
                                        inputName="imageUrl"
                                        assetInputName="imageAssetId"
                                        onPendingAssetChange={updatePendingAsset}
                                        target={{
                                          kind: 'step-image',
                                          flowId: flow.id,
                                          stepId: step.id,
                                        }}
                                      />
                                    </Field>

                                    <Field label="Image alt">
                                      <input
                                        name="imageAlt"
                                        defaultValue={step.imageAlt || ''}
                                        className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-emerald-500"
                                      />
                                    </Field>

                                    <Field label="Image caption">
                                      <input
                                        name="imageCaption"
                                        defaultValue={step.imageCaption || ''}
                                        className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-emerald-500"
                                      />
                                    </Field>
                                  </div>
                                </div>

                                <div className="mt-5">
                                  <button
                                    type="submit"
                                    name="_intent"
                                    value="save_step"
                                    disabled={stepIsSaving}
                                    className="inline-flex items-center justify-center rounded-2xl bg-emerald-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-70"
                                  >
                                    {stepIsSaving ? 'Saving step...' : 'Save step'}
                                  </button>
                                </div>
                                </fieldset>
                              </Form>
                            )
                          })}
                        </div>
                      ) : (
                        <div className="mt-6 rounded-[1.5rem] border border-slate-200 bg-slate-50 px-5 py-6 text-sm text-slate-500">
                          No steps yet.
                        </div>
                      )}
                    </article>
                  </section>
                ) : null}

                {flow && panel === 'media' ? (
                  <section className="mx-auto max-w-5xl">
                    <article className="rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-[0_20px_60px_rgba(15,23,42,0.06)]">
                      <h2 className="text-xl font-bold text-slate-950">Media</h2>

                      <Form method="post">
                        <input type="hidden" name="_intent" value="save_media" />
                        <input type="hidden" name="currentGroup" value={flow.sectionSlug} />
                        <input type="hidden" name="currentPanel" value="media" />
                        <input type="hidden" name="currentFlowId" value={flow.id} />
                        <input type="hidden" name="currentSearch" value={search} />

                        <fieldset disabled={flow.isPublished} className="mt-6 space-y-5">
                        <div className="grid gap-4 md:grid-cols-2">
                          <Field label="Video mode">
                            <select
                              name="videoMode"
                              defaultValue={flow.videoMode}
                              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-emerald-500 focus:bg-white"
                            >
                              <option value="embed">Embed</option>
                              <option value="redirect">Redirect</option>
                            </select>
                          </Field>

                          <Field label="YouTube link">
                            <input
                              name="youTubeUrl"
                              defaultValue={flow.youTubeUrl || ''}
                              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-emerald-500 focus:bg-white"
                            />
                          </Field>

                          <Field label="Cover image" className="md:col-span-2">
                            <DocumentationImageField
                              initialUrl={flow.coverImageUrl || ''}
                              initialAssetId={flow.coverImageAssetId || ''}
                              inputName="coverImageUrl"
                              assetInputName="coverImageAssetId"
                              onPendingAssetChange={updatePendingAsset}
                              target={{ kind: 'flow-cover', flowId: flow.id }}
                            />
                          </Field>
                        </div>

                        <div className="grid gap-4 lg:grid-cols-2">
                          <StatCard label="Cover image" value={flow.coverImageUrl || 'Not attached'} />
                          <StatCard label="Video link" value={flow.youTubeUrl || 'Not attached'} />
                        </div>

                        <button
                          type="submit"
                          disabled={pendingIntent === 'save_media'}
                          className="inline-flex items-center justify-center rounded-2xl bg-emerald-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-70"
                        >
                          {pendingIntent === 'save_media' ? 'Saving media...' : 'Save media'}
                        </button>
                        </fieldset>
                      </Form>
                    </article>
                  </section>
                ) : null}
              </div>
            </div>
          </>
        ) : null}
      </div>

      {stepToDelete && flow ? (
        <ConfirmationDialog
          title={`Remove step ${stepToDelete.stepNumber}?`}
          description={`${stepToDelete.title || 'Untitled step'}${
            stepToDelete.hasImage ? ' has an attached image.' : '.'
          } Remaining steps will be renumbered.`}
          onClose={() => setStepToDelete(null)}
        >
          <Form
            method="post"
            className="flex flex-wrap justify-end gap-3"
            onSubmit={() => setStepToDelete(null)}
          >
            <input type="hidden" name="_intent" value="delete_step" />
            <input type="hidden" name="currentGroup" value={flow.sectionSlug} />
            <input type="hidden" name="currentPanel" value="steps" />
            <input type="hidden" name="currentFlowId" value={flow.id} />
            <input type="hidden" name="currentSearch" value={search} />
            <input type="hidden" name="stepId" value={stepToDelete.id} />
            <button
              type="button"
              onClick={() => setStepToDelete(null)}
              className="rounded-2xl border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={pendingIntent === 'delete_step'}
              className="rounded-2xl bg-rose-700 px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
            >
              {pendingIntent === 'delete_step' ? 'Removing...' : 'Permanently remove step'}
            </button>
          </Form>
        </ConfirmationDialog>
      ) : null}

      {showFlowDelete && flow ? (
        <ConfirmationDialog
          title="Delete this documentation flow?"
          description={`This permanently removes “${flow.title}”, its ${flow.steps.length} step${
            flow.steps.length === 1 ? '' : 's'
          }, and its managed media. Type the flow title to confirm.`}
          onClose={() => setShowFlowDelete(false)}
        >
          <Form
            method="post"
            className="space-y-4"
            onSubmit={() => setShowFlowDelete(false)}
          >
            <input type="hidden" name="_intent" value="delete_flow" />
            <input type="hidden" name="currentGroup" value={flow.sectionSlug} />
            <input type="hidden" name="currentPanel" value="details" />
            <input type="hidden" name="currentFlowId" value={flow.id} />
            <input type="hidden" name="currentSearch" value={search} />
            <input
              value={flowDeleteConfirmation}
              onChange={(event) => setFlowDeleteConfirmation(event.target.value)}
              placeholder={flow.title}
              className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-rose-500"
            />
            <div className="flex flex-wrap justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowFlowDelete(false)}
                className="rounded-2xl border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-700"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={
                  flowDeleteConfirmation !== flow.title || pendingIntent === 'delete_flow'
                }
                className="rounded-2xl bg-rose-700 px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {pendingIntent === 'delete_flow' ? 'Deleting...' : 'Permanently delete flow'}
              </button>
            </div>
          </Form>
        </ConfirmationDialog>
      ) : null}
    </PlatformShell>
  )
}

function Field({
  label,
  className = '',
  children,
}: {
  label: string
  className?: string
  children: ReactNode
}) {
  return (
    <label className={`block ${className}`.trim()}>
      <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
        {label}
      </span>
      <div className="mt-2">{children}</div>
    </label>
  )
}

function Chip({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-slate-700">
      {children}
    </span>
  )
}

function ConfirmationDialog({
  title,
  description,
  onClose,
  children,
}: {
  title: string
  description: string
  onClose: () => void
  children: ReactNode
}) {
  const dialogRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const previousActiveElement = document.activeElement as HTMLElement | null
    const dialog = dialogRef.current
    const focusable = dialog?.querySelector<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )
    focusable?.focus()

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }

      if (event.key !== 'Tab' || !dialog) return
      const focusableElements = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      )
      if (focusableElements.length === 0) return
      const first = focusableElements[0]
      const last = focusableElements[focusableElements.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      previousActiveElement?.focus()
    }
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="documentation-confirmation-title"
        aria-describedby="documentation-confirmation-description"
        className="w-full max-w-lg rounded-[1.75rem] bg-white p-6 shadow-2xl"
      >
        <h2 id="documentation-confirmation-title" className="text-xl font-bold text-slate-950">
          {title}
        </h2>
        <p id="documentation-confirmation-description" className="mt-3 text-sm leading-6 text-slate-600">
          {description}
        </p>
        <div className="mt-6">{children}</div>
      </div>
    </div>
  )
}

function DocumentationImageField({
  initialUrl,
  initialAssetId,
  inputName,
  assetInputName,
  target,
  onPendingAssetChange,
}: {
  initialUrl: string
  initialAssetId: string
  inputName: string
  assetInputName: string
  target: DocumentationImageUploadTarget
  onPendingAssetChange: (previousAssetId?: string | null, nextAssetId?: string | null) => void
}) {
  const [value, setValue] = useState(initialUrl)
  const [assetId, setAssetId] = useState(initialAssetId)
  const [isPendingAsset, setIsPendingAsset] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    setValue(initialUrl)
    setAssetId(initialAssetId)
    setIsPendingAsset(false)
    setUploadError(null)
  }, [initialAssetId, initialUrl])

  function discardPendingAsset() {
    if (!isPendingAsset || !assetId) return
    const discardedAssetId = assetId
    onPendingAssetChange(discardedAssetId, null)
    setAssetId('')
    setIsPendingAsset(false)
    discardDocumentationImageUpload(discardedAssetId).catch(() => undefined)
  }

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''

    if (!file) {
      return
    }

    setIsUploading(true)
    setUploadError(null)

    try {
      const result = await uploadDocumentationImageToCloudinary(file, target)
      const previousPendingAssetId = isPendingAsset ? assetId : null
      setValue(result.secureUrl)
      setAssetId(result.assetId)
      setIsPendingAsset(true)
      onPendingAssetChange(previousPendingAssetId, result.assetId)
      if (previousPendingAssetId) {
        discardDocumentationImageUpload(previousPendingAssetId).catch(() => undefined)
      }
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : 'Upload failed.')
    } finally {
      setIsUploading(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-[1.35rem] border border-dashed border-slate-300 bg-slate-50">
        {value ? (
          <img
            alt="Documentation asset preview"
            className="h-48 w-full object-cover"
            src={value}
          />
        ) : (
          <div className="flex h-48 items-center justify-center px-4 text-sm text-slate-500">
            No image selected.
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <input
          accept="image/*"
          className="sr-only"
          disabled={isUploading}
          onChange={handleFileChange}
          ref={fileInputRef}
          type="file"
        />

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className={`inline-flex items-center justify-center rounded-2xl border px-4 py-3 text-sm font-semibold transition ${
            'cursor-pointer border-emerald-200 bg-emerald-50 text-emerald-800 hover:border-emerald-300 hover:bg-emerald-100'
          } ${isUploading ? 'pointer-events-none opacity-70' : ''}`}
          disabled={isUploading}
        >
          {isUploading ? 'Uploading...' : value ? 'Replace image' : 'Upload image'}
        </button>

        {value ? (
          <>
            <button
              type="button"
              onClick={() => {
                discardPendingAsset()
                setValue('')
                if (!isPendingAsset) setAssetId('')
              }}
              className="inline-flex items-center justify-center rounded-2xl border border-rose-200 px-4 py-3 text-sm font-semibold text-rose-700 transition hover:border-rose-300 hover:bg-rose-50"
            >
              Remove image
            </button>

            <a
              className="inline-flex items-center justify-center rounded-2xl border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
              href={value}
              rel="noreferrer"
              target="_blank"
            >
              Open image
            </a>
          </>
        ) : null}
      </div>

      <input
        className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-emerald-500"
        name={inputName}
        onChange={(event) => {
          discardPendingAsset()
          setAssetId('')
          setValue(event.target.value)
        }}
        placeholder="https://..."
        value={value}
      />

      <input type="hidden" name={assetInputName} value={assetId} />

      {isPendingAsset ? (
        <p className="text-sm font-medium text-amber-700">
          Uploaded — save this flow or step to attach the image.
        </p>
      ) : null}

      {uploadError ? <p className="text-sm text-rose-600">{uploadError}</p> : null}
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[1.45rem] border border-slate-200 bg-slate-50 p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
        {label}
      </p>
      <p className="mt-3 break-words text-base font-semibold text-slate-950">{value}</p>
    </div>
  )
}
