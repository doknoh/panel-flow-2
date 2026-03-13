'use client'

import { useState } from 'react'
import { Tip } from '@/components/ui/Tip'
import AnalyticsDashboard from './AnalyticsDashboard'
import PowerRankings from './PowerRankings'

interface AnalyticsClientProps {
  series: any
  sessions: any[]
}

export default function AnalyticsClient({ series, sessions }: AnalyticsClientProps) {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'rankings'>('dashboard')

  return (
    <div>
      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-[var(--border)]">
        <Tip content="View writing statistics and progress">
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`hover-glow px-4 py-2 text-sm font-medium border-b-2 ${
              activeTab === 'dashboard'
                ? 'border-[var(--color-primary)] text-[var(--text-primary)]'
                : 'border-transparent text-[var(--text-secondary)]'
            }`}
          >
            Dashboard
          </button>
        </Tip>
        <Tip content="See character appearance rankings">
          <button
            onClick={() => setActiveTab('rankings')}
            className={`hover-glow px-4 py-2 text-sm font-medium border-b-2 ${
              activeTab === 'rankings'
                ? 'border-[var(--color-primary)] text-[var(--text-primary)]'
                : 'border-transparent text-[var(--text-secondary)]'
            }`}
          >
            Power Rankings
          </button>
        </Tip>
      </div>

      {/* Content */}
      {activeTab === 'dashboard' && (
        <AnalyticsDashboard series={series} sessions={sessions} />
      )}
      {activeTab === 'rankings' && (
        <PowerRankings series={series} />
      )}
    </div>
  )
}
