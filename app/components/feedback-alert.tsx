import { Alert, AlertDescription, AlertTitle } from '~/components/ui/alert'

type FeedbackTone = 'error' | 'info' | 'success' | 'warning'

type FeedbackAlertProps = {
  tone?: FeedbackTone
  title: string
  message: string
  className?: string
}

const toneStyles: Record<FeedbackTone, { className: string; variant: 'default' | 'destructive' }> =
  {
    error: {
      className: '',
      variant: 'destructive',
    },
    info: {
      className: 'border-sky-200 bg-sky-50 text-sky-950',
      variant: 'default',
    },
    success: {
      className: 'border-emerald-200 bg-emerald-50 text-emerald-950',
      variant: 'default',
    },
    warning: {
      className: 'border-amber-200 bg-amber-50 text-amber-950',
      variant: 'default',
    },
  }

export function FeedbackAlert({
  tone = 'info',
  title,
  message,
  className = '',
}: FeedbackAlertProps) {
  const config = toneStyles[tone]

  return (
    <Alert variant={config.variant} className={`${config.className} ${className}`.trim()}>
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  )
}
