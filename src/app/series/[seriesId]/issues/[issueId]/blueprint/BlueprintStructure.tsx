'use client'

import { useMemo } from 'react'

interface BlueprintStructureProps {
  issue: any
  selectedSceneId: string | null
  selectedPageId: string | null
  onSelectScene: (sceneId: string) => void
  onSelectPage: (pageId: string) => void
}

function countSceneWords(scene: any): number {
  let words = 0
  for (const page of scene.pages || []) {
    for (const panel of page.panels || []) {
      if (panel.visual_description) {
        words += panel.visual_description.trim().split(/\s+/).filter((w: string) => w.length > 0).length
      }
      for (const dlg of panel.dialogue_blocks || []) {
        if (dlg.text) {
          words += dlg.text.trim().split(/\s+/).filter((w: string) => w.length > 0).length
        }
      }
      for (const cap of panel.captions || []) {
        if (cap.text) {
          words += cap.text.trim().split(/\s+/).filter((w: string) => w.length > 0).length
        }
      }
    }
  }
  return words
}

export default function BlueprintStructure({
  issue,
  selectedSceneId,
  selectedPageId,
  onSelectScene,
  onSelectPage,
}: BlueprintStructureProps) {
  const items = useMemo(() => {
    const result: any[] = []
    for (const act of issue.acts || []) {
      result.push({
        type: 'act',
        id: act.id,
        actNumber: act.number || act.sort_order || 1,
        title: act.title || `Act ${act.number || act.sort_order || '?'}`,
      })
      for (const scene of act.scenes || []) {
        const pageCount = (scene.pages || []).length
        const wordCount = countSceneWords(scene)
        result.push({
          type: 'scene',
          id: scene.id,
          actNumber: act.number || act.sort_order || 1,
          sceneOrder: scene.sort_order || scene.order || 1,
          title: scene.title || 'Untitled Scene',
          pageCount,
          wordCount,
        })
        for (const page of (scene.pages || []).sort((a: any, b: any) => (a.sort_order || a.order || 0) - (b.sort_order || b.order || 0))) {
          result.push({
            type: 'page',
            id: page.id,
            sceneId: scene.id,
            pageNumber: page.page_number || page.sort_order || page.order || 1,
            panelCount: (page.panels || []).length,
          })
        }
      }
    }
    return result
  }, [issue])

  // If no content, show placeholder
  if (items.length === 0) {
    return (
      <aside className="bp-sidebar-left">
        <div className="bp-panel-header">
          <span>Structure</span>
          <span className="bp-crosshair" style={{ position: 'relative', width: 8, height: 8 }} />
        </div>
        <div style={{ padding: 16, fontSize: '0.75rem', color: 'var(--bp-ink-light)' }}>
          No acts or scenes yet.
        </div>
        <div className="bp-sidebar-footer">
          <svg width="60" height="60" viewBox="0 0 100 100" style={{ opacity: 0.2, stroke: 'var(--bp-ink)', fill: 'none', strokeWidth: 1 }}>
            <circle cx="50" cy="50" r="40" />
            <line x1="10" y1="50" x2="90" y2="50" />
            <line x1="50" y1="10" x2="50" y2="90" />
          </svg>
        </div>
      </aside>
    )
  }

  return (
    <aside className="bp-sidebar-left">
      <div className="bp-panel-header">
        <span>Structure</span>
        <span className="bp-crosshair" style={{ position: 'relative', width: 8, height: 8 }} />
      </div>

      <ul className="bp-structure-list">
        {items.map((item) => {
          if (item.type === 'act') {
            return (
              <li key={item.id} className="bp-structure-item dimmed">
                <span className="bp-item-meta">
                  {String(item.actNumber).padStart(2, '0')}.00 // ACT {item.actNumber}
                </span>
                <span className="bp-item-title">{item.title}</span>
              </li>
            )
          }
          if (item.type === 'scene') {
            const isActive = item.id === selectedSceneId
            return (
              <li
                key={item.id}
                className={`bp-structure-item${isActive ? ' active' : ''}`}
                onClick={() => onSelectScene(item.id)}
              >
                <span className="bp-item-meta">
                  {String(item.actNumber).padStart(2, '0')}.{String(item.sceneOrder).padStart(2, '0')} // SCENE {item.sceneOrder}
                </span>
                <span className="bp-item-title">{item.title}</span>
                <div className="bp-item-stats">
                  {item.pageCount} Page{item.pageCount !== 1 ? 's' : ''} / {item.wordCount.toLocaleString()} Words
                </div>
              </li>
            )
          }
          if (item.type === 'page') {
            const isActive = item.id === selectedPageId
            return (
              <li
                key={item.id}
                className={`bp-structure-item${isActive ? ' active' : ''}`}
                onClick={() => onSelectPage(item.id)}
                style={{ paddingLeft: 32 }}
              >
                <span className="bp-item-meta">
                  PG {String(item.pageNumber).padStart(2, '0')}
                </span>
                <span className="bp-item-title" style={{ fontSize: '0.65rem' }}>
                  Page {item.pageNumber}
                  {item.panelCount > 0 && ` (${item.panelCount} panel${item.panelCount !== 1 ? 's' : ''})`}
                </span>
              </li>
            )
          }
          return null
        })}
      </ul>

      <div className="bp-sidebar-footer">
        <svg width="60" height="60" viewBox="0 0 100 100" style={{ opacity: 0.2, stroke: 'var(--bp-ink)', fill: 'none', strokeWidth: 1 }}>
          <circle cx="50" cy="50" r="40" />
          <line x1="10" y1="50" x2="90" y2="50" />
          <line x1="50" y1="10" x2="50" y2="90" />
        </svg>
      </div>
    </aside>
  )
}
