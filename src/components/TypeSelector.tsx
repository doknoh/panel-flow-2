'use client'

import { useState, useRef, useEffect, useCallback } from 'react'

type DialogueType = 'dialogue' | 'thought' | 'whisper' | 'shout' | 'off_panel' | 'electronic' | 'radio'
type CaptionType = 'narrative' | 'location' | 'time' | 'editorial'

interface TypeSelectorProps {
  type: 'dialogue' | 'caption'
  value: string | null
  onChange: (newType: string) => void
  className?: string
}

const DIALOGUE_TYPES: { value: DialogueType; label: string; description: string }[] = [
  { value: 'dialogue', label: 'Normal', description: 'Regular speech' },
  { value: 'thought', label: 'Thought', description: 'Internal thoughts (italicized)' },
  { value: 'whisper', label: 'Whisper', description: 'Quiet speech' },
  { value: 'shout', label: 'Shout', description: 'Loud/emphasized speech' },
  { value: 'off_panel', label: 'Off Panel', description: 'Character not visible' },
  { value: 'electronic', label: 'Electronic', description: 'Phone, computer, etc.' },
  { value: 'radio', label: 'V.O.', description: 'Voice-over narration' },
]

const CAPTION_TYPES: { value: CaptionType; label: string; description: string }[] = [
  { value: 'narrative', label: 'Narrative', description: 'Story narration' },
  { value: 'location', label: 'Location', description: 'Place identifier' },
  { value: 'time', label: 'Time', description: 'Time identifier' },
  { value: 'editorial', label: 'Editorial', description: 'Author note' },
]

export default function TypeSelector({
  type,
  value,
  onChange,
  className = '',
}: TypeSelectorProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  const options = type === 'dialogue' ? DIALOGUE_TYPES : CAPTION_TYPES
  const currentOption = options.find(o => o.value === value) || options[0]

  // Handle click outside to close
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Reset highlight when opening
  useEffect(() => {
    if (isOpen) {
      const currentIndex = options.findIndex(o => o.value === value)
      setHighlightedIndex(currentIndex >= 0 ? currentIndex : 0)
    }
  }, [isOpen, value, options])

  // Scroll highlighted item into view
  useEffect(() => {
    if (isOpen && listRef.current) {
      const highlightedEl = listRef.current.children[highlightedIndex] as HTMLElement
      if (highlightedEl) {
        highlightedEl.scrollIntoView({ block: 'nearest' })
      }
    }
  }, [highlightedIndex, isOpen])

  const handleSelect = useCallback((newValue: string) => {
    onChange(newValue)
    setIsOpen(false)
  }, [onChange])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!isOpen) {
      if (e.key === 'Enter' || e.key === 'ArrowDown' || e.key === ' ') {
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
      case ' ':
        e.preventDefault()
        if (options[highlightedIndex]) {
          handleSelect(options[highlightedIndex].value)
        }
        break
      case 'Escape':
        e.preventDefault()
        e.stopPropagation() // Prevent ScriptView from exiting
        setIsOpen(false)
        break
      case 'Tab':
        setIsOpen(false)
        break
    }
  }, [isOpen, options, highlightedIndex, handleSelect])

  // Get display label for current type
  const getTypeLabel = () => {
    if (type === 'dialogue') {
      switch (value) {
        case 'radio': return 'V.O.'
        case 'thought': return 'THOUGHT'
        case 'whisper': return 'WHISPER'
        case 'shout': return 'SHOUT'
        case 'off_panel': return 'OFF'
        case 'electronic': return 'ELEC'
        default: return null // Normal dialogue doesn't show indicator
      }
    } else {
      switch (value) {
        case 'location': return 'LOCATION'
        case 'time': return 'TIME'
        case 'editorial': return 'EDITORIAL'
        default: return null // Narrative is default
      }
    }
  }

  const typeLabel = getTypeLabel()
  const baseColor = type === 'dialogue' ? 'text-blue-500' : 'text-amber-500'
  const hoverColor = type === 'dialogue' ? 'hover:text-blue-400' : 'hover:text-amber-400'

  return (
    <div ref={containerRef} className={`relative inline-block ${className}`}>
      {/* Trigger button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        onKeyDown={handleKeyDown}
        className={`${baseColor} ${hoverColor} text-xs uppercase tracking-wider transition-colors cursor-pointer px-1 py-0.5 rounded hover:bg-gray-800`}
        title={`Change ${type} type`}
      >
        {typeLabel ? `(${typeLabel})` : `[${type === 'dialogue' ? 'type' : 'type'}]`}
        <span className="ml-0.5 text-gray-600">▾</span>
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute z-50 mt-1 left-0 w-48 bg-gray-900 border border-gray-700 rounded-lg shadow-lg overflow-hidden">
          <ul
            ref={listRef}
            className="max-h-64 overflow-y-auto py-1"
            role="listbox"
          >
            {options.map((option, index) => (
              <li
                key={option.value}
                role="option"
                aria-selected={option.value === value}
                onClick={() => handleSelect(option.value)}
                onMouseEnter={() => setHighlightedIndex(index)}
                className={`px-3 py-2 cursor-pointer transition-colors ${
                  index === highlightedIndex
                    ? type === 'dialogue' ? 'bg-blue-600 text-white' : 'bg-amber-600 text-white'
                    : option.value === value
                    ? 'bg-gray-800 ' + baseColor
                    : 'text-gray-300 hover:bg-gray-800'
                }`}
              >
                <div className="text-sm font-medium">{option.label}</div>
                <div className={`text-xs ${
                  index === highlightedIndex ? 'text-white/70' : 'text-gray-500'
                }`}>
                  {option.description}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
