const excludedDocumentationFormFields = new Set([
  '_editorId',
  '_intent',
  '_responseMode',
  '_submissionId',
  'currentFlowId',
  'currentGroup',
  'currentPanel',
  'currentSearch',
  'stepId',
])

function normalizeDocumentationFormValue(value: FormDataEntryValue) {
  if (typeof value !== 'string') {
    return `${value.name}:${value.size}:${value.type}`
  }

  return value.replace(/\r\n/g, '\n')
}

export function createDocumentationFormSnapshot(form: HTMLFormElement) {
  const entries = Array.from(new FormData(form).entries())
    .filter(([name]) => !excludedDocumentationFormFields.has(name))
    .map(([name, value]) => [name, normalizeDocumentationFormValue(value)] as const)
    .sort(([leftName, leftValue], [rightName, rightValue]) => {
      const nameComparison = leftName.localeCompare(rightName)
      return nameComparison !== 0 ? nameComparison : leftValue.localeCompare(rightValue)
    })

  return JSON.stringify(entries)
}
