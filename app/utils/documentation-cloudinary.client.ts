export type DocumentationImageUploadTarget =
  | {
      kind: 'flow-cover'
      flowId: string
    }
  | {
      kind: 'step-image'
      flowId: string
      stepId: string
    }

export type DocumentationImageUploadResult = {
  assetId: string
  publicId: string
  secureUrl: string
}

type DocumentationUploadSignature = {
  assetId: string
  uploadUrl: string
  apiKey: string
  timestamp: number
  folder: string
  publicId: string
  signature: string
  allowedFormats: string
}

async function getSignedDocumentationUpload(
  target: DocumentationImageUploadTarget
): Promise<DocumentationUploadSignature> {
  const response = await fetch('/api/documentation/cloudinary-signature', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(target),
  })

  const body = (await response.json().catch(() => null)) as
    | {
        message?: string
        assetId?: string
        uploadUrl?: string
        apiKey?: string
        timestamp?: number
        folder?: string
        publicId?: string
        signature?: string
        allowedFormats?: string
      }
    | null

  if (
    !response.ok ||
    !body?.assetId ||
    !body.uploadUrl ||
    !body.apiKey ||
    typeof body.timestamp !== 'number' ||
    !body.folder ||
    !body.publicId ||
    !body.signature ||
    !body.allowedFormats
  ) {
    throw new Error(body?.message || 'Unable to prepare a signed upload.')
  }

  return {
    assetId: body.assetId,
    uploadUrl: body.uploadUrl,
    apiKey: body.apiKey,
    timestamp: body.timestamp,
    folder: body.folder,
    publicId: body.publicId,
    signature: body.signature,
    allowedFormats: body.allowedFormats,
  }
}

export async function uploadDocumentationImageToCloudinary(
  file: File,
  target: DocumentationImageUploadTarget
): Promise<DocumentationImageUploadResult> {
  const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp'])
  if (!allowedTypes.has(file.type)) {
    throw new Error('Choose a JPEG, PNG, or WebP image.')
  }

  if (file.size > 10 * 1024 * 1024) {
    throw new Error('Documentation images must be 10 MB or smaller.')
  }

  const signedUpload = await getSignedDocumentationUpload(target)

  const formData = new FormData()
  formData.append('file', file)
  formData.append('api_key', signedUpload.apiKey)
  formData.append('timestamp', String(signedUpload.timestamp))
  formData.append('folder', signedUpload.folder)
  formData.append('public_id', signedUpload.publicId)
  formData.append('signature', signedUpload.signature)
  formData.append('allowed_formats', signedUpload.allowedFormats)

  const response = await fetch(signedUpload.uploadUrl, {
    method: 'POST',
    body: formData,
  })

  const body = (await response.json().catch(() => null)) as
    | { secure_url?: string; public_id?: string; error?: { message?: string } }
    | null

  if (!response.ok || !body?.secure_url || !body.public_id) {
    await discardDocumentationImageUpload(signedUpload.assetId).catch(() => undefined)
    throw new Error(body?.error?.message || 'Cloudinary upload failed.')
  }

  return {
    assetId: signedUpload.assetId,
    publicId: body.public_id,
    secureUrl: body.secure_url,
  }
}

export async function discardDocumentationImageUpload(assetId: string) {
  if (!assetId) return

  const response = await fetch('/api/documentation/cloudinary-signature', {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ assetId }),
  })

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { message?: string } | null
    throw new Error(body?.message || 'Unable to discard the pending upload.')
  }
}
