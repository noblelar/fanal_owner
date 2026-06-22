import assert from 'node:assert/strict'
import test from 'node:test'

import {
  canPublishDocumentationDraft,
  moveDocumentationStepIds,
} from '../app/utils/documentation-workflow-state.js'

test('step ordering moves one step and leaves the source order unchanged', () => {
  const source = ['step-a', 'step-b', 'step-c']

  assert.deepEqual(moveDocumentationStepIds(source, 1, 'up'), [
    'step-b',
    'step-a',
    'step-c',
  ])
  assert.deepEqual(moveDocumentationStepIds(source, 1, 'down'), [
    'step-a',
    'step-c',
    'step-b',
  ])
  assert.deepEqual(source, ['step-a', 'step-b', 'step-c'])
})

test('step ordering ignores moves beyond either boundary', () => {
  assert.deepEqual(moveDocumentationStepIds(['step-a', 'step-b'], 0, 'up'), [
    'step-a',
    'step-b',
  ])
  assert.deepEqual(moveDocumentationStepIds(['step-a', 'step-b'], 1, 'down'), [
    'step-a',
    'step-b',
  ])
})

test('publishing requires a ready draft with no unresolved browser changes', () => {
  assert.equal(
    canPublishDocumentationDraft({
      hasDraft: true,
      isReady: true,
      hasUnresolvedChanges: false,
    }),
    true
  )
  assert.equal(
    canPublishDocumentationDraft({
      hasDraft: false,
      isReady: true,
      hasUnresolvedChanges: false,
    }),
    false
  )
  assert.equal(
    canPublishDocumentationDraft({
      hasDraft: true,
      isReady: false,
      hasUnresolvedChanges: false,
    }),
    false
  )
  assert.equal(
    canPublishDocumentationDraft({
      hasDraft: true,
      isReady: true,
      hasUnresolvedChanges: true,
    }),
    false
  )
})
