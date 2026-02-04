'use client'

import { useEffect } from 'react'

interface KeyboardShortcutsModalProps {
  isOpen: boolean
  onClose: () => void
}

const shortcuts = [
  { category: 'Navigation', items: [
    { keys: ['⌘', '↑'], description: 'Previous page' },
    { keys: ['⌘', '↓'], description: 'Next page' },
    { keys: ['⌘', '⇧', '↑'], description: 'Previous scene' },
    { keys: ['⌘', '⇧', '↓'], description: 'Next scene' },
    { keys: ['⌘', 'J'], description: 'Jump to page...' },
  ]},
  { category: 'General', items: [
    { keys: ['⌘', 'S'], description: 'Save (confirms auto-save status)' },
    { keys: ['⌘', 'Z'], description: 'Undo' },
    { keys: ['⌘', '⇧', 'Z'], description: 'Redo' },
    { keys: ['⌘', 'F'], description: 'Find & Replace' },
    { keys: ['?'], description: 'Show keyboard shortcuts' },
  ]},
  { category: 'Editor', items: [
    { keys: ['⌘', '↵'], description: 'Add new panel' },
    { keys: ['⌘', 'D'], description: 'Add dialogue to last panel' },
    { keys: ['⌘', '⇧', 'D'], description: 'Add sound effect to last panel' },
    { keys: ['⌘', 'P'], description: 'Add new page' },
  ]},
  { category: 'Find & Replace', items: [
    { keys: ['↵'], description: 'Find next' },
    { keys: ['⇧', '↵'], description: 'Find previous' },
    { keys: ['Esc'], description: 'Close' },
  ]},
]

export default function KeyboardShortcutsModal({ isOpen, onClose }: KeyboardShortcutsModalProps) {
  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg w-full max-w-lg mx-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-[var(--border)]">
          <h2 className="text-lg font-semibold">Keyboard Shortcuts</h2>
          <button
            onClick={onClose}
            className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] p-1"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        <div className="p-4 max-h-[70vh] overflow-y-auto">
          {shortcuts.map((section) => (
            <div key={section.category} className="mb-6 last:mb-0">
              <h3 className="text-xs uppercase tracking-wider text-[var(--text-secondary)] mb-3">{section.category}</h3>
              <div className="space-y-2">
                {section.items.map((shortcut, index) => (
                  <div key={index} className="flex items-center justify-between">
                    <span className="text-[var(--text-secondary)] text-sm">{shortcut.description}</span>
                    <div className="flex items-center gap-1">
                      {shortcut.keys.map((key, keyIndex) => (
                        <kbd
                          key={keyIndex}
                          className="px-2 py-1 text-xs font-mono bg-[var(--bg-tertiary)] border border-[var(--border)] rounded shadow-sm min-w-[24px] text-center"
                        >
                          {key}
                        </kbd>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="p-4 border-t border-[var(--border)] text-center">
          <p className="text-xs text-[var(--text-secondary)]">
            Press <kbd className="px-1.5 py-0.5 text-xs font-mono bg-[var(--bg-tertiary)] border border-[var(--border)] rounded">?</kbd> anytime to show this help
          </p>
        </div>
      </div>
    </div>
  )
}
