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
    console.error('Global error:', error)
  }, [error])

  return (
    <html>
      <body style={{ fontFamily: 'system-ui, sans-serif', padding: '2rem', backgroundColor: '#0a0a0a', color: '#e5e5e5' }}>
        <div style={{ maxWidth: '32rem', margin: '4rem auto', textAlign: 'center' }}>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 600, marginBottom: '1rem' }}>
            Something went wrong
          </h1>
          <p style={{ color: '#a3a3a3', marginBottom: '1.5rem' }}>
            An unexpected error occurred. Your work has been auto-saved.
          </p>
          {error.digest && (
            <p style={{ color: '#737373', fontSize: '0.75rem', marginBottom: '1rem' }}>
              Error ID: {error.digest}
            </p>
          )}
          <button
            onClick={reset}
            style={{
              backgroundColor: '#2563eb',
              color: 'white',
              border: 'none',
              padding: '0.5rem 1.5rem',
              borderRadius: '0.375rem',
              cursor: 'pointer',
              fontSize: '0.875rem',
              fontWeight: 500,
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  )
}
