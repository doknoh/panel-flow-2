'use client'

import React, { useState, useEffect } from 'react'
import Link from 'next/link'

interface FlatPage {
  page: {
    id: string
    page_number: number
    story_beat: string | null
    intention: string | null
    plotline_id: string | null
    plotline: { id: string; name: string; color: string } | null
    panels?: Array<{
      dialogue_blocks?: Array<{ speaker_name: string | null }>
    }>
  }
  scene: {
    title: string | null
    plotline: { name: string; color: string } | null
  }
  globalPageNumber: number
  orientation: 'left' | 'right'
}

interface WeaveDrawerProps {
  page: FlatPage | null
  panelCount: number
  wordCount: number
  dialogueRatio: number
  plotlines: Array<{ id: string; name: string; color: string }>
  onClose: () => void
  onSaveStoryBeat: (pageId: string, value: string) => void
  onAssignPlotline: (pageId: string, plotlineId: string | null) => void
  seriesId: string
  issueId: string
}

export function WeaveDrawer({
  page,
  panelCount,
  wordCount,
  dialogueRatio,
  plotlines,
  onClose,
  onSaveStoryBeat,
  onAssignPlotline,
  seriesId,
  issueId,
}: WeaveDrawerProps) {
  const [storyBeat, setStoryBeat] = useState(page?.page.story_beat || '')

  useEffect(() => {
    setStoryBeat(page?.page.story_beat || '')
  }, [page?.page.id, page?.page.story_beat])

  if (!page) return null

  // Extract unique speaker names from panels
  const speakerNames: string[] = []
  if (page.page.panels) {
    for (const panel of page.page.panels) {
      if (panel.dialogue_blocks) {
        for (const db of panel.dialogue_blocks) {
          if (db.speaker_name) {
            const upper = db.speaker_name.toUpperCase()
            if (!speakerNames.includes(upper)) {
              speakerNames.push(upper)
            }
          }
        }
      }
    }
  }

  const scenePlotlineColor = page.scene.plotline?.color ?? 'var(--text-secondary)'

  const selectedPlotlineId = page.page.plotline_id ?? ''
  const selectedPlotline = plotlines.find((p) => p.id === selectedPlotlineId)

  return (
    <aside
      role="complementary"
      aria-label="Page detail"
      className="flex flex-col overflow-y-auto"
      style={{
        width: 260,
        background: 'var(--bg-secondary)',
        borderLeft: '2px solid var(--color-primary)',
        height: '100%',
        padding: 16,
      }}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex flex-col gap-1">
          <span
            style={{
              fontFamily: "'Helvetica Neue', Helvetica, sans-serif",
              fontSize: '1.375rem',
              fontWeight: 900,
              color: 'var(--text-primary)',
              lineHeight: 1,
            }}
          >
            PAGE {page.globalPageNumber}
          </span>
          <span
            className="font-mono text-[var(--text-muted)]"
            style={{ fontSize: '0.5625rem', letterSpacing: '0.08em' }}
          >
            {page.orientation === 'right' ? 'RIGHT' : 'LEFT'}
          </span>
        </div>
        <button
          onClick={onClose}
          className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors flex-shrink-0"
          aria-label="Close drawer"
          style={{ fontSize: '1rem', lineHeight: 1, padding: 2 }}
        >
          ✕
        </button>
      </div>

      {/* Plotline selector */}
      <div className="mb-4">
        <label
          style={{
            fontFamily: "'Helvetica Neue', Helvetica, sans-serif",
            fontSize: '0.4375rem',
            fontWeight: 700,
            color: 'var(--text-muted)',
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            display: 'block',
            marginBottom: 4,
          }}
        >
          PLOTLINE
        </label>
        <div className="flex items-center gap-2">
          {selectedPlotline && (
            <div
              style={{
                width: 10,
                height: 10,
                borderRadius: '50%',
                backgroundColor: selectedPlotline.color,
                flexShrink: 0,
              }}
            />
          )}
          <select
            value={selectedPlotlineId}
            onChange={(e) => {
              const val = e.target.value
              onAssignPlotline(page.page.id, val === '' ? null : val)
            }}
            className="font-mono text-[var(--text-primary)] bg-[var(--bg-primary)] border border-[var(--border)] flex-1"
            style={{ fontSize: '0.625rem', padding: '3px 6px', borderRadius: 3 }}
          >
            <option value="">None</option>
            {plotlines.map((pl) => (
              <option key={pl.id} value={pl.id}>
                {pl.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Stats row */}
      <div
        className="grid grid-cols-3 pb-3 mb-4"
        style={{ borderBottom: '1px solid var(--border-subtle)' }}
      >
        {[
          { label: 'PANELS', value: panelCount },
          { label: 'WORDS', value: wordCount },
          { label: 'DIALOGUE', value: `${Math.round(dialogueRatio)}%` },
        ].map(({ label, value }) => (
          <div key={label} className="flex flex-col items-center">
            <span
              style={{
                fontFamily: "'Helvetica Neue', Helvetica, sans-serif",
                fontSize: '0.4375rem',
                fontWeight: 700,
                color: 'var(--text-muted)',
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                marginBottom: 2,
              }}
            >
              {label}
            </span>
            <span
              className="font-mono text-[var(--text-primary)]"
              style={{ fontSize: '0.875rem', fontWeight: 700 }}
            >
              {value}
            </span>
          </div>
        ))}
      </div>

      {/* Story Beat */}
      <div className="mb-4">
        <label
          style={{
            fontFamily: "'Helvetica Neue', Helvetica, sans-serif",
            fontSize: '0.4375rem',
            fontWeight: 700,
            color: 'var(--text-muted)',
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            display: 'block',
            marginBottom: 4,
          }}
        >
          STORY BEAT
        </label>
        <textarea
          value={storyBeat}
          onChange={(e) => setStoryBeat(e.target.value)}
          onBlur={() => onSaveStoryBeat(page.page.id, storyBeat)}
          className="font-mono text-[var(--text-primary)] bg-[var(--bg-primary)] border border-[var(--border)] w-full resize-none"
          style={{ fontSize: '0.6875rem', padding: '6px 8px', borderRadius: 3, minHeight: 64 }}
          placeholder="What happens on this page..."
        />
      </div>

      {/* Characters */}
      <div className="mb-4">
        <label
          style={{
            fontFamily: "'Helvetica Neue', Helvetica, sans-serif",
            fontSize: '0.4375rem',
            fontWeight: 700,
            color: 'var(--text-muted)',
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            display: 'block',
            marginBottom: 4,
          }}
        >
          CHARACTERS
        </label>
        {speakerNames.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {speakerNames.map((name) => (
              <span
                key={name}
                className="font-mono text-[var(--text-secondary)] bg-[var(--bg-tertiary)]"
                style={{ fontSize: '0.5625rem', padding: '2px 6px', borderRadius: 3 }}
              >
                {name}
              </span>
            ))}
          </div>
        ) : (
          <span className="font-mono text-[var(--text-muted)]" style={{ fontSize: '0.625rem' }}>
            —
          </span>
        )}
      </div>

      {/* Intention */}
      <div className="mb-4">
        <label
          style={{
            fontFamily: "'Helvetica Neue', Helvetica, sans-serif",
            fontSize: '0.4375rem',
            fontWeight: 700,
            color: 'var(--text-muted)',
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            display: 'block',
            marginBottom: 4,
          }}
        >
          INTENTION
        </label>
        <span
          className="font-mono text-[var(--color-primary)]"
          style={{ fontSize: '0.625rem' }}
        >
          {page.page.intention || '—'}
        </span>
      </div>

      {/* Scene */}
      <div className="mb-4">
        <label
          style={{
            fontFamily: "'Helvetica Neue', Helvetica, sans-serif",
            fontSize: '0.4375rem',
            fontWeight: 700,
            color: 'var(--text-muted)',
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            display: 'block',
            marginBottom: 4,
          }}
        >
          SCENE
        </label>
        <span
          className="font-mono"
          style={{ fontSize: '0.625rem', color: scenePlotlineColor }}
        >
          {page.scene.title || '—'}
        </span>
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Action button */}
      <Link
        href={`/series/${seriesId}/issues/${issueId}?page=${page.page.id}`}
        className="block w-full text-center text-white font-mono"
        style={{
          backgroundColor: 'var(--color-primary)',
          padding: '10px 0',
          fontSize: '0.6875rem',
          fontWeight: 700,
          letterSpacing: '0.08em',
          borderRadius: 3,
          textDecoration: 'none',
        }}
      >
        OPEN IN EDITOR →
      </Link>
    </aside>
  )
}
