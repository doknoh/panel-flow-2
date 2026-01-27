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
  storageKey?: string // For persisting sizes to localStorage
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

  const [isDraggingLeft, setIsDraggingLeft] = useState(false)
  const [isDraggingRight, setIsDraggingRight] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // Save sizes to localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(storageKey, JSON.stringify({ left: leftWidth, right: rightWidth }))
    }
  }, [leftWidth, rightWidth, storageKey])

  // Handle left divider drag
  const handleLeftMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setIsDraggingLeft(true)
  }, [])

  // Handle right divider drag
  const handleRightMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setIsDraggingRight(true)
  }, [])

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
    setLeftWidth(defaultLeftWidth)
  }, [defaultLeftWidth])

  const handleRightDoubleClick = useCallback(() => {
    setRightWidth(defaultRightWidth)
  }, [defaultRightWidth])

  return (
    <div ref={containerRef} className="flex-1 flex overflow-hidden">
      {/* Left Panel */}
      <div
        className="shrink-0 overflow-y-auto hidden md:block"
        style={{ width: leftWidth }}
      >
        {leftPanel}
      </div>

      {/* Left Divider */}
      <div
        className="w-1 bg-zinc-800 hover:bg-blue-500/50 cursor-col-resize shrink-0 relative group hidden md:block transition-colors"
        onMouseDown={handleLeftMouseDown}
        onDoubleClick={handleLeftDoubleClick}
        title="Drag to resize • Double-click to reset"
      >
        <div className={`absolute inset-y-0 -left-1 -right-1 ${isDraggingLeft ? 'bg-blue-500/30' : ''}`} />
        {/* Visible grab indicator on hover */}
        <div className="absolute inset-y-0 left-0 right-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
          <div className="w-0.5 h-8 bg-blue-400 rounded-full" />
        </div>
      </div>

      {/* Center Panel */}
      <div className="flex-1 overflow-y-auto min-w-0">
        {centerPanel}
      </div>

      {/* Right Divider */}
      <div
        className="w-1 bg-zinc-800 hover:bg-blue-500/50 cursor-col-resize shrink-0 relative group hidden md:block transition-colors"
        onMouseDown={handleRightMouseDown}
        onDoubleClick={handleRightDoubleClick}
        title="Drag to resize • Double-click to reset"
      >
        <div className={`absolute inset-y-0 -left-1 -right-1 ${isDraggingRight ? 'bg-blue-500/30' : ''}`} />
        {/* Visible grab indicator on hover */}
        <div className="absolute inset-y-0 left-0 right-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
          <div className="w-0.5 h-8 bg-blue-400 rounded-full" />
        </div>
      </div>

      {/* Right Panel */}
      <div
        className="shrink-0 overflow-y-auto hidden md:block"
        style={{ width: rightWidth }}
      >
        {rightPanel}
      </div>
    </div>
  )
}
