export const documentationEditorSaveIntents = new Set([
  'save_details',
  'save_media',
  'save_step',
])

export function isDocumentationEditorSubmission(formData, intent) {
  return (
    formData.get('_responseMode') === 'editor' &&
    documentationEditorSaveIntents.has(intent)
  )
}

export function createDocumentationActionData(formData, intent, result) {
  const editorId = String(formData.get('_editorId') ?? '').trim()
  const submissionId = String(formData.get('_submissionId') ?? '').trim()

  return {
    ...result,
    intent,
    editorId: editorId || undefined,
    editorSubmission: isDocumentationEditorSubmission(formData, intent),
    submissionId: submissionId || undefined,
  }
}

export function parseDocumentationExpectedVersion(formData) {
  const value = Number(formData.get('expectedVersion'))
  return Number.isSafeInteger(value) && value > 0 ? value : null
}

export function parseDocumentationOrderedStepIds(value) {
  return String(value ?? '')
    .split(',')
    .map((stepId) => stepId.trim())
    .filter(Boolean)
}

export function shouldRevalidateDocumentationRoute(
  actionResult,
  defaultShouldRevalidate
) {
  return actionResult?.editorSubmission ? false : defaultShouldRevalidate
}
