'use client'

import { useEffect } from 'react'
import Link from 'next/link'

export default function IssueEditorError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('Issue editor error:', error)
  }, [error])

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center p-4">
      <div className="max-w-lg w-full bg-zinc-900 border border-zinc-800 rounded-lg p-8">
        <div className="text-amber-400 text-4xl mb-4 text-center">!</div>
        <h1 className="text-xl font-bold mb-2 text-center">Editor Error</h1>
        <p className="text-zinc-400 mb-4 text-center">
          There was a problem loading the issue editor. Your work has been auto-saved.
        </p>

        <div className="bg-zinc-800 rounded p-4 mb-6">
          <p className="text-sm text-zinc-500 mb-1">Error details:</p>
          <p className="text-sm text-red-400 font-mono">
            {error.message || 'Unknown error'}
          </p>
        </div>

        <div className="flex flex-col gap-3">
          <button
            onClick={reset}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded transition-colors"
          >
            Reload Editor
          </button>
          <Link
            href="/dashboard"
            className="w-full bg-zinc-800 hover:bg-zinc-700 text-white font-medium py-2 px-4 rounded transition-colors text-center"
          >
            Return to Dashboard
          </Link>
        </div>

        <p className="text-zinc-600 text-xs mt-6 text-center">
          If this problem persists, try refreshing the page or clearing your browser cache.
        </p>
      </div>
    </div>
  )
}
