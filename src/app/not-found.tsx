import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)] flex items-center justify-center p-4">
      <div className="max-w-md w-full text-center">
        <p className="type-display text-[var(--text-muted)] mb-2">404</p>
        <h1 className="text-xl font-bold mb-2">Page not found</h1>
        <p className="text-[var(--text-secondary)] mb-6">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <Link
          href="/dashboard"
          className="inline-block px-6 py-2.5 text-sm font-medium bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white rounded transition-colors"
        >
          Back to Dashboard
        </Link>
      </div>
    </div>
  )
}
