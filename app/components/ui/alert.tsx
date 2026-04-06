import * as React from 'react'

type AlertVariant = 'default' | 'destructive'

function cn(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ')
}

const alertVariants: Record<AlertVariant, string> = {
  default: 'border-slate-200 bg-white text-slate-900',
  destructive: 'border-rose-300 bg-rose-50 text-rose-950',
}

export interface AlertProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: AlertVariant
}

const Alert = React.forwardRef<HTMLDivElement, AlertProps>(function Alert(
  { className, variant = 'default', ...props },
  ref
) {
  return (
    <div
      ref={ref}
      role="alert"
      className={cn(
        'relative w-full rounded-2xl border px-4 py-4 shadow-sm',
        alertVariants[variant],
        className
      )}
      {...props}
    />
  )
})

const AlertTitle = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLHeadingElement>>(
  function AlertTitle({ className, ...props }, ref) {
    return <p ref={ref} className={cn('text-sm font-semibold leading-none', className)} {...props} />
  }
)

const AlertDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(function AlertDescription({ className, ...props }, ref) {
  return <p ref={ref} className={cn('mt-2 text-sm leading-6', className)} {...props} />
})

export { Alert, AlertDescription, AlertTitle }
