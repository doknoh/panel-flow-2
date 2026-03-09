'use client'

import { useMemo, useEffect, useRef } from 'react'

interface BlueprintEditorProps {
  issue: any
  characters: any[]
  selectedPageId: string | null
}

function getCharacterDisplayName(characterId: string | null, characters: any[], dialogueBlock: any): string {
  if (dialogueBlock.speaker_name) return dialogueBlock.speaker_name.toUpperCase()
  if (!characterId) return 'UNKNOWN'
  const char = characters.find((c: any) => c.id === characterId)
  return char ? (char.display_name || char.name || 'UNKNOWN').toUpperCase() : 'UNKNOWN'
}

function getDeliveryTag(block: any): string {
  const parts: string[] = []
  if (block.delivery_type === 'VO') parts.push('V.O.')
  else if (block.delivery_type === 'OS') parts.push('O.S.')
  if (block.delivery_instruction) parts.push(block.delivery_instruction.toUpperCase())
  if (parts.length === 0) return ''
  return ` (${parts.join(', ')})`
}

function getPanelSizeLabel(panel: any): string {
  if (panel.panel_size === 'FULL_PAGE') return '//Splash'
  if (panel.panel_size === 'HALF') return '//Half'
  if (panel.panel_size === 'THIRD') return '//Third'
  if (panel.panel_size === 'INSET') return '//Inset'
  if (panel.camera) return `// ${panel.camera}`
  return ''
}

export default function BlueprintEditor({ issue, characters, selectedPageId }: BlueprintEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null)

  // Flatten all pages in order
  const allPages = useMemo(() => {
    const pages: any[] = []
    for (const act of issue.acts || []) {
      for (const scene of (act.scenes || []).sort((a: any, b: any) => (a.sort_order || 0) - (b.sort_order || 0))) {
        for (const page of (scene.pages || []).sort((a: any, b: any) => (a.sort_order || a.order || 0) - (b.sort_order || b.order || 0))) {
          pages.push({
            ...page,
            scene,
            act,
            panels: (page.panels || []).sort((a: any, b: any) => (a.sort_order || a.order || 0) - (b.sort_order || b.order || 0)),
          })
        }
      }
    }
    return pages
  }, [issue])

  // Scroll to selected page
  useEffect(() => {
    if (selectedPageId && editorRef.current) {
      const el = editorRef.current.querySelector(`[data-page-id="${selectedPageId}"]`)
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
    }
  }, [selectedPageId])

  // Get series initials for background glyph
  const seriesInitials = useMemo(() => {
    const title = issue.series?.title || ''
    return title.split(/\s+/).map((w: string) => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || 'PF'
  }, [issue])

  if (allPages.length === 0) {
    return (
      <main className="bp-editor-panel">
        <div className="bp-crosshair" style={{ position: 'absolute', top: 20, left: 20 }} />
        <div className="bp-crosshair" style={{ position: 'absolute', top: 20, right: 20 }} />
        <div className="bp-bg-glyph">{seriesInitials}</div>
        <div className="bp-script-container">
          <div style={{ textAlign: 'center', padding: '80px 0', color: 'var(--bp-ink-light)', fontFamily: 'var(--bp-mono)' }}>
            No pages yet. Start writing in the editor.
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="bp-editor-panel" ref={editorRef}>
      <div className="bp-crosshair" style={{ position: 'absolute', top: 20, left: 20 }} />
      <div className="bp-crosshair" style={{ position: 'absolute', top: 20, right: 20 }} />
      <div className="bp-bg-glyph">{seriesInitials}</div>

      <div className="bp-script-container">
        {allPages.map((page) => {
          const pageNum = page.page_number || page.sort_order || page.order || 1
          const pageNumStr = String(pageNum).padStart(2, '0')
          const orientation = page.orientation || (pageNum % 2 === 1 ? 'RIGHT' : 'LEFT')
          const orientLabel = orientation.toLowerCase().replace('_', ' ')

          return (
            <div key={page.id} data-page-id={page.id}>
              {/* Page Header */}
              <div className="bp-page-header">
                <span>Page {pageNumStr} ({orientLabel})</span>
                <span className="bp-page-num">{pageNumStr}</span>
              </div>

              {/* Panels */}
              {page.panels.map((panel: any, panelIdx: number) => {
                const panelNum = panelIdx + 1
                const sizeLabel = getPanelSizeLabel(panel)

                return (
                  <div key={panel.id} className="bp-panel-block">
                    <div className="bp-panel-heading">
                      Panel {panelNum} {sizeLabel}
                    </div>

                    {/* Visual description */}
                    {panel.visual_description && (
                      <div className="bp-script-element bp-visual-desc">
                        {panel.visual_description}
                      </div>
                    )}

                    {/* Dialogue blocks */}
                    {(panel.dialogue_blocks || [])
                      .sort((a: any, b: any) => (a.sort_order || a.order || 0) - (b.sort_order || b.order || 0))
                      .map((dlg: any) => {
                        const speakerName = getCharacterDisplayName(dlg.character_id || dlg.speaker_id, characters, dlg)
                        const deliveryTag = getDeliveryTag(dlg)
                        const balloonSuffix = dlg.balloon_number && dlg.balloon_number > 1 ? ` ${dlg.balloon_number}` : ''

                        return (
                          <div key={dlg.id}>
                            <div className="bp-script-element bp-character-name">
                              {speakerName}{balloonSuffix}{deliveryTag}
                            </div>
                            {dlg.text && (
                              <div className="bp-script-element bp-dialogue">
                                {dlg.text}
                              </div>
                            )}
                          </div>
                        )
                      })}

                    {/* Captions */}
                    {(panel.captions || [])
                      .sort((a: any, b: any) => (a.sort_order || a.order || 0) - (b.sort_order || b.order || 0))
                      .map((cap: any) => (
                        <div key={cap.id}>
                          <div className="bp-script-element bp-character-name">
                            {cap.type === 'NARRATION' ? 'CAPTION' : cap.type || 'CAPTION'}
                          </div>
                          {cap.text && (
                            <div className="bp-script-element bp-caption">
                              {cap.text}
                            </div>
                          )}
                        </div>
                      ))}

                    {/* SFX */}
                    {(panel.sound_effects || []).map((sfx: any) => (
                      <div key={sfx.id} className="bp-script-element bp-sfx">
                        {sfx.text}
                      </div>
                    ))}

                    {/* Inline SFX field */}
                    {panel.sfx && (
                      <div className="bp-script-element bp-sfx">
                        {panel.sfx}
                      </div>
                    )}
                  </div>
                )
              })}

              {page.panels.length === 0 && (
                <div style={{ padding: '20px 0 40px 20px', color: 'var(--bp-ink-light)', fontFamily: 'var(--bp-mono)', fontSize: 'var(--bp-sm)' }}>
                  Empty page — no panels yet
                </div>
              )}
            </div>
          )
        })}
      </div>
    </main>
  )
}
