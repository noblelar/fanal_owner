import { createServer } from 'node:http'

const host = '127.0.0.1'
const port = Number(process.env.FANAL_E2E_API_PORT || 4174)
const now = () => new Date().toISOString()

const platformUser = {
  id: 'owner-e2e',
  email: 'owner@fanal.test',
  firstName: 'Fanal',
  lastName: 'Owner',
  displayName: 'Fanal Owner',
  roles: ['PLATFORM_OWNER'],
  isActive: true,
  createdAt: now(),
  lastLoginAt: now(),
}

let state

function resetState() {
  state = {
    failDetailsSaveOnce: true,
    nextFlow: 2,
    nextStep: 3,
    nextAsset: 1,
    flows: [
      {
        id: 'flow-1',
        documentationSectionId: 'section-overview',
        sectionSlug: 'overview',
        sectionTitle: 'Overview',
        slug: 'owner-guide-draft',
        title: 'Owner guide draft',
        audienceLabel: 'Platform owners',
        summary: 'A draft guide used by the isolated browser regression suite.',
        description: '',
        routeHint: '/owner',
        coverImageUrl: null,
        coverImageAssetId: null,
        youTubeUrl: null,
        videoMode: 'embed',
        estimatedReadMinutes: 4,
        sortOrder: 1,
        isPublished: false,
        version: 1,
        draftRevisionId: 'revision-draft-1',
        publishedRevisionId: null,
        draftVersionNumber: 1,
        publishedVersionNumber: null,
        hasUnpublishedChanges: true,
        updatedAt: now(),
        steps: [
          {
            id: 'step-1',
            stepNumber: 1,
            title: 'First step',
            body: 'Complete the first task.',
            imageUrl: null,
            imageAssetId: null,
            imageAlt: null,
            imageCaption: null,
            version: 1,
          },
          {
            id: 'step-2',
            stepNumber: 2,
            title: 'Second step',
            body: 'Complete the second task.',
            imageUrl: null,
            imageAssetId: null,
            imageAlt: null,
            imageCaption: null,
            version: 1,
          },
        ],
      },
    ],
  }
}

resetState()

function sendJson(response, status, body, extraHeaders = {}) {
  response.writeHead(status, {
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Allow-Methods': 'DELETE, GET, OPTIONS, PATCH, POST, PUT',
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
    ...extraHeaders,
  })
  response.end(JSON.stringify(body))
}

async function readJson(request) {
  const chunks = []
  for await (const chunk of request) chunks.push(chunk)
  if (chunks.length === 0) return {}

  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    return {}
  }
}

function authPayload() {
  return {
    accessToken: 'e2e-access-token',
    refreshToken: 'e2e-refresh-token',
    user: platformUser,
  }
}

function flowSummary(flow) {
  return {
    id: flow.id,
    documentationSectionId: flow.documentationSectionId,
    sectionSlug: flow.sectionSlug,
    title: flow.title,
    audienceLabel: flow.audienceLabel,
    summary: flow.summary,
    routeHint: flow.routeHint,
    isPublished: flow.isPublished,
    version: flow.version,
    draftRevisionId: flow.draftRevisionId,
    publishedRevisionId: flow.publishedRevisionId,
    draftVersionNumber: flow.draftVersionNumber,
    publishedVersionNumber: flow.publishedVersionNumber,
    hasUnpublishedChanges: flow.hasUnpublishedChanges,
    sortOrder: flow.sortOrder,
    stepCount: flow.steps.length,
    updatedAt: flow.updatedAt,
  }
}

function mutation(flow, message = 'Documentation updated.') {
  return { message, flow }
}

function bump(flow) {
  flow.version += 1
  flow.updatedAt = now()
  flow.steps.forEach((step, index) => {
    step.stepNumber = index + 1
    step.version = flow.version
  })
}

function findFlow(flowId) {
  return state.flows.find((flow) => flow.id === flowId)
}

function notFound(response) {
  sendJson(response, 404, {
    code: 'documentation_not_found',
    message: 'The requested documentation resource was not found.',
    fieldErrors: {},
    publishBlockers: [],
  })
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url || '/', `http://${host}:${port}`)
  const path = url.pathname

  if (request.method === 'OPTIONS') {
    response.writeHead(204, {
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      'Access-Control-Allow-Methods': 'DELETE, GET, OPTIONS, PATCH, POST, PUT',
      'Access-Control-Allow-Origin': '*',
    })
    response.end()
    return
  }

  if (path === '/__test/health') {
    sendJson(response, 200, { ok: true })
    return
  }

  if (path === '/__test/reset' && request.method === 'POST') {
    resetState()
    sendJson(response, 200, { ok: true })
    return
  }

  if (path === '/api/platform/auth/login' && request.method === 'POST') {
    sendJson(response, 200, authPayload())
    return
  }

  if (path === '/api/platform/auth/me' && request.method === 'GET') {
    sendJson(response, 200, { user: platformUser })
    return
  }

  if (path === '/api/platform/auth/refresh-token' && request.method === 'POST') {
    sendJson(response, 200, authPayload())
    return
  }

  if (path === '/api/platform/auth/logout' && request.method === 'POST') {
    sendJson(response, 200, { message: 'Signed out.' })
    return
  }

  if (path === '/api/platform/documentation/library' && request.method === 'GET') {
    const search = (url.searchParams.get('search') || '').toLowerCase()
    const flows = state.flows
      .filter((flow) => !search || `${flow.title} ${flow.summary}`.toLowerCase().includes(search))
      .map(flowSummary)
    sendJson(response, 200, {
      activeSectionSlug: 'overview',
      sections: [
        {
          id: 'section-overview',
          slug: 'overview',
          title: 'Overview',
          flowCount: flows.length,
        },
      ],
      flows,
    })
    return
  }

  if (path === '/api/platform/documentation/flows' && request.method === 'POST') {
    const body = await readJson(request)
    const id = `flow-${state.nextFlow++}`
    const flow = {
      id,
      documentationSectionId: 'section-overview',
      sectionSlug: body.sectionSlug || 'overview',
      sectionTitle: 'Overview',
      slug: `untitled-flow-${id}`,
      title: 'Untitled documentation flow',
      audienceLabel: '',
      summary: '',
      description: '',
      routeHint: '',
      coverImageUrl: null,
      coverImageAssetId: null,
      youTubeUrl: null,
      videoMode: 'embed',
      estimatedReadMinutes: null,
      sortOrder: state.flows.length + 1,
      isPublished: false,
      version: 1,
      draftRevisionId: `revision-${id}-draft`,
      publishedRevisionId: null,
      draftVersionNumber: 1,
      publishedVersionNumber: null,
      hasUnpublishedChanges: true,
      updatedAt: now(),
      steps: [],
    }
    state.flows.push(flow)
    sendJson(response, 201, mutation(flow, 'Documentation flow created.'))
    return
  }

  const flowMatch = path.match(/^\/api\/platform\/documentation\/flows\/([^/]+)$/)
  if (flowMatch) {
    const flow = findFlow(flowMatch[1])
    if (!flow) return notFound(response)

    if (request.method === 'GET') {
      sendJson(response, 200, { flow })
      return
    }

    if (request.method === 'PATCH') {
      const body = await readJson(request)
      if (body.title === 'Trigger failed save' && state.failDetailsSaveOnce) {
        state.failDetailsSaveOnce = false
        sendJson(response, 500, {
          code: 'documentation_save_failed',
          message: 'The simulated API save failed. Retry your changes.',
          fieldErrors: {},
          publishBlockers: [],
        })
        return
      }

      for (const field of [
        'sectionSlug',
        'audienceLabel',
        'title',
        'routeHint',
        'summary',
        'videoMode',
        'youTubeUrl',
        'coverImageUrl',
        'coverImageAssetId',
      ]) {
        if (field in body) flow[field] = body[field] || null
      }
      bump(flow)
      sendJson(response, 200, mutation(flow))
      return
    }

    if (request.method === 'DELETE') {
      state.flows = state.flows.filter((candidate) => candidate.id !== flow.id)
      sendJson(response, 200, {
        message: 'Documentation flow deleted.',
        deletedFlowId: flow.id,
        sectionSlug: flow.sectionSlug,
      })
      return
    }
  }

  const revisionsMatch = path.match(
    /^\/api\/platform\/documentation\/flows\/([^/]+)\/revisions$/
  )
  if (revisionsMatch && request.method === 'GET') {
    const flow = findFlow(revisionsMatch[1])
    if (!flow) return notFound(response)
    const revisions = []
    if (flow.draftRevisionId) {
      revisions.push({
        id: flow.draftRevisionId,
        flowId: flow.id,
        versionNumber: flow.draftVersionNumber || 1,
        status: 'draft',
        title: flow.title,
        basedOnRevisionId: flow.publishedRevisionId,
        version: flow.version,
        createdByPlatformUserId: platformUser.id,
        publishedByPlatformUserId: null,
        createdAt: flow.updatedAt,
        updatedAt: flow.updatedAt,
        publishedAt: null,
      })
    }
    if (flow.publishedRevisionId) {
      revisions.push({
        id: flow.publishedRevisionId,
        flowId: flow.id,
        versionNumber: flow.publishedVersionNumber || 1,
        status: 'published',
        title: flow.title,
        basedOnRevisionId: null,
        version: flow.version,
        createdByPlatformUserId: platformUser.id,
        publishedByPlatformUserId: platformUser.id,
        createdAt: flow.updatedAt,
        updatedAt: flow.updatedAt,
        publishedAt: flow.updatedAt,
      })
    }
    sendJson(response, 200, { revisions })
    return
  }

  const readinessMatch = path.match(
    /^\/api\/platform\/documentation\/flows\/([^/]+)\/publish-readiness$/
  )
  if (readinessMatch && request.method === 'GET') {
    const flow = findFlow(readinessMatch[1])
    if (!flow) return notFound(response)
    sendJson(response, 200, {
      flowId: flow.id,
      draftRevisionId: flow.draftRevisionId,
      flowVersion: flow.version,
      isReady: Boolean(flow.draftRevisionId),
      blockers: [],
    })
    return
  }

  const publishMatch = path.match(
    /^\/api\/platform\/documentation\/flows\/([^/]+)\/publish$/
  )
  if (publishMatch && request.method === 'POST') {
    const flow = findFlow(publishMatch[1])
    if (!flow) return notFound(response)
    flow.isPublished = true
    flow.publishedRevisionId = flow.draftRevisionId
    flow.publishedVersionNumber = flow.draftVersionNumber
    flow.draftRevisionId = null
    flow.draftVersionNumber = null
    flow.hasUnpublishedChanges = false
    bump(flow)
    sendJson(response, 200, mutation(flow, 'Documentation draft published.'))
    return
  }

  const draftMatch = path.match(/^\/api\/platform\/documentation\/flows\/([^/]+)\/draft$/)
  if (draftMatch) {
    const flow = findFlow(draftMatch[1])
    if (!flow) return notFound(response)
    if (request.method === 'POST') {
      flow.draftRevisionId = `revision-${flow.id}-draft-${flow.version + 1}`
      flow.draftVersionNumber = (flow.publishedVersionNumber || 1) + 1
      flow.hasUnpublishedChanges = true
      bump(flow)
      sendJson(response, 200, mutation(flow, 'Documentation draft created.'))
      return
    }
    if (request.method === 'DELETE') {
      flow.draftRevisionId = null
      flow.draftVersionNumber = null
      flow.hasUnpublishedChanges = false
      bump(flow)
      sendJson(response, 200, mutation(flow, 'Documentation draft discarded.'))
      return
    }
  }

  const unpublishMatch = path.match(
    /^\/api\/platform\/documentation\/flows\/([^/]+)\/unpublish$/
  )
  if (unpublishMatch && request.method === 'POST') {
    const flow = findFlow(unpublishMatch[1])
    if (!flow) return notFound(response)
    flow.isPublished = false
    flow.draftRevisionId = `revision-${flow.id}-unpublished`
    flow.draftVersionNumber = (flow.publishedVersionNumber || 1) + 1
    flow.publishedRevisionId = null
    flow.publishedVersionNumber = null
    flow.hasUnpublishedChanges = true
    bump(flow)
    sendJson(response, 200, mutation(flow, 'Documentation flow unpublished.'))
    return
  }

  const stepsMatch = path.match(/^\/api\/platform\/documentation\/flows\/([^/]+)\/steps$/)
  if (stepsMatch && request.method === 'POST') {
    const flow = findFlow(stepsMatch[1])
    if (!flow) return notFound(response)
    const id = `step-${state.nextStep++}`
    flow.steps.push({
      id,
      stepNumber: flow.steps.length + 1,
      title: 'Untitled step',
      body: '',
      imageUrl: null,
      imageAssetId: null,
      imageAlt: null,
      imageCaption: null,
      version: flow.version,
    })
    bump(flow)
    sendJson(response, 201, mutation(flow, 'Documentation step added.'))
    return
  }

  const orderMatch = path.match(
    /^\/api\/platform\/documentation\/flows\/([^/]+)\/steps\/order$/
  )
  if (orderMatch && request.method === 'PUT') {
    const flow = findFlow(orderMatch[1])
    if (!flow) return notFound(response)
    const body = await readJson(request)
    const stepById = new Map(flow.steps.map((step) => [step.id, step]))
    flow.steps = (body.orderedStepIds || []).map((stepId) => stepById.get(stepId)).filter(Boolean)
    bump(flow)
    sendJson(response, 200, mutation(flow, 'Documentation steps reordered.'))
    return
  }

  const stepMatch = path.match(/^\/api\/platform\/documentation\/steps\/([^/]+)$/)
  if (stepMatch) {
    const flow = state.flows.find((candidate) =>
      candidate.steps.some((step) => step.id === stepMatch[1])
    )
    if (!flow) return notFound(response)
    const step = flow.steps.find((candidate) => candidate.id === stepMatch[1])

    if (request.method === 'PATCH') {
      const body = await readJson(request)
      for (const field of [
        'title',
        'body',
        'imageUrl',
        'imageAssetId',
        'imageAlt',
        'imageCaption',
      ]) {
        if (field in body) step[field] = body[field] || null
      }
      bump(flow)
      sendJson(response, 200, mutation(flow, 'Documentation step updated.'))
      return
    }

    if (request.method === 'DELETE') {
      flow.steps = flow.steps.filter((candidate) => candidate.id !== step.id)
      bump(flow)
      sendJson(response, 200, mutation(flow, 'Documentation step removed.'))
      return
    }
  }

  if (path === '/api/platform/documentation/uploads' && request.method === 'POST') {
    const assetId = `asset-${state.nextAsset++}`
    sendJson(response, 201, {
      assetId,
      uploadUrl: `http://${host}:${port}/cloudinary/upload`,
      apiKey: 'e2e-cloudinary-key',
      timestamp: Math.floor(Date.now() / 1000),
      folder: 'fanal/e2e/documentation',
      publicId: assetId,
      signature: 'e2e-signature',
      allowedFormats: 'jpg,png,webp',
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    })
    return
  }

  const uploadDeleteMatch = path.match(/^\/api\/platform\/documentation\/uploads\/([^/]+)$/)
  if (uploadDeleteMatch && request.method === 'DELETE') {
    sendJson(response, 200, { message: 'Pending upload discarded.' })
    return
  }

  if (path === '/cloudinary/upload' && request.method === 'POST') {
    const publicId = `asset-upload-${state.nextAsset}`
    sendJson(response, 200, {
      public_id: publicId,
      secure_url: `http://${host}:${port}/media/documentation-cover.png`,
    })
    return
  }

  if (path === '/media/documentation-cover.png' && request.method === 'GET') {
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
      'base64'
    )
    response.writeHead(200, {
      'Access-Control-Allow-Origin': '*',
      'Content-Type': 'image/png',
    })
    response.end(png)
    return
  }

  sendJson(response, 404, { message: `No E2E mock route for ${request.method} ${path}` })
})

server.listen(port, host, () => {
  console.log(`[fanal-owner-e2e] Mock platform API listening on http://${host}:${port}`)
})

function shutdown() {
  server.close(() => process.exit(0))
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
