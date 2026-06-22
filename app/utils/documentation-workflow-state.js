/**
 * Return the complete step ordering produced by moving one step one position.
 * The input is never mutated so it is safe to reuse for both move controls.
 *
 * @param {string[]} stepIds
 * @param {number} index
 * @param {'up' | 'down'} direction
 */
export function moveDocumentationStepIds(stepIds, index, direction) {
  const orderedStepIds = [...stepIds]
  const target = direction === 'up' ? index - 1 : index + 1

  if (index < 0 || index >= orderedStepIds.length || target < 0 || target >= orderedStepIds.length) {
    return orderedStepIds
  }

  const currentStepId = orderedStepIds[index]
  orderedStepIds[index] = orderedStepIds[target]
  orderedStepIds[target] = currentStepId
  return orderedStepIds
}

/**
 * Publishing is safe only when the server has a ready draft and the browser has
 * no unsaved or failed editor changes waiting to be acknowledged.
 *
 * @param {{ hasDraft: boolean, isReady: boolean, hasUnresolvedChanges: boolean }} state
 */
export function canPublishDocumentationDraft(state) {
  return state.hasDraft && state.isReady && !state.hasUnresolvedChanges
}
