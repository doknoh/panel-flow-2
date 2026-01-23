'use client'

import { useState } from 'react'
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
      <div className="flex gap-1 mb-6 border-b border-zinc-800">
        <button
          onClick={() => setActiveTab('dashboard')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'dashboard'
              ? 'border-blue-500 text-white'
              : 'border-transparent text-zinc-400 hover:text-white'
          }`}
        >
          Dashboard
        </button>
        <button
          onClick={() => setActiveTab('rankings')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'rankings'
              ? 'border-blue-500 text-white'
              : 'border-transparent text-zinc-400 hover:text-white'
          }`}
        >
          Power Rankings
        </button>
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
