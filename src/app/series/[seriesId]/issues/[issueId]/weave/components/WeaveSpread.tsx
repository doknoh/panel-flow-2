'use client'

import { SpreadGroup } from '@/lib/weave-spreads'

interface SceneInfo {
  id: string
  plotline_id: string | null
  plotline: { color: string } | null
}

interface WeaveSpreadProps {
  spread: SpreadGroup
  children: React.ReactNode // The two WeavePageCard children
  leftScene?: SceneInfo | null
  rightScene?: SceneInfo | null
}

function InsideCover() {
  return (
    <div className="w-[86px] h-[118px] bg-[var(--bg-secondary)] rounded-l flex items-center justify-center border border-[var(--border-subtle)]">
      <span className="font-mono text-[7px] text-[var(--text-muted)] text-center leading-tight">
        INSIDE
        <br />
        COVER
      </span>
    </div>
  )
}

export function WeaveSpread({
  spread,
  children,
  leftScene,
  rightScene,
}: WeaveSpreadProps) {
  const { left, right, isFirst, isSplash } = spread

  const hasSceneBreak =
    leftScene != null &&
    rightScene != null &&
    leftScene.id !== rightScene.id

  const leftColor = leftScene?.plotline?.color ?? null
  const rightColor = rightScene?.plotline?.color ?? null

  // Spine style
  const spineWidth = hasSceneBreak ? 4 : 3

  const spineStyle: React.CSSProperties = hasSceneBreak
    ? {
        width: spineWidth,
        background:
          leftColor && rightColor
            ? `linear-gradient(to bottom, ${leftColor}, ${rightColor})`
            : leftColor
            ? leftColor
            : rightColor
            ? rightColor
            : undefined,
        flexShrink: 0,
        alignSelf: 'stretch',
      }
    : {
        width: spineWidth,
        background:
          'linear-gradient(to bottom, var(--border), var(--bg-primary), var(--border))',
        flexShrink: 0,
        alignSelf: 'stretch',
      }

  // Page number color
  const leftPageNumStyle: React.CSSProperties =
    hasSceneBreak && leftColor ? { color: leftColor } : {}
  const rightPageNumStyle: React.CSSProperties =
    hasSceneBreak && rightColor ? { color: rightColor } : {}

  // Determine page numbers
  const leftPageNum = left?.globalPageNumber ?? null
  const rightPageNum = right?.globalPageNumber ?? null

  return (
    <div className="flex flex-col items-center">
      {/* Horizontal card pair */}
      <div className="flex flex-row gap-0 items-stretch">
        {/* Left card slot */}
        {isFirst && left === null ? (
          <InsideCover />
        ) : isSplash ? (
          // Splash: render single child spanning both slots; right slot is empty
          <div className="flex flex-row items-stretch">
            {children}
          </div>
        ) : (
          // Normal: left card area with rounded-l
          <div className="rounded-l overflow-hidden">
            {/* The first child (left card) */}
            {Array.isArray(children) ? (children as React.ReactNode[])[0] : null}
          </div>
        )}

        {/* Spine */}
        {!isSplash && (
          <div style={spineStyle} />
        )}

        {/* Right card slot */}
        {!isSplash && (
          <div className="rounded-r overflow-hidden">
            {right != null ? (
              Array.isArray(children) ? (children as React.ReactNode[])[1] : children
            ) : (
              // Empty right placeholder
              <div className="w-[86px] h-[118px] bg-[var(--bg-secondary)] opacity-30" />
            )}
          </div>
        )}
      </div>

      {/* Page numbers below */}
      {!isSplash && (
        <div className="flex flex-row gap-0 mt-1">
          {/* Left page number */}
          <div
            className="font-mono text-[9px] font-bold text-[var(--text-secondary)] flex items-center justify-center"
            style={{ width: 86, ...leftPageNumStyle }}
          >
            {leftPageNum != null ? leftPageNum : ''}
          </div>

          {/* Spine spacer */}
          <div style={{ width: spineWidth }} />

          {/* Right page number */}
          <div
            className="font-mono text-[9px] font-bold text-[var(--text-secondary)] flex items-center justify-center"
            style={{ width: 86, ...rightPageNumStyle }}
          >
            {rightPageNum != null ? rightPageNum : ''}
          </div>
        </div>
      )}

      {/* Splash page number */}
      {isSplash && left != null && (
        <div className="mt-1 font-mono text-[9px] font-bold text-[var(--text-secondary)] text-center">
          {left.globalPageNumber}
        </div>
      )}

      {/* Scene break label */}
      {hasSceneBreak && (
        <div className="mt-0.5 font-mono text-[7px] text-[var(--text-muted)] text-center tracking-wider">
          SCENE BREAK
        </div>
      )}
    </div>
  )
}
