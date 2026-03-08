'use client'

import { useState, useCallback, useMemo } from 'react'
import BlueprintNav from './BlueprintNav'
import BlueprintStructure from './BlueprintStructure'
import BlueprintEditor from './BlueprintEditor'
import BlueprintReference from './BlueprintReference'
import BlueprintStatusBar from './BlueprintStatusBar'
import './blueprint.css'

interface BlueprintViewProps {
  issue: any
  seriesId: string
}

export default function BlueprintView({ issue, seriesId }: BlueprintViewProps) {
  const [selectedSceneId, setSelectedSceneId] = useState<string | null>(null)
  const [selectedPageId, setSelectedPageId] = useState<string | null>(() => {
    // Default to first page
    for (const act of issue.acts || []) {
      for (const scene of act.scenes || []) {
        if (scene.pages && scene.pages.length > 0) {
          const sorted = [...scene.pages].sort((a: any, b: any) => (a.sort_order || a.order || 0) - (b.sort_order || b.order || 0))
          return sorted[0].id
        }
      }
    }
    return null
  })

  const characters = useMemo(() => issue.series?.characters || [], [issue])
  const locations = useMemo(() => issue.series?.locations || [], [issue])

  const handleSelectScene = useCallback((sceneId: string) => {
    setSelectedSceneId(sceneId)
    // Auto-select first page of scene
    for (const act of issue.acts || []) {
      for (const scene of act.scenes || []) {
        if (scene.id === sceneId && scene.pages && scene.pages.length > 0) {
          const sorted = [...scene.pages].sort((a: any, b: any) => (a.sort_order || a.order || 0) - (b.sort_order || b.order || 0))
          setSelectedPageId(sorted[0].id)
          return
        }
      }
    }
  }, [issue])

  const handleSelectPage = useCallback((pageId: string) => {
    setSelectedPageId(pageId)
    // Also set scene
    for (const act of issue.acts || []) {
      for (const scene of act.scenes || []) {
        if ((scene.pages || []).find((p: any) => p.id === pageId)) {
          setSelectedSceneId(scene.id)
          return
        }
      }
    }
  }, [issue])

  return (
    <div className="blueprint">
      <BlueprintNav
        seriesId={seriesId}
        issueId={issue.id}
        issueTitle={issue.title}
        issueNumber={issue.number}
      />

      <div className="bp-workspace">
        <BlueprintStructure
          issue={issue}
          selectedSceneId={selectedSceneId}
          selectedPageId={selectedPageId}
          onSelectScene={handleSelectScene}
          onSelectPage={handleSelectPage}
        />

        <BlueprintEditor
          issue={issue}
          characters={characters}
          selectedPageId={selectedPageId}
        />

        <BlueprintReference
          issue={issue}
          characters={characters}
          locations={locations}
          selectedPageId={selectedPageId}
        />
      </div>

      <BlueprintStatusBar issue={issue} />
    </div>
  )
}
