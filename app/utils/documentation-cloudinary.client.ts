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
  publicId: string
  secureUrl: string
}

type DocumentationUploadSignature = {
  uploadUrl: string
  apiKey: string
  timestamp: number
  folder: string
  publicId: string
  signature: string
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
        uploadUrl?: string
        apiKey?: string
        timestamp?: number
        folder?: string
        publicId?: string
        signature?: string
      }
    | null

  if (
    !response.ok ||
    !body?.uploadUrl ||
    !body.apiKey ||
    typeof body.timestamp !== 'number' ||
    !body.folder ||
    !body.publicId ||
    !body.signature
  ) {
    throw new Error(body?.message || 'Unable to prepare a signed upload.')
  }

  return {
    uploadUrl: body.uploadUrl,
    apiKey: body.apiKey,
    timestamp: body.timestamp,
    folder: body.folder,
    publicId: body.publicId,
    signature: body.signature,
  }
}

export async function uploadDocumentationImageToCloudinary(
  file: File,
  target: DocumentationImageUploadTarget
): Promise<DocumentationImageUploadResult> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Choose an image file before uploading.')
  }

  const signedUpload = await getSignedDocumentationUpload(target)

  const formData = new FormData()
  formData.append('file', file)
  formData.append('api_key', signedUpload.apiKey)
  formData.append('timestamp', String(signedUpload.timestamp))
  formData.append('folder', signedUpload.folder)
  formData.append('public_id', signedUpload.publicId)
  formData.append('signature', signedUpload.signature)

  const response = await fetch(signedUpload.uploadUrl, {
    method: 'POST',
    body: formData,
  })

  const body = (await response.json().catch(() => null)) as
    | { secure_url?: string; public_id?: string; error?: { message?: string } }
    | null

  if (!response.ok || !body?.secure_url || !body.public_id) {
    throw new Error(body?.error?.message || 'Cloudinary upload failed.')
  }

  return {
    publicId: body.public_id,
    secureUrl: body.secure_url,
  }
}
