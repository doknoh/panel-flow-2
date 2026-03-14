'use client'

import React, { useState, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react'
import { createRoot, Root } from 'react-dom/client'

export interface MentionCharacter {
  id: string
  name: string
  display_name?: string | null
  role?: string | null
}

interface MentionListProps {
  items: MentionCharacter[]
  command: (item: MentionCharacter) => void
  query: string
}

export interface MentionListRef {
  onKeyDown: (event: KeyboardEvent) => boolean
}

/**
 * The dropdown list rendered inside the suggestion popup.
 */
const MentionList = forwardRef<MentionListRef, MentionListProps>(
  ({ items, command }, ref) => {
    const [selectedIndex, setSelectedIndex] = useState(0)

    // Reset selection when items change
    useEffect(() => setSelectedIndex(0), [items])

    const selectItem = useCallback(
      (index: number) => {
        const item = items[index]
        if (item) command(item)
      },
      [items, command]
    )

    useImperativeHandle(ref, () => ({
      onKeyDown: (event: KeyboardEvent) => {
        if (event.key === 'ArrowUp') {
          setSelectedIndex((prev) => (prev + items.length - 1) % items.length)
          return true
        }
        if (event.key === 'ArrowDown') {
          setSelectedIndex((prev) => (prev + 1) % items.length)
          return true
        }
        if (event.key === 'Enter' || event.key === 'Tab') {
          selectItem(selectedIndex)
          return true
        }
        return false
      },
    }))

    if (items.length === 0) return null

    return (
      <div className="mention-dropdown">
        {items.map((item, index) => {
          const displayName = (item.display_name || item.name).toUpperCase()
          return (
            <button
              key={item.id}
              className={`mention-dropdown-item ${index === selectedIndex ? 'is-selected' : ''}`}
              onClick={() => selectItem(index)}
              onMouseEnter={() => setSelectedIndex(index)}
              type="button"
            >
              <span className="mention-dropdown-name">{displayName}</span>
              {item.role && (
                <span className="mention-dropdown-role">{item.role}</span>
              )}
            </button>
          )
        })}
      </div>
    )
  }
)
MentionList.displayName = 'MentionList'

/**
 * Creates the suggestion plugin render config for TipTap.
 * Returns the render() result with lifecycle hooks that mount/unmount
 * a React-based dropdown popup at the cursor position.
 */
export function createMentionSuggestionRenderer() {
  let root: Root | null = null
  let container: HTMLElement | null = null
  let listRef: MentionListRef | null = null

  return {
    onStart: (props: { items: MentionCharacter[]; command: (item: MentionCharacter) => void; clientRect: (() => DOMRect | null) | null; query: string }) => {
      container = document.createElement('div')
      container.className = 'mention-dropdown-container'
      document.body.appendChild(container)

      // Position at cursor
      if (props.clientRect) {
        const rect = props.clientRect()
        if (rect) {
          container.style.position = 'fixed'
          container.style.left = `${rect.left}px`
          container.style.top = `${rect.bottom + 4}px`
          container.style.zIndex = '9999'
        }
      }

      root = createRoot(container)
      root.render(
        <MentionList
          ref={(ref) => { listRef = ref }}
          items={props.items}
          command={props.command}
          query={props.query}
        />
      )
    },

    onUpdate: (props: { items: MentionCharacter[]; command: (item: MentionCharacter) => void; clientRect: (() => DOMRect | null) | null; query: string }) => {
      if (!root || !container) return

      // Reposition
      if (props.clientRect) {
        const rect = props.clientRect()
        if (rect) {
          container.style.left = `${rect.left}px`
          container.style.top = `${rect.bottom + 4}px`
        }
      }

      root.render(
        <MentionList
          ref={(ref) => { listRef = ref }}
          items={props.items}
          command={props.command}
          query={props.query}
        />
      )
    },

    onKeyDown: (props: { event: KeyboardEvent }) => {
      if (props.event.key === 'Escape') {
        return true // Let suggestion plugin handle dismiss
      }
      return listRef?.onKeyDown(props.event) ?? false
    },

    onExit: () => {
      if (root) {
        root.unmount()
        root = null
      }
      if (container) {
        container.remove()
        container = null
      }
      listRef = null
    },
  }
}
