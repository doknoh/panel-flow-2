'use client'

import { useState } from 'react'
import NotebookItem from './NotebookItem'
import { CanvasItemData, FilingTarget } from './NotebookClient'
import { Search } from 'lucide-react'

interface NotebookListViewProps {
  items: CanvasItemData[]
  onUpdate: (id: string, updates: Partial<CanvasItemData>) => void
  onArchive: (id: string) => void
  onGraduate: (item: CanvasItemData) => void
  onOpenFiling: (itemId: string) => void
  onUnfileItem: (id: string) => void
  filingTargets: FilingTarget[]
  onLoadFilingTargets: () => void
  onDragStart: (id: string) => void
  onDragOver: (e: React.DragEvent, targetId: string) => void
  onDragEnd: () => void
  draggedId: string | null
}

export default function NotebookListView({
  items,
  onUpdate,
  onArchive,
  onGraduate,
  onOpenFiling,
  onUnfileItem,
  filingTargets,
  onLoadFilingTargets,
  onDragStart,
  onDragOver,
  onDragEnd,
  draggedId,
}: NotebookListViewProps) {
  const [search, setSearch] = useState('')

  const filteredItems = search
    ? items.filter(item =>
        item.title.toLowerCase().includes(search.toLowerCase()) ||
        (item.content || '').toLowerCase().includes(search.toLowerCase())
      )
    : items

  return (
    <div>
      {/* Search */}
      <div className="mb-4 relative">
        <Search
          size={14}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
        />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search notes..."
          className="w-full max-w-md bg-[var(--bg-secondary)] border border-[var(--border)] rounded px-3 py-2 pl-9 text-sm focus:border-[var(--color-primary)] focus:outline-none placeholder:text-[var(--text-muted)]"
        />
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 stagger-children">
        {filteredItems.map(item => (
          <NotebookItem
            key={item.id}
            item={item}
            variant="card"
            onUpdate={onUpdate}
            onArchive={onArchive}
            onGraduate={onGraduate}
            onOpenFiling={onOpenFiling}
            onUnfileItem={onUnfileItem}
            filingTargets={filingTargets}
            onDragStart={onDragStart}
            onDragOver={onDragOver}
            onDragEnd={onDragEnd}
            isDragging={draggedId === item.id}
          />
        ))}
      </div>

      {/* Empty search state */}
      {filteredItems.length === 0 && search && (
        <p className="text-center text-[var(--text-muted)] type-meta py-8">
          No notes matching &ldquo;{search}&rdquo;
        </p>
      )}
    </div>
  )
}
