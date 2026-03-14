'use client'

import { useMemo } from 'react'
import PageEditor from './PageEditor'
import { computeMirrorAlignment } from '@/lib/mirror-diff'

// Compatible interfaces mirroring PageEditor.tsx lines 35-119 (not exported there)

interface Character {
  id: string
  name: string
  display_name?: string | null
  role?: string | null
}

interface Location {
  id: string
  name: string
}

interface DialogueBlock {
  id: string
  character_id: string | null
  dialogue_type: string
  text: string
  sort_order: number
  delivery_instruction: string | null
}

interface Caption {
  id: string
  caption_type: string
  text: string
  sort_order: number
}

interface SoundEffect {
  id: string
  text: string
  sort_order: number
}

interface Panel {
  id: string
  panel_number: number
  visual_description: string | null
  camera: string | null
  notes_to_artist: string | null
  internal_notes: string | null
  dialogue_blocks: DialogueBlock[]
  captions: Caption[]
  sound_effects: SoundEffect[]
  // characters_present is a DB field not yet in the TS interface
  characters_present?: string[]
}

type PageType = 'SINGLE' | 'SPLASH' | 'SPREAD_LEFT' | 'SPREAD_RIGHT'
type PageIntention = 'setup' | 'reveal' | 'transition' | 'climax' | 'breathing_room' | 'silent_beat'

interface PageForLinking {
  id: string
  page_number: number
  page_type: PageType
  linked_page_id: string | null
  mirror_page_id?: string | null
}

interface Page {
  id: string
  page_number: number
  page_type?: PageType
  intention?: PageIntention | null
  linked_page_id?: string | null
  mirror_page_id?: string | null
  panels: Panel[]
}

interface PageContext {
  page: Page
  act: { id: string; name: string; number?: number; sort_order: number }
  scene: { id: string; name: string; sort_order: number; plotline_name?: string | null; total_pages?: number }
  pagePositionInScene?: number
}

interface FiledNote {
  id: string
  title: string
  content: string | null
  item_type: string
  filed_to_page_id: string
  filed_at: string
}

interface DualPageEditorProps {
  leftPage: Page
  rightPage: Page
  leftPageContext: PageContext | null
  rightPageContext: PageContext | null
  characters: Character[]
  locations: Location[]
  seriesId: string
  scenePages: PageForLinking[]
  onUpdate: () => void
  setSaveStatus: (status: 'saved' | 'saving' | 'unsaved') => void
  filedNotes: FiledNote[]
  onNavigateToPage: (direction: 'prev' | 'next') => void
  mode: 'spread' | 'mirror' | 'compare'
  isVertical: boolean
  onClose?: () => void // close split view (for compare mode)
}

export default function DualPageEditor({
  leftPage,
  rightPage,
  leftPageContext,
  rightPageContext,
  characters,
  locations,
  seriesId,
  scenePages,
  onUpdate,
  setSaveStatus,
  filedNotes,
  onNavigateToPage,
  mode,
  isVertical,
  onClose,
}: DualPageEditorProps) {
  // Mirror alignment indicators
  const mirrorAlignment = useMemo(() => {
    if (mode !== 'mirror') return null
    const leftPanels = (leftPage.panels || []).map((p: Panel) => ({
      panel_number: p.panel_number,
      characters_present: p.characters_present || [],
      dialogue_blocks: p.dialogue_blocks || [],
    }))
    const rightPanels = (rightPage.panels || []).map((p: Panel) => ({
      panel_number: p.panel_number,
      characters_present: p.characters_present || [],
      dialogue_blocks: p.dialogue_blocks || [],
    }))
    return computeMirrorAlignment(leftPanels, rightPanels)
  }, [mode, leftPage.panels, rightPage.panels])

  return (
    <div className={`dual-page-editor ${isVertical ? 'dual-page-editor--vertical' : ''}`}>
      {/* Mode indicator bar */}
      <div className="dual-page-editor__header">
        <span className="type-micro text-[var(--text-muted)]">
          {mode === 'spread' ? 'SPREAD VIEW' : mode === 'mirror' ? 'MIRROR VIEW' : 'COMPARE VIEW'}
        </span>
        {onClose && (
          <button onClick={onClose} className="type-micro hover-fade text-[var(--text-muted)]">
            [CLOSE SPLIT]
          </button>
        )}
      </div>

      <div className={`dual-page-editor__panes ${isVertical ? 'flex-col' : ''}`}>
        {/* Left pane */}
        <div className="dual-page-editor__pane">
          <PageEditor
            page={leftPage}
            pageContext={leftPageContext}
            characters={characters}
            locations={locations}
            seriesId={seriesId}
            scenePages={scenePages}
            onUpdate={onUpdate}
            setSaveStatus={setSaveStatus}
            filedNotes={filedNotes.filter((n) => n.filed_to_page_id === leftPage.id)}
            onNavigateToPage={onNavigateToPage}
          />
        </div>

        {/* Mirror alignment gutter (mirror mode only) */}
        {mode === 'mirror' && mirrorAlignment && (
          <div className="dual-page-editor__gutter">
            {mirrorAlignment.map((status, i) => (
              <div
                key={i}
                className={`dual-page-editor__gutter-dot ${
                  status.status === 'green'
                    ? 'bg-[var(--color-success)]'
                    : 'bg-[var(--color-warning)]'
                }`}
                title={status.status === 'green' ? 'Panels aligned' : 'Panels diverge'}
              />
            ))}
          </div>
        )}

        {/* Right pane */}
        <div className="dual-page-editor__pane">
          <PageEditor
            page={rightPage}
            pageContext={rightPageContext}
            characters={characters}
            locations={locations}
            seriesId={seriesId}
            scenePages={scenePages}
            onUpdate={onUpdate}
            setSaveStatus={setSaveStatus}
            filedNotes={filedNotes.filter((n) => n.filed_to_page_id === rightPage.id)}
            onNavigateToPage={onNavigateToPage}
          />
        </div>
      </div>
    </div>
  )
}
