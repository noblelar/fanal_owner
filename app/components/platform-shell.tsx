import { useEffect, useState } from 'react'
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

const sidebarPreferenceKey = 'fanal-owner:sidebar-collapsed'
const brandLogoSrc = '/images/fanal_logo.svg'

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
  {
    to: '/documentation',
    label: 'Documentation',
    icon: DocumentationIcon,
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
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false)

  useEffect(() => {
    try {
      const storedPreference = window.localStorage.getItem(sidebarPreferenceKey)
      if (storedPreference !== null) {
        setIsSidebarCollapsed(storedPreference === 'true')
      }
    } catch {
      // Storage can be unavailable in privacy-restricted browser contexts.
    }
  }, [])

  function toggleSidebar() {
    const nextValue = !isSidebarCollapsed
    setIsSidebarCollapsed(nextValue)

    try {
      window.localStorage.setItem(sidebarPreferenceKey, String(nextValue))
    } catch {
      // The in-memory preference still works when storage is unavailable.
    }
  }

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,_#f5f1e7_0%,_#ffffff_32%,_#eef4f1_100%)] text-slate-900">
      <a
        href="#owner-main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-slate-950 focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white focus:shadow-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2"
      >
        Skip to main content
      </a>

      <div
        className={`grid min-h-screen transition-[grid-template-columns] duration-300 ease-out motion-reduce:transition-none ${
          isSidebarCollapsed
            ? 'lg:grid-cols-[5.5rem_minmax(0,1fr)]'
            : 'lg:grid-cols-[18rem_minmax(0,1fr)]'
        }`}
      >
        <aside
          id="owner-sidebar"
          aria-label="Owner console sidebar"
          className="relative hidden border-r border-slate-200/80 bg-white/88 backdrop-blur-xl lg:sticky lg:top-0 lg:flex lg:h-screen lg:self-start lg:flex-col lg:justify-between"
          data-collapsed={isSidebarCollapsed}
        >
          <button
            type="button"
            onClick={toggleSidebar}
            aria-controls="owner-sidebar-navigation"
            aria-expanded={!isSidebarCollapsed}
            aria-pressed={isSidebarCollapsed}
            aria-label={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            title={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="absolute -right-4 top-8 z-30 inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-md transition hover:border-emerald-300 hover:text-emerald-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 motion-reduce:transition-none"
          >
            {isSidebarCollapsed ? (
              <ChevronRightIcon className="h-4 w-4" />
            ) : (
              <ChevronLeftIcon className="h-4 w-4" />
            )}
          </button>

          <div className={`space-y-8 py-7 ${isSidebarCollapsed ? 'px-3' : 'px-6'}`}>
            <Link
              to="/dashboard"
              aria-label={isSidebarCollapsed ? 'Fanal Owner Console' : undefined}
              className={`group relative block rounded-[1.75rem] border border-emerald-100 bg-emerald-50/70 shadow-[0_20px_45px_rgba(16,185,129,0.08)] transition-[padding,box-shadow,background-color] duration-300 hover:bg-emerald-50 hover:shadow-[0_22px_48px_rgba(16,185,129,0.12)] focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 motion-reduce:transition-none ${
                isSidebarCollapsed ? 'p-2' : 'p-4'
              }`}
            >
              <div className={`flex items-center ${isSidebarCollapsed ? 'justify-center' : 'gap-3'}`}>
                <div
                  className={`flex shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-white/95 shadow-[0_16px_28px_rgba(5,150,105,0.16)] ring-1 ring-emerald-100/80 ${
                    isSidebarCollapsed ? 'h-12 w-12 p-2.5' : 'h-12 w-12 p-2'
                  }`}
                >
                  <img
                    src={brandLogoSrc}
                    alt=""
                    width={49}
                    height={51}
                    className="h-full w-full object-contain"
                    decoding="async"
                    draggable={false}
                  />
                </div>
                {!isSidebarCollapsed ? (
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-700">
                      Fanal
                    </p>
                    <p className="text-lg font-black tracking-tight text-slate-950">
                      Owner Console
                    </p>
                  </div>
                ) : (
                  <SidebarTooltip>Fanal Owner Console</SidebarTooltip>
                )}
              </div>
            </Link>

            <nav
              id="owner-sidebar-navigation"
              aria-label="Owner console navigation"
              className="space-y-2"
            >
              {navItems.map((item) => {
                const isActive = item.end
                  ? location.pathname === item.to
                  : location.pathname === item.to || location.pathname.startsWith(`${item.to}/`)

                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    aria-current={isActive ? 'page' : undefined}
                    aria-label={isSidebarCollapsed ? item.label : undefined}
                    title={isSidebarCollapsed ? item.label : undefined}
                    className={`group relative flex items-center rounded-[1.35rem] transition focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 motion-reduce:transition-none ${
                      isSidebarCollapsed ? 'h-14 justify-center px-0 py-0' : 'gap-3 px-4 py-3'
                    } ${
                      isActive
                        ? 'bg-emerald-600 text-white shadow-[0_18px_30px_rgba(5,150,105,0.24)]'
                        : 'border border-transparent text-slate-600 hover:border-slate-200 hover:bg-white hover:text-slate-950 hover:shadow-sm'
                    }`}
                  >
                    <span
                      className={`flex h-10 w-10 items-center justify-center rounded-2xl transition ${
                        isActive
                          ? 'bg-white/16 text-white'
                          : 'bg-slate-100 text-slate-600 group-hover:bg-emerald-50 group-hover:text-emerald-700'
                      }`}
                    >
                      <item.icon aria-hidden="true" focusable="false" className="h-5 w-5" />
                    </span>
                    {!isSidebarCollapsed ? (
                      <span className="min-w-0 text-sm font-semibold">{item.label}</span>
                    ) : (
                      <SidebarTooltip>{item.label}</SidebarTooltip>
                    )}
                  </NavLink>
                )
              })}
            </nav>
          </div>

          <div className={`space-y-4 border-t border-slate-200/80 py-6 ${isSidebarCollapsed ? 'px-3' : 'px-6'}`}>
            <Form method="post" action="/logout">
              <button
                type="submit"
                aria-label={isSidebarCollapsed ? 'Sign out' : undefined}
                title={isSidebarCollapsed ? 'Sign out' : undefined}
                className={`group relative inline-flex w-full items-center justify-center rounded-2xl border border-slate-300 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 motion-reduce:transition-none ${
                  isSidebarCollapsed ? 'h-12 px-2' : 'gap-2 px-4'
                }`}
              >
                {isSidebarCollapsed ? (
                  <>
                    <SignOutIcon aria-hidden="true" focusable="false" className="h-5 w-5" />
                    <SidebarTooltip>Sign out</SidebarTooltip>
                  </>
                ) : (
                  'Sign out'
                )}
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

              <nav
                aria-label="Owner console mobile navigation"
                className="mt-4 flex gap-2 overflow-x-auto pb-1 lg:hidden"
              >
                {navItems.map((item) => {
                  const isActive = item.end
                    ? location.pathname === item.to
                    : location.pathname === item.to || location.pathname.startsWith(`${item.to}/`)

                  return (
                    <Link
                      key={item.to}
                      to={item.to}
                      aria-current={isActive ? 'page' : undefined}
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
              </nav>
            </div>
          </header>

          <main
            id="owner-main-content"
            tabIndex={-1}
            className="px-4 py-6 outline-none md:px-6 lg:px-8 lg:py-8"
          >
            {children}
          </main>
        </div>
      </div>
    </div>
  )
}

function SidebarTooltip({ children }: { children: ReactNode }) {
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute left-[calc(100%+0.75rem)] top-1/2 z-40 -translate-y-1/2 whitespace-nowrap rounded-xl bg-slate-950 px-3 py-2 text-xs font-semibold text-white opacity-0 shadow-xl ring-1 ring-white/10 transition duration-150 group-hover:translate-x-0.5 group-hover:opacity-100 group-focus-visible:translate-x-0.5 group-focus-visible:opacity-100 group-focus-within:translate-x-0.5 group-focus-within:opacity-100 motion-reduce:transition-none"
    >
      {children}
    </span>
  )
}

function ChevronLeftIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d="m15 18-6-6 6-6" />
    </svg>
  )
}

function ChevronRightIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d="m9 18 6-6-6-6" />
    </svg>
  )
}

function SignOutIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d="M10 17l5-5-5-5" />
      <path d="M15 12H3" />
      <path d="M14 4h4a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3h-4" />
    </svg>
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

function DocumentationIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M6 4.5h9a3 3 0 0 1 3 3V19.5H9a3 3 0 0 0-3 3" />
      <path d="M6 4.5v18" />
      <path d="M9 8h6" />
      <path d="M9 12h6" />
      <path d="M9 16h4" />
    </svg>
  )
}
