'use client'

import { useState, useRef, useEffect, useCallback } from 'react'

interface Character {
  id: string
  name: string
}

interface CharacterAutocompleteProps {
  characters: Character[]
  selectedId: string | null
  onChange: (characterId: string | null) => void
  placeholder?: string
  className?: string
}

export default function CharacterAutocomplete({
  characters,
  selectedId,
  onChange,
  placeholder = 'Select character...',
  className = '',
}: CharacterAutocompleteProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [highlightedIndex, setHighlightedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Get the selected character name
  const selectedCharacter = characters.find(c => c.id === selectedId)

  // Filter characters by query (case-insensitive prefix match)
  const filteredCharacters = characters.filter(c =>
    c.name.toLowerCase().startsWith(query.toLowerCase())
  ).slice(0, 10) // Max 10 results

  // Add "None" option at the top
  const options = [
    { id: null, name: '— None —' },
    ...filteredCharacters.map(c => ({ id: c.id as string | null, name: c.name })),
  ]

  // Handle click outside to close
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
        setQuery('')
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Reset highlight when options change
  useEffect(() => {
    setHighlightedIndex(0)
  }, [query])

  // Scroll highlighted item into view
  useEffect(() => {
    if (isOpen && listRef.current) {
      const highlightedEl = listRef.current.children[highlightedIndex] as HTMLElement
      if (highlightedEl) {
        highlightedEl.scrollIntoView({ block: 'nearest' })
      }
    }
  }, [highlightedIndex, isOpen])

  const handleSelect = useCallback((characterId: string | null) => {
    onChange(characterId)
    setIsOpen(false)
    setQuery('')
  }, [onChange])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!isOpen) {
      if (e.key === 'Enter' || e.key === 'ArrowDown') {
        e.preventDefault()
        setIsOpen(true)
      }
      return
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setHighlightedIndex(prev =>
          prev < options.length - 1 ? prev + 1 : prev
        )
        break
      case 'ArrowUp':
        e.preventDefault()
        setHighlightedIndex(prev => prev > 0 ? prev - 1 : 0)
        break
      case 'Enter':
        e.preventDefault()
        if (options[highlightedIndex]) {
          handleSelect(options[highlightedIndex].id)
        }
        break
      case 'Escape':
        e.preventDefault()
        e.stopPropagation() // Prevent ScriptView from exiting
        setIsOpen(false)
        setQuery('')
        break
      case 'Tab':
        setIsOpen(false)
        setQuery('')
        break
    }
  }, [isOpen, options, highlightedIndex, handleSelect])

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {/* Trigger / Display */}
      <button
        type="button"
        onClick={() => {
          setIsOpen(!isOpen)
          if (!isOpen) {
            setTimeout(() => inputRef.current?.focus(), 0)
          }
        }}
        className="text-[var(--color-primary)] font-bold uppercase tracking-wider text-sm hover:text-[var(--accent-hover)] transition-colors cursor-pointer"
      >
        {selectedCharacter?.name || placeholder}
        <span className="ml-1 text-[var(--text-muted)]">▾</span>
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute z-50 mt-1 left-1/2 -translate-x-1/2 w-56 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg shadow-lg overflow-hidden">
          {/* Search input */}
          <div className="p-2 border-b border-[var(--border)]">
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type to filter..."
              className="w-full bg-[var(--bg-tertiary)] text-white text-sm px-3 py-1.5 rounded border border-[var(--border-strong)] focus:outline-none focus:border-[var(--color-primary)]"
              autoFocus
            />
          </div>

          {/* Options list */}
          <ul
            ref={listRef}
            className="max-h-48 overflow-y-auto"
            role="listbox"
          >
            {options.length === 0 ? (
              <li className="px-3 py-2 text-[var(--text-muted)] text-sm">
                No characters match
              </li>
            ) : (
              options.map((option, index) => (
                <li
                  key={option.id || 'none'}
                  role="option"
                  aria-selected={option.id === selectedId}
                  onClick={() => handleSelect(option.id)}
                  onMouseEnter={() => setHighlightedIndex(index)}
                  className={`px-3 py-2 text-sm cursor-pointer transition-colors ${
                    index === highlightedIndex
                      ? 'bg-[var(--color-primary)] text-white'
                      : option.id === selectedId
                      ? 'bg-[var(--bg-tertiary)] text-[var(--color-primary)]'
                      : 'text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]'
                  } ${option.id === null ? 'text-[var(--text-muted)] italic' : ''}`}
                >
                  {option.name}
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  )
}
