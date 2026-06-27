import assert from 'node:assert/strict'
import test from 'node:test'

import {
  createDocumentationActionData,
  isDocumentationEditorSubmission,
  parseDocumentationExpectedVersion,
  parseDocumentationOrderedStepIds,
  shouldRevalidateDocumentationRoute,
} from '../app/utils/documentation-route-state.js'

function createFormData(values) {
  const formData = new FormData()
  Object.entries(values).forEach(([name, value]) => formData.set(name, value))
  return formData
}

test('editor save responses preserve the editor and submission acknowledgement identity', () => {
  const formData = createFormData({
    _responseMode: 'editor',
    _editorId: ' flow-details:flow-1 ',
    _submissionId: ' submission-7 ',
  })

  assert.equal(isDocumentationEditorSubmission(formData, 'save_details'), true)
  assert.deepEqual(createDocumentationActionData(formData, 'save_details', {
    ok: true,
    redirectTo: '/documentation?flow=flow-1&section=details',
  }), {
    ok: true,
    redirectTo: '/documentation?flow=flow-1&section=details',
    intent: 'save_details',
    editorId: 'flow-details:flow-1',
    editorSubmission: true,
    submissionId: 'submission-7',
  })
})

test('non-save CRUD actions cannot masquerade as editor acknowledgements', () => {
  const formData = createFormData({
    _responseMode: 'editor',
    _editorId: 'flow-details:flow-1',
    _submissionId: 'submission-8',
  })

  assert.equal(isDocumentationEditorSubmission(formData, 'publish_flow'), false)
  assert.equal(
    createDocumentationActionData(formData, 'publish_flow', { ok: true })
      .editorSubmission,
    false
  )
})

test('expected versions accept positive safe integers only', () => {
  for (const value of ['', '0', '-1', '1.5', 'not-a-version']) {
    assert.equal(
      parseDocumentationExpectedVersion(createFormData({ expectedVersion: value })),
      null
    )
  }

  assert.equal(
    parseDocumentationExpectedVersion(createFormData({ expectedVersion: '42' })),
    42
  )
})

test('complete reorder payloads are normalized without empty step identifiers', () => {
  assert.deepEqual(
    parseDocumentationOrderedStepIds(' step-3,step-1, , step-2 '),
    ['step-3', 'step-1', 'step-2']
  )
})

test('successful editor saves suppress loader revalidation while other actions retain it', () => {
  assert.equal(
    shouldRevalidateDocumentationRoute({ editorSubmission: true }, true),
    false
  )
  assert.equal(
    shouldRevalidateDocumentationRoute({ editorSubmission: false }, true),
    true
  )
  assert.equal(shouldRevalidateDocumentationRoute(undefined, false), false)
})
