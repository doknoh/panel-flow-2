'use client'

import { useEffect } from 'react'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Log error to console in development, could send to error tracking service in production
    console.error('Application error:', error)
  }, [error])

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)] flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg p-8 text-center">
        <div className="text-red-400 text-4xl mb-4">!</div>
        <h1 className="text-xl font-bold mb-2">Something went wrong</h1>
        <p className="text-[var(--text-secondary)] mb-6">
          {error.message || 'An unexpected error occurred. Please try again.'}
        </p>
        <div className="flex flex-col gap-3">
          <button
            onClick={reset}
            className="w-full bg-blue-600 hover:bg-blue-700 text-[var(--text-primary)] font-medium py-2 px-4 rounded transition-colors"
          >
            Try again
          </button>
          <a
            href="/dashboard"
            className="w-full bg-[var(--bg-tertiary)] hover:bg-[var(--bg-tertiary)] text-[var(--text-primary)] font-medium py-2 px-4 rounded transition-colors inline-block"
          >
            Go to Dashboard
          </a>
        </div>
        {error.digest && (
          <p className="text-[var(--text-muted)] text-xs mt-4">
            Error ID: {error.digest}
          </p>
        )}
      </div>
    </div>
  )
}
