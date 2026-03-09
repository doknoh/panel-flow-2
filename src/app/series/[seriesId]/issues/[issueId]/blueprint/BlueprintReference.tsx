'use client'

import { useState, useMemo } from 'react'

interface BlueprintReferenceProps {
  issue: any
  characters: any[]
  locations: any[]
  selectedPageId: string | null
}

export default function BlueprintReference({
  issue,
  characters,
  locations,
  selectedPageId,
}: BlueprintReferenceProps) {
  const [chatMessages] = useState<{ role: 'ai' | 'user'; text: string }[]>([
    { role: 'ai', text: 'Blueprint view loaded. This is a read-only script preview. Use the Editor view to make changes.' },
  ])
  const [chatInput, setChatInput] = useState('')

  // Find characters present on selected page
  const pageCharacters = useMemo(() => {
    if (!selectedPageId) return characters.slice(0, 3)
    for (const act of issue.acts || []) {
      for (const scene of act.scenes || []) {
        const page = (scene.pages || []).find((p: any) => p.id === selectedPageId)
        if (page) {
          const charIds = new Set<string>()
          for (const panel of page.panels || []) {
            if (panel.characters_present) {
              for (const cid of panel.characters_present) charIds.add(cid)
            }
            for (const dlg of panel.dialogue_blocks || []) {
              if (dlg.character_id) charIds.add(dlg.character_id)
              if (dlg.speaker_id) charIds.add(dlg.speaker_id)
            }
          }
          if (charIds.size > 0) {
            return characters.filter((c) => charIds.has(c.id))
          }
          // Fall back to scene characters
          if (scene.characters && scene.characters.length > 0) {
            return characters.filter((c: any) => scene.characters.includes(c.id))
          }
        }
      }
    }
    return characters.slice(0, 3)
  }, [issue, characters, selectedPageId])

  // Find location for selected page
  const pageLocation = useMemo(() => {
    if (!selectedPageId) return locations[0] || null
    for (const act of issue.acts || []) {
      for (const scene of act.scenes || []) {
        const page = (scene.pages || []).find((p: any) => p.id === selectedPageId)
        if (page) {
          if (scene.location_id) {
            return locations.find((l: any) => l.id === scene.location_id) || null
          }
        }
      }
    }
    return locations[0] || null
  }, [issue, locations, selectedPageId])

  return (
    <aside className="bp-sidebar-right">
      <div className="bp-context-top">
        <div className="bp-panel-header" style={{ borderBottom: 'none', paddingLeft: 0 }}>
          <span>Reference</span>
        </div>

        {/* Character cards */}
        {pageCharacters.map((char: any, idx: number) => (
          <div key={char.id} className="bp-context-card">
            <div className="bp-card-header">
              <span>CHR_{String(idx + 1).padStart(2, '0')} {'// '}{(char.display_name || char.name || 'UNKNOWN').toUpperCase()}</span>
              <span>#{String(idx + 1).padStart(2, '0')}</span>
            </div>
            <div className="bp-card-content">
              {char.physical_description && (
                <div style={{ marginBottom: 4 }}>
                  <strong>Physical:</strong> {char.physical_description}
                </div>
              )}
              {char.speech_patterns && (
                <div style={{ marginBottom: 4 }}>
                  <strong>Voice:</strong> {char.speech_patterns}
                </div>
              )}
              {char.arc_notes && (
                <div style={{ marginBottom: 4 }}>
                  <strong>Arc:</strong> {char.arc_notes}
                </div>
              )}
              {!char.physical_description && !char.speech_patterns && !char.arc_notes && (
                <div style={{ color: 'var(--bp-ink-light)' }}>
                  {char.name || 'Unnamed character'}
                </div>
              )}
              {char.relationships && (
                <div style={{ marginTop: 8 }}>
                  <span className="bp-tag">Character</span>
                </div>
              )}
            </div>
          </div>
        ))}

        {pageCharacters.length === 0 && (
          <div className="bp-context-card">
            <div className="bp-card-header">
              <span>CHR {'\/\/'} NONE</span>
              <span>--</span>
            </div>
            <div className="bp-card-content" style={{ color: 'var(--bp-ink-light)' }}>
              No characters on this page
            </div>
          </div>
        )}

        {/* Location card */}
        {pageLocation && (
          <div className="bp-context-card">
            <div className="bp-card-header">
              <span>LOC {'// '}{(pageLocation.name || 'UNKNOWN').toUpperCase()}</span>
              <span>#LOC</span>
            </div>
            <div className="bp-card-content">
              {pageLocation.description || pageLocation.visual_details || pageLocation.name}
            </div>
          </div>
        )}

        {/* Issue context card */}
        {(issue.themes || issue.motifs || issue.stakes) && (
          <div className="bp-context-card">
            <div className="bp-card-header">
              <span>ISSUE CONTEXT</span>
              <span>#{String(issue.number).padStart(2, '0')}</span>
            </div>
            <div className="bp-card-content">
              {issue.themes && (
                <div style={{ marginBottom: 4 }}>
                  <strong>Theme:</strong> {issue.themes}
                </div>
              )}
              {issue.motifs && (
                <div style={{ marginBottom: 4 }}>
                  <strong>Motifs:</strong> {issue.motifs}
                </div>
              )}
              {issue.stakes && (
                <div style={{ marginBottom: 4 }}>
                  <strong>Stakes:</strong> {issue.stakes}
                </div>
              )}
              <div style={{ marginTop: 8 }}>
                {issue.themes && <span className="bp-tag">Theme</span>}
                {issue.motifs && <span className="bp-tag">Motifs</span>}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* AI Partner */}
      <div className="bp-ai-partner">
        <div className="bp-ai-header">
          <div className="bp-ai-circle" />
          <span>Struct_AI Partner</span>
        </div>

        <div className="bp-chat-log">
          {chatMessages.map((msg, i) => (
            <div key={i} className={`bp-msg ${msg.role === 'ai' ? 'ai' : 'user'}`}>
              {msg.text}
            </div>
          ))}
        </div>

        <div className="bp-chat-input-area">
          <input
            type="text"
            className="bp-chat-input"
            placeholder="CMD_INPUT..."
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && chatInput.trim()) {
                setChatInput('')
              }
            }}
          />
          <button
            className="bp-send-btn"
            onClick={() => {
              if (chatInput.trim()) {
                setChatInput('')
              }
            }}
          >
            &gt;
          </button>
        </div>
      </div>
    </aside>
  )
}
