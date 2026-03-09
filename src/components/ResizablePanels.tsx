'use client'

import { useState, useRef, useCallback, useEffect, ReactNode } from 'react'

interface ResizablePanelsProps {
  leftPanel: ReactNode
  centerPanel: ReactNode
  rightPanel: ReactNode
  leftMinWidth?: number
  leftMaxWidth?: number
  rightMinWidth?: number
  rightMaxWidth?: number
  defaultLeftWidth?: number
  defaultRightWidth?: number
  storageKey?: string
  isLeftCollapsed?: boolean
  isRightCollapsed?: boolean
  onLeftCollapseChange?: (collapsed: boolean) => void
  onRightCollapseChange?: (collapsed: boolean) => void
}

export default function ResizablePanels({
  leftPanel,
  centerPanel,
  rightPanel,
  leftMinWidth = 180,
  leftMaxWidth = 400,
  rightMinWidth = 200,
  rightMaxWidth = 500,
  defaultLeftWidth = 256,
  defaultRightWidth = 320,
  storageKey = 'panel-sizes',
  isLeftCollapsed: controlledLeftCollapsed,
  isRightCollapsed: controlledRightCollapsed,
  onLeftCollapseChange,
  onRightCollapseChange,
}: ResizablePanelsProps) {
  // Load saved sizes from localStorage
  const [leftWidth, setLeftWidth] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(storageKey)
      if (saved) {
        try {
          const { left } = JSON.parse(saved)
          return Math.max(leftMinWidth, Math.min(leftMaxWidth, left || defaultLeftWidth))
        } catch {}
      }
    }
    return defaultLeftWidth
  })

  const [rightWidth, setRightWidth] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(storageKey)
      if (saved) {
        try {
          const { right } = JSON.parse(saved)
          return Math.max(rightMinWidth, Math.min(rightMaxWidth, right || defaultRightWidth))
        } catch {}
      }
    }
    return defaultRightWidth
  })

  // Collapse state — can be controlled or uncontrolled
  const [internalLeftCollapsed, setInternalLeftCollapsed] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(storageKey)
      if (saved) {
        try {
          const parsed = JSON.parse(saved)
          return parsed.leftCollapsed ?? false
        } catch {}
      }
    }
    return false
  })

  const [internalRightCollapsed, setInternalRightCollapsed] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(storageKey)
      if (saved) {
        try {
          const parsed = JSON.parse(saved)
          return parsed.rightCollapsed ?? false
        } catch {}
      }
    }
    return false
  })

  const isLeftCollapsed = controlledLeftCollapsed ?? internalLeftCollapsed
  const isRightCollapsed = controlledRightCollapsed ?? internalRightCollapsed

  // Track widths before collapse so we can restore them
  const savedLeftWidthRef = useRef(leftWidth)
  const savedRightWidthRef = useRef(rightWidth)

  // Keep refs in sync when user resizes (only when not collapsed)
  useEffect(() => {
    if (!isLeftCollapsed) savedLeftWidthRef.current = leftWidth
  }, [leftWidth, isLeftCollapsed])

  useEffect(() => {
    if (!isRightCollapsed) savedRightWidthRef.current = rightWidth
  }, [rightWidth, isRightCollapsed])

  // Animation state: tracks whether we're mid-transition
  const [isLeftAnimating, setIsLeftAnimating] = useState(false)
  const [isRightAnimating, setIsRightAnimating] = useState(false)

  const [isDraggingLeft, setIsDraggingLeft] = useState(false)
  const [isDraggingRight, setIsDraggingRight] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // Save sizes + collapse state to localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(storageKey, JSON.stringify({
        left: isLeftCollapsed ? savedLeftWidthRef.current : leftWidth,
        right: isRightCollapsed ? savedRightWidthRef.current : rightWidth,
        leftCollapsed: isLeftCollapsed,
        rightCollapsed: isRightCollapsed,
      }))
    }
  }, [leftWidth, rightWidth, isLeftCollapsed, isRightCollapsed, storageKey])

  // Toggle collapse handlers
  const toggleLeftCollapse = useCallback(() => {
    const newCollapsed = !isLeftCollapsed
    if (!newCollapsed) {
      // Expanding: restore saved width
      setLeftWidth(savedLeftWidthRef.current)
    }
    setIsLeftAnimating(true)
    if (onLeftCollapseChange) {
      onLeftCollapseChange(newCollapsed)
    } else {
      setInternalLeftCollapsed(newCollapsed)
    }
    // Clear animating state after transition
    setTimeout(() => setIsLeftAnimating(false), 350)
  }, [isLeftCollapsed, onLeftCollapseChange])

  const toggleRightCollapse = useCallback(() => {
    const newCollapsed = !isRightCollapsed
    if (!newCollapsed) {
      // Expanding: restore saved width
      setRightWidth(savedRightWidthRef.current)
    }
    setIsRightAnimating(true)
    if (onRightCollapseChange) {
      onRightCollapseChange(newCollapsed)
    } else {
      setInternalRightCollapsed(newCollapsed)
    }
    setTimeout(() => setIsRightAnimating(false), 350)
  }, [isRightCollapsed, onRightCollapseChange])

  // Handle left divider drag (only when not collapsed)
  const handleLeftMouseDown = useCallback((e: React.MouseEvent) => {
    if (isLeftCollapsed) return
    e.preventDefault()
    setIsDraggingLeft(true)
  }, [isLeftCollapsed])

  // Handle right divider drag (only when not collapsed)
  const handleRightMouseDown = useCallback((e: React.MouseEvent) => {
    if (isRightCollapsed) return
    e.preventDefault()
    setIsDraggingRight(true)
  }, [isRightCollapsed])

  // Global mouse move handler
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return

      const rect = containerRef.current.getBoundingClientRect()

      if (isDraggingLeft) {
        const newWidth = e.clientX - rect.left
        setLeftWidth(Math.max(leftMinWidth, Math.min(leftMaxWidth, newWidth)))
      }

      if (isDraggingRight) {
        const newWidth = rect.right - e.clientX
        setRightWidth(Math.max(rightMinWidth, Math.min(rightMaxWidth, newWidth)))
      }
    }

    const handleMouseUp = () => {
      setIsDraggingLeft(false)
      setIsDraggingRight(false)
    }

    if (isDraggingLeft || isDraggingRight) {
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
  }, [isDraggingLeft, isDraggingRight, leftMinWidth, leftMaxWidth, rightMinWidth, rightMaxWidth])

  // Double-click to reset to default
  const handleLeftDoubleClick = useCallback(() => {
    if (isLeftCollapsed) return
    setLeftWidth(defaultLeftWidth)
  }, [defaultLeftWidth, isLeftCollapsed])

  const handleRightDoubleClick = useCallback(() => {
    if (isRightCollapsed) return
    setRightWidth(defaultRightWidth)
  }, [defaultRightWidth, isRightCollapsed])

  // Computed widths for animation
  const effectiveLeftWidth = isLeftCollapsed ? 0 : leftWidth
  const effectiveRightWidth = isRightCollapsed ? 0 : rightWidth
  const leftTransitioning = isLeftAnimating || isLeftCollapsed !== (effectiveLeftWidth === 0)
  const rightTransitioning = isRightAnimating || isRightCollapsed !== (effectiveRightWidth === 0)

  return (
    <div ref={containerRef} className="flex-1 flex overflow-hidden">
      {/* Left Panel */}
      <div
        className="shrink-0 overflow-hidden hidden md:block"
        style={{
          width: effectiveLeftWidth,
          transition: isLeftAnimating ? 'width 300ms cubic-bezier(0.16, 1, 0.3, 1)' : isDraggingLeft ? 'none' : undefined,
        }}
      >
        <div
          className="h-full overflow-y-auto"
          style={{
            width: isLeftCollapsed ? savedLeftWidthRef.current : leftWidth,
            opacity: isLeftCollapsed ? 0 : 1,
            transition: isLeftAnimating
              ? isLeftCollapsed
                ? 'opacity 100ms ease-out'
                : 'opacity 150ms ease-out 150ms'
              : undefined,
          }}
        >
          {leftPanel}
        </div>
      </div>

      {/* Left Divider */}
      <div
        className={`shrink-0 relative group hidden md:flex items-center
          ${isLeftCollapsed
            ? 'w-3 cursor-pointer hover:bg-[var(--color-primary)]/10'
            : 'w-1 cursor-col-resize hover:bg-[var(--color-primary)]/50'
          }
          bg-[var(--border)] transition-all duration-200`}
        onMouseDown={isLeftCollapsed ? undefined : handleLeftMouseDown}
        onDoubleClick={isLeftCollapsed ? undefined : handleLeftDoubleClick}
        onClick={isLeftCollapsed ? toggleLeftCollapse : undefined}
        title={isLeftCollapsed ? 'Expand panel (⌘[)' : 'Drag to resize • Double-click to reset'}
      >
        {/* Drag highlight */}
        {!isLeftCollapsed && (
          <div className={`absolute inset-y-0 -left-1 -right-1 ${isDraggingLeft ? 'bg-[var(--color-primary)]/30' : ''}`} />
        )}

        {/* Collapse/expand chevron */}
        <button
          onClick={(e) => { e.stopPropagation(); toggleLeftCollapse() }}
          className={`absolute z-10 flex items-center justify-center
            w-5 h-8 rounded-r-md
            bg-[var(--bg-secondary)] border border-l-0 border-[var(--border)]
            text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]
            transition-all duration-150
            ${isLeftCollapsed
              ? 'opacity-100 -right-5'
              : 'opacity-0 group-hover:opacity-100 -right-5'
            }`}
          title={isLeftCollapsed ? 'Expand (⌘[)' : 'Collapse (⌘[)'}
        >
          <span className="text-[10px] font-mono leading-none">
            {isLeftCollapsed ? '»' : '«'}
          </span>
        </button>

        {/* Grab indicator (only when expanded) */}
        {!isLeftCollapsed && (
          <div className="absolute inset-y-0 left-0 right-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
            <div className="w-0.5 h-8 bg-[var(--color-primary)] rounded-full" />
          </div>
        )}
      </div>

      {/* Center Panel */}
      <div className="flex-1 overflow-y-auto min-w-0">
        {centerPanel}
      </div>

      {/* Right Divider */}
      <div
        className={`shrink-0 relative group hidden md:flex items-center
          ${isRightCollapsed
            ? 'w-3 cursor-pointer hover:bg-[var(--color-primary)]/10'
            : 'w-1 cursor-col-resize hover:bg-[var(--color-primary)]/50'
          }
          bg-[var(--border)] transition-all duration-200`}
        onMouseDown={isRightCollapsed ? undefined : handleRightMouseDown}
        onDoubleClick={isRightCollapsed ? undefined : handleRightDoubleClick}
        onClick={isRightCollapsed ? toggleRightCollapse : undefined}
        title={isRightCollapsed ? 'Expand panel (⌘])' : 'Drag to resize • Double-click to reset'}
      >
        {/* Drag highlight */}
        {!isRightCollapsed && (
          <div className={`absolute inset-y-0 -left-1 -right-1 ${isDraggingRight ? 'bg-[var(--color-primary)]/30' : ''}`} />
        )}

        {/* Collapse/expand chevron */}
        <button
          onClick={(e) => { e.stopPropagation(); toggleRightCollapse() }}
          className={`absolute z-10 flex items-center justify-center
            w-5 h-8 rounded-l-md
            bg-[var(--bg-secondary)] border border-r-0 border-[var(--border)]
            text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]
            transition-all duration-150
            ${isRightCollapsed
              ? 'opacity-100 -left-5'
              : 'opacity-0 group-hover:opacity-100 -left-5'
            }`}
          title={isRightCollapsed ? 'Expand (⌘])' : 'Collapse (⌘])'}
        >
          <span className="text-[10px] font-mono leading-none">
            {isRightCollapsed ? '«' : '»'}
          </span>
        </button>

        {/* Grab indicator (only when expanded) */}
        {!isRightCollapsed && (
          <div className="absolute inset-y-0 left-0 right-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
            <div className="w-0.5 h-8 bg-[var(--color-primary)] rounded-full" />
          </div>
        )}
      </div>

      {/* Right Panel */}
      <div
        className="shrink-0 overflow-hidden hidden md:block"
        style={{
          width: effectiveRightWidth,
          transition: isRightAnimating ? 'width 300ms cubic-bezier(0.16, 1, 0.3, 1)' : isDraggingRight ? 'none' : undefined,
        }}
      >
        <div
          className="h-full overflow-y-auto"
          style={{
            width: isRightCollapsed ? savedRightWidthRef.current : rightWidth,
            opacity: isRightCollapsed ? 0 : 1,
            transition: isRightAnimating
              ? isRightCollapsed
                ? 'opacity 100ms ease-out'
                : 'opacity 150ms ease-out 150ms'
              : undefined,
          }}
        >
          {rightPanel}
        </div>
      </div>
    </div>
  )
}
