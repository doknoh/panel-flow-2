'use client'

import { useEffect } from 'react'
import { Tip } from '@/components/ui/Tip'
import { CanvasItemData, FilingTarget, ITEM_TYPE_CONFIG, ITEM_TYPE_ICONS } from './NotebookClient'
import { Archive } from 'lucide-react'

interface FiledNotesTabProps {
  items: CanvasItemData[]
  filingTargets: FilingTarget[]
  onUnfileItem: (id: string) => void
  onLoadFilingTargets: () => void
}

export default function FiledNotesTab({
  items,
  filingTargets,
  onUnfileItem,
  onLoadFilingTargets,
}: FiledNotesTabProps) {
  useEffect(() => {
    onLoadFilingTargets()
  }, [onLoadFilingTargets])

  if (items.length === 0) {
    return (
      <div className="text-center py-12">
        <Archive size={32} className="mx-auto mb-3 text-[var(--text-muted)]" />
        <p className="type-label text-[var(--text-muted)]">NO FILED NOTES</p>
        <p className="type-micro text-[var(--text-muted)] mt-1">
          Send notes to specific pages using the &ldquo;File To...&rdquo; option
        </p>
      </div>
    )
  }

  // Group items by issue number
  const grouped = new Map<number, {
    issueTitle: string | null
    items: Array<CanvasItemData & { target?: FilingTarget }>
  }>()

  for (const item of items) {
    const target = filingTargets.find(t => t.pageId === item.filed_to_page_id)
    const issueNumber = target?.issueNumber ?? 0

    if (!grouped.has(issueNumber)) {
      grouped.set(issueNumber, { issueTitle: target?.issueTitle ?? null, items: [] })
    }
    grouped.get(issueNumber)!.items.push({ ...item, target })
  }

  const sortedGroups = Array.from(grouped.entries()).sort(([a], [b]) => a - b)

  return (
    <div className="space-y-6">
      {sortedGroups.map(([issueNumber, group]) => (
        <div key={issueNumber}>
          <h3 className="type-label text-[var(--text-secondary)] mb-3">
            {issueNumber > 0 ? `ISSUE #${issueNumber}` : 'UNKNOWN ISSUE'}
            {group.issueTitle && (
              <span className="text-[var(--text-muted)] font-normal ml-2">
                {group.issueTitle}
              </span>
            )}
          </h3>

          <div className="space-y-2">
            {group.items.map(item => {
              const config = ITEM_TYPE_CONFIG[item.item_type]
              const icon = ITEM_TYPE_ICONS[item.item_type]

              return (
                <div
                  key={item.id}
                  className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg p-3 flex items-start gap-3 hover:border-[var(--border-strong)] hover-glow"
                >
                  {/* Left border indicator */}
                  <div
                    className="w-1 self-stretch rounded-full shrink-0"
                    style={{ backgroundColor: config.borderColor }}
                  />

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[var(--text-muted)]">{icon}</span>
                      <span className="font-medium text-[var(--text-primary)] truncate">
                        {item.title}
                      </span>
                      <span
                        className="type-micro px-1.5 py-0.5 border shrink-0"
                        style={{ borderColor: config.borderColor, color: config.borderColor }}
                      >
                        {config.label}
                      </span>
                    </div>

                    {item.content && (
                      <p className="text-sm text-[var(--text-secondary)] line-clamp-2 mb-1">
                        {item.content}
                      </p>
                    )}

                    <div className="flex items-center gap-3">
                      {item.target && (
                        <span className="type-micro text-[var(--text-muted)]">
                          Page {item.target.pageNumber}
                          {item.target.sceneName && (
                            <span className="type-separator mx-1">{'//'}  </span>
                          )}
                          {item.target.sceneName}
                        </span>
                      )}
                      {item.filed_at && (
                        <span className="type-micro text-[var(--text-muted)]">
                          Filed {formatTimeAgo(new Date(item.filed_at))}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Unfile button */}
                  <Tip content="Remove from page">
                    <button
                      onClick={() => onUnfileItem(item.id)}
                      className="type-micro px-2 py-0.5 border border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--text-primary)] hover-fade shrink-0 transition-colors active:scale-[0.97]"
                    >
                      UNFILE
                    </button>
                  </Tip>
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

function formatTimeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}
