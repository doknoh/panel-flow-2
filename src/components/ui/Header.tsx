'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'
import ThemeToggle from './ThemeToggle'
import FontScaleToggle from './FontScaleToggle'
import { Tip } from '@/components/ui/Tip'

interface HeaderProps {
  // Existing
  userEmail?: string
  showBackLink?: boolean
  backHref?: string
  backLabel?: string
  title?: string
  children?: ReactNode

  // New
  variant?: 'main' | 'subpage'
  maxWidth?: string
  subtitle?: string
  subtitleNode?: ReactNode
  secondaryRow?: ReactNode
}

export default function Header({
  userEmail,
  showBackLink = false,
  backHref = '/dashboard',
  backLabel = 'Dashboard',
  title = 'Panel Flow',
  children,
  variant = 'main',
  maxWidth,
  subtitle,
  subtitleNode,
  secondaryRow,
}: HeaderProps) {
  const isSubpage = variant === 'subpage'
  const resolvedMaxWidth = maxWidth || (isSubpage ? 'max-w-5xl' : 'max-w-7xl')
  const showBack = isSubpage || showBackLink
  const titleSizeClass = isSubpage
    ? 'text-lg'
    : 'text-xl sm:text-2xl'

  return (
    <header className="border-b border-[var(--text-primary)] bg-[var(--bg-primary)] px-4 sm:px-6 py-3">
      <div className={`${resolvedMaxWidth} mx-auto`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {showBack && (
              <>
                <Link
                  href={backHref}
                  className="type-meta text-[var(--text-secondary)] hover-glow"
                >
                  &larr; {backLabel}
                </Link>
                <span className="type-separator">{'//'}</span>
              </>
            )}
            <div>
              <h1 className={`font-black tracking-[-0.04em] text-[var(--text-primary)] ${titleSizeClass} uppercase leading-none`}>
                {title}
              </h1>
              {subtitle && (
                <p className="type-micro text-[var(--text-muted)] mt-0.5">{subtitle}</p>
              )}
              {subtitleNode && !subtitle && (
                <div className="mt-0.5">{subtitleNode}</div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-4">
            {children}
            <FontScaleToggle />
            <ThemeToggle />
            {userEmail && (
              <span className="type-micro text-[var(--text-muted)] truncate max-w-[120px] sm:max-w-none">
                {userEmail}
              </span>
            )}
            {userEmail && (
              <form action="/auth/signout" method="post" className="flex items-center">
                <Tip content="Sign out">
                  <button
                    type="submit"
                    className="type-micro text-[var(--text-muted)] whitespace-nowrap active:scale-[0.97] transition-all duration-150 ease-out hover-fade"
                  >
                    Sign out
                  </button>
                </Tip>
              </form>
            )}
          </div>
        </div>
        {secondaryRow && (
          <div className="mt-3">
            {secondaryRow}
          </div>
        )}
      </div>
    </header>
  )
}
