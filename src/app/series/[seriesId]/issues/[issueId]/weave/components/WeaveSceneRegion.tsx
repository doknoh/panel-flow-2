'use client'

import React from 'react'
import { hexToRgba } from '@/lib/utils'

interface WeaveSceneRegionProps {
  scene: {
    id: string
    title: string | null
    name: string | null
  }
  plotlineColor: string
  pageCount: number
  onSelectAll: (sceneId: string) => void
  children: React.ReactNode
}

export function WeaveSceneRegion({
  scene,
  plotlineColor,
  pageCount,
  onSelectAll,
  children,
}: WeaveSceneRegionProps) {
  if (pageCount === 0) return null

  const sceneName = scene.title ?? scene.name ?? 'Untitled Scene'
  const bgColor = hexToRgba(plotlineColor, 0.04)

  return (
    <div
      className="rounded-md p-3 mb-1"
      style={{ backgroundColor: bgColor }}
    >
      {/* Scene label row */}
      <div
        className="flex items-center justify-between mb-2 cursor-pointer hover:opacity-80 transition-opacity"
        onClick={() => onSelectAll(scene.id)}
        role="button"
        tabIndex={0}
        aria-label={`Select all pages in ${sceneName}`}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onSelectAll(scene.id)
          }
        }}
      >
        {/* Left: color dot + scene name */}
        <div className="flex items-center gap-1.5">
          <span
            className="inline-block rounded-full flex-shrink-0"
            style={{
              width: 8,
              height: 8,
              backgroundColor: plotlineColor,
            }}
          />
          <span
            className="uppercase tracking-wide"
            style={{
              fontFamily: 'Helvetica, Arial, sans-serif',
              fontSize: 9,
              fontWeight: 700,
              color: plotlineColor,
            }}
          >
            {sceneName}
          </span>
        </div>

        {/* Right: page count hint */}
        <span
          className="font-mono text-[var(--text-muted)]"
          style={{ fontSize: 8 }}
        >
          {pageCount} {pageCount === 1 ? 'page' : 'pages'} · click to select all
        </span>
      </div>

      {/* Spreads container */}
      <div className="flex flex-wrap gap-8">
        {children}
      </div>
    </div>
  )
}
