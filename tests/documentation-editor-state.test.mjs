import assert from 'node:assert/strict'
import test from 'node:test'

import {
  createDocumentationNavigationPermit,
  markDocumentationEditorFailed,
  markDocumentationEditorSaved,
  markDocumentationEditorSaving,
  registerDocumentationEditor,
  shouldBlockDocumentationNavigation,
  summarizeDocumentationFlowEditors,
  updateDocumentationEditorSnapshot,
} from '../app/utils/documentation-editor-state.js'

function createEditors(editorId = 'flow-details:flow-1', flowId = 'flow-1') {
  return registerDocumentationEditor(new Map(), {
    editorId,
    flowId,
    label: 'Flow details',
    baselineSnapshot: 'original',
    currentSnapshot: 'original',
  })
}

test('ordinary text changes become dirty and reverting restores clean state', () => {
  const changed = updateDocumentationEditorSnapshot(
    createEditors(),
    'flow-details:flow-1',
    'changed'
  )
  assert.equal(changed.get('flow-details:flow-1')?.status, 'dirty')

  const reverted = updateDocumentationEditorSnapshot(
    changed,
    'flow-details:flow-1',
    'original'
  )
  assert.equal(reverted.get('flow-details:flow-1')?.status, 'clean')
})

test('a matching successful acknowledgement clears the submitted dirty state', () => {
  const dirty = updateDocumentationEditorSnapshot(
    createEditors(),
    'flow-details:flow-1',
    'submitted'
  )
  const saving = markDocumentationEditorSaving(
    dirty,
    'flow-details:flow-1',
    'submission-1',
    'submitted'
  )
  assert.equal(saving.get('flow-details:flow-1')?.status, 'saving')

  const saved = markDocumentationEditorSaved(
    saving,
    'flow-details:flow-1',
    'submission-1',
    'submitted'
  )
  assert.equal(saved.get('flow-details:flow-1')?.status, 'clean')
  assert.equal(saved.get('flow-details:flow-1')?.baselineSnapshot, 'submitted')
})

test('new edits made during a save remain dirty after the earlier save succeeds', () => {
  const saving = markDocumentationEditorSaving(
    createEditors(),
    'flow-details:flow-1',
    'submission-1',
    'submitted'
  )
  const editedAgain = updateDocumentationEditorSnapshot(
    saving,
    'flow-details:flow-1',
    'newer-change'
  )
  const acknowledged = markDocumentationEditorSaved(
    editedAgain,
    'flow-details:flow-1',
    'submission-1',
    'newer-change'
  )

  assert.equal(acknowledged.get('flow-details:flow-1')?.status, 'dirty')
  assert.equal(acknowledged.get('flow-details:flow-1')?.baselineSnapshot, 'submitted')
  assert.equal(
    acknowledged.get('flow-details:flow-1')?.message,
    'Earlier changes saved; newer changes are unsaved.'
  )
})

test('failed and stale save responses never clear unresolved changes', () => {
  const saving = markDocumentationEditorSaving(
    createEditors(),
    'flow-details:flow-1',
    'submission-2',
    'submitted'
  )
  const staleResponse = markDocumentationEditorSaved(
    saving,
    'flow-details:flow-1',
    'submission-1',
    'submitted'
  )
  assert.strictEqual(staleResponse, saving)

  const failed = markDocumentationEditorFailed(
    saving,
    'flow-details:flow-1',
    'submission-2',
    'The API rejected the update.'
  )
  assert.equal(failed.get('flow-details:flow-1')?.status, 'failed')
  assert.equal(
    failed.get('flow-details:flow-1')?.message,
    'The API rejected the update.'
  )
})

test('flow summaries isolate dirty, saving, and failed editors by flow', () => {
  let editors = createEditors()
  editors = registerDocumentationEditor(editors, {
    editorId: 'flow-media:flow-1',
    flowId: 'flow-1',
    label: 'Flow media',
    baselineSnapshot: 'media-original',
    currentSnapshot: 'media-original',
  })
  editors = registerDocumentationEditor(editors, {
    editorId: 'flow-details:flow-2',
    flowId: 'flow-2',
    label: 'Other flow',
    baselineSnapshot: 'other',
    currentSnapshot: 'other',
  })
  editors = updateDocumentationEditorSnapshot(
    editors,
    'flow-details:flow-1',
    'changed'
  )
  editors = markDocumentationEditorSaving(
    editors,
    'flow-media:flow-1',
    'submission-media',
    'media-changed'
  )

  assert.deepEqual(summarizeDocumentationFlowEditors(editors, 'flow-1'), {
    changedCount: 2,
    dirtyCount: 1,
    failedCount: 0,
    savingCount: 1,
  })
  assert.deepEqual(summarizeDocumentationFlowEditors(editors, 'flow-2'), {
    changedCount: 0,
    dirtyCount: 0,
    failedCount: 0,
    savingCount: 0,
  })
})

test('navigation is blocked for unresolved changes unless a matching permit is consumed', () => {
  const permit = createDocumentationNavigationPermit()
  permit.permit('/documentation?flow=flow-1&section=media')

  assert.equal(
    permit.consume('/documentation?flow=flow-1&section=details'),
    false
  )
  const isPermitted = permit.consume('/documentation?flow=flow-1&section=media')
  assert.equal(isPermitted, true)
  assert.equal(
    shouldBlockDocumentationNavigation({
      hasUnresolvedChanges: true,
      currentDestination: '/documentation?section=details',
      nextDestination: '/documentation?section=media',
      isPermitted,
    }),
    false
  )
  assert.equal(permit.consume('/documentation?flow=flow-1&section=media'), false)
  assert.equal(
    shouldBlockDocumentationNavigation({
      hasUnresolvedChanges: true,
      currentDestination: '/documentation?section=details',
      nextDestination: '/dashboard',
      isPermitted: false,
    }),
    true
  )
})
