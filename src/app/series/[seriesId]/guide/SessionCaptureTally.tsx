'use client'

interface CaptureTallyProps {
  captures: {
    story_beats: number
    scene_descriptions: number
    panel_drafts: number
    characters: number
    locations: number
    plotlines: number
    canvas_items: number
    project_notes: number
  }
}

const TALLY_LABELS: Record<string, string> = {
  story_beats: 'story beats placed',
  scene_descriptions: 'scene descriptions updated',
  panel_drafts: 'panel drafts',
  characters: 'characters created',
  locations: 'locations created',
  plotlines: 'plotlines created',
  canvas_items: 'canvas items saved',
  project_notes: 'project notes saved',
}

export default function SessionCaptureTally({ captures }: CaptureTallyProps) {
  const entries = Object.entries(captures).filter(([, count]) => count > 0)
  if (entries.length === 0) return null

  const total = entries.reduce((sum, [, count]) => sum + count, 0)

  return (
    <div className="border-t border-[var(--border)] bg-[var(--bg-secondary)] px-4 py-2">
      <div className="type-micro text-[var(--text-muted)] mb-1">
        SESSION CAPTURES ({total})
      </div>
      <div className="space-y-0.5">
        {entries.map(([key, count]) => (
          <div key={key} className="text-xs text-[var(--text-secondary)]">
            {count} {TALLY_LABELS[key] || key}
          </div>
        ))}
      </div>
    </div>
  )
}
