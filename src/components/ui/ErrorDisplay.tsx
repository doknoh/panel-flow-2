'use client'

import { useEffect } from 'react'

interface ErrorDisplayProps {
  error: Error & { digest?: string }
  reset: () => void
  title?: string
  description?: string
  retryLabel?: string
  dashboardHref?: string
  dashboardLabel?: string
  showDetails?: boolean
  helpText?: string
}

export default function ErrorDisplay({
  error,
  reset,
  title = 'Something went wrong',
  description,
  retryLabel = 'Try again',
  dashboardHref = '/dashboard',
  dashboardLabel = 'Go to Dashboard',
  showDetails = false,
  helpText,
}: ErrorDisplayProps) {
  useEffect(() => {
    console.error('Application error:', error)
  }, [error])

  const defaultDescription = description || error.message || 'An unexpected error occurred. Please try again.'

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)] flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg p-8 text-center">
        <div className="text-[var(--color-error)] text-4xl mb-4" aria-hidden="true">!</div>
        <h1 className="text-xl font-bold mb-2">{title}</h1>
        <p className="text-[var(--text-secondary)] mb-4">
          {defaultDescription}
        </p>

        {showDetails && error.message && (
          <div className="bg-[var(--bg-tertiary)] rounded p-4 mb-6 text-left">
            <p className="text-sm text-[var(--text-secondary)] mb-1">Error details:</p>
            <p className="text-sm text-[var(--color-error)] font-mono">
              {error.message}
            </p>
          </div>
        )}

        <div className="flex flex-col gap-3">
          <button
            onClick={reset}
            className="w-full bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white font-medium py-2 px-4 rounded transition-colors"
          >
            {retryLabel}
          </button>
          <a
            href={dashboardHref}
            className="w-full bg-[var(--bg-tertiary)] hover:bg-[var(--border)] text-[var(--text-primary)] font-medium py-2 px-4 rounded transition-colors inline-block"
          >
            {dashboardLabel}
          </a>
        </div>

        {error.digest && (
          <p className="text-[var(--text-muted)] text-xs mt-4">
            Error ID: {error.digest}
          </p>
        )}

        {helpText && (
          <p className="text-[var(--text-muted)] text-xs mt-4">
            {helpText}
          </p>
        )}
      </div>
    </div>
  )
}
