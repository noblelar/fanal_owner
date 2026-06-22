import {
  Form,
  useActionData,
  useLocation,
  useNavigate,
  useNavigation,
  useRevalidator,
} from '@remix-run/react'
import { useEffect, useRef } from 'react'
import type { ComponentProps } from 'react'
import { createDocumentationFormSnapshot } from '~/utils/documentation-form-snapshot'
import { useDocumentationDirtyState } from './documentation-dirty-provider'

type DocumentationEditorActionData = {
  editorId?: string
  editorSubmission?: boolean
  error?: string
  intent?: string
  ok?: boolean
  redirectTo?: string
  submissionId?: string
}

type DocumentationEditorFormProps = Omit<ComponentProps<typeof Form>, 'onInput' | 'onChange'> & {
  editorId: string
  flowId: string
  label: string
  saveIntent: string
}

export function DocumentationEditorForm({
  editorId,
  flowId,
  label,
  saveIntent,
  children,
  onSubmit,
  ...formProps
}: DocumentationEditorFormProps) {
  const formRef = useRef<HTMLFormElement | null>(null)
  const submissionIdInputRef = useRef<HTMLInputElement | null>(null)
  const activeSubmissionRef = useRef<{ id: string; snapshot: string } | null>(null)
  const labelRef = useRef(label)
  const location = useLocation()
  const navigate = useNavigate()
  const navigation = useNavigation()
  const revalidator = useRevalidator()
  const actionData = useActionData<DocumentationEditorActionData>()
  const {
    markEditorFailed,
    markEditorSaved,
    markEditorSaving,
    permitNavigationTo,
    refreshEditorFromForm,
    registerEditor,
    unregisterEditor,
  } = useDocumentationDirtyState()

  useEffect(() => {
    const form = formRef.current
    if (!form) return
    const snapshot = createDocumentationFormSnapshot(form)
    registerEditor({
      editorId,
      flowId,
      label: labelRef.current,
      baselineSnapshot: snapshot,
      currentSnapshot: snapshot,
    })

    return () => unregisterEditor(editorId)
  }, [editorId, flowId, registerEditor, unregisterEditor])

  useEffect(() => {
    if (navigation.state !== 'idle' || !activeSubmissionRef.current) return
    const activeSubmission = activeSubmissionRef.current
    activeSubmissionRef.current = null
    const form = formRef.current
    if (!form) return

    const responseMatchesSubmission =
      actionData?.editorSubmission === true &&
      actionData.editorId === editorId &&
      actionData.intent === saveIntent &&
      actionData.submissionId === activeSubmission.id

    if (!responseMatchesSubmission) {
      markEditorFailed(
        editorId,
        activeSubmission.id,
        'The save response could not be confirmed. Your changes remain unsaved.'
      )
      return
    }

    if (actionData.ok !== true) {
      markEditorFailed(
        editorId,
        activeSubmission.id,
        actionData.error || 'The documentation changes could not be saved.'
      )
      return
    }

    const currentSnapshot = createDocumentationFormSnapshot(form)
    const hasNewerChanges = currentSnapshot !== activeSubmission.snapshot
    markEditorSaved(editorId, activeSubmission.id, currentSnapshot)

    if (hasNewerChanges) return

    const currentUrl = `${location.pathname}${location.search}`
    if (actionData.redirectTo && actionData.redirectTo !== currentUrl) {
      permitNavigationTo(actionData.redirectTo)
      navigate(actionData.redirectTo, { replace: true })
      return
    }

    revalidator.revalidate()
  }, [
    actionData,
    editorId,
    location.pathname,
    location.search,
    markEditorFailed,
    markEditorSaved,
    navigate,
    navigation.state,
    permitNavigationTo,
    revalidator,
    saveIntent,
  ])

  function refreshSnapshot() {
    const form = formRef.current
    if (form) refreshEditorFromForm(editorId, form)
  }

  return (
    <Form
      {...formProps}
      ref={formRef}
      onInput={refreshSnapshot}
      onChange={refreshSnapshot}
      onSubmit={(event) => {
        onSubmit?.(event)
        if (event.defaultPrevented) return

        const submitter = (event.nativeEvent as SubmitEvent).submitter as
          | HTMLButtonElement
          | HTMLInputElement
          | null
        const intent = submitter?.name === '_intent' ? submitter.value : saveIntent
        if (intent === saveIntent && formRef.current && submissionIdInputRef.current) {
          if (activeSubmissionRef.current) {
            event.preventDefault()
            return
          }

          const submissionId = createDocumentationSubmissionId()
          submissionIdInputRef.current.value = submissionId
          const snapshot = createDocumentationFormSnapshot(formRef.current)
          activeSubmissionRef.current = { id: submissionId, snapshot }
          markEditorSaving(editorId, submissionId, snapshot)
        }
      }}
    >
      <input type="hidden" name="_editorId" value={editorId} />
      <input type="hidden" name="_responseMode" value="editor" />
      <input ref={submissionIdInputRef} type="hidden" name="_submissionId" />
      {children}
    </Form>
  )
}

function createDocumentationSubmissionId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  return `documentation-${Date.now()}-${Math.random().toString(36).slice(2)}`
}
