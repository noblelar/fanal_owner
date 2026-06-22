import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { createDocumentationFormSnapshot } from '~/utils/documentation-form-snapshot'

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
  const permittedNavigationRef = useRef<string | null>(null)
  const [editors, setEditors] = useState<Map<string, DocumentationEditorRecord>>(
    () => new Map()
  )

  const registerEditor = useCallback(
    (record: Omit<DocumentationEditorRecord, 'status'>) => {
      setEditors((current) => {
        const existing = current.get(record.editorId)
        if (existing) return current

        const next = new Map(current)
        next.set(record.editorId, { ...record, status: 'clean' })
        return next
      })
    },
    []
  )

  const unregisterEditor = useCallback((editorId: string) => {
    setEditors((current) => {
      if (!current.has(editorId)) return current
      const next = new Map(current)
      next.delete(editorId)
      return next
    })
  }, [])

  const updateEditorSnapshot = useCallback((editorId: string, snapshot: string) => {
    setEditors((current) => {
      const existing = current.get(editorId)
      if (!existing || existing.currentSnapshot === snapshot) return current
      const next = new Map(current)
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
    })
  }, [])

  const refreshEditorFromForm = useCallback(
    (editorId: string, form: HTMLFormElement) => {
      updateEditorSnapshot(editorId, createDocumentationFormSnapshot(form))
    },
    [updateEditorSnapshot]
  )

  const markEditorSaving = useCallback(
    (editorId: string, submissionId: string, submittedSnapshot: string) => {
      setEditors((current) => {
        const existing = current.get(editorId)
        if (!existing) return current
        const next = new Map(current)
        next.set(editorId, {
          ...existing,
          activeSubmissionId: submissionId,
          status: 'saving',
          currentSnapshot: submittedSnapshot,
          submittedSnapshot,
          message: 'Saving changes...',
        })
        return next
      })
    },
    []
  )

  const markEditorSaved = useCallback(
    (editorId: string, submissionId: string, currentSnapshot: string) => {
      setEditors((current) => {
        const existing = current.get(editorId)
        if (
          !existing ||
          !existing.submittedSnapshot ||
          existing.activeSubmissionId !== submissionId
        ) {
          return current
        }
        const next = new Map(current)
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
      })
    },
    []
  )

  const markEditorFailed = useCallback(
    (editorId: string, submissionId: string, message: string) => {
      setEditors((current) => {
        const existing = current.get(editorId)
        if (!existing || existing.activeSubmissionId !== submissionId) return current
        const next = new Map(current)
        next.set(editorId, {
          ...existing,
          activeSubmissionId: undefined,
          status: 'failed',
          submittedSnapshot: undefined,
          message,
        })
        return next
      })
    },
    []
  )

  const permitNavigationTo = useCallback((destination: string) => {
    permittedNavigationRef.current = destination
  }, [])

  const consumeNavigationPermit = useCallback((destination: string) => {
    if (permittedNavigationRef.current !== destination) return false
    permittedNavigationRef.current = null
    return true
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

    const flowEditors = Array.from(editors.values()).filter(
      (editor) => editor.flowId === flowId
    )
    const countStatus = (status: DocumentationEditorStatus) =>
      flowEditors.filter((editor) => editor.status === status).length

    return {
      changedCount: flowEditors.filter((editor) => editor.status !== 'clean').length,
      dirtyCount: countStatus('dirty'),
      failedCount: countStatus('failed'),
      savingCount: countStatus('saving'),
    }
  }, [editors, flowId])
}
