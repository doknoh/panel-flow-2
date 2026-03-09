'use client'

import Link from 'next/link'
import ThemeToggle from './ThemeToggle'

interface HeaderProps {
  userEmail?: string
  showBackLink?: boolean
  backHref?: string
  backLabel?: string
  title?: string
  children?: React.ReactNode
}

export default function Header({
  userEmail,
  showBackLink = false,
  backHref = '/dashboard',
  backLabel = '← Dashboard',
  title = 'Panel Flow',
  children,
}: HeaderProps) {
  return (
    <header className="border-b border-[var(--text-primary)] bg-[var(--bg-primary)] px-4 sm:px-6 py-3">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-4">
          {showBackLink && (
            <>
              <Link
                href={backHref}
                className="type-meta text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
              >
                {backLabel}
              </Link>
              <span className="type-separator">{'\/\/'}</span>
            </>
          )}
          <h1 className="font-black tracking-[-0.04em] text-[var(--text-primary)] text-xl sm:text-2xl uppercase leading-none">{title}</h1>
        </div>
        <div className="flex items-center gap-2 sm:gap-4">
          {children}
          <ThemeToggle />
          {userEmail && (
            <span className="type-micro text-[var(--text-muted)] truncate max-w-[120px] sm:max-w-none">
              {userEmail}
            </span>
          )}
          {userEmail && (
            <form action="/auth/signout" method="post">
              <button
                type="submit"
                className="type-micro text-[var(--text-muted)] hover:text-[var(--text-primary)] whitespace-nowrap active:scale-[0.97] transition-all duration-150 ease-out"
              >
                Sign out
              </button>
            </form>
          )}
        </div>
      </div>
    </header>
  )
}
