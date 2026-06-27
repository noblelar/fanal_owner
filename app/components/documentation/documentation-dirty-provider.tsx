import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { createDocumentationFormSnapshot } from '~/utils/documentation-form-snapshot'
import {
  createDocumentationNavigationPermit,
  markDocumentationEditorFailed,
  markDocumentationEditorSaved,
  markDocumentationEditorSaving,
  registerDocumentationEditor,
  summarizeDocumentationFlowEditors,
  unregisterDocumentationEditor,
  updateDocumentationEditorSnapshot,
} from '~/utils/documentation-editor-state'

export type DocumentationEditorStatus = 'clean' | 'dirty' | 'saving' | 'failed'

export type DocumentationEditorRecord = {
  editorId: string
  flowId: string
  label: string
  status: DocumentationEditorStatus
  baselineSnapshot: string
  currentSnapshot: string
  activeSubmissionId?: string
  submittedSnapshot?: string
  message?: string
}

type DocumentationDirtyContextValue = {
  editors: ReadonlyMap<string, DocumentationEditorRecord>
  registerEditor: (record: Omit<DocumentationEditorRecord, 'status'>) => void
  unregisterEditor: (editorId: string) => void
  updateEditorSnapshot: (editorId: string, snapshot: string) => void
  refreshEditorFromForm: (editorId: string, form: HTMLFormElement) => void
  markEditorSaving: (
    editorId: string,
    submissionId: string,
    submittedSnapshot: string
  ) => void
  markEditorSaved: (
    editorId: string,
    submissionId: string,
    currentSnapshot: string
  ) => void
  markEditorFailed: (editorId: string, submissionId: string, message: string) => void
  permitNavigationTo: (destination: string) => void
  consumeNavigationPermit: (destination: string) => boolean
}

const DocumentationDirtyContext = createContext<DocumentationDirtyContextValue | null>(null)

export function DocumentationDirtyProvider({ children }: { children: ReactNode }) {
  const navigationPermitRef = useRef(createDocumentationNavigationPermit())
  const [editors, setEditors] = useState<Map<string, DocumentationEditorRecord>>(
    () => new Map()
  )

  const registerEditor = useCallback(
    (record: Omit<DocumentationEditorRecord, 'status'>) => {
      setEditors((current) => registerDocumentationEditor(current, record))
    },
    []
  )

  const unregisterEditor = useCallback((editorId: string) => {
    setEditors((current) => unregisterDocumentationEditor(current, editorId))
  }, [])

  const updateEditorSnapshot = useCallback((editorId: string, snapshot: string) => {
    setEditors((current) =>
      updateDocumentationEditorSnapshot(current, editorId, snapshot)
    )
  }, [])

  const refreshEditorFromForm = useCallback(
    (editorId: string, form: HTMLFormElement) => {
      updateEditorSnapshot(editorId, createDocumentationFormSnapshot(form))
    },
    [updateEditorSnapshot]
  )

  const markEditorSaving = useCallback(
    (editorId: string, submissionId: string, submittedSnapshot: string) => {
      setEditors((current) =>
        markDocumentationEditorSaving(
          current,
          editorId,
          submissionId,
          submittedSnapshot
        )
      )
    },
    []
  )

  const markEditorSaved = useCallback(
    (editorId: string, submissionId: string, currentSnapshot: string) => {
      setEditors((current) =>
        markDocumentationEditorSaved(current, editorId, submissionId, currentSnapshot)
      )
    },
    []
  )

  const markEditorFailed = useCallback(
    (editorId: string, submissionId: string, message: string) => {
      setEditors((current) =>
        markDocumentationEditorFailed(current, editorId, submissionId, message)
      )
    },
    []
  )

  const permitNavigationTo = useCallback((destination: string) => {
    navigationPermitRef.current.permit(destination)
  }, [])

  const consumeNavigationPermit = useCallback((destination: string) => {
    return navigationPermitRef.current.consume(destination)
  }, [])

  const value = useMemo<DocumentationDirtyContextValue>(
    () => ({
      editors,
      registerEditor,
      unregisterEditor,
      updateEditorSnapshot,
      refreshEditorFromForm,
      markEditorSaving,
      markEditorSaved,
      markEditorFailed,
      permitNavigationTo,
      consumeNavigationPermit,
    }),
    [
      editors,
      markEditorFailed,
      markEditorSaved,
      markEditorSaving,
      consumeNavigationPermit,
      permitNavigationTo,
      refreshEditorFromForm,
      registerEditor,
      unregisterEditor,
      updateEditorSnapshot,
    ]
  )

  return (
    <DocumentationDirtyContext.Provider value={value}>
      {children}
    </DocumentationDirtyContext.Provider>
  )
}

export function useDocumentationDirtyState() {
  const context = useContext(DocumentationDirtyContext)
  if (!context) {
    throw new Error('Documentation dirty state must be used inside its provider.')
  }
  return context
}

export function useDocumentationEditor(editorId: string) {
  return useDocumentationDirtyState().editors.get(editorId) ?? null
}

export function useDocumentationFlowDirtySummary(flowId?: string | null) {
  const { editors } = useDocumentationDirtyState()
  return useMemo(() => {
    if (!flowId) {
      return {
        changedCount: 0,
        dirtyCount: 0,
        failedCount: 0,
        savingCount: 0,
      }
    }

    return summarizeDocumentationFlowEditors(editors, flowId)
  }, [editors, flowId])
}
