'use client'

import { useState, useRef, useEffect } from 'react'

interface Option {
  value: string
  label: string
  sublabel?: string
}

interface SearchableSelectProps {
  options: Option[]
  value: string | null
  onChange: (value: string | null) => void
  placeholder?: string
  className?: string
}

export default function SearchableSelect({
  options, value, onChange, placeholder = 'Search...', className = '',
}: SearchableSelectProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const filtered = query
    ? options.filter(o =>
        o.label.toLowerCase().includes(query.toLowerCase()) ||
        (o.sublabel && o.sublabel.toLowerCase().includes(query.toLowerCase()))
      )
    : options

  const selectedLabel = value ? options.find(o => o.value === value)?.label : null

  useEffect(() => {
    if (!isOpen) return
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
        setQuery('')
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [isOpen])

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <button
        onClick={() => { setIsOpen(!isOpen); setTimeout(() => inputRef.current?.focus(), 0) }}
        className="w-full text-left px-3 py-2 text-sm border border-[var(--border)] rounded bg-[var(--bg-primary)] hover:border-[var(--border-strong)]"
      >
        {selectedLabel || <span className="text-[var(--text-muted)]">{placeholder}</span>}
      </button>
      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-[var(--bg-primary)] border border-[var(--border-strong)] shadow-lg z-50 rounded max-h-60 overflow-hidden">
          <div className="p-2 border-b border-[var(--border)]">
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Type to filter..."
              className="w-full px-2 py-1 text-sm bg-[var(--bg-secondary)] border border-[var(--border)] rounded"
            />
          </div>
          <div className="overflow-y-auto max-h-48">
            {filtered.map(opt => (
              <button
                key={opt.value}
                onClick={() => { onChange(opt.value); setIsOpen(false); setQuery('') }}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-[var(--bg-secondary)] ${
                  opt.value === value ? 'bg-[var(--bg-tertiary)] font-medium' : ''
                }`}
              >
                {opt.label}
                {opt.sublabel && <span className="text-xs text-[var(--text-muted)] ml-2">{opt.sublabel}</span>}
              </button>
            ))}
            {filtered.length === 0 && (
              <div className="px-3 py-2 text-sm text-[var(--text-muted)]">No matches</div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
