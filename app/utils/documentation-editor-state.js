/**
 * @typedef {'clean' | 'dirty' | 'saving' | 'failed'} DocumentationEditorStatus
 *
 * @typedef {object} DocumentationEditorRecord
 * @property {string} editorId
 * @property {string} flowId
 * @property {string} label
 * @property {DocumentationEditorStatus} status
 * @property {string} baselineSnapshot
 * @property {string} currentSnapshot
 * @property {string=} activeSubmissionId
 * @property {string=} submittedSnapshot
 * @property {string=} message
 */

/**
 * @param {Map<string, DocumentationEditorRecord>} editors
 * @param {Omit<DocumentationEditorRecord, 'status'>} record
 */
export function registerDocumentationEditor(editors, record) {
  if (editors.has(record.editorId)) return editors

  const next = new Map(editors)
  next.set(record.editorId, { ...record, status: 'clean' })
  return next
}

/**
 * @param {Map<string, DocumentationEditorRecord>} editors
 * @param {string} editorId
 */
export function unregisterDocumentationEditor(editors, editorId) {
  if (!editors.has(editorId)) return editors

  const next = new Map(editors)
  next.delete(editorId)
  return next
}

/**
 * @param {Map<string, DocumentationEditorRecord>} editors
 * @param {string} editorId
 * @param {string} snapshot
 */
export function updateDocumentationEditorSnapshot(editors, editorId, snapshot) {
  const existing = editors.get(editorId)
  if (!existing || existing.currentSnapshot === snapshot) return editors

  const next = new Map(editors)
  const isClean = snapshot === existing.baselineSnapshot
  next.set(editorId, {
    ...existing,
    currentSnapshot: snapshot,
    status: existing.status === 'saving' ? 'saving' : isClean ? 'clean' : 'dirty',
    message:
      existing.status === 'saving'
        ? existing.message
        : isClean
          ? undefined
          : existing.status === 'failed'
            ? undefined
            : existing.message,
  })
  return next
}

/**
 * @param {Map<string, DocumentationEditorRecord>} editors
 * @param {string} editorId
 * @param {string} submissionId
 * @param {string} submittedSnapshot
 */
export function markDocumentationEditorSaving(
  editors,
  editorId,
  submissionId,
  submittedSnapshot
) {
  const existing = editors.get(editorId)
  if (!existing) return editors

  const next = new Map(editors)
  next.set(editorId, {
    ...existing,
    activeSubmissionId: submissionId,
    status: 'saving',
    currentSnapshot: submittedSnapshot,
    submittedSnapshot,
    message: 'Saving changes...',
  })
  return next
}

/**
 * @param {Map<string, DocumentationEditorRecord>} editors
 * @param {string} editorId
 * @param {string} submissionId
 * @param {string} currentSnapshot
 */
export function markDocumentationEditorSaved(
  editors,
  editorId,
  submissionId,
  currentSnapshot
) {
  const existing = editors.get(editorId)
  if (
    !existing ||
    !existing.submittedSnapshot ||
    existing.activeSubmissionId !== submissionId
  ) {
    return editors
  }

  const next = new Map(editors)
  const hasNewerChanges = currentSnapshot !== existing.submittedSnapshot
  next.set(editorId, {
    ...existing,
    activeSubmissionId: undefined,
    baselineSnapshot: existing.submittedSnapshot,
    currentSnapshot,
    submittedSnapshot: undefined,
    status: hasNewerChanges ? 'dirty' : 'clean',
    message: hasNewerChanges
      ? 'Earlier changes saved; newer changes are unsaved.'
      : 'Saved',
  })
  return next
}

/**
 * @param {Map<string, DocumentationEditorRecord>} editors
 * @param {string} editorId
 * @param {string} submissionId
 * @param {string} message
 */
export function markDocumentationEditorFailed(
  editors,
  editorId,
  submissionId,
  message
) {
  const existing = editors.get(editorId)
  if (!existing || existing.activeSubmissionId !== submissionId) return editors

  const next = new Map(editors)
  next.set(editorId, {
    ...existing,
    activeSubmissionId: undefined,
    status: 'failed',
    submittedSnapshot: undefined,
    message,
  })
  return next
}

/**
 * @param {ReadonlyMap<string, DocumentationEditorRecord>} editors
 * @param {string | null | undefined} flowId
 */
export function summarizeDocumentationFlowEditors(editors, flowId) {
  if (!flowId) {
    return { changedCount: 0, dirtyCount: 0, failedCount: 0, savingCount: 0 }
  }

  const flowEditors = Array.from(editors.values()).filter(
    (editor) => editor.flowId === flowId
  )
  const countStatus = (status) =>
    flowEditors.filter((editor) => editor.status === status).length

  return {
    changedCount: flowEditors.filter((editor) => editor.status !== 'clean').length,
    dirtyCount: countStatus('dirty'),
    failedCount: countStatus('failed'),
    savingCount: countStatus('saving'),
  }
}

export function createDocumentationNavigationPermit() {
  let destination = null

  return {
    permit(nextDestination) {
      destination = nextDestination
    },
    consume(nextDestination) {
      if (destination !== nextDestination) return false
      destination = null
      return true
    },
  }
}

export function shouldBlockDocumentationNavigation({
  hasUnresolvedChanges,
  currentDestination,
  nextDestination,
  isPermitted,
}) {
  if (isPermitted) return false
  return hasUnresolvedChanges && currentDestination !== nextDestination
}
