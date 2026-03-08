'use client'

import { useMemo } from 'react'

interface BlueprintStatusBarProps {
  issue: any
}

function countWords(text: string | null | undefined): number {
  if (!text) return 0
  return text.trim().split(/\s+/).filter((w) => w.length > 0).length
}

export default function BlueprintStatusBar({ issue }: BlueprintStatusBarProps) {
  const stats = useMemo(() => {
    let totalWords = 0
    let totalPanels = 0
    let totalPages = 0

    for (const act of issue.acts || []) {
      for (const scene of act.scenes || []) {
        for (const page of scene.pages || []) {
          totalPages++
          for (const panel of page.panels || []) {
            totalPanels++
            totalWords += countWords(panel.visual_description)
            for (const dlg of panel.dialogue_blocks || []) {
              totalWords += countWords(dlg.text)
            }
            for (const cap of panel.captions || []) {
              totalWords += countWords(cap.text)
            }
          }
        }
      }
    }

    return { totalWords, totalPanels, totalPages }
  }, [issue])

  const now = new Date()
  const timeStr = [
    String(now.getHours()).padStart(2, '0'),
    String(now.getMinutes()).padStart(2, '0'),
    String(now.getSeconds()).padStart(2, '0'),
  ].join(':')

  return (
    <footer className="bp-status-bar">
      <div className="bp-status-group">
        <div className="bp-status-item">
          PAGES: <span>{stats.totalPages}</span>
        </div>
        <div className="bp-status-item">
          PANELS: <span>{stats.totalPanels}</span>
        </div>
        <div className="bp-status-item">
          WORDS: <span>{stats.totalWords.toLocaleString()}</span>
        </div>
      </div>
      <div className="bp-status-group">
        <div className="bp-status-item">
          SAVED: <span>{timeStr}</span>
        </div>
        <div className="bp-status-item">
          MODE: <span>BLUEPRINT</span>
        </div>
      </div>
    </footer>
  )
}
