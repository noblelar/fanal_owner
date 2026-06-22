import { useDocumentationEditor } from './documentation-dirty-provider'

const statusStyles = {
  clean: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  dirty: 'border-amber-200 bg-amber-50 text-amber-800',
  saving: 'border-sky-200 bg-sky-50 text-sky-700',
  failed: 'border-rose-200 bg-rose-50 text-rose-700',
} as const

const statusLabels = {
  clean: 'Saved',
  dirty: 'Unsaved changes',
  saving: 'Saving...',
  failed: 'Save failed',
} as const

export function DocumentationEditorStatus({ editorId }: { editorId: string }) {
  const editor = useDocumentationEditor(editorId)
  const status = editor?.status ?? 'clean'

  return (
    <span
      className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${statusStyles[status]}`}
      title={editor?.message}
      aria-live="polite"
    >
      {statusLabels[status]}
    </span>
  )
}
