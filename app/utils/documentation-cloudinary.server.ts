import { createHash } from 'node:crypto'

type DocumentationUploadTarget =
  | {
      kind: 'flow-cover'
      flowId: string
    }
  | {
      kind: 'step-image'
      flowId: string
      stepId: string
    }

export type SignedDocumentationUploadPayload = {
  uploadUrl: string
  apiKey: string
  timestamp: number
  folder: string
  publicId: string
  signature: string
}

function getRequiredEnv(name: string) {
  const value = process.env[name]?.trim()
  if (!value) {
    throw new Error(`${name} is not configured.`)
  }

  return value
}

function getBaseFolder() {
  return (
    process.env.CLOUDINARY_BASE_FOLDER?.trim() ||
    process.env.NEXT_PUBLIC_CLOUDINARY_BASE_FOLDER?.trim() ||
    ''
  )
}

function buildFolder(target: DocumentationUploadTarget, baseFolder: string) {
  if (target.kind === 'flow-cover') {
    return `${baseFolder}/documentation/flows/${target.flowId}/cover`
  }

  return `${baseFolder}/documentation/flows/${target.flowId}/steps/${target.stepId}`
}

function buildPublicId(target: DocumentationUploadTarget) {
  const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`

  if (target.kind === 'flow-cover') {
    return `cover_${target.flowId}_${suffix}`
  }

  return `step_${target.stepId}_${suffix}`
}

function signCloudinaryParams(params: Record<string, string | number>, apiSecret: string) {
  const toSign = Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
    .map(([key, value]) => `${key}=${value}`)
    .join('&')

  return createHash('sha1')
    .update(`${toSign}${apiSecret}`)
    .digest('hex')
}

export function buildSignedDocumentationUpload(
  target: DocumentationUploadTarget
): SignedDocumentationUploadPayload {
  const cloudName = getRequiredEnv('CLOUDINARY_CLOUD_NAME')
  const apiKey = getRequiredEnv('CLOUDINARY_API_KEY')
  const apiSecret = getRequiredEnv('CLOUDINARY_API_SECRET')
  const baseFolder = getBaseFolder()

  if (!baseFolder) {
    throw new Error(
      'CLOUDINARY_BASE_FOLDER or NEXT_PUBLIC_CLOUDINARY_BASE_FOLDER must be configured.'
    )
  }

  const timestamp = Math.floor(Date.now() / 1000)
  const folder = buildFolder(target, baseFolder)
  const publicId = buildPublicId(target)
  const signature = signCloudinaryParams(
    {
      folder,
      public_id: publicId,
      timestamp,
    },
    apiSecret
  )

  return {
    uploadUrl: `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
    apiKey,
    timestamp,
    folder,
    publicId,
    signature,
  }
}
