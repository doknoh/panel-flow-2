'use client'

import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { postJsonWithRetry, FetchError } from '@/lib/fetch-with-retry'
import { useToast } from '@/contexts/ToastContext'
import { getImageUrl } from '@/lib/supabase/storage'
import PacingAnalyst from '@/components/PacingAnalyst'
import type { PageData } from '@/lib/pacing'

// Image attachment type for visuals tab
interface VisualImage {
  id: string
  storage_path: string
  filename: string
  caption: string | null
  is_primary: boolean
  url: string
  entityName: string
  entityType: 'character' | 'location'
}

interface ContinuityAlert {
  id: string
  type: 'character' | 'dialogue' | 'pacing' | 'structure'
  severity: 'warning' | 'info'
  message: string
  details: string
}

interface PageContext {
  page: any
  act: { id: string; name: string; sort_order: number; title?: string; intention?: string; beat_summary?: string }
  scene: { id: string; name: string; sort_order: number; title?: string; intention?: string; scene_summary?: string }
}

interface Issue {
  id: string
  number: number
  title: string | null
  summary: string | null
  themes: string | null
  tagline: string | null
  visual_style: string | null
  motifs: string | null
  stakes: string | null
  rules: string | null
  series_act: 'BEGINNING' | 'MIDDLE' | 'END' | null
  status: string
  outline_notes: string | null
  series: {
    id: string
    title: string
    central_theme?: string | null
    logline?: string | null
    characters: any[]
    locations: any[]
  }
  acts: any[]
}

interface ToolkitProps {
  issue: Issue
  selectedPageContext?: PageContext | null
  onRefresh?: () => void
}

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  suggestions?: AISuggestion[]
}

interface AISuggestion {
  type: 'act_intention' | 'scene_intention' | 'page_intention' | 'scene_summary' | 'act_beat' | 'panel_description' | 'dialogue' | 'caption'
  targetId: string
  targetLabel: string
  content: string
  panelNumber?: number // For panel-level content
  speakerName?: string // For dialogue
  captionType?: string // For captions
}

// Parse AI response for actionable suggestions
// Supports outline fields AND panel content (descriptions, dialogue, captions)
function parseAISuggestions(response: string, context: PageContext | null): AISuggestion[] {
  const suggestions: AISuggestion[] = []

  if (!context) return suggestions

  // Look for markers in the response that indicate saveable content
  // Format: [SAVE_AS:type] content [/SAVE_AS]
  // For panel content: [SAVE_AS:panel_description:panelNum] or [SAVE_AS:dialogue:panelNum:SPEAKER]
  const savePattern = /\[SAVE_AS:([\w_]+)(?::([^\]]+))?\]([\s\S]*?)\[\/SAVE_AS\]/g
  let match

  while ((match = savePattern.exec(response)) !== null) {
    const [, type, metadata, content] = match
    const trimmedContent = content.trim()

    switch (type) {
      case 'act_intention':
        suggestions.push({
          type: 'act_intention',
          targetId: context.act.id,
          targetLabel: context.act.name || `Act ${context.act.sort_order + 1}`,
          content: trimmedContent,
        })
        break
      case 'scene_intention':
        suggestions.push({
          type: 'scene_intention',
          targetId: context.scene.id,
          targetLabel: context.scene.title || context.scene.name || 'Current Scene',
          content: trimmedContent,
        })
        break
      case 'page_intention':
        suggestions.push({
          type: 'page_intention',
          targetId: context.page.id,
          targetLabel: `Page ${context.page.page_number}`,
          content: trimmedContent,
        })
        break
      case 'scene_summary':
        suggestions.push({
          type: 'scene_summary',
          targetId: context.scene.id,
          targetLabel: context.scene.title || context.scene.name || 'Current Scene',
          content: trimmedContent,
        })
        break
      case 'act_beat':
        suggestions.push({
          type: 'act_beat',
          targetId: context.act.id,
          targetLabel: context.act.name || `Act ${context.act.sort_order + 1}`,
          content: trimmedContent,
        })
        break
      case 'panel_description':
        // Metadata format: panelNumber
        const panelNum = metadata ? parseInt(metadata) : 1
        const panel = context.page.panels?.find((p: any) => p.panel_number === panelNum)
        if (panel) {
          suggestions.push({
            type: 'panel_description',
            targetId: panel.id,
            targetLabel: `Page ${context.page.page_number}, Panel ${panelNum}`,
            content: trimmedContent,
            panelNumber: panelNum,
          })
        }
        break
      case 'dialogue':
        // Metadata format: panelNumber:SPEAKER_NAME
        if (metadata) {
          const [panelStr, ...speakerParts] = metadata.split(':')
          const dialoguePanelNum = parseInt(panelStr)
          const speakerName = speakerParts.join(':') // In case speaker name has colons
          const dialoguePanel = context.page.panels?.find((p: any) => p.panel_number === dialoguePanelNum)
          if (dialoguePanel) {
            suggestions.push({
              type: 'dialogue',
              targetId: dialoguePanel.id,
              targetLabel: `${speakerName} (Page ${context.page.page_number}, Panel ${dialoguePanelNum})`,
              content: trimmedContent,
              panelNumber: dialoguePanelNum,
              speakerName: speakerName,
            })
          }
        }
        break
      case 'caption':
        // Metadata format: panelNumber:captionType
        if (metadata) {
          const [panelStr, captionType = 'narration'] = metadata.split(':')
          const captionPanelNum = parseInt(panelStr)
          const captionPanel = context.page.panels?.find((p: any) => p.panel_number === captionPanelNum)
          if (captionPanel) {
            suggestions.push({
              type: 'caption',
              targetId: captionPanel.id,
              targetLabel: `${captionType.toUpperCase()} (Page ${context.page.page_number}, Panel ${captionPanelNum})`,
              content: trimmedContent,
              panelNumber: captionPanelNum,
              captionType: captionType,
            })
          }
        }
        break
    }
  }

  return suggestions
}

export default function Toolkit({ issue, selectedPageContext, onRefresh }: ToolkitProps) {
  const [activeTab, setActiveTab] = useState<'context' | 'characters' | 'locations' | 'visuals' | 'alerts' | 'pacing' | 'ai'>('ai')
  const [isEditingContext, setIsEditingContext] = useState(false)
  const [contextForm, setContextForm] = useState({
    title: issue.title || '',
    summary: issue.summary || '',
    themes: issue.themes || '',
    tagline: issue.tagline || '',
    visual_style: issue.visual_style || '',
    motifs: issue.motifs || '',
    stakes: issue.stakes || '',
    rules: issue.rules || '',
    series_act: issue.series_act || '',
    outline_notes: issue.outline_notes || '',
  })
  const [saving, setSaving] = useState(false)
  // Local state for optimistic status updates
  const [localStatus, setLocalStatus] = useState(issue.status)
  const { showToast } = useToast()

  // Character and Location detail panel state
  const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(null)
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(null)
  const [localCharacters, setLocalCharacters] = useState(issue.series.characters)
  const [localLocations, setLocalLocations] = useState(issue.series.locations)
  const [characterSaving, setCharacterSaving] = useState(false)
  const [locationSaving, setLocationSaving] = useState(false)
  const characterSaveTimerRef = useRef<NodeJS.Timeout | null>(null)
  const locationSaveTimerRef = useRef<NodeJS.Timeout | null>(null)

  // Sync local characters/locations when props change
  useEffect(() => {
    setLocalCharacters(issue.series.characters)
  }, [issue.series.characters])

  useEffect(() => {
    setLocalLocations(issue.series.locations)
  }, [issue.series.locations])

  // Compute characters/locations in current scene for contextual filtering
  const sceneCharacterIds = useMemo(() => {
    if (!selectedPageContext?.scene?.id) return new Set<string>()

    const characterIds = new Set<string>()

    // Find all pages in the current scene
    for (const act of issue.acts || []) {
      for (const scene of act.scenes || []) {
        if (scene.id === selectedPageContext.scene.id) {
          // Get all character IDs from dialogue blocks in this scene
          for (const page of scene.pages || []) {
            for (const panel of page.panels || []) {
              for (const dialogue of panel.dialogue_blocks || []) {
                if (dialogue.character_id) {
                  characterIds.add(dialogue.character_id)
                }
              }
            }
          }
        }
      }
    }

    return characterIds
  }, [issue.acts, selectedPageContext?.scene?.id])

  // Split characters into "in scene" and "other" groups
  const { sceneCharacters, otherCharacters } = useMemo(() => {
    const inScene: any[] = []
    const other: any[] = []

    for (const char of localCharacters) {
      if (sceneCharacterIds.has(char.id)) {
        inScene.push(char)
      } else {
        other.push(char)
      }
    }

    return { sceneCharacters: inScene, otherCharacters: other }
  }, [localCharacters, sceneCharacterIds])

  // For locations, we could add scene-location associations later
  // For now, show all locations but could be filtered similarly

  // Visuals tab state
  const [visuals, setVisuals] = useState<VisualImage[]>([])
  const [visualsLoading, setVisualsLoading] = useState(false)
  const [selectedVisual, setSelectedVisual] = useState<VisualImage | null>(null)
  const [visualsFilter, setVisualsFilter] = useState<'all' | 'characters' | 'locations'>('all')

  // Fetch visuals for all characters and locations
  const fetchVisuals = useCallback(async () => {
    setVisualsLoading(true)
    const supabase = createClient()

    // Get character IDs
    const characterIds = issue.series.characters.map((c: any) => c.id)
    const locationIds = issue.series.locations.map((l: any) => l.id)

    const allImages: VisualImage[] = []

    // Fetch character images
    if (characterIds.length > 0) {
      const { data: charImages } = await supabase
        .from('image_attachments')
        .select('*')
        .eq('entity_type', 'character')
        .in('entity_id', characterIds)
        .order('is_primary', { ascending: false })
        .order('sort_order', { ascending: true })

      if (charImages) {
        for (const img of charImages) {
          const character = issue.series.characters.find((c: any) => c.id === img.entity_id)
          allImages.push({
            ...img,
            url: getImageUrl(img.storage_path),
            entityName: character?.name || 'Unknown',
            entityType: 'character',
          })
        }
      }
    }

    // Fetch location images
    if (locationIds.length > 0) {
      const { data: locImages } = await supabase
        .from('image_attachments')
        .select('*')
        .eq('entity_type', 'location')
        .in('entity_id', locationIds)
        .order('is_primary', { ascending: false })
        .order('sort_order', { ascending: true })

      if (locImages) {
        for (const img of locImages) {
          const location = issue.series.locations.find((l: any) => l.id === img.entity_id)
          allImages.push({
            ...img,
            url: getImageUrl(img.storage_path),
            entityName: location?.name || 'Unknown',
            entityType: 'location',
          })
        }
      }
    }

    setVisuals(allImages)
    setVisualsLoading(false)
  }, [issue.series.characters, issue.series.locations])

  // Fetch visuals when tab is opened
  useEffect(() => {
    if (activeTab === 'visuals' && visuals.length === 0 && !visualsLoading) {
      fetchVisuals()
    }
  }, [activeTab, visuals.length, visualsLoading, fetchVisuals])

  // Filter visuals based on selection
  const filteredVisuals = useMemo(() => {
    if (visualsFilter === 'all') return visuals
    return visuals.filter(v => v.entityType === (visualsFilter === 'characters' ? 'character' : 'location'))
  }, [visuals, visualsFilter])

  // Continuity alerts state
  const [dismissedAlerts, setDismissedAlerts] = useState<Set<string>>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(`dismissed-alerts-${issue.id}`)
      return stored ? new Set(JSON.parse(stored)) : new Set()
    }
    return new Set()
  })

  // AI Chat state
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [chatInput, setChatInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [aiMode, setAiMode] = useState<'outline' | 'draft'>('outline')
  const chatEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages])

  // Sync local status with prop when it changes from outside
  useEffect(() => {
    setLocalStatus(issue.status)
  }, [issue.status])

  // Run passive continuity checks on the issue
  const continuityAlerts = useMemo<ContinuityAlert[]>(() => {
    const alerts: ContinuityAlert[] = []
    const acts = issue.acts || []

    // Check: No acts
    if (acts.length === 0) {
      alerts.push({
        id: 'no-acts',
        type: 'structure',
        severity: 'info',
        message: 'No acts defined',
        details: 'Add acts to structure your issue into beginning, middle, and end.',
      })
    }

    // Check: Empty scenes
    let emptySceneCount = 0
    let totalPages = 0
    let totalPanels = 0
    let hasDialogue = false

    for (const act of acts) {
      for (const scene of (act.scenes || [])) {
        const pages = scene.pages || []
        if (pages.length === 0) {
          emptySceneCount++
        }
        for (const page of pages) {
          totalPages++
          for (const panel of (page.panels || [])) {
            totalPanels++
            if (panel.dialogue_blocks?.some((d: any) => d.text)) {
              hasDialogue = true
            }
          }
        }
      }
    }

    if (emptySceneCount > 0) {
      alerts.push({
        id: `empty-scenes-${emptySceneCount}`,
        type: 'structure',
        severity: 'warning',
        message: `${emptySceneCount} empty scene${emptySceneCount > 1 ? 's' : ''}`,
        details: 'Some scenes have no pages. Add pages or remove empty scenes.',
      })
    }

    // Check: No dialogue
    if (totalPanels > 5 && !hasDialogue) {
      alerts.push({
        id: 'no-dialogue',
        type: 'dialogue',
        severity: 'info',
        message: 'Silent issue detected',
        details: 'This issue has panels but no dialogue. Verify this is intentional.',
      })
    }

    // Check: Pacing - too many panels per page
    const highPanelPages: number[] = []
    let pageNum = 0
    for (const act of acts) {
      for (const scene of (act.scenes || [])) {
        for (const page of (scene.pages || [])) {
          pageNum++
          if ((page.panels?.length || 0) > 9) {
            highPanelPages.push(pageNum)
          }
        }
      }
    }

    if (highPanelPages.length > 0) {
      alerts.push({
        id: `high-panel-count-${highPanelPages.join('-')}`,
        type: 'pacing',
        severity: 'warning',
        message: `${highPanelPages.length} page${highPanelPages.length > 1 ? 's' : ''} with 10+ panels`,
        details: `Page${highPanelPages.length > 1 ? 's' : ''} ${highPanelPages.join(', ')} may be too dense. Consider splitting panels.`,
      })
    }

    // Check: Missing character in dialogue
    const unknownSpeakers: string[] = []
    const characterIds = new Set(issue.series.characters.map((c: any) => c.id))

    for (const act of acts) {
      for (const scene of (act.scenes || [])) {
        for (const page of (scene.pages || [])) {
          for (const panel of (page.panels || [])) {
            for (const dialogue of (panel.dialogue_blocks || [])) {
              if (dialogue.text && !dialogue.character_id && dialogue.speaker_name) {
                if (!unknownSpeakers.includes(dialogue.speaker_name)) {
                  unknownSpeakers.push(dialogue.speaker_name)
                }
              }
            }
          }
        }
      }
    }

    if (unknownSpeakers.length > 0) {
      alerts.push({
        id: `unknown-speakers-${unknownSpeakers.length}`,
        type: 'character',
        severity: 'warning',
        message: `${unknownSpeakers.length} untracked speaker${unknownSpeakers.length > 1 ? 's' : ''}`,
        details: `Speaker${unknownSpeakers.length > 1 ? 's' : ''} "${unknownSpeakers.slice(0, 3).join('", "')}"${unknownSpeakers.length > 3 ? '...' : ''} not in character database.`,
      })
    }

    return alerts
  }, [issue])

  // Filter out dismissed alerts
  const activeAlerts = continuityAlerts.filter(a => !dismissedAlerts.has(a.id))

  // Dismiss an alert
  const dismissAlert = (alertId: string) => {
    const newDismissed = new Set(dismissedAlerts)
    newDismissed.add(alertId)
    setDismissedAlerts(newDismissed)
    localStorage.setItem(`dismissed-alerts-${issue.id}`, JSON.stringify([...newDismissed]))
  }

  // Clear all dismissed alerts
  const clearDismissed = () => {
    setDismissedAlerts(new Set())
    localStorage.removeItem(`dismissed-alerts-${issue.id}`)
  }

  const saveContext = async () => {
    setSaving(true)

    // Optimistic update - close form and show success immediately
    setIsEditingContext(false)
    showToast('Context saved', 'success')

    const supabase = createClient()
    const { error } = await supabase
      .from('issues')
      .update({
        title: contextForm.title || null,
        summary: contextForm.summary || null,
        themes: contextForm.themes || null,
        tagline: contextForm.tagline || null,
        visual_style: contextForm.visual_style || null,
        motifs: contextForm.motifs || null,
        stakes: contextForm.stakes || null,
        rules: contextForm.rules || null,
        series_act: contextForm.series_act || null,
        outline_notes: contextForm.outline_notes || null,
      })
      .eq('id', issue.id)

    if (error) {
      // Rollback - reopen form and show error
      setIsEditingContext(true)
      showToast('Failed to save context', 'error')
    } else {
      onRefresh?.()
    }
    setSaving(false)
  }

  // Character detail panel functions
  const selectedCharacter = localCharacters.find((c: any) => c.id === selectedCharacterId)
  const selectedLocation = localLocations.find((l: any) => l.id === selectedLocationId)

  const updateCharacterField = (field: string, value: string) => {
    if (!selectedCharacterId) return

    // Optimistic update
    setLocalCharacters((prev: any[]) => prev.map((c: any) =>
      c.id === selectedCharacterId ? { ...c, [field]: value } : c
    ))

    // Debounced save
    if (characterSaveTimerRef.current) {
      clearTimeout(characterSaveTimerRef.current)
    }
    characterSaveTimerRef.current = setTimeout(() => {
      saveCharacter(selectedCharacterId, field, value)
    }, 1000)
  }

  const saveCharacter = async (characterId: string, field: string, value: string) => {
    setCharacterSaving(true)
    const supabase = createClient()

    const { error } = await supabase
      .from('characters')
      .update({ [field]: value || null })
      .eq('id', characterId)

    if (error) {
      showToast('Failed to save character', 'error')
    }
    setCharacterSaving(false)
  }

  const deleteCharacter = async (characterId: string) => {
    const supabase = createClient()

    // Count dialogues assigned to this character
    const { count } = await supabase
      .from('dialogue_blocks')
      .select('*', { count: 'exact', head: true })
      .eq('character_id', characterId)

    const dialogueCount = count || 0
    const confirmMessage = dialogueCount > 0
      ? `This character has ${dialogueCount} dialogue${dialogueCount > 1 ? 's' : ''} assigned. Delete anyway? (Dialogues will become unassigned)`
      : 'Delete this character?'

    if (!confirm(confirmMessage)) return

    // Optimistic update
    setLocalCharacters((prev: any[]) => prev.filter((c: any) => c.id !== characterId))
    setSelectedCharacterId(null)
    showToast('Character deleted', 'success')

    const { error } = await supabase
      .from('characters')
      .delete()
      .eq('id', characterId)

    if (error) {
      // Rollback
      setLocalCharacters(issue.series.characters)
      showToast('Failed to delete character', 'error')
    } else {
      onRefresh?.()
    }
  }

  // Location detail panel functions
  const updateLocationField = (field: string, value: string) => {
    if (!selectedLocationId) return

    // Optimistic update
    setLocalLocations((prev: any[]) => prev.map((l: any) =>
      l.id === selectedLocationId ? { ...l, [field]: value } : l
    ))

    // Debounced save
    if (locationSaveTimerRef.current) {
      clearTimeout(locationSaveTimerRef.current)
    }
    locationSaveTimerRef.current = setTimeout(() => {
      saveLocation(selectedLocationId, field, value)
    }, 1000)
  }

  const saveLocation = async (locationId: string, field: string, value: string) => {
    setLocationSaving(true)
    const supabase = createClient()

    const { error } = await supabase
      .from('locations')
      .update({ [field]: value || null })
      .eq('id', locationId)

    if (error) {
      showToast('Failed to save location', 'error')
    }
    setLocationSaving(false)
  }

  const deleteLocation = async (locationId: string) => {
    if (!confirm('Delete this location?')) return

    // Optimistic update
    setLocalLocations((prev: any[]) => prev.filter((l: any) => l.id !== locationId))
    setSelectedLocationId(null)
    showToast('Location deleted', 'success')

    const supabase = createClient()
    const { error } = await supabase
      .from('locations')
      .delete()
      .eq('id', locationId)

    if (error) {
      // Rollback
      setLocalLocations(issue.series.locations)
      showToast('Failed to delete location', 'error')
    } else {
      onRefresh?.()
    }
  }

  // Build comprehensive context for AI - includes full script content
  const buildHierarchicalContext = () => {
    const parts: string[] = []

    // Series level
    parts.push(`SERIES: "${issue.series.title}"`)
    if (issue.series.central_theme) {
      parts.push(`Central Theme: ${issue.series.central_theme}`)
    }
    if (issue.series.logline) {
      parts.push(`Logline: ${issue.series.logline}`)
    }

    // Characters with details
    if (issue.series.characters.length > 0) {
      parts.push(`\nCHARACTERS:`)
      issue.series.characters.forEach((c: any) => {
        parts.push(`- ${c.name}${c.role ? ` (${c.role})` : ''}${c.description ? `: ${c.description}` : ''}`)
      })
    }

    // Locations with details
    if (issue.series.locations.length > 0) {
      parts.push(`\nLOCATIONS:`)
      issue.series.locations.forEach((l: any) => {
        parts.push(`- ${l.name}${l.description ? `: ${l.description}` : ''}`)
      })
    }

    // Issue level
    parts.push(`\n${'='.repeat(50)}`)
    parts.push(`ISSUE #${issue.number}${issue.title ? `: ${issue.title}` : ''}`)
    parts.push(`${'='.repeat(50)}`)
    if (issue.summary) parts.push(`Summary: ${issue.summary}`)
    if (issue.themes) parts.push(`Themes: ${issue.themes}`)
    if (issue.stakes) parts.push(`Stakes: ${issue.stakes}`)
    if (issue.outline_notes) parts.push(`Outline Notes: ${issue.outline_notes}`)

    // Build full script content
    const sortedActs = [...(issue.acts || [])].sort((a: any, b: any) => a.sort_order - b.sort_order)

    for (const act of sortedActs) {
      parts.push(`\n${'─'.repeat(40)}`)
      parts.push(`ACT: ${act.name || `Act ${act.sort_order + 1}`}`)
      if (act.intention) parts.push(`Intention: ${act.intention}`)
      if (act.beat_summary) parts.push(`Beat Summary: ${act.beat_summary}`)
      parts.push(`${'─'.repeat(40)}`)

      const sortedScenes = [...(act.scenes || [])].sort((a: any, b: any) => a.sort_order - b.sort_order)

      for (const scene of sortedScenes) {
        parts.push(`\nSCENE: ${scene.title || scene.name || 'Untitled'}`)
        if (scene.intention) parts.push(`Intention: ${scene.intention}`)
        if (scene.scene_summary) parts.push(`Summary: ${scene.scene_summary}`)

        const sortedPages = [...(scene.pages || [])].sort((a: any, b: any) => a.sort_order - b.sort_order)

        for (const page of sortedPages) {
          parts.push(`\nPAGE ${page.page_number}`)
          if (page.intention) parts.push(`[Intention: ${page.intention}]`)

          const sortedPanels = [...(page.panels || [])].sort((a: any, b: any) => a.sort_order - b.sort_order)

          for (const panel of sortedPanels) {
            parts.push(`\nPanel ${panel.panel_number}:`)
            if (panel.visual_description) {
              parts.push(panel.visual_description)
            }

            // Dialogue
            const sortedDialogue = [...(panel.dialogue_blocks || [])].sort((a: any, b: any) => a.sort_order - b.sort_order)
            for (const d of sortedDialogue) {
              if (d.text) {
                const speaker = d.speaker_name || 'UNKNOWN'
                parts.push(`${speaker}: "${d.text}"`)
              }
            }

            // Captions
            const sortedCaptions = [...(panel.captions || [])].sort((a: any, b: any) => a.sort_order - b.sort_order)
            for (const c of sortedCaptions) {
              if (c.text) {
                const type = c.caption_type || 'CAPTION'
                parts.push(`[${type.toUpperCase()}]: ${c.text}`)
              }
            }
          }
        }
      }
    }

    // Current location indicator
    if (selectedPageContext) {
      const { act, scene, page } = selectedPageContext
      parts.push(`\n${'='.repeat(50)}`)
      parts.push(`CURRENTLY VIEWING: ${act.name || `Act ${act.sort_order + 1}`} › ${scene.title || scene.name || 'Scene'} › Page ${page.page_number}`)
      parts.push(`${'='.repeat(50)}`)
    }

    return parts.join('\n')
  }

  // Apply an AI suggestion to the database
  const applySuggestion = async (suggestion: AISuggestion) => {
    const supabase = createClient()

    // Handle panel content separately (dialogue, captions need inserts, not updates)
    if (suggestion.type === 'dialogue' && suggestion.speakerName) {
      // Get the highest sort_order for existing dialogue blocks in this panel
      const { data: existingDialogue } = await supabase
        .from('dialogue_blocks')
        .select('sort_order')
        .eq('panel_id', suggestion.targetId)
        .order('sort_order', { ascending: false })
        .limit(1)

      const nextSortOrder = existingDialogue?.[0]?.sort_order !== undefined
        ? existingDialogue[0].sort_order + 1
        : 0

      const { error } = await supabase
        .from('dialogue_blocks')
        .insert({
          panel_id: suggestion.targetId,
          speaker_name: suggestion.speakerName,
          text: suggestion.content,
          sort_order: nextSortOrder,
        })

      if (error) {
        showToast('Failed to add dialogue', 'error')
      } else {
        showToast(`Added dialogue for ${suggestion.speakerName}`, 'success')
        onRefresh?.()
      }
      return
    }

    if (suggestion.type === 'caption' && suggestion.captionType) {
      // Get the highest sort_order for existing captions in this panel
      const { data: existingCaptions } = await supabase
        .from('captions')
        .select('sort_order')
        .eq('panel_id', suggestion.targetId)
        .order('sort_order', { ascending: false })
        .limit(1)

      const nextSortOrder = existingCaptions?.[0]?.sort_order !== undefined
        ? existingCaptions[0].sort_order + 1
        : 0

      const { error } = await supabase
        .from('captions')
        .insert({
          panel_id: suggestion.targetId,
          caption_type: suggestion.captionType,
          text: suggestion.content,
          sort_order: nextSortOrder,
        })

      if (error) {
        showToast('Failed to add caption', 'error')
      } else {
        showToast(`Added ${suggestion.captionType} caption`, 'success')
        onRefresh?.()
      }
      return
    }

    if (suggestion.type === 'panel_description') {
      const { error } = await supabase
        .from('panels')
        .update({ visual_description: suggestion.content })
        .eq('id', suggestion.targetId)

      if (error) {
        showToast('Failed to save panel description', 'error')
      } else {
        showToast(`Saved description to ${suggestion.targetLabel}`, 'success')
        onRefresh?.()
      }
      return
    }

    // Handle outline fields (original logic)
    let table: string
    let field: string

    switch (suggestion.type) {
      case 'act_intention':
        table = 'acts'
        field = 'intention'
        break
      case 'act_beat':
        table = 'acts'
        field = 'beat_summary'
        break
      case 'scene_intention':
        table = 'scenes'
        field = 'intention'
        break
      case 'scene_summary':
        table = 'scenes'
        field = 'scene_summary'
        break
      case 'page_intention':
        table = 'pages'
        field = 'intention'
        break
      default:
        showToast('Unknown suggestion type', 'error')
        return
    }

    const { error } = await supabase
      .from(table)
      .update({ [field]: suggestion.content })
      .eq('id', suggestion.targetId)

    if (error) {
      showToast(`Failed to save ${suggestion.type.replace('_', ' ')}`, 'error')
    } else {
      showToast(`Saved to ${suggestion.targetLabel}`, 'success')
      onRefresh?.()
    }
  }

  // Determine if the issue has substantial content or is blank
  const hasExistingContent = useMemo(() => {
    let panelCount = 0
    let dialogueCount = 0
    for (const act of (issue.acts || [])) {
      for (const scene of (act.scenes || [])) {
        for (const page of (scene.pages || [])) {
          for (const panel of (page.panels || [])) {
            panelCount++
            if (panel.visual_description) panelCount++
            dialogueCount += (panel.dialogue_blocks?.length || 0)
          }
        }
      }
    }
    // Consider "has content" if there are panels with descriptions or dialogue
    return panelCount > 5 || dialogueCount > 3
  }, [issue])

  // Build conversation history for context
  const buildConversationHistory = () => {
    // Include up to 10 recent messages for context
    const recentMessages = chatMessages.slice(-10)
    if (recentMessages.length === 0) return ''

    return '\n\nCONVERSATION SO FAR:\n' + recentMessages.map(msg =>
      `${msg.role === 'user' ? 'Author' : 'You'}: ${msg.content}`
    ).join('\n\n')
  }

  const sendMessage = async () => {
    if (!chatInput.trim() || isLoading) return

    const userMessage = chatInput.trim()
    const isFirstMessage = chatMessages.length === 0
    setChatInput('')
    setChatMessages(prev => [...prev, { role: 'user', content: userMessage }])
    setIsLoading(true)

    try {
      // Build rich context with full script
      const context = buildHierarchicalContext()
      const conversationHistory = buildConversationHistory()

      // Determine opening approach based on content state
      const openingGuidance = isFirstMessage
        ? hasExistingContent
          ? `
OPENING APPROACH: This issue has existing content. You have read it all. Start by acknowledging the work that exists and ask ONE question about what the author wants to work on today.
Example: "I've read through Issue #${issue.number}. [Brief observation about what you notice - a strength, a theme, something interesting]. What would you like to work on?"`
          : `
OPENING APPROACH: This is a new/blank issue with little content. Start with macro-level exploration. Ask ONE big-picture question to help define the story from the top down.
Think: What is this issue ABOUT? What happens? Who changes? What's the emotional journey?
Example: "Let's build out Issue #${issue.number}. What's the core story you want to tell in this issue?"`
        : ''

      // Core instructions for a true writing partner
      const coreInstructions = `
YOU ARE A WRITING PARTNER who has thoroughly read and understood this entire script.

CRITICAL RULES:
1. ASK ONLY ONE QUESTION AT A TIME. Never ask multiple questions in a single response. This is essential for a Socratic dialogue.
2. You have READ THE FULL SCRIPT above. Reference specific scenes, dialogue, and moments when relevant.
3. Don't treat the author like they're starting from scratch - engage with what EXISTS.
4. Be a collaborator, not an interrogator.
5. If offering feedback, ask first: "Would you like my thoughts on [specific aspect]?" Don't fire off critiques.
6. When giving feedback, be specific - reference actual pages, panels, dialogue lines.
7. LISTEN for when the author puts a "fine point" on something - when they articulate something clearly that could be saved (a plot point, scene intention, panel description, dialogue line). When you hear this, ASK if they want it added to the document.
${openingGuidance}

CONVERSATION MEMORY: You remember everything discussed in this conversation. Build on previous answers. Don't re-ask questions that have been answered.
${conversationHistory}

YOUR KNOWLEDGE: You have the complete script above. You know the characters, their voices, the locations, the plot beats, the dialogue. USE this knowledge.`

      // Mode-specific additions with expanded save options
      const modeInstructions = aiMode === 'outline'
        ? `

OUTLINE MODE:
- Help with story structure, act breaks, scene purposes, character arcs
- Work from macro to micro: Series theme → Issue stakes → Act purposes → Scene intentions → Page beats
- When the author articulates something clearly, ASK: "That sounds like [type of thing]. Want me to save that as the [field name]?"
- If they agree, wrap the content in tags:
  [SAVE_AS:act_intention]content[/SAVE_AS]
  [SAVE_AS:scene_intention]content[/SAVE_AS]
  [SAVE_AS:page_intention]content[/SAVE_AS]
  [SAVE_AS:scene_summary]content[/SAVE_AS]
  [SAVE_AS:act_beat]content[/SAVE_AS]
- ONLY use these tags AFTER the author agrees to save something.`
        : `

DRAFT MODE:
- Help write and refine actual script content - panel descriptions, dialogue, captions
- Be specific and visual in your suggestions
- Match the existing voice and tone of the script
- When the author articulates a clear panel description, dialogue line, or caption, ASK: "Want me to add that to [location]?"
- If they agree, wrap the content in tags:
  [SAVE_AS:panel_description:panelNumber]visual description here[/SAVE_AS]
  [SAVE_AS:dialogue:panelNumber:SPEAKER_NAME]dialogue text here[/SAVE_AS]
  [SAVE_AS:caption:panelNumber:captionType]caption text here[/SAVE_AS]
  (captionType can be: narration, thought, location, time)
- ONLY use these tags AFTER the author agrees to save something.`

      const fullContext = context + coreInstructions + modeInstructions

      const data = await postJsonWithRetry<{ response?: string; error?: string }>(
        '/api/chat',
        { message: userMessage, context: fullContext, maxTokens: 2048 },
        { retries: 2, retryDelay: 1000 }
      )

      if (data.error) {
        setChatMessages(prev => [...prev, { role: 'assistant', content: `Error: ${data.error}` }])
      } else {
        const response = data.response || ''
        // Parse for suggestions
        const suggestions = parseAISuggestions(response, selectedPageContext || null)
        // Clean response by removing the SAVE_AS tags for display
        const cleanResponse = response.replace(/\[SAVE_AS:[\w_]+(?::[^\]]+)?\]([\s\S]*?)\[\/SAVE_AS\]/g, '$1')
        setChatMessages(prev => [...prev, {
          role: 'assistant',
          content: cleanResponse,
          suggestions: suggestions.length > 0 ? suggestions : undefined
        }])
      }
    } catch (error) {
      let errorMessage = 'Failed to connect to AI assistant. Please try again.'

      if (error instanceof FetchError) {
        if (error.status === 429) {
          errorMessage = `Rate limit reached. Please wait ${error.retryAfter || 60} seconds before trying again.`
        } else if (error.status === 401) {
          errorMessage = 'Session expired. Please refresh the page to continue.'
        } else if (error.status >= 500) {
          errorMessage = 'The AI service is temporarily unavailable. Please try again in a moment.'
        }
      }

      setChatMessages(prev => [...prev, { role: 'assistant', content: errorMessage }])
    }

    setIsLoading(false)
  }

  // Calculate stats
  const totalPages = issue.acts?.reduce((acc, act) =>
    acc + (act.scenes?.reduce((sAcc: number, scene: any) =>
      sAcc + (scene.pages?.length || 0), 0) || 0), 0) || 0

  const totalPanels = issue.acts?.reduce((acc, act) =>
    acc + (act.scenes?.reduce((sAcc: number, scene: any) =>
      sAcc + (scene.pages?.reduce((pAcc: number, page: any) =>
        pAcc + (page.panels?.length || 0), 0) || 0), 0) || 0), 0) || 0

  return (
    <div className="p-4 h-full flex flex-col">
      {/* Tab Navigation */}
      <div className="flex gap-1 mb-4 bg-[var(--bg-tertiary)] rounded-lg p-1 shrink-0">
        <button
          onClick={() => setActiveTab('context')}
          className={`flex-1 py-1.5 px-2 rounded text-xs transition-colors ${
            activeTab === 'context'
              ? 'bg-[var(--bg-tertiary)] text-white'
              : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
          }`}
        >
          Context
        </button>
        <button
          onClick={() => setActiveTab('characters')}
          className={`flex-1 py-1.5 px-2 rounded text-xs transition-colors ${
            activeTab === 'characters'
              ? 'bg-[var(--bg-tertiary)] text-white'
              : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
          }`}
        >
          Chars
        </button>
        <button
          onClick={() => setActiveTab('locations')}
          className={`flex-1 py-1.5 px-2 rounded text-xs transition-colors ${
            activeTab === 'locations'
              ? 'bg-[var(--bg-tertiary)] text-white'
              : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
          }`}
        >
          Locs
        </button>
        <button
          onClick={() => setActiveTab('visuals')}
          className={`flex-1 py-1.5 px-2 rounded text-xs transition-colors ${
            activeTab === 'visuals'
              ? 'bg-emerald-600 text-white'
              : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
          }`}
        >
          Pics
        </button>
        <button
          onClick={() => setActiveTab('alerts')}
          className={`flex-1 py-1.5 px-2 rounded text-xs transition-colors relative ${
            activeTab === 'alerts'
              ? 'bg-[var(--bg-tertiary)] text-white'
              : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
          }`}
        >
          Alerts
          {activeAlerts.length > 0 && (
            <span className="absolute -top-1 -right-1 w-4 h-4 bg-amber-500 text-black text-[10px] font-bold rounded-full flex items-center justify-center">
              {activeAlerts.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('pacing')}
          className={`flex-1 py-1.5 px-2 rounded text-xs transition-colors ${
            activeTab === 'pacing'
              ? 'bg-purple-600 text-white'
              : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
          }`}
        >
          Pace
        </button>
        <button
          onClick={() => setActiveTab('ai')}
          className={`flex-1 py-1.5 px-2 rounded text-xs transition-colors ${
            activeTab === 'ai'
              ? 'bg-blue-600 text-white'
              : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
          }`}
        >
          AI
        </button>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {/* Context Tab */}
        {activeTab === 'context' && (
          <div className="space-y-4 overflow-y-auto">
            {/* Issue Stats */}
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="bg-[var(--bg-tertiary)] rounded p-3">
                <div className="text-2xl font-bold">{issue.acts?.length || 0}</div>
                <div className="text-xs text-[var(--text-secondary)]">Acts</div>
              </div>
              <div className="bg-[var(--bg-tertiary)] rounded p-3">
                <div className="text-2xl font-bold">{totalPages}</div>
                <div className="text-xs text-[var(--text-secondary)]">Pages</div>
              </div>
              <div className="bg-[var(--bg-tertiary)] rounded p-3">
                <div className="text-2xl font-bold">{totalPanels}</div>
                <div className="text-xs text-[var(--text-secondary)]">Panels</div>
              </div>
            </div>

            {/* Issue Context */}
            <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-sm">Issue Context</h3>
                <button
                  onClick={() => setIsEditingContext(!isEditingContext)}
                  className="text-xs text-blue-400 hover:text-blue-300"
                >
                  {isEditingContext ? 'Cancel' : 'Edit'}
                </button>
              </div>

              {isEditingContext ? (
                <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
                  <div>
                    <label className="block text-xs text-[var(--text-secondary)] mb-1">Title</label>
                    <input
                      type="text"
                      value={contextForm.title}
                      onChange={(e) => setContextForm(prev => ({ ...prev, title: e.target.value }))}
                      placeholder="Issue title..."
                      className="w-full bg-[var(--bg-tertiary)] border border-[var(--border)] rounded px-3 py-2 text-sm focus:border-[var(--color-primary)] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-[var(--text-secondary)] mb-1">Tagline</label>
                    <input
                      type="text"
                      value={contextForm.tagline}
                      onChange={(e) => setContextForm(prev => ({ ...prev, tagline: e.target.value }))}
                      placeholder="One-line hook for this issue..."
                      className="w-full bg-[var(--bg-tertiary)] border border-[var(--border)] rounded px-3 py-2 text-sm focus:border-[var(--color-primary)] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-[var(--text-secondary)] mb-1">Summary (TL;DR)</label>
                    <textarea
                      value={contextForm.summary}
                      onChange={(e) => setContextForm(prev => ({ ...prev, summary: e.target.value }))}
                      placeholder="Brief summary of this issue..."
                      className="w-full bg-[var(--bg-tertiary)] border border-[var(--border)] rounded px-3 py-2 text-sm resize-none focus:border-[var(--color-primary)] focus:outline-none"
                      rows={2}
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-[var(--text-secondary)] mb-1">Themes</label>
                    <textarea
                      value={contextForm.themes}
                      onChange={(e) => setContextForm(prev => ({ ...prev, themes: e.target.value }))}
                      placeholder="Key themes explored..."
                      className="w-full bg-[var(--bg-tertiary)] border border-[var(--border)] rounded px-3 py-2 text-sm resize-none focus:border-[var(--color-primary)] focus:outline-none"
                      rows={2}
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-[var(--text-secondary)] mb-1">Stakes</label>
                    <textarea
                      value={contextForm.stakes}
                      onChange={(e) => setContextForm(prev => ({ ...prev, stakes: e.target.value }))}
                      placeholder="What's at risk in this issue..."
                      className="w-full bg-[var(--bg-tertiary)] border border-[var(--border)] rounded px-3 py-2 text-sm resize-none focus:border-[var(--color-primary)] focus:outline-none"
                      rows={2}
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-[var(--text-secondary)] mb-1">Outline Notes</label>
                    <textarea
                      value={contextForm.outline_notes}
                      onChange={(e) => setContextForm(prev => ({ ...prev, outline_notes: e.target.value }))}
                      placeholder="Working notes for this issue's outline..."
                      className="w-full bg-[var(--bg-tertiary)] border border-[var(--border)] rounded px-3 py-2 text-sm resize-none focus:border-[var(--color-primary)] focus:outline-none"
                      rows={3}
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-[var(--text-secondary)] mb-1">Motifs</label>
                    <textarea
                      value={contextForm.motifs}
                      onChange={(e) => setContextForm(prev => ({ ...prev, motifs: e.target.value }))}
                      placeholder="Visual/narrative motifs for this issue..."
                      className="w-full bg-[var(--bg-tertiary)] border border-[var(--border)] rounded px-3 py-2 text-sm resize-none focus:border-[var(--color-primary)] focus:outline-none"
                      rows={2}
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-[var(--text-secondary)] mb-1">Visual Style</label>
                    <textarea
                      value={contextForm.visual_style}
                      onChange={(e) => setContextForm(prev => ({ ...prev, visual_style: e.target.value }))}
                      placeholder="Visual style notes for artist..."
                      className="w-full bg-[var(--bg-tertiary)] border border-[var(--border)] rounded px-3 py-2 text-sm resize-none focus:border-[var(--color-primary)] focus:outline-none"
                      rows={2}
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-[var(--text-secondary)] mb-1">Issue Rules</label>
                    <textarea
                      value={contextForm.rules}
                      onChange={(e) => setContextForm(prev => ({ ...prev, rules: e.target.value }))}
                      placeholder="Issue-specific conventions (e.g., 9-panel grid for introspection)..."
                      className="w-full bg-[var(--bg-tertiary)] border border-[var(--border)] rounded px-3 py-2 text-sm resize-none focus:border-[var(--color-primary)] focus:outline-none"
                      rows={2}
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-[var(--text-secondary)] mb-1">Series Position</label>
                    <select
                      value={contextForm.series_act}
                      onChange={(e) => setContextForm(prev => ({ ...prev, series_act: e.target.value }))}
                      className="w-full bg-[var(--bg-tertiary)] border border-[var(--border)] rounded px-3 py-2 text-sm focus:border-[var(--color-primary)] focus:outline-none"
                    >
                      <option value="">Not set</option>
                      <option value="BEGINNING">Beginning (Act 1)</option>
                      <option value="MIDDLE">Middle (Act 2)</option>
                      <option value="END">End (Act 3)</option>
                    </select>
                  </div>
                  <button
                    onClick={saveContext}
                    disabled={saving}
                    className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-[var(--bg-tertiary)] py-2 rounded text-sm sticky bottom-0"
                  >
                    {saving ? 'Saving...' : 'Save Context'}
                  </button>
                </div>
              ) : (
                <div className="space-y-3 text-sm max-h-80 overflow-y-auto">
                  {issue.title && (
                    <div>
                      <span className="text-[var(--text-secondary)]">Title: </span>
                      <span>{issue.title}</span>
                    </div>
                  )}
                  {issue.tagline && (
                    <div className="italic text-[var(--text-secondary)]">&ldquo;{issue.tagline}&rdquo;</div>
                  )}
                  {issue.series_act && (
                    <div className="inline-block px-2 py-0.5 bg-[var(--bg-tertiary)] rounded text-xs">
                      Series {issue.series_act.toLowerCase()}
                    </div>
                  )}
                  {issue.summary && (
                    <div>
                      <span className="text-[var(--text-muted)] block text-xs mb-1">Summary</span>
                      <p className="text-[var(--text-secondary)]">{issue.summary}</p>
                    </div>
                  )}
                  {issue.themes && (
                    <div>
                      <span className="text-[var(--text-muted)] block text-xs mb-1">Themes</span>
                      <p className="text-[var(--text-secondary)]">{issue.themes}</p>
                    </div>
                  )}
                  {issue.stakes && (
                    <div>
                      <span className="text-[var(--text-muted)] block text-xs mb-1">Stakes</span>
                      <p className="text-[var(--text-secondary)]">{issue.stakes}</p>
                    </div>
                  )}
                  {issue.outline_notes && (
                    <div>
                      <span className="text-[var(--text-muted)] block text-xs mb-1">Outline Notes</span>
                      <p className="text-[var(--text-secondary)]">{issue.outline_notes}</p>
                    </div>
                  )}
                  {issue.motifs && (
                    <div>
                      <span className="text-[var(--text-muted)] block text-xs mb-1">Motifs</span>
                      <p className="text-[var(--text-secondary)]">{issue.motifs}</p>
                    </div>
                  )}
                  {issue.visual_style && (
                    <div>
                      <span className="text-[var(--text-muted)] block text-xs mb-1">Visual Style</span>
                      <p className="text-[var(--text-secondary)]">{issue.visual_style}</p>
                    </div>
                  )}
                  {issue.rules && (
                    <div>
                      <span className="text-[var(--text-muted)] block text-xs mb-1">Issue Rules</span>
                      <p className="text-[var(--text-secondary)]">{issue.rules}</p>
                    </div>
                  )}
                  {!issue.title && !issue.summary && !issue.themes && !issue.tagline && (
                    <p className="text-[var(--text-muted)] text-center py-2">
                      No context set. Click Edit to add details.
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Status */}
            <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg p-4">
              <h3 className="font-semibold text-sm mb-3">Status</h3>
              <select
                value={localStatus}
                onChange={async (e) => {
                  const newStatus = e.target.value
                  const previousStatus = localStatus

                  // Optimistic update FIRST
                  setLocalStatus(newStatus)

                  // Then persist to database
                  const supabase = createClient()
                  const { error } = await supabase
                    .from('issues')
                    .update({ status: newStatus })
                    .eq('id', issue.id)

                  if (error) {
                    // Rollback on error
                    setLocalStatus(previousStatus)
                    showToast('Failed to update status', 'error')
                  } else {
                    onRefresh?.()
                  }
                }}
                className="w-full bg-[var(--bg-tertiary)] border border-[var(--border)] rounded px-3 py-2 text-sm"
              >
                <option value="outline">Outline</option>
                <option value="drafting">Drafting</option>
                <option value="revision">Revision</option>
                <option value="complete">Complete</option>
              </select>
            </div>
          </div>
        )}

        {/* Characters Tab */}
        {activeTab === 'characters' && (
          <div className="space-y-2 overflow-y-auto flex-1">
            {selectedCharacter ? (
              /* Character Detail View */
              <div className="space-y-3">
                <button
                  onClick={() => setSelectedCharacterId(null)}
                  className="flex items-center gap-1 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
                >
                  <span>←</span> Back to list
                </button>

                <div className="space-y-3">
                  {/* Name */}
                  <div>
                    <label className="block text-xs text-[var(--text-muted)] mb-1">Name</label>
                    <input
                      type="text"
                      value={selectedCharacter.name || ''}
                      onChange={(e) => updateCharacterField('name', e.target.value)}
                      className="w-full bg-[var(--bg-tertiary)] border border-[var(--border)] rounded px-3 py-2 text-sm"
                    />
                  </div>

                  {/* Role */}
                  <div>
                    <label className="block text-xs text-[var(--text-muted)] mb-1">Role</label>
                    <input
                      type="text"
                      value={selectedCharacter.role || ''}
                      onChange={(e) => updateCharacterField('role', e.target.value)}
                      placeholder="e.g., Protagonist, Antagonist, Supporting"
                      className="w-full bg-[var(--bg-tertiary)] border border-[var(--border)] rounded px-3 py-2 text-sm"
                    />
                  </div>

                  {/* Description */}
                  <div>
                    <label className="block text-xs text-[var(--text-muted)] mb-1">Description</label>
                    <textarea
                      value={selectedCharacter.description || ''}
                      onChange={(e) => updateCharacterField('description', e.target.value)}
                      placeholder="Brief character description..."
                      rows={2}
                      className="w-full bg-[var(--bg-tertiary)] border border-[var(--border)] rounded px-3 py-2 text-sm resize-none"
                    />
                  </div>

                  {/* Visual Description */}
                  <div>
                    <label className="block text-xs text-[var(--text-muted)] mb-1">Visual Description</label>
                    <textarea
                      value={selectedCharacter.visual_description || ''}
                      onChange={(e) => updateCharacterField('visual_description', e.target.value)}
                      placeholder="Physical appearance, clothing, distinguishing features..."
                      rows={3}
                      className="w-full bg-[var(--bg-tertiary)] border border-[var(--border)] rounded px-3 py-2 text-sm resize-none"
                    />
                  </div>

                  {/* Personality Traits */}
                  <div>
                    <label className="block text-xs text-[var(--text-muted)] mb-1">Personality Traits</label>
                    <textarea
                      value={selectedCharacter.personality_traits || ''}
                      onChange={(e) => updateCharacterField('personality_traits', e.target.value)}
                      placeholder="Key personality characteristics..."
                      rows={2}
                      className="w-full bg-[var(--bg-tertiary)] border border-[var(--border)] rounded px-3 py-2 text-sm resize-none"
                    />
                  </div>

                  {/* Background */}
                  <div>
                    <label className="block text-xs text-[var(--text-muted)] mb-1">Background</label>
                    <textarea
                      value={selectedCharacter.background || ''}
                      onChange={(e) => updateCharacterField('background', e.target.value)}
                      placeholder="Character history and backstory..."
                      rows={3}
                      className="w-full bg-[var(--bg-tertiary)] border border-[var(--border)] rounded px-3 py-2 text-sm resize-none"
                    />
                  </div>

                  {/* Save indicator */}
                  <div className="text-xs text-[var(--text-muted)] text-right">
                    {characterSaving ? 'Saving...' : 'Auto-saves'}
                  </div>

                  {/* Delete button */}
                  <button
                    onClick={() => deleteCharacter(selectedCharacter.id)}
                    className="w-full mt-4 px-3 py-2 text-sm text-red-400 hover:text-red-300 hover:bg-red-900/20 rounded transition-colors"
                  >
                    Delete Character
                  </button>
                </div>
              </div>
            ) : (
              /* Character List View - Grouped by scene context */
              <>
                {localCharacters.length === 0 ? (
                  <p className="text-[var(--text-muted)] text-sm text-center py-4">
                    No characters defined yet. Add characters from the series page.
                  </p>
                ) : (
                  <div className="space-y-4">
                    {/* Characters in current scene */}
                    {sceneCharacters.length > 0 && (
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <h3 className="font-semibold text-xs text-emerald-400 uppercase tracking-wide">In This Scene</h3>
                          <span className="text-xs text-emerald-400/60">({sceneCharacters.length})</span>
                        </div>
                        <div className="space-y-1">
                          {sceneCharacters.map((char: any) => (
                            <button
                              key={char.id}
                              onClick={() => setSelectedCharacterId(char.id)}
                              className="w-full text-left bg-emerald-900/20 hover:bg-emerald-900/30 border border-emerald-700/30 rounded p-3 transition-colors group"
                            >
                              <div className="flex items-center justify-between">
                                <div className="font-medium text-sm text-emerald-100">{char.name}</div>
                                <span className="text-emerald-400/50 group-hover:text-emerald-400 transition-colors">→</span>
                              </div>
                              {char.role && (
                                <div className="text-xs text-emerald-300/70">{char.role}</div>
                              )}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Other characters */}
                    {otherCharacters.length > 0 && (
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <h3 className="font-semibold text-xs text-[var(--text-muted)] uppercase tracking-wide">
                            {sceneCharacters.length > 0 ? 'Other Characters' : 'All Characters'}
                          </h3>
                          <span className="text-xs text-[var(--text-muted)]">({otherCharacters.length})</span>
                        </div>
                        <div className="space-y-1">
                          {otherCharacters.map((char: any) => (
                            <button
                              key={char.id}
                              onClick={() => setSelectedCharacterId(char.id)}
                              className="w-full text-left bg-[var(--bg-tertiary)] hover:bg-[var(--bg-secondary)] rounded p-3 transition-colors group"
                            >
                              <div className="flex items-center justify-between">
                                <div className="font-medium text-sm">{char.name}</div>
                                <span className="text-[var(--text-muted)] group-hover:text-[var(--text-secondary)] transition-colors">→</span>
                              </div>
                              {char.role && (
                                <div className="text-xs text-[var(--text-secondary)]">{char.role}</div>
                              )}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Empty state when no page selected */}
                    {sceneCharacters.length === 0 && selectedPageContext && (
                      <p className="text-xs text-[var(--text-muted)] italic text-center py-2">
                        No characters have dialogue in this scene yet
                      </p>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Locations Tab */}
        {activeTab === 'locations' && (
          <div className="space-y-2 overflow-y-auto flex-1">
            {selectedLocation ? (
              /* Location Detail View */
              <div className="space-y-3">
                <button
                  onClick={() => setSelectedLocationId(null)}
                  className="flex items-center gap-1 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
                >
                  <span>←</span> Back to list
                </button>

                <div className="space-y-3">
                  {/* Name */}
                  <div>
                    <label className="block text-xs text-[var(--text-muted)] mb-1">Name</label>
                    <input
                      type="text"
                      value={selectedLocation.name || ''}
                      onChange={(e) => updateLocationField('name', e.target.value)}
                      className="w-full bg-[var(--bg-tertiary)] border border-[var(--border)] rounded px-3 py-2 text-sm"
                    />
                  </div>

                  {/* Description */}
                  <div>
                    <label className="block text-xs text-[var(--text-muted)] mb-1">Description</label>
                    <textarea
                      value={selectedLocation.description || ''}
                      onChange={(e) => updateLocationField('description', e.target.value)}
                      placeholder="What is this place? What happens here?"
                      rows={3}
                      className="w-full bg-[var(--bg-tertiary)] border border-[var(--border)] rounded px-3 py-2 text-sm resize-none"
                    />
                  </div>

                  {/* Visual Description */}
                  <div>
                    <label className="block text-xs text-[var(--text-muted)] mb-1">Visual Description</label>
                    <textarea
                      value={selectedLocation.visual_description || ''}
                      onChange={(e) => updateLocationField('visual_description', e.target.value)}
                      placeholder="How does this place look? Key visual elements..."
                      rows={3}
                      className="w-full bg-[var(--bg-tertiary)] border border-[var(--border)] rounded px-3 py-2 text-sm resize-none"
                    />
                  </div>

                  {/* Mood/Atmosphere */}
                  <div>
                    <label className="block text-xs text-[var(--text-muted)] mb-1">Mood / Atmosphere</label>
                    <textarea
                      value={selectedLocation.mood || ''}
                      onChange={(e) => updateLocationField('mood', e.target.value)}
                      placeholder="What's the feeling of this place?"
                      rows={2}
                      className="w-full bg-[var(--bg-tertiary)] border border-[var(--border)] rounded px-3 py-2 text-sm resize-none"
                    />
                  </div>

                  {/* Save indicator */}
                  <div className="text-xs text-[var(--text-muted)] text-right">
                    {locationSaving ? 'Saving...' : 'Auto-saves'}
                  </div>

                  {/* Delete button */}
                  <button
                    onClick={() => deleteLocation(selectedLocation.id)}
                    className="w-full mt-4 px-3 py-2 text-sm text-red-400 hover:text-red-300 hover:bg-red-900/20 rounded transition-colors"
                  >
                    Delete Location
                  </button>
                </div>
              </div>
            ) : (
              /* Location List View */
              <>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-semibold text-sm text-[var(--text-secondary)]">Series Locations</h3>
                </div>
                {localLocations.length === 0 ? (
                  <p className="text-[var(--text-muted)] text-sm text-center py-4">
                    No locations defined yet. Add locations from the series page.
                  </p>
                ) : (
                  <div className="space-y-1">
                    {localLocations.map((loc: any) => (
                      <button
                        key={loc.id}
                        onClick={() => setSelectedLocationId(loc.id)}
                        className="w-full text-left bg-[var(--bg-tertiary)] hover:bg-[var(--bg-secondary)] rounded p-3 transition-colors group"
                      >
                        <div className="flex items-center justify-between">
                          <div className="font-medium text-sm">{loc.name}</div>
                          <span className="text-[var(--text-muted)] group-hover:text-[var(--text-secondary)] transition-colors">→</span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Visuals Tab */}
        {activeTab === 'visuals' && (
          <div className="flex flex-col h-full overflow-hidden">
            {/* Filter buttons */}
            <div className="flex gap-1 mb-3 bg-[var(--bg-secondary)] rounded p-1 shrink-0">
              <button
                onClick={() => setVisualsFilter('all')}
                className={`flex-1 py-1 px-2 rounded text-xs transition-colors ${
                  visualsFilter === 'all'
                    ? 'bg-emerald-600 text-white'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                All
              </button>
              <button
                onClick={() => setVisualsFilter('characters')}
                className={`flex-1 py-1 px-2 rounded text-xs transition-colors ${
                  visualsFilter === 'characters'
                    ? 'bg-blue-600 text-white'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                Characters
              </button>
              <button
                onClick={() => setVisualsFilter('locations')}
                className={`flex-1 py-1 px-2 rounded text-xs transition-colors ${
                  visualsFilter === 'locations'
                    ? 'bg-purple-600 text-white'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                Locations
              </button>
            </div>

            {/* Image grid or detail view */}
            {selectedVisual ? (
              /* Full image view */
              <div className="flex flex-col h-full">
                <button
                  onClick={() => setSelectedVisual(null)}
                  className="flex items-center gap-1 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] mb-2 shrink-0"
                >
                  <span>←</span> Back to gallery
                </button>
                <div className="flex-1 overflow-hidden rounded-lg">
                  <img
                    src={selectedVisual.url}
                    alt={selectedVisual.entityName}
                    className="w-full h-full object-contain bg-black/20 rounded-lg"
                  />
                </div>
                <div className="mt-2 shrink-0">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs px-2 py-0.5 rounded ${
                      selectedVisual.entityType === 'character'
                        ? 'bg-blue-900/50 text-blue-300'
                        : 'bg-purple-900/50 text-purple-300'
                    }`}>
                      {selectedVisual.entityType}
                    </span>
                    <span className="font-medium text-sm">{selectedVisual.entityName}</span>
                    {selectedVisual.is_primary && (
                      <span className="text-xs text-emerald-400">★ Primary</span>
                    )}
                  </div>
                  {selectedVisual.caption && (
                    <p className="text-xs text-[var(--text-secondary)] mt-1">{selectedVisual.caption}</p>
                  )}
                </div>
              </div>
            ) : visualsLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : filteredVisuals.length === 0 ? (
              <div className="text-center py-8">
                <div className="text-4xl mb-3 opacity-30">🖼️</div>
                <p className="text-[var(--text-secondary)] text-sm">
                  {visuals.length === 0
                    ? 'No reference images yet'
                    : `No ${visualsFilter} images`}
                </p>
                <p className="text-[var(--text-muted)] text-xs mt-1">
                  Add images from the Characters or Locations pages
                </p>
                <button
                  onClick={fetchVisuals}
                  className="mt-3 text-xs text-emerald-400 hover:text-emerald-300"
                >
                  Refresh
                </button>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto">
                <div className="grid grid-cols-3 gap-2">
                  {filteredVisuals.map((visual) => (
                    <button
                      key={visual.id}
                      onClick={() => setSelectedVisual(visual)}
                      className="relative aspect-square rounded-lg overflow-hidden group border-2 border-transparent hover:border-emerald-500/50 transition-all"
                    >
                      <img
                        src={visual.url}
                        alt={visual.entityName}
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                      <div className="absolute bottom-0 left-0 right-0 p-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <div className={`text-[10px] px-1 py-0.5 rounded inline-block ${
                          visual.entityType === 'character'
                            ? 'bg-blue-600'
                            : 'bg-purple-600'
                        }`}>
                          {visual.entityName}
                        </div>
                      </div>
                      {visual.is_primary && (
                        <div className="absolute top-1 right-1 w-4 h-4 bg-emerald-500 rounded-full flex items-center justify-center text-[10px]">
                          ★
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Alerts Tab */}
        {activeTab === 'alerts' && (
          <div className="space-y-3 overflow-y-auto">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold text-sm text-[var(--text-secondary)]">Continuity Alerts</h3>
              {dismissedAlerts.size > 0 && (
                <button
                  onClick={clearDismissed}
                  className="text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
                >
                  Show dismissed ({dismissedAlerts.size})
                </button>
              )}
            </div>

            {activeAlerts.length === 0 ? (
              <div className="text-center py-8">
                <div className="text-green-400 text-2xl mb-2">✓</div>
                <p className="text-[var(--text-secondary)] text-sm">No issues detected</p>
                <p className="text-[var(--text-muted)] text-xs mt-1">
                  {dismissedAlerts.size > 0
                    ? `${dismissedAlerts.size} dismissed`
                    : 'Your issue looks good!'}
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {activeAlerts.map((alert) => (
                  <div
                    key={alert.id}
                    className={`rounded-lg p-3 border ${
                      alert.severity === 'warning'
                        ? 'bg-amber-900/20 border-amber-700/50'
                        : 'bg-blue-900/20 border-blue-700/50'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${
                            alert.severity === 'warning'
                              ? 'bg-amber-500/20 text-amber-400'
                              : 'bg-blue-500/20 text-blue-400'
                          }`}>
                            {alert.type}
                          </span>
                          <span className={`text-sm font-medium ${
                            alert.severity === 'warning' ? 'text-amber-300' : 'text-blue-300'
                          }`}>
                            {alert.message}
                          </span>
                        </div>
                        <p className="text-xs text-[var(--text-secondary)]">{alert.details}</p>
                      </div>
                      <button
                        onClick={() => dismissAlert(alert.id)}
                        className="text-[var(--text-muted)] hover:text-[var(--text-secondary)] text-sm shrink-0"
                        title="Dismiss"
                      >
                        ×
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="pt-4 border-t border-[var(--border)]">
              <a
                href={`/series/${issue.series.id}/continuity`}
                className="text-xs text-blue-400 hover:text-blue-300"
              >
                Run full continuity check →
              </a>
            </div>
          </div>
        )}

        {/* Pacing Analysis Tab */}
        {activeTab === 'pacing' && (
          <div className="overflow-y-auto">
            <PacingAnalyst
              pages={
                issue.acts?.flatMap((act: any) =>
                  act.scenes?.flatMap((scene: any) =>
                    scene.pages?.map((page: any) => ({
                      id: page.id,
                      page_number: page.page_number,
                      panels: page.panels || [],
                    })) || []
                  ) || []
                ) || []
              }
              onPageClick={(pageId) => {
                // Find the page and trigger navigation if callback provided
                console.log('Navigate to page:', pageId)
              }}
            />
          </div>
        )}

        {/* AI Chat Tab */}
        {activeTab === 'ai' && (
          <div className="flex flex-col h-full">
            {/* Mode Toggle & Current Scope */}
            <div className="mb-3 space-y-2 shrink-0">
              {/* Mode Toggle */}
              <div className="flex gap-1 bg-[var(--bg-secondary)] rounded-lg p-1">
                <button
                  onClick={() => setAiMode('outline')}
                  className={`flex-1 py-1.5 px-2 rounded text-xs font-medium transition-colors ${
                    aiMode === 'outline'
                      ? 'bg-purple-600 text-white'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  Outline Mode
                </button>
                <button
                  onClick={() => setAiMode('draft')}
                  className={`flex-1 py-1.5 px-2 rounded text-xs font-medium transition-colors ${
                    aiMode === 'draft'
                      ? 'bg-green-600 text-white'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  Draft Mode
                </button>
              </div>

              {/* Current Scope Indicator */}
              {selectedPageContext && (
                <div className="text-xs text-[var(--text-muted)] bg-[var(--bg-secondary)] rounded px-3 py-2">
                  <span className="text-[var(--text-secondary)]">Working on:</span>{' '}
                  <span className="text-[var(--text-secondary)]">
                    {selectedPageContext.act.name || `Act ${selectedPageContext.act.sort_order + 1}`}
                  </span>
                  {' › '}
                  <span className="text-[var(--text-secondary)]">
                    {selectedPageContext.scene.title || selectedPageContext.scene.name || 'Scene'}
                  </span>
                  {' › '}
                  <span className="text-[var(--text-secondary)]">
                    Page {selectedPageContext.page.page_number}
                  </span>
                </div>
              )}
            </div>

            {/* Chat Messages */}
            <div className="flex-1 overflow-y-auto space-y-3 mb-3">
              {chatMessages.length === 0 ? (
                <div className="text-center py-6 px-4">
                  <div className="text-3xl mb-3 opacity-30">
                    {aiMode === 'outline' ? '🧠' : '✍️'}
                  </div>
                  <p className="text-[var(--text-secondary)] text-sm mb-2">
                    {aiMode === 'outline' ? 'AI Outline Partner' : 'AI Writing Partner'}
                  </p>
                  <p className="text-[var(--text-muted)] text-xs mb-4">
                    {aiMode === 'outline'
                      ? 'Work out your story from the top down. The AI will push you to clarify your ideas and can save them to your outline.'
                      : 'Get help writing panel descriptions, dialogue, and captions for your script.'
                    }
                  </p>
                  <div className="text-xs text-[var(--text-muted)] space-y-1.5 text-left bg-[var(--bg-tertiary)]/50 rounded-lg p-3">
                    {aiMode === 'outline' ? (
                      <>
                        <p>• "What should this scene accomplish?"</p>
                        <p>• "Help me work out the act breaks"</p>
                        <p>• "What's the emotional beat of this page?"</p>
                        <p>• "Push me on the theme of this issue"</p>
                      </>
                    ) : (
                      <>
                        <p>• "Write dialogue for a tense confrontation"</p>
                        <p>• "Describe a dramatic establishing shot"</p>
                        <p>• "Suggest pacing for this action sequence"</p>
                        <p>• "Help with character's inner monologue"</p>
                      </>
                    )}
                  </div>
                </div>
              ) : (
                chatMessages.map((msg, i) => (
                  <div
                    key={i}
                    className={`rounded-lg text-sm ${
                      msg.role === 'user'
                        ? 'bg-blue-900/30 ml-4 p-3'
                        : 'bg-[var(--bg-tertiary)] mr-2 p-3'
                    }`}
                  >
                    <p className="text-xs text-[var(--text-muted)] mb-1">
                      {msg.role === 'user' ? 'You' : 'AI Writing Partner'}
                    </p>
                    <p className="whitespace-pre-wrap">{msg.content}</p>

                    {/* AI Suggestions */}
                    {msg.suggestions && msg.suggestions.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-[var(--border)] space-y-2">
                        <p className="text-xs text-[var(--text-secondary)]">Save to document:</p>
                        {msg.suggestions.map((suggestion, idx) => {
                          const isOutline = ['act_intention', 'scene_intention', 'page_intention', 'scene_summary', 'act_beat'].includes(suggestion.type)
                          const isDialogue = suggestion.type === 'dialogue'
                          const isCaption = suggestion.type === 'caption'
                          const isPanelDesc = suggestion.type === 'panel_description'

                          return (
                            <button
                              key={idx}
                              onClick={() => applySuggestion(suggestion)}
                              className={`w-full text-left p-2 rounded text-xs transition-colors ${
                                isOutline
                                  ? 'bg-purple-900/30 hover:bg-purple-900/50 border border-purple-700/50'
                                  : isDialogue
                                    ? 'bg-blue-900/30 hover:bg-blue-900/50 border border-blue-700/50'
                                    : isCaption
                                      ? 'bg-amber-900/30 hover:bg-amber-900/50 border border-amber-700/50'
                                      : 'bg-green-900/30 hover:bg-green-900/50 border border-green-700/50'
                              }`}
                            >
                              <span className={`font-medium ${
                                isOutline ? 'text-purple-300'
                                  : isDialogue ? 'text-blue-300'
                                    : isCaption ? 'text-amber-300'
                                      : 'text-green-300'
                              }`}>
                                {isOutline ? '📋' : isDialogue ? '💬' : isCaption ? '📝' : '🎬'}{' '}
                                {suggestion.type.replace(/_/g, ' ')} → {suggestion.targetLabel}
                              </span>
                              <p className="text-[var(--text-secondary)] mt-1 line-clamp-2">{suggestion.content}</p>
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </div>
                ))
              )}
              {isLoading && (
                <div className="bg-[var(--bg-tertiary)] p-3 rounded-lg mr-4">
                  <p className="text-xs text-[var(--text-muted)] mb-1">AI Writing Partner</p>
                  <p className="text-[var(--text-secondary)]">Thinking...</p>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Chat Input */}
            <div className="shrink-0">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendMessage()}
                  placeholder={aiMode === 'outline' ? "Work out your story..." : "Ask for writing help..."}
                  className="flex-1 bg-[var(--bg-tertiary)] border border-[var(--border)] rounded px-3 py-2 text-sm focus:border-[var(--color-primary)] focus:outline-none"
                  disabled={isLoading}
                />
                <button
                  onClick={sendMessage}
                  disabled={isLoading || !chatInput.trim()}
                  className="bg-blue-600 hover:bg-blue-700 disabled:bg-[var(--bg-tertiary)] px-4 py-2 rounded text-sm shrink-0"
                >
                  Send
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
