'use client'

import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/contexts/ToastContext'
import { getImageUrl } from '@/lib/supabase/storage'
import { parseSSEData, type ToolUseSSEEvent } from '@/lib/ai/streaming'
import PacingAnalyst from '@/components/PacingAnalyst'
import ChatMessageContent from '@/components/ChatMessageContent'
import ConfirmDialog, { useConfirmDialog } from '@/components/ui/ConfirmDialog'
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
  act: { id: string; name: string; number?: number; sort_order: number; title?: string; intention?: string; beat_summary?: string }
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

interface ToolProposal {
  toolUseId: string
  toolName: string
  input: Record<string, unknown>
  status: 'streaming' | 'pending' | 'executing' | 'completed' | 'dismissed'
}

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  isError?: boolean
  toolProposals?: ToolProposal[]
}

// Tool display config
const TOOL_DISPLAY: Record<string, { icon: string; label: string; color: string }> = {
  create_character: { icon: '👤', label: 'Create Character', color: 'var(--color-primary)' },
  update_character: { icon: '👤', label: 'Update Character', color: 'var(--color-primary)' },
  create_location: { icon: '📍', label: 'Create Location', color: 'var(--color-success)' },
  create_plotline: { icon: '🧵', label: 'Create Plotline', color: 'var(--accent-hover)' },
  save_canvas_beat: { icon: '💡', label: 'Save to Canvas', color: 'var(--color-warning)' },
  add_panel_note: { icon: '📝', label: 'Add Panel Note', color: 'var(--color-info)' },
  update_scene_metadata: { icon: '🎬', label: 'Update Scene', color: 'var(--accent-hover)' },
  draft_panel_description: { icon: '🎨', label: 'Draft Panel', color: 'var(--color-success)' },
  add_dialogue: { icon: '💬', label: 'Add Dialogue', color: 'var(--color-primary)' },
  save_project_note: { icon: '📌', label: 'Save Note', color: 'var(--color-warning)' },
  generate_power_rankings: { icon: '🏆', label: 'Power Rankings', color: 'var(--accent-hover)' },
  track_character_state: { icon: '🎭', label: 'Track Character State', color: 'var(--color-primary)' },
  continuity_check: { icon: '🔍', label: 'Continuity Check', color: 'var(--color-error)' },
  extract_outline: { icon: '📋', label: 'Extract Outline', color: 'var(--color-info)' },
  draft_scene_summary: { icon: '📄', label: 'Scene Summary', color: 'var(--color-success)' },
}

function getToolSummary(toolName: string, input: Record<string, unknown>): string {
  switch (toolName) {
    case 'create_character':
      return `Create character: ${input.display_name || input.name}`
    case 'update_character':
      return `Update character details`
    case 'create_location':
      return `Create location: ${input.name}`
    case 'create_plotline':
      return `Create plotline: ${input.name}`
    case 'save_canvas_beat':
      return `Save to canvas: "${input.title}"`
    case 'add_panel_note':
      return `Add editorial note to panel`
    case 'update_scene_metadata':
      return `Update scene: ${input.title || 'metadata'}`
    case 'draft_panel_description':
      return `Draft panel description`
    case 'add_dialogue':
      return `Add dialogue for ${input.speaker_name}`
    case 'save_project_note':
      return `Save project note`
    case 'generate_power_rankings':
      return `Analyze and rank ${(input.issueIds as string[] || []).length} issues`
    case 'track_character_state':
      return `Track state: ${input.emotional_state || 'character state'}`
    case 'continuity_check':
      return `Run ${input.scope || 'issue'}-level continuity check`
    case 'extract_outline':
      return `Extract outline from script`
    case 'draft_scene_summary':
      return `Summarize scene content`
    default:
      return toolName.replace(/_/g, ' ')
  }
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
  const { confirm: confirmDialog, dialogProps } = useConfirmDialog()

  // Character and Location detail panel state
  const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(null)
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(null)
  const [localCharacters, setLocalCharacters] = useState(issue.series.characters)
  const [localLocations, setLocalLocations] = useState(issue.series.locations)
  const [characterSaving, setCharacterSaving] = useState(false)
  const [showAllCharacters, setShowAllCharacters] = useState(false)
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

  // Helper: find character IDs mentioned in a visual description by name matching
  const findCharacterIdsInText = useCallback((text: string | null | undefined): string[] => {
    if (!text) return []
    const upper = text.toUpperCase()
    const found: string[] = []
    for (const char of localCharacters) {
      const name = (char.display_name || char.name || '').toUpperCase()
      if (name && upper.includes(name)) found.push(char.id)
    }
    return found
  }, [localCharacters])

  // Compute characters/locations in current scene for contextual filtering
  const sceneCharacterIds = useMemo(() => {
    if (!selectedPageContext?.scene?.id) return new Set<string>()

    const characterIds = new Set<string>()

    // Find all pages in the current scene
    for (const act of issue.acts || []) {
      for (const scene of act.scenes || []) {
        if (scene.id === selectedPageContext.scene.id) {
          for (const page of scene.pages || []) {
            for (const panel of page.panels || []) {
              // From dialogue blocks
              for (const dialogue of panel.dialogue_blocks || []) {
                if (dialogue.character_id) {
                  characterIds.add(dialogue.character_id)
                }
              }
              // From visual descriptions (name matching)
              for (const id of findCharacterIdsInText(panel.visual_description)) {
                characterIds.add(id)
              }
            }
          }
        }
      }
    }

    return characterIds
  }, [issue.acts, selectedPageContext?.scene?.id, findCharacterIdsInText])

  // Compute characters on the current page (from dialogue + visual descriptions)
  const pageCharacterIds = useMemo(() => {
    if (!selectedPageContext?.page?.panels) return new Set<string>()
    const ids = new Set<string>()
    for (const panel of selectedPageContext.page.panels) {
      // From dialogue blocks
      for (const dlg of panel.dialogue_blocks || []) {
        if (dlg.character_id) ids.add(dlg.character_id)
      }
      // From visual descriptions (name matching)
      for (const id of findCharacterIdsInText(panel.visual_description)) {
        ids.add(id)
      }
    }
    return ids
  }, [selectedPageContext?.page?.panels, findCharacterIdsInText])

  // Split characters into three groups: on page / in scene / other
  const { pageCharacters, sceneCharacters, otherCharacters } = useMemo(() => {
    const onPage: any[] = []
    const inScene: any[] = []
    const other: any[] = []

    for (const char of localCharacters) {
      if (pageCharacterIds.has(char.id)) {
        onPage.push(char)
      } else if (sceneCharacterIds.has(char.id)) {
        inScene.push(char)
      } else {
        other.push(char)
      }
    }

    return { pageCharacters: onPage, sceneCharacters: inScene, otherCharacters: other }
  }, [localCharacters, pageCharacterIds, sceneCharacterIds])

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
  const [streamingText, setStreamingText] = useState('')
  const [streamingToolProposals, setStreamingToolProposals] = useState<ToolProposal[]>([])
  const chatEndRef = useRef<HTMLDivElement>(null)
  const chatContainerRef = useRef<HTMLDivElement>(null)
  const abortControllerRef = useRef<AbortController | null>(null)
  const conversationIdRef = useRef<string | null>(null)
  const userScrolledUpRef = useRef(false)

  // Smart auto-scroll: only scroll if user is near the bottom
  useEffect(() => {
    if (!userScrolledUpRef.current) {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [chatMessages, streamingText])

  // Always scroll to bottom when user sends a message
  useEffect(() => {
    userScrolledUpRef.current = false
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages.length])

  // Trigger conversation synthesis on unmount or when chat is cleared
  useEffect(() => {
    return () => {
      const convId = conversationIdRef.current
      if (convId) {
        // Fire and forget — synthesize the conversation
        fetch('/api/ai/synthesize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ conversationId: convId }),
        }).catch(() => {})
      }
    }
  }, [])

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
    const description = dialogueCount > 0
      ? `This character has ${dialogueCount} dialogue${dialogueCount > 1 ? 's' : ''} assigned. Dialogues will become unassigned.`
      : 'This character will be permanently removed.'

    const confirmed = await confirmDialog({
      title: 'Delete this character?',
      description,
      confirmLabel: 'Delete',
      variant: 'danger',
    })
    if (!confirmed) return

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
    const confirmed = await confirmDialog({
      title: 'Delete this location?',
      description: 'This location will be permanently removed.',
      confirmLabel: 'Delete',
      variant: 'danger',
    })
    if (!confirmed) return

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
  // Handle tool proposal confirm/dismiss
  const handleToolProposal = async (
    proposal: ToolProposal,
    confirmed: boolean,
    messageIndex: number
  ) => {
    // Find the assistant message text that preceded this tool call
    const assistantMsg = chatMessages[messageIndex]
    if (!assistantMsg) return

    // Update proposal status
    setChatMessages(prev => prev.map((msg, idx) => {
      if (idx !== messageIndex || !msg.toolProposals) return msg
      return {
        ...msg,
        toolProposals: msg.toolProposals.map(tp =>
          tp.toolUseId === proposal.toolUseId
            ? { ...tp, status: confirmed ? 'executing' as const : 'dismissed' as const }
            : tp
        ),
      }
    }))

    if (!confirmed) return

    // Build prior message history (text-only messages before this one)
    const priorMessages = chatMessages
      .slice(0, messageIndex)
      .map(m => ({ role: m.role, content: m.content }))

    setIsLoading(true)
    setStreamingText('')
    setStreamingToolProposals([])

    try {
      const response = await fetch('/api/ai/tool-result', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: priorMessages,
          assistantText: assistantMsg.content,
          toolUseId: proposal.toolUseId,
          toolName: proposal.toolName,
          toolInput: proposal.input,
          confirmed,
          seriesId: issue.series.id,
          issueId: issue.id,
          pageId: selectedPageContext?.page?.id,
        }),
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      // Mark the tool as completed
      setChatMessages(prev => prev.map((msg, idx) => {
        if (idx !== messageIndex || !msg.toolProposals) return msg
        return {
          ...msg,
          toolProposals: msg.toolProposals.map(tp =>
            tp.toolUseId === proposal.toolUseId
              ? { ...tp, status: 'completed' as const }
              : tp
          ),
        }
      }))

      // Process SSE stream for the continuation
      await processSSEStream(response)
      onRefresh?.()
    } catch (error) {
      setChatMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Failed to process tool result. Please try again.',
      }])
    }

    setIsLoading(false)
  }

  // Process an SSE stream response and update state
  const processSSEStream = async (response: Response) => {
    const reader = response.body?.getReader()
    if (!reader) return

    const decoder = new TextDecoder()
    let buffer = ''
    let fullText = ''
    const toolProposals: ToolProposal[] = []

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const data = line.slice(6)

          const parsed = parseSSEData(data)

          if (parsed.done) break

          if (parsed.error) {
            setChatMessages(prev => [...prev, {
              role: 'assistant',
              content: `Error: ${parsed.error}`,
            }])
            return
          }

          if (parsed.content) {
            fullText += parsed.content
            setStreamingText(fullText)
          }

          if (parsed.toolUse) {
            const toolEvent = parsed.toolUse
            if (toolEvent.event === 'start') {
              toolProposals.push({
                toolUseId: toolEvent.toolUseId,
                toolName: toolEvent.toolName,
                input: {},
                status: 'streaming',
              })
              setStreamingToolProposals([...toolProposals])
            } else if (toolEvent.event === 'complete') {
              const idx = toolProposals.findIndex(tp => tp.toolUseId === toolEvent.toolUseId)
              if (idx >= 0) {
                toolProposals[idx] = {
                  ...toolProposals[idx],
                  input: (toolEvent as ToolUseSSEEvent & { input: Record<string, unknown> }).input,
                  status: 'pending',
                }
                setStreamingToolProposals([...toolProposals])
              }
            }
          }
        }
      }
    } finally {
      reader.releaseLock()
    }

    // Finalize the message
    setChatMessages(prev => [...prev, {
      role: 'assistant',
      content: fullText,
      toolProposals: toolProposals.length > 0 ? toolProposals : undefined,
    }])
    setStreamingText('')
    setStreamingToolProposals([])
  }

  const sendMessage = async () => {
    if (!chatInput.trim() || isLoading) return

    const userMessage = chatInput.trim()
    setChatInput('')
    setChatMessages(prev => [...prev, { role: 'user', content: userMessage }])
    setIsLoading(true)
    setStreamingText('')
    setStreamingToolProposals([])

    try {
      // Build message history for the API
      const allMessages = [
        ...chatMessages.map(m => ({ role: m.role, content: m.content })),
        { role: 'user' as const, content: userMessage },
      ]

      const controller = new AbortController()
      abortControllerRef.current = controller

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: allMessages,
          seriesId: issue.series.id,
          issueId: issue.id,
          pageId: selectedPageContext?.page?.id,
          mode: 'ask',
          conversationId: conversationIdRef.current,
        }),
        signal: controller.signal,
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(errorText || `HTTP ${response.status}`)
      }

      // Capture conversation ID for synthesis on unmount
      const convId = response.headers.get('X-Conversation-Id')
      if (convId) {
        conversationIdRef.current = convId
      }

      // Process the SSE stream
      await processSSEStream(response)
    } catch (error) {
      if ((error as Error).name === 'AbortError') return

      setChatMessages(prev => [...prev, {
        role: 'assistant',
        content: error instanceof Error ? error.message : 'Failed to connect to AI assistant.',
        isError: true,
      }])
    }

    setIsLoading(false)
    abortControllerRef.current = null
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
      <ConfirmDialog {...dialogProps} />
      {/* Tab Navigation */}
      <div className="flex gap-0 mb-4 border-b border-[var(--border)] shrink-0">
        {([
          { key: 'context', label: 'CTX' },
          { key: 'characters', label: 'CHAR' },
          { key: 'locations', label: 'LOC' },
          { key: 'visuals', label: 'VIS' },
          { key: 'alerts', label: 'ALRT' },
          { key: 'pacing', label: 'PACE' },
          { key: 'ai', label: 'AI' },
        ] as const).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`flex-1 py-2 px-1 type-micro transition-colors relative ${
              activeTab === key
                ? 'text-[var(--text-primary)] border-b-2 border-[var(--text-primary)]'
                : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
            }`}
          >
            {label}
            {key === 'alerts' && activeAlerts.length > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-[var(--color-warning)]" aria-label={`${activeAlerts.length} alerts`} />
            )}
          </button>
        ))}
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {/* Context Tab */}
        {activeTab === 'context' && (
          <div className="space-y-4 overflow-y-auto">
            {/* Issue Stats */}
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="bg-[var(--bg-tertiary)] p-3">
                <div className="text-3xl font-black">{issue.acts?.length || 0}</div>
                <div className="type-micro">ACTS</div>
              </div>
              <div className="bg-[var(--bg-tertiary)] p-3">
                <div className="text-3xl font-black">{totalPages}</div>
                <div className="type-micro">PAGES</div>
              </div>
              <div className="bg-[var(--bg-tertiary)] p-3">
                <div className="text-3xl font-black">{totalPanels}</div>
                <div className="type-micro">PANELS</div>
              </div>
            </div>

            {/* Issue Context */}
            <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="type-label">ISSUE CONTEXT</h3>
                <button
                  onClick={() => setIsEditingContext(!isEditingContext)}
                  className="text-xs text-[var(--color-primary)] hover:opacity-80"
                >
                  {isEditingContext ? 'Cancel' : 'Edit'}
                </button>
              </div>

              {isEditingContext ? (
                <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
                  <div>
                    <label className="block type-micro text-[var(--text-muted)] mb-1">Title</label>
                    <input
                      type="text"
                      value={contextForm.title}
                      onChange={(e) => setContextForm(prev => ({ ...prev, title: e.target.value }))}
                      placeholder="Issue title..."
                      className="w-full bg-[var(--bg-tertiary)] border border-[var(--border)] rounded px-3 py-2 text-sm focus:border-[var(--color-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]/50"
                    />
                  </div>
                  <div>
                    <label className="block type-micro text-[var(--text-muted)] mb-1">Tagline</label>
                    <input
                      type="text"
                      value={contextForm.tagline}
                      onChange={(e) => setContextForm(prev => ({ ...prev, tagline: e.target.value }))}
                      placeholder="One-line hook for this issue..."
                      className="w-full bg-[var(--bg-tertiary)] border border-[var(--border)] rounded px-3 py-2 text-sm focus:border-[var(--color-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]/50"
                    />
                  </div>
                  <div>
                    <label className="block type-micro text-[var(--text-muted)] mb-1">Summary (TL;DR)</label>
                    <textarea
                      value={contextForm.summary}
                      onChange={(e) => setContextForm(prev => ({ ...prev, summary: e.target.value }))}
                      placeholder="Brief summary of this issue..."
                      className="w-full bg-[var(--bg-tertiary)] border border-[var(--border)] rounded px-3 py-2 text-sm resize-none focus:border-[var(--color-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]/50"
                      rows={2}
                    />
                  </div>
                  <div>
                    <label className="block type-micro text-[var(--text-muted)] mb-1">Themes</label>
                    <textarea
                      value={contextForm.themes}
                      onChange={(e) => setContextForm(prev => ({ ...prev, themes: e.target.value }))}
                      placeholder="Key themes explored..."
                      className="w-full bg-[var(--bg-tertiary)] border border-[var(--border)] rounded px-3 py-2 text-sm resize-none focus:border-[var(--color-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]/50"
                      rows={2}
                    />
                  </div>
                  <div>
                    <label className="block type-micro text-[var(--text-muted)] mb-1">Stakes</label>
                    <textarea
                      value={contextForm.stakes}
                      onChange={(e) => setContextForm(prev => ({ ...prev, stakes: e.target.value }))}
                      placeholder="What's at risk in this issue..."
                      className="w-full bg-[var(--bg-tertiary)] border border-[var(--border)] rounded px-3 py-2 text-sm resize-none focus:border-[var(--color-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]/50"
                      rows={2}
                    />
                  </div>
                  <div>
                    <label className="block type-micro text-[var(--text-muted)] mb-1">Outline Notes</label>
                    <textarea
                      value={contextForm.outline_notes}
                      onChange={(e) => setContextForm(prev => ({ ...prev, outline_notes: e.target.value }))}
                      placeholder="Working notes for this issue's outline..."
                      className="w-full bg-[var(--bg-tertiary)] border border-[var(--border)] rounded px-3 py-2 text-sm resize-none focus:border-[var(--color-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]/50"
                      rows={3}
                    />
                  </div>
                  <div>
                    <label className="block type-micro text-[var(--text-muted)] mb-1">Motifs</label>
                    <textarea
                      value={contextForm.motifs}
                      onChange={(e) => setContextForm(prev => ({ ...prev, motifs: e.target.value }))}
                      placeholder="Visual/narrative motifs for this issue..."
                      className="w-full bg-[var(--bg-tertiary)] border border-[var(--border)] rounded px-3 py-2 text-sm resize-none focus:border-[var(--color-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]/50"
                      rows={2}
                    />
                  </div>
                  <div>
                    <label className="block type-micro text-[var(--text-muted)] mb-1">Visual Style</label>
                    <textarea
                      value={contextForm.visual_style}
                      onChange={(e) => setContextForm(prev => ({ ...prev, visual_style: e.target.value }))}
                      placeholder="Visual style notes for artist..."
                      className="w-full bg-[var(--bg-tertiary)] border border-[var(--border)] rounded px-3 py-2 text-sm resize-none focus:border-[var(--color-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]/50"
                      rows={2}
                    />
                  </div>
                  <div>
                    <label className="block type-micro text-[var(--text-muted)] mb-1">Issue Rules</label>
                    <textarea
                      value={contextForm.rules}
                      onChange={(e) => setContextForm(prev => ({ ...prev, rules: e.target.value }))}
                      placeholder="Issue-specific conventions (e.g., 9-panel grid for introspection)..."
                      className="w-full bg-[var(--bg-tertiary)] border border-[var(--border)] rounded px-3 py-2 text-sm resize-none focus:border-[var(--color-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]/50"
                      rows={2}
                    />
                  </div>
                  <div>
                    <label className="block type-micro text-[var(--text-muted)] mb-1">Series Position</label>
                    <select
                      value={contextForm.series_act}
                      onChange={(e) => setContextForm(prev => ({ ...prev, series_act: e.target.value }))}
                      className="w-full bg-[var(--bg-tertiary)] border border-[var(--border)] rounded px-3 py-2 text-sm focus:border-[var(--color-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]/50"
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
                    className="w-full bg-[var(--color-primary)] hover:opacity-90 disabled:bg-[var(--bg-tertiary)] py-2 rounded text-sm sticky bottom-0"
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
              <h3 className="type-label mb-3">STATUS</h3>
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
                className="w-full bg-[var(--bg-tertiary)] border border-[var(--border)] rounded px-3 py-2 text-sm focus:outline-none focus:border-[var(--color-primary)] focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]/50"
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
              /* Character Detail View — read-only quick reference */
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <button
                    onClick={() => setSelectedCharacterId(null)}
                    className="flex items-center gap-1 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
                  >
                    <span>←</span> Back
                  </button>
                  <a
                    href={`/series/${issue.series.id}/characters`}
                    className="text-xs text-[var(--color-primary)] hover:text-[var(--color-primary-hover)] transition-colors"
                  >
                    Edit on Characters Page →
                  </a>
                </div>

                {/* Character name + role header */}
                <div>
                  <h3 className="type-label text-[var(--text-primary)]">{selectedCharacter.name}</h3>
                  {selectedCharacter.display_name && selectedCharacter.display_name !== selectedCharacter.name && (
                    <p className="text-xs text-[var(--text-muted)]">aka {selectedCharacter.display_name}</p>
                  )}
                  {selectedCharacter.role && (
                    <p className="text-xs text-[var(--color-primary)]/80 mt-0.5">{selectedCharacter.role}</p>
                  )}
                  {selectedCharacter.aliases?.length > 0 && (
                    <p className="text-xs text-[var(--text-muted)] mt-0.5">
                      Aliases: {selectedCharacter.aliases.join(', ')}
                    </p>
                  )}
                </div>

                {/* Fields shown only if they have content */}
                <div className="space-y-2.5">
                  {selectedCharacter.physical_description && (
                    <div>
                      <label className="block type-micro text-[var(--text-muted)] mb-0.5">APPEARANCE</label>
                      <p className="text-sm text-[var(--text-secondary)] whitespace-pre-wrap">{selectedCharacter.physical_description}</p>
                    </div>
                  )}

                  {selectedCharacter.personality_traits && (
                    <div>
                      <label className="block type-micro text-[var(--text-muted)] mb-0.5">PERSONALITY</label>
                      <p className="text-sm text-[var(--text-secondary)] whitespace-pre-wrap">{selectedCharacter.personality_traits}</p>
                    </div>
                  )}

                  {selectedCharacter.speech_patterns && (
                    <div>
                      <label className="block type-micro text-[var(--text-muted)] mb-0.5">SPEECH PATTERNS</label>
                      <p className="text-sm text-[var(--text-secondary)] whitespace-pre-wrap">{selectedCharacter.speech_patterns}</p>
                    </div>
                  )}

                  {selectedCharacter.relationships && (
                    <div>
                      <label className="block type-micro text-[var(--text-muted)] mb-0.5">RELATIONSHIPS</label>
                      <p className="text-sm text-[var(--text-secondary)] whitespace-pre-wrap">{selectedCharacter.relationships}</p>
                    </div>
                  )}

                  {selectedCharacter.arc_notes && (
                    <div>
                      <label className="block type-micro text-[var(--text-muted)] mb-0.5">ARC NOTES</label>
                      <p className="text-sm text-[var(--text-secondary)] whitespace-pre-wrap">{selectedCharacter.arc_notes}</p>
                    </div>
                  )}

                  {selectedCharacter.background && (
                    <div>
                      <label className="block type-micro text-[var(--text-muted)] mb-0.5">BACKGROUND</label>
                      <p className="text-sm text-[var(--text-secondary)] whitespace-pre-wrap">{selectedCharacter.background}</p>
                    </div>
                  )}

                  {/* Compact visual details row if any exist */}
                  {(selectedCharacter.age || selectedCharacter.height || selectedCharacter.build) && (
                    <div>
                      <label className="block type-micro text-[var(--text-muted)] mb-0.5">DETAILS</label>
                      <p className="text-xs text-[var(--text-secondary)]">
                        {[
                          selectedCharacter.age && `Age: ${selectedCharacter.age}`,
                          selectedCharacter.height,
                          selectedCharacter.build,
                          selectedCharacter.eye_color && `Eyes: ${selectedCharacter.eye_color}`,
                          selectedCharacter.hair_color_style && `Hair: ${selectedCharacter.hair_color_style}`,
                        ].filter(Boolean).join(' · ')}
                      </p>
                      {selectedCharacter.distinguishing_marks && (
                        <p className="text-xs text-[var(--text-secondary)] mt-0.5">{selectedCharacter.distinguishing_marks}</p>
                      )}
                      {selectedCharacter.style_wardrobe && (
                        <p className="text-xs text-[var(--text-secondary)] mt-0.5">Wardrobe: {selectedCharacter.style_wardrobe}</p>
                      )}
                    </div>
                  )}

                  {/* Empty state if character has no data filled in */}
                  {!selectedCharacter.physical_description && !selectedCharacter.personality_traits &&
                   !selectedCharacter.speech_patterns && !selectedCharacter.relationships &&
                   !selectedCharacter.arc_notes && !selectedCharacter.background && (
                    <p className="text-xs text-[var(--text-muted)] italic text-center py-3">
                      No character details yet.{' '}
                      <a
                        href={`/series/${issue.series.id}/characters`}
                        className="text-[var(--color-primary)] hover:underline"
                      >
                        Add them on the Characters page.
                      </a>
                    </p>
                  )}
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
                    {/* Characters on current page */}
                    {pageCharacters.length > 0 && (
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <h3 className="type-label text-[var(--color-primary)]">On This Page</h3>
                          <span className="text-xs text-[var(--color-primary)]/60">({pageCharacters.length})</span>
                        </div>
                        <div className="space-y-1">
                          {pageCharacters.map((char: any) => (
                            <button
                              key={char.id}
                              onClick={() => setSelectedCharacterId(char.id)}
                              className="w-full text-left bg-[var(--color-primary)]/10 hover:bg-[var(--color-primary)]/15 border border-[var(--color-primary)]/30 rounded p-3 transition-colors group"
                            >
                              <div className="flex items-center justify-between">
                                <div className="font-medium text-sm">{char.name}</div>
                                <span className="text-[var(--color-primary)]/50 group-hover:text-[var(--color-primary)] transition-colors">→</span>
                              </div>
                              {char.role && (
                                <div className="text-xs text-[var(--color-primary)]/70">{char.role}</div>
                              )}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Characters in current scene (but not on this page) */}
                    {sceneCharacters.length > 0 && (
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <h3 className="type-label text-[var(--color-success)]">In This Scene</h3>
                          <span className="text-xs text-[var(--color-success)]/60">({sceneCharacters.length})</span>
                        </div>
                        <div className="space-y-1">
                          {sceneCharacters.map((char: any) => (
                            <button
                              key={char.id}
                              onClick={() => setSelectedCharacterId(char.id)}
                              className="w-full text-left bg-[var(--color-success)]/10 hover:bg-[var(--color-success)]/15 border border-[var(--color-success)]/20 rounded p-3 transition-colors group"
                            >
                              <div className="flex items-center justify-between">
                                <div className="font-medium text-sm text-[var(--text-primary)]">{char.name}</div>
                                <span className="text-[var(--color-success)]/50 group-hover:text-[var(--color-success)] transition-colors">→</span>
                              </div>
                              {char.role && (
                                <div className="text-xs text-[var(--text-secondary)]">{char.role}</div>
                              )}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* All other characters — collapsed by default */}
                    {otherCharacters.length > 0 && (
                      <div>
                        <button
                          onClick={() => setShowAllCharacters(prev => !prev)}
                          className="flex items-center gap-2 mb-2 group"
                        >
                          <span className="text-xs text-[var(--text-muted)] group-hover:text-[var(--text-secondary)] transition-colors">
                            {showAllCharacters ? '▾' : '▸'}
                          </span>
                          <h3 className="type-label text-[var(--text-muted)] group-hover:text-[var(--text-secondary)] transition-colors">
                            All Characters
                          </h3>
                          <span className="text-xs text-[var(--text-muted)]">({otherCharacters.length})</span>
                        </button>
                        {showAllCharacters && (
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
                        )}
                      </div>
                    )}

                    {/* Empty state when no characters detected on page/scene */}
                    {pageCharacters.length === 0 && sceneCharacters.length === 0 && selectedPageContext && (
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
                    <label className="block type-micro text-[var(--text-muted)] mb-1">Name</label>
                    <input
                      type="text"
                      value={selectedLocation.name || ''}
                      onChange={(e) => updateLocationField('name', e.target.value)}
                      className="w-full bg-[var(--bg-tertiary)] border border-[var(--border)] rounded px-3 py-2 text-sm"
                    />
                  </div>

                  {/* Description */}
                  <div>
                    <label className="block type-micro text-[var(--text-muted)] mb-1">Description</label>
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
                    <label className="block type-micro text-[var(--text-muted)] mb-1">Visual Description</label>
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
                    <label className="block type-micro text-[var(--text-muted)] mb-1">Mood / Atmosphere</label>
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
                    className="w-full mt-4 px-3 py-2 text-sm text-[var(--color-error)] hover:opacity-80 hover:bg-[var(--color-error)]/10 rounded transition-colors"
                  >
                    Delete Location
                  </button>
                </div>
              </div>
            ) : (
              /* Location List View */
              <>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="type-label">SERIES LOCATIONS</h3>
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
                    ? 'bg-[var(--color-success)] text-white'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                All
              </button>
              <button
                onClick={() => setVisualsFilter('characters')}
                className={`flex-1 py-1 px-2 rounded text-xs transition-colors ${
                  visualsFilter === 'characters'
                    ? 'bg-[var(--color-primary)] text-white'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                Characters
              </button>
              <button
                onClick={() => setVisualsFilter('locations')}
                className={`flex-1 py-1 px-2 rounded text-xs transition-colors ${
                  visualsFilter === 'locations'
                    ? 'bg-[var(--accent-hover)] text-white'
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
                        ? 'bg-[var(--color-primary)]/20 text-[var(--color-primary)]'
                        : 'bg-[var(--accent-hover)]/20 text-[var(--accent-hover)]'
                    }`}>
                      {selectedVisual.entityType}
                    </span>
                    <span className="font-medium text-sm">{selectedVisual.entityName}</span>
                    {selectedVisual.is_primary && (
                      <span className="text-xs text-[var(--color-success)]">★ Primary</span>
                    )}
                  </div>
                  {selectedVisual.caption && (
                    <p className="text-xs text-[var(--text-secondary)] mt-1">{selectedVisual.caption}</p>
                  )}
                </div>
              </div>
            ) : visualsLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="w-6 h-6 border-2 border-[var(--color-success)] border-t-transparent rounded-full animate-spin" />
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
                  className="mt-3 text-xs text-[var(--color-success)] hover:text-[var(--color-success-hover,var(--color-success))]"
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
                      className="relative aspect-square rounded-lg overflow-hidden group border-2 border-transparent hover:border-[var(--color-success)]/50 transition-all"
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
                            ? 'bg-[var(--color-primary)]'
                            : 'bg-[var(--accent-hover)]'
                        }`}>
                          {visual.entityName}
                        </div>
                      </div>
                      {visual.is_primary && (
                        <div className="absolute top-1 right-1 w-4 h-4 bg-[var(--color-success)] rounded-full flex items-center justify-center text-[10px]">
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
              <h3 className="type-label">CONTINUITY ALERTS</h3>
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
                <div className="text-[var(--color-success)] text-2xl mb-2">✓</div>
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
                        ? 'bg-[var(--color-warning)]/10 border-[var(--color-warning)]/30'
                        : 'bg-[var(--color-primary)]/10 border-[var(--color-primary)]/30'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${
                            alert.severity === 'warning'
                              ? 'bg-[var(--color-warning)]/20 text-[var(--color-warning)]'
                              : 'bg-[var(--color-primary)]/20 text-[var(--color-primary)]'
                          }`}>
                            {alert.type}
                          </span>
                          <span className={`text-sm font-medium ${
                            alert.severity === 'warning' ? 'text-[var(--color-warning)]' : 'text-[var(--color-primary)]'
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
                className="text-xs text-[var(--color-primary)] hover:opacity-80"
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
                      panels: (page.panels || []).map((panel: any) => ({
                        id: panel.id,
                        dialogue: panel.dialogue_blocks || [],
                        captions: panel.captions || [],
                        visual_description: panel.visual_description,
                      })),
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
            {/* Current Scope Indicator */}
            {selectedPageContext && (
              <div className="mb-3 shrink-0 text-xs text-[var(--text-muted)] bg-[var(--bg-secondary)] rounded px-3 py-2">
                <span className="text-[var(--text-secondary)]">Working on:</span>{' '}
                <span className="text-[var(--text-secondary)]">
                  {selectedPageContext.act.name || `Act ${selectedPageContext.act.number ?? (selectedPageContext.act.sort_order + 1)}`}
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

            {/* Chat Messages */}
            <div
              ref={chatContainerRef}
              className="flex-1 overflow-y-auto space-y-3 mb-3"
              onScroll={(e) => {
                const el = e.currentTarget
                const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
                userScrolledUpRef.current = distanceFromBottom > 80
              }}
            >
              {chatMessages.length === 0 && !streamingText ? (
                <div className="flex items-center justify-center h-full px-4">
                  <p className="type-meta text-[var(--text-disabled)] text-center">
                    Ask your editor anything about this project.
                  </p>
                </div>
              ) : (
                <>
                  {chatMessages.map((msg, i) => (
                    <div
                      key={i}
                      className={`rounded-lg text-sm ${
                        msg.isError
                          ? 'bg-[var(--color-error)]/10 border border-[var(--color-error)]/30 mr-2 p-3'
                          : msg.role === 'user'
                          ? 'bg-[var(--color-primary)]/10 ml-4 p-3'
                          : 'bg-[var(--bg-tertiary)] mr-2 p-3'
                      }`}
                    >
                      {msg.isError ? (
                        <>
                          <p className="type-micro mb-1 text-[var(--color-error)]">ERROR</p>
                          <p className="type-console text-[var(--color-error)]">{msg.content}</p>
                          <button
                            onClick={() => {
                              // Remove this error message and set input to last user message for retry
                              const lastUserMsg = chatMessages.slice(0, i).reverse().find(m => m.role === 'user')
                              if (lastUserMsg) {
                                setChatMessages(prev => prev.filter((_, idx) => idx !== i))
                                setChatInput(lastUserMsg.content)
                              }
                            }}
                            className="mt-2 text-xs text-[var(--color-primary)] hover:underline"
                          >
                            Retry
                          </button>
                        </>
                      ) : (
                        <>
                          <p className="type-micro mb-1">
                            {msg.role === 'user' ? 'YOU' : 'SYSTEM_AI'}
                          </p>
                          {msg.role === 'assistant' ? (
                            <ChatMessageContent content={msg.content} />
                          ) : (
                            <p className="type-console whitespace-pre-wrap">{msg.content}</p>
                          )}
                          {msg.role === 'assistant' && (
                            <button
                              onClick={async () => {
                                const supabase = createClient()
                                const { error } = await supabase
                                  .from('project_notes')
                                  .insert({
                                    series_id: issue.series.id,
                                    type: 'AI_INSIGHT',
                                    content: msg.content.slice(0, 500),
                                  })
                                if (error) {
                                  showToast('Failed to save note', 'error')
                                } else {
                                  showToast('Saved to project notes', 'success')
                                }
                              }}
                              className="mt-2 text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors"
                              title="Save this insight to Project Notes"
                            >
                              Save to Notes
                            </button>
                          )}
                        </>
                      )}

                      {/* Tool Proposals */}
                      {msg.toolProposals && msg.toolProposals.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-[var(--border)] space-y-2">
                          {msg.toolProposals.map((proposal) => {
                            const display = TOOL_DISPLAY[proposal.toolName] || { icon: '🔧', label: proposal.toolName, color: 'var(--text-secondary)' }
                            const summary = getToolSummary(proposal.toolName, proposal.input)

                            return (
                              <div
                                key={proposal.toolUseId}
                                className="border border-dashed rounded-lg p-3"
                                style={{ borderColor: display.color }}
                              >
                                <div className="flex items-start gap-2 mb-2">
                                  <span className="text-base">{display.icon}</span>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-xs font-medium" style={{ color: display.color }}>
                                      {display.label}
                                    </p>
                                    <p className="text-xs text-[var(--text-secondary)] mt-0.5">{summary}</p>
                                  </div>
                                  {/* Status badge */}
                                  {proposal.status === 'completed' && (
                                    <span className="text-xs px-1.5 py-0.5 rounded bg-[var(--color-success)]/20 text-[var(--color-success)]">Done</span>
                                  )}
                                  {proposal.status === 'dismissed' && (
                                    <span className="text-xs px-1.5 py-0.5 rounded bg-[var(--bg-secondary)] text-[var(--text-muted)]">Skipped</span>
                                  )}
                                  {proposal.status === 'executing' && (
                                    <span className="text-xs px-1.5 py-0.5 rounded bg-[var(--color-warning)]/20 text-[var(--color-warning)]">Running...</span>
                                  )}
                                </div>

                                {/* Confirm / Skip buttons for pending proposals */}
                                {proposal.status === 'pending' && (
                                  <div className="flex gap-2 mt-2">
                                    <button
                                      onClick={() => handleToolProposal(proposal, true, i)}
                                      disabled={isLoading}
                                      className="flex-1 py-1.5 px-3 rounded text-xs font-medium transition-colors bg-[var(--color-primary)] text-white hover:opacity-90 disabled:opacity-50"
                                    >
                                      Confirm
                                    </button>
                                    <button
                                      onClick={() => handleToolProposal(proposal, false, i)}
                                      disabled={isLoading}
                                      className="flex-1 py-1.5 px-3 rounded text-xs font-medium transition-colors border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                      Skip
                                    </button>
                                  </div>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  ))}

                  {/* Streaming text (in-progress response) */}
                  {streamingText && (
                    <div className="bg-[var(--bg-tertiary)] mr-2 p-3 rounded-lg text-sm">
                      <p className="text-xs text-[var(--text-muted)] mb-1">AI Creative Partner</p>
                      <ChatMessageContent content={streamingText} />

                      {/* Streaming tool proposals */}
                      {streamingToolProposals.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-[var(--border)] space-y-2">
                          {streamingToolProposals.map((proposal) => {
                            const display = TOOL_DISPLAY[proposal.toolName] || { icon: '🔧', label: proposal.toolName, color: 'var(--text-secondary)' }
                            return (
                              <div
                                key={proposal.toolUseId}
                                className="border border-dashed rounded-lg p-3 opacity-70"
                                style={{ borderColor: display.color }}
                              >
                                <div className="flex items-center gap-2">
                                  <span className="text-base">{display.icon}</span>
                                  <p className="text-xs font-medium" style={{ color: display.color }}>
                                    {proposal.status === 'streaming' ? `${display.label}...` : display.label}
                                  </p>
                                  {proposal.status === 'streaming' && (
                                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-[var(--color-warning)] animate-pulse" />
                                  )}
                                </div>
                                {proposal.status === 'pending' && (
                                  <p className="text-xs text-[var(--text-secondary)] mt-1">
                                    {getToolSummary(proposal.toolName, proposal.input)}
                                  </p>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Loading indicator when waiting for first token */}
                  {isLoading && !streamingText && (
                    <div className="bg-[var(--bg-tertiary)] p-3 rounded-lg mr-2">
                      <p className="text-xs text-[var(--text-muted)] mb-1">AI Creative Partner</p>
                      <div className="flex items-center gap-2">
                        <span className="inline-block w-1.5 h-1.5 rounded-full bg-[var(--text-muted)] animate-pulse" />
                        <span className="inline-block w-1.5 h-1.5 rounded-full bg-[var(--text-muted)] animate-pulse" style={{ animationDelay: '0.2s' }} />
                        <span className="inline-block w-1.5 h-1.5 rounded-full bg-[var(--text-muted)] animate-pulse" style={{ animationDelay: '0.4s' }} />
                        <span className="text-xs text-[var(--text-muted)] ml-1">Thinking...</span>
                      </div>
                    </div>
                  )}
                </>
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Chat Input */}
            <div className="shrink-0">
              <div className="flex gap-2 items-end">
                <textarea
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      sendMessage()
                    }
                  }}
                  placeholder="Talk to your editor..."
                  rows={1}
                  className="flex-1 bg-[var(--bg-tertiary)] border border-[var(--border)] rounded px-3 py-2 text-sm focus:border-[var(--color-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]/50 resize-none max-h-32 overflow-y-auto disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={isLoading}
                  style={{ minHeight: '38px' }}
                  onInput={(e) => {
                    const el = e.currentTarget
                    el.style.height = '38px'
                    el.style.height = Math.min(el.scrollHeight, 128) + 'px'
                  }}
                />
                <button
                  onClick={sendMessage}
                  disabled={isLoading || !chatInput.trim()}
                  className="bg-[var(--color-primary)] hover:opacity-90 disabled:bg-[var(--bg-tertiary)] disabled:text-[var(--text-muted)] px-4 py-2 rounded text-sm shrink-0"
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
