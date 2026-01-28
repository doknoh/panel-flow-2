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
    <header className="border-b border-[var(--border)] bg-[var(--bg-primary)] px-4 sm:px-6 py-4">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-4">
          {showBackLink && (
            <>
              <Link
                href={backHref}
                className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
              >
                {backLabel}
              </Link>
              <span className="text-[var(--text-muted)]">/</span>
            </>
          )}
          <h1 className="text-lg sm:text-xl font-bold text-[var(--text-primary)]">{title}</h1>
        </div>
        <div className="flex items-center gap-2 sm:gap-4">
          {children}
          <ThemeToggle />
          {userEmail && (
            <span className="text-[var(--text-secondary)] text-xs sm:text-sm truncate max-w-[120px] sm:max-w-none">
              {userEmail}
            </span>
          )}
          {userEmail && (
            <form action="/auth/signout" method="post">
              <button
                type="submit"
                className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-sm whitespace-nowrap transition-colors"
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
