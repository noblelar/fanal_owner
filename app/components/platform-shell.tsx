import type { ReactNode, SVGProps } from 'react'
import { Form, Link, NavLink, useLocation } from '@remix-run/react'

type PlatformShellProps = {
  title: string
  description?: string
  children: ReactNode
  actions?: ReactNode
  eyebrow?: string
}

type ShellNavItem = {
  to: string
  label: string
  end?: boolean
  icon: (props: SVGProps<SVGSVGElement>) => JSX.Element
}

const navItems: ShellNavItem[] = [
  {
    to: '/dashboard',
    label: 'Dashboard',
    end: true,
    icon: DashboardIcon,
  },
  {
    to: '/schools',
    label: 'School Governance',
    icon: SchoolIcon,
  },
  {
    to: '/operators',
    label: 'Platform Operators',
    icon: OperatorsIcon,
  },
]

export function PlatformShell({
  title,
  description,
  children,
  actions,
  eyebrow = 'Owner workspace',
}: PlatformShellProps) {
  const location = useLocation()

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,_#f5f1e7_0%,_#ffffff_32%,_#eef4f1_100%)] text-slate-900">
      <div className="grid min-h-screen lg:grid-cols-[18rem_minmax(0,1fr)]">
        <aside className="hidden border-r border-slate-200/80 bg-white/88 backdrop-blur-xl lg:sticky lg:top-0 lg:flex lg:h-screen lg:self-start lg:flex-col lg:justify-between">
          <div className="space-y-8 px-6 py-7">
            <Link to="/dashboard" className="block rounded-[1.75rem] border border-emerald-100 bg-emerald-50/70 p-4 shadow-[0_20px_45px_rgba(16,185,129,0.08)]">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-600 text-white shadow-[0_16px_28px_rgba(5,150,105,0.22)]">
                  <GridAccentIcon className="h-6 w-6" />
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-700">
                    Fanal
                  </p>
                  <p className="text-lg font-black tracking-tight text-slate-950">
                    Owner Console
                  </p>
                </div>
              </div>
            </Link>

            <nav className="space-y-2">
              {navItems.map((item) => {
                const isActive = item.end
                  ? location.pathname === item.to
                  : location.pathname === item.to || location.pathname.startsWith(`${item.to}/`)

                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    className={`group flex items-center gap-3 rounded-[1.35rem] px-4 py-3 transition ${
                      isActive
                        ? 'bg-emerald-600 text-white shadow-[0_18px_30px_rgba(5,150,105,0.24)]'
                        : 'border border-transparent text-slate-600 hover:border-slate-200 hover:bg-white hover:text-slate-950'
                    }`}
                  >
                    <span
                      className={`flex h-10 w-10 items-center justify-center rounded-2xl ${
                        isActive ? 'bg-white/16 text-white' : 'bg-slate-100 text-slate-600 group-hover:bg-emerald-50 group-hover:text-emerald-700'
                      }`}
                    >
                      <item.icon className="h-5 w-5" />
                    </span>
                    <span className="min-w-0 text-sm font-semibold">{item.label}</span>
                  </NavLink>
                )
              })}
            </nav>
          </div>

          <div className="space-y-4 border-t border-slate-200/80 px-6 py-6">
            <Form method="post" action="/logout">
              <button
                type="submit"
                className="inline-flex w-full items-center justify-center rounded-2xl border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
              >
                Sign out
              </button>
            </Form>
          </div>
        </aside>

        <div className="min-w-0">
          <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-white/82 backdrop-blur-xl">
            <div className="px-4 py-4 md:px-6 lg:px-8">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-700">
                    {eyebrow}
                  </p>
                  <div className="mt-2 flex flex-col gap-2">
                    <h1 className="text-3xl font-black tracking-tight text-slate-950 md:text-4xl">
                      {title}
                    </h1>
                    {description ? (
                      <p className="max-w-3xl text-sm text-slate-600 md:text-base">
                        {description}
                      </p>
                    ) : null}
                  </div>
                </div>

                {actions ? (
                  <div className="flex flex-wrap items-center gap-3 xl:justify-end">
                    {actions}
                  </div>
                ) : null}
              </div>

              <div className="mt-4 flex gap-2 overflow-x-auto pb-1 lg:hidden">
                {navItems.map((item) => {
                  const isActive = item.end
                    ? location.pathname === item.to
                    : location.pathname === item.to || location.pathname.startsWith(`${item.to}/`)

                  return (
                    <Link
                      key={item.to}
                      to={item.to}
                      className={`inline-flex items-center rounded-full border px-3 py-2 text-sm font-semibold whitespace-nowrap transition ${
                        isActive
                          ? 'border-emerald-600 bg-emerald-600 text-white'
                          : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                      }`}
                    >
                      {item.label}
                    </Link>
                  )
                })}
              </div>
            </div>
          </header>

          <div className="px-4 py-6 md:px-6 lg:px-8 lg:py-8">{children}</div>
        </div>
      </div>
    </div>
  )
}

function DashboardIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect x="3" y="3" width="8" height="8" rx="2" />
      <rect x="13" y="3" width="8" height="5" rx="2" />
      <rect x="13" y="10" width="8" height="11" rx="2" />
      <rect x="3" y="13" width="8" height="8" rx="2" />
    </svg>
  )
}

function SchoolIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M4 10.5 12 4l8 6.5" />
      <path d="M6 9.5V20h12V9.5" />
      <path d="M9 20v-5h6v5" />
    </svg>
  )
}

function OperatorsIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2" />
      <circle cx="9.5" cy="7" r="3.5" />
      <path d="M20 8v6" />
      <path d="M17 11h6" />
    </svg>
  )
}

function GridAccentIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M4 7h16" />
      <path d="M4 12h16" />
      <path d="M4 17h10" />
      <path d="M7 4v16" />
      <path d="M12 4v8" />
      <path d="M17 4v16" />
    </svg>
  )
}
