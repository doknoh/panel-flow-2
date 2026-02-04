'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import OutlineView from './OutlineView'
import SeriesTimeline from './SeriesTimeline'

interface OutlinePageClientProps {
  series: any
}

export default function OutlinePageClient({ series }: OutlinePageClientProps) {
  const [viewMode, setViewMode] = useState<'list' | 'timeline'>('timeline')
  const router = useRouter()

  const handleRefresh = () => {
    router.refresh()
  }

  return (
    <div>
      {/* View Toggle */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex gap-1 bg-[var(--bg-tertiary)] rounded-lg p-1">
          <button
            onClick={() => setViewMode('timeline')}
            className={`px-4 py-2 rounded text-sm font-medium transition-colors ${
              viewMode === 'timeline'
                ? 'bg-indigo-600 text-white'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            Timeline View
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={`px-4 py-2 rounded text-sm font-medium transition-colors ${
              viewMode === 'list'
                ? 'bg-indigo-600 text-white'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            List View
          </button>
        </div>

        <div className="text-sm text-[var(--text-muted)]">
          {series.issues?.length || 0} issues • {series.plotlines?.length || 0} plotlines
        </div>
      </div>

      {/* Views */}
      {viewMode === 'timeline' ? (
        <SeriesTimeline series={series} onRefresh={handleRefresh} />
      ) : (
        <OutlineView series={series} />
      )}
    </div>
  )
}
