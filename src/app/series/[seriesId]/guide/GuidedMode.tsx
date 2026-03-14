'use client'

import { useState, useRef, useEffect, type ReactNode } from 'react'
import { Tip } from '@/components/ui/Tip'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { useToast } from '@/contexts/ToastContext'
import { analyzeProjectCompleteness, type CompletenessAnalysis } from './analyzeCompleteness'
import { parseSSEData, type ToolUseSSEEvent } from '@/lib/ai/streaming'
import Header from '@/components/ui/Header'
import ChatMessageContent from '@/components/ChatMessageContent'
import SessionCaptureTally from './SessionCaptureTally'
import HarvestReview from './HarvestReview'
import {
  Users, MapPin, GitBranch, Lightbulb, StickyNote, Film,
  PenTool, MessageSquare, Pin, Trophy, Search, List, FileText, Wrench,
} from 'lucide-react'

interface GuidedSession {
  id: string
  title: string | null
  session_type: string
  status: string
  focus_area: string | null
  completion_areas: string[] | null
  started_at: string
  last_active_at: string
}

interface GuidedMessage {
  id: string
  role: 'assistant' | 'user'
  content: string
  extracted_data: any
  created_at: string
}

interface WriterInsight {
  id: string
  insight_type: string
  category: string | null
  description: string
  confidence: number
}

interface ToolProposal {
  toolUseId: string
  toolName: string
  input: Record<string, unknown>
  status: 'streaming' | 'pending' | 'executing' | 'completed' | 'dismissed'
}

// Tool display config
const TOOL_ICON_SIZE = 14
const TOOL_DISPLAY: Record<string, { icon: ReactNode; label: string; color: string }> = {
  create_character: { icon: <Users size={TOOL_ICON_SIZE} />, label: 'Create Character', color: 'var(--color-primary)' },
  update_character: { icon: <Users size={TOOL_ICON_SIZE} />, label: 'Update Character', color: 'var(--color-primary)' },
  create_location: { icon: <MapPin size={TOOL_ICON_SIZE} />, label: 'Create Location', color: 'var(--color-success)' },
  create_plotline: { icon: <GitBranch size={TOOL_ICON_SIZE} />, label: 'Create Plotline', color: 'var(--accent-hover)' },
  save_canvas_beat: { icon: <Lightbulb size={TOOL_ICON_SIZE} />, label: 'Save to Canvas', color: 'var(--color-warning)' },
  add_panel_note: { icon: <StickyNote size={TOOL_ICON_SIZE} />, label: 'Add Panel Note', color: 'var(--color-info)' },
  update_scene_metadata: { icon: <Film size={TOOL_ICON_SIZE} />, label: 'Update Scene', color: 'var(--accent-hover)' },
  draft_panel_description: { icon: <PenTool size={TOOL_ICON_SIZE} />, label: 'Draft Panel', color: 'var(--color-success)' },
  add_dialogue: { icon: <MessageSquare size={TOOL_ICON_SIZE} />, label: 'Add Dialogue', color: 'var(--color-primary)' },
  save_project_note: { icon: <Pin size={TOOL_ICON_SIZE} />, label: 'Save Note', color: 'var(--color-warning)' },
  generate_power_rankings: { icon: <Trophy size={TOOL_ICON_SIZE} />, label: 'Power Rankings', color: 'var(--accent-hover)' },
  track_character_state: { icon: <Users size={TOOL_ICON_SIZE} />, label: 'Track Character State', color: 'var(--color-primary)' },
  continuity_check: { icon: <Search size={TOOL_ICON_SIZE} />, label: 'Continuity Check', color: 'var(--color-error)' },
  extract_outline: { icon: <List size={TOOL_ICON_SIZE} />, label: 'Extract Outline', color: 'var(--color-info)' },
  draft_scene_summary: { icon: <FileText size={TOOL_ICON_SIZE} />, label: 'Scene Summary', color: 'var(--color-success)' },
}
const DEFAULT_TOOL_DISPLAY = { icon: <Wrench size={TOOL_ICON_SIZE} />, label: '', color: 'var(--text-secondary)' }

const TOOL_TO_CAPTURE_KEY: Record<string, string> = {
  update_scene_metadata: 'scene_descriptions',
  draft_panel_description: 'panel_drafts',
  create_character: 'characters',
  update_character: 'characters',
  create_location: 'locations',
  create_plotline: 'plotlines',
  save_canvas_beat: 'canvas_items',
  save_project_note: 'project_notes',
  update_page_story_beat: 'story_beats',
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

interface DisplayMessage {
  id: string
  role: 'assistant' | 'user'
  content: string
  toolProposals?: ToolProposal[]
}

interface GuidedModeProps {
  series: any
  issueId?: string
  sceneId?: string
  pageId?: string
  existingSession: GuidedSession | null
  sessionMessages: GuidedMessage[]
  writerInsights: WriterInsight[]
  recentSessions: GuidedSession[]
  userId: string
}

export default function GuidedMode({
  series,
  issueId,
  sceneId,
  pageId,
  existingSession,
  sessionMessages: initialMessages,
  writerInsights,
  recentSessions,
  userId,
}: GuidedModeProps) {
  const router = useRouter()
  const { showToast } = useToast()
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const [session, setSession] = useState<GuidedSession | null>(existingSession)
  const [displayMessages, setDisplayMessages] = useState<DisplayMessage[]>(
    initialMessages.map(m => ({ id: m.id, role: m.role, content: m.content }))
  )
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [streamingText, setStreamingText] = useState('')
  const [streamingToolProposals, setStreamingToolProposals] = useState<ToolProposal[]>([])
  const [showSessionPicker, setShowSessionPicker] = useState(!existingSession && recentSessions.length > 0)
  const [analysis, setAnalysis] = useState<CompletenessAnalysis | null>(null)
  const [showSessionMenu, setShowSessionMenu] = useState(false)
  const [isExtracting, setIsExtracting] = useState(false)
  const [extractionResults, setExtractionResults] = useState<any>(null)
  const [sessionCaptures, setSessionCaptures] = useState({
    story_beats: 0, scene_descriptions: 0, panel_drafts: 0,
    characters: 0, locations: 0, plotlines: 0,
    canvas_items: 0, project_notes: 0,
  })
  const [harvestItems, setHarvestItems] = useState<any[] | null>(null)
  const [harvesting, setHarvesting] = useState(false)

  // Find the current context based on URL params
  const currentIssue = issueId ? series.issues?.find((i: any) => i.id === issueId) : null
  const currentScene = sceneId && currentIssue
    ? currentIssue.acts?.flatMap((a: any) => a.scenes || []).find((s: any) => s.id === sceneId)
    : null
  const currentPage = pageId && currentScene
    ? currentScene.pages?.find((p: any) => p.id === pageId)
    : null

  // Analyze completeness on mount
  useEffect(() => {
    const result = analyzeProjectCompleteness(series, currentIssue, currentScene, currentPage)
    setAnalysis(result)
  }, [series, currentIssue, currentScene, currentPage])

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [displayMessages, streamingText])

  // Auto-focus input
  useEffect(() => {
    inputRef.current?.focus()
  }, [session])

  // Auto-generate initial message for new sessions with no messages
  useEffect(() => {
    if (session && displayMessages.length === 0 && !isLoading) {
      generateInitialMessage(session.id, session.session_type, session.focus_area || undefined)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // Only run on mount

  // Process an SSE stream response
  const processSSEStream = async (response: Response): Promise<{ text: string; toolProposals: ToolProposal[] }> => {
    const reader = response.body?.getReader()
    if (!reader) return { text: '', toolProposals: [] }

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
            return { text: `Error: ${parsed.error}`, toolProposals: [] }
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

    return { text: fullText, toolProposals }
  }

  // Handle tool proposal confirm/dismiss
  const handleToolProposal = async (
    proposal: ToolProposal,
    confirmed: boolean,
    messageIndex: number
  ) => {
    const assistantMsg = displayMessages[messageIndex]
    if (!assistantMsg) return

    // Update proposal status
    setDisplayMessages(prev => prev.map((msg, idx) => {
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

    // Build prior message history
    const priorMessages = displayMessages
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
          seriesId: series.id,
          issueId,
          pageId,
          mode: 'guide',
        }),
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      // Mark the tool as completed
      setDisplayMessages(prev => prev.map((msg, idx) => {
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

      // Increment capture tally
      const captureKey = TOOL_TO_CAPTURE_KEY[proposal.toolName]
      if (captureKey) {
        setSessionCaptures(prev => ({ ...prev, [captureKey]: prev[captureKey as keyof typeof prev] + 1 }))
      }

      // Process SSE stream for the continuation
      const result = await processSSEStream(response)

      // Finalize continuation message
      if (result.text) {
        setDisplayMessages(prev => [...prev, {
          id: `msg-${Date.now()}`,
          role: 'assistant' as const,
          content: result.text,
          toolProposals: result.toolProposals.length > 0 ? result.toolProposals : undefined,
        }])
      }
      setStreamingText('')
      setStreamingToolProposals([])

      router.refresh()
    } catch (error) {
      setDisplayMessages(prev => [...prev, {
        id: `msg-${Date.now()}`,
        role: 'assistant' as const,
        content: 'Failed to process tool result. Please try again.',
      }])
    }

    setIsLoading(false)
  }

  // Start a new session
  const startNewSession = async (sessionType: string = 'general') => {
    const supabase = createClient()

    const { data: newSession, error } = await supabase
      .from('guided_sessions')
      .insert({
        user_id: userId,
        series_id: series.id,
        issue_id: issueId || null,
        scene_id: sceneId || null,
        page_id: pageId || null,
        session_type: sessionType,
        status: 'active',
      })
      .select()
      .single()

    if (error) {
      showToast('Failed to start session', 'error')
      return
    }

    setSession(newSession)
    setDisplayMessages([])
    setShowSessionPicker(false)

    // Generate initial AI message based on context
    await generateInitialMessage(newSession.id, sessionType)
  }

  // Resume an existing session
  const resumeSession = async (sessionToResume: GuidedSession) => {
    const supabase = createClient()

    // Fetch messages for this session
    const { data: msgs, error: msgsError } = await supabase
      .from('guided_messages')
      .select('*')
      .eq('session_id', sessionToResume.id)
      .order('created_at', { ascending: true })

    if (msgsError) {
      console.error('Failed to fetch guided messages:', msgsError)
      showToast('Failed to load session messages', 'error')
      return
    }

    setSession(sessionToResume)
    setDisplayMessages((msgs || []).map((m: any) => ({ id: m.id, role: m.role, content: m.content })))
    setShowSessionPicker(false)

    // Update last_active_at
    const { error: updateError } = await supabase
      .from('guided_sessions')
      .update({ last_active_at: new Date().toISOString() })
      .eq('id', sessionToResume.id)

    if (updateError) {
      console.error('Failed to update session last_active_at:', updateError)
    }
  }

  // Generate the initial AI message (streaming)
  const generateInitialMessage = async (sessionId: string, sessionType: string, focusArea?: string) => {
    setIsLoading(true)
    setStreamingText('')
    setStreamingToolProposals([])

    try {
      const response = await fetch('/api/guide', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          seriesId: series.id,
          issueId,
          pageId,
          isInitial: true,
          sessionType,
          focusArea,
          analysis,
        }),
      })

      if (!response.ok) throw new Error('Failed to generate response')

      const result = await processSSEStream(response)

      // Save assistant message to DB
      const supabase = createClient()
      const { data: savedMessage, error: saveError } = await supabase
        .from('guided_messages')
        .insert({
          session_id: sessionId,
          role: 'assistant',
          content: result.text,
          extracted_data: null,
        })
        .select()
        .single()

      if (saveError) {
        console.error('Failed to save initial assistant message:', saveError)
      }

      // Finalize the message
      setDisplayMessages([{
        id: savedMessage?.id || `msg-${Date.now()}`,
        role: 'assistant',
        content: result.text,
        toolProposals: result.toolProposals.length > 0 ? result.toolProposals : undefined,
      }])
      setStreamingText('')
      setStreamingToolProposals([])
    } catch (error) {
      showToast('Failed to start conversation', 'error')
    } finally {
      setIsLoading(false)
    }
  }

  // Send a message (streaming)
  const sendMessage = async () => {
    if (!input.trim() || !session || isLoading) return

    const userMessage = input.trim()
    setInput('')
    setIsLoading(true)
    setStreamingText('')
    setStreamingToolProposals([])

    const supabase = createClient()

    // Save user message
    const { data: savedUserMessage, error: userMsgError } = await supabase
      .from('guided_messages')
      .insert({
        session_id: session.id,
        role: 'user',
        content: userMessage,
      })
      .select()
      .single()

    if (userMsgError) {
      console.error('Failed to save user message:', userMsgError)
    }

    const userMsg: DisplayMessage = {
      id: savedUserMessage?.id || `msg-${Date.now()}`,
      role: 'user',
      content: userMessage,
    }
    setDisplayMessages(prev => [...prev, userMsg])

    try {
      const allMessages = [
        ...displayMessages.map(m => ({ role: m.role, content: m.content })),
        { role: 'user' as const, content: userMessage },
      ]

      const response = await fetch('/api/guide', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          seriesId: series.id,
          issueId,
          pageId,
          messages: allMessages,
          userMessage,
        }),
      })

      if (!response.ok) throw new Error('Failed to generate response')

      const result = await processSSEStream(response)

      // Save assistant message to DB
      const { data: savedAssistantMessage, error: assistantMsgError } = await supabase
        .from('guided_messages')
        .insert({
          session_id: session.id,
          role: 'assistant',
          content: result.text,
          extracted_data: null,
        })
        .select()
        .single()

      if (assistantMsgError) {
        console.error('Failed to save assistant message:', assistantMsgError)
      }

      // Finalize the message
      setDisplayMessages(prev => [...prev, {
        id: savedAssistantMessage?.id || `msg-${Date.now()}`,
        role: 'assistant',
        content: result.text,
        toolProposals: result.toolProposals.length > 0 ? result.toolProposals : undefined,
      }])
      setStreamingText('')
      setStreamingToolProposals([])

      // Update session last_active_at
      const { error: sessionUpdateError } = await supabase
        .from('guided_sessions')
        .update({ last_active_at: new Date().toISOString() })
        .eq('id', session.id)

      if (sessionUpdateError) {
        console.error('Failed to update session last_active_at:', sessionUpdateError)
      }
    } catch (error) {
      showToast('Failed to send message', 'error')
    } finally {
      setIsLoading(false)
    }
  }

  // Handle keyboard shortcuts
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  // Shift focus within the same session
  const shiftFocus = async (newFocus: string) => {
    if (!session || isLoading) return

    setShowSessionMenu(false)
    setIsLoading(true)
    setStreamingText('')
    setStreamingToolProposals([])

    const supabase = createClient()

    // Add a message from the user indicating the shift
    const shiftMessage = `I'd like to shift our focus to ${newFocus.replace(/_/g, ' ')}. Let's explore that area while keeping in mind what we've discussed so far.`

    // Save user message
    const { data: savedUserMessage, error: shiftUserMsgError } = await supabase
      .from('guided_messages')
      .insert({
        session_id: session.id,
        role: 'user',
        content: shiftMessage,
      })
      .select()
      .single()

    if (shiftUserMsgError) {
      console.error('Failed to save shift focus user message:', shiftUserMsgError)
    }

    setDisplayMessages(prev => [...prev, {
      id: savedUserMessage?.id || `msg-${Date.now()}`,
      role: 'user',
      content: shiftMessage,
    }])

    try {
      const allMessages = [
        ...displayMessages.map(m => ({ role: m.role, content: m.content })),
        { role: 'user' as const, content: shiftMessage },
      ]

      const response = await fetch('/api/guide', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          seriesId: series.id,
          issueId,
          pageId,
          messages: allMessages,
          userMessage: shiftMessage,
        }),
      })

      if (!response.ok) throw new Error('Failed to generate response')

      const result = await processSSEStream(response)

      // Save assistant message
      const { data: savedAssistantMessage, error: shiftAssistantMsgError } = await supabase
        .from('guided_messages')
        .insert({
          session_id: session.id,
          role: 'assistant',
          content: result.text,
          extracted_data: null,
        })
        .select()
        .single()

      if (shiftAssistantMsgError) {
        console.error('Failed to save shift focus assistant message:', shiftAssistantMsgError)
      }

      setDisplayMessages(prev => [...prev, {
        id: savedAssistantMessage?.id || `msg-${Date.now()}`,
        role: 'assistant',
        content: result.text,
        toolProposals: result.toolProposals.length > 0 ? result.toolProposals : undefined,
      }])
      setStreamingText('')
      setStreamingToolProposals([])

      // Update session focus area
      const { error: focusUpdateError } = await supabase
        .from('guided_sessions')
        .update({
          focus_area: newFocus,
          session_type: newFocus,
        })
        .eq('id', session.id)

      if (focusUpdateError) {
        console.error('Failed to update session focus area:', focusUpdateError)
      }

      setSession(prev => prev ? { ...prev, focus_area: newFocus, session_type: newFocus } : null)
    } catch (error) {
      showToast('Failed to shift focus', 'error')
    } finally {
      setIsLoading(false)
    }
  }

  // Extract insights from the current session
  const extractInsights = async () => {
    if (!session || displayMessages.length < 2) {
      showToast('Need more conversation to extract insights', 'error')
      return
    }

    setIsExtracting(true)
    setExtractionResults(null)

    try {
      const response = await fetch('/api/guide/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: session.id,
          messages: displayMessages.map(m => ({ role: m.role, content: m.content })),
          series,
        }),
      })

      if (!response.ok) throw new Error('Failed to extract insights')

      const data = await response.json()
      setExtractionResults(data)

      if (data.savedInsights?.length > 0) {
        showToast(`Saved ${data.savedInsights.length} insight(s) to your profile`, 'success')
      } else if (data.insights?.length > 0) {
        showToast(`Found ${data.insights.length} insight(s), but confidence was too low to save`, 'info')
      } else {
        showToast('No clear insights found yet. Keep exploring!', 'info')
      }
    } catch (error) {
      showToast('Failed to extract insights', 'error')
    } finally {
      setIsExtracting(false)
    }
  }

  // Harvest session insights into actionable items
  const handleHarvest = async () => {
    if (!session) return
    setHarvesting(true)
    const res = await fetch('/api/guide/harvest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: session.id }),
    })
    const { items } = await res.json()
    setHarvestItems(items || [])
    setHarvesting(false)
  }

  // Determine the context label
  const contextLabel = currentPage
    ? `Page ${currentPage.page_number}`
    : currentScene
    ? currentScene.title || currentScene.name || 'Scene'
    : currentIssue
    ? `Issue #${currentIssue.number}${currentIssue.title ? `: ${currentIssue.title}` : ''}`
    : series.title

  return (
    <div className="h-screen flex flex-col bg-[var(--bg-primary)] text-[var(--text-primary)]">
      {/* Header */}
      <Header
        variant="subpage"
        backHref={currentIssue ? `/series/${series.id}/issues/${currentIssue.id}` : `/series/${series.id}`}
        backLabel={series.title}
        title="Guide"
        maxWidth="max-w-4xl"
        subtitleNode={
          <div>
            {contextLabel !== series.title && (
              <p className="type-micro text-[var(--text-secondary)] uppercase">{contextLabel}</p>
            )}
            {session && (
              <p className="type-micro text-[var(--text-muted)]">
                {session.session_type === 'general' ? 'GENERAL SESSION' : session.session_type.replace(/_/g, ' ').toUpperCase()}
                {session.focus_area && ` // EXPLORING: ${session.focus_area.toUpperCase()}`}
              </p>
            )}
          </div>
        }
      >
        {session && (
          <div className="relative">
            <button
              onClick={() => setShowSessionMenu(!showSessionMenu)}
              className="type-micro text-[var(--text-secondary)] px-3 py-1.5 border border-[var(--border)] hover:border-[var(--border-strong)] hover-fade flex items-center gap-1 active:scale-[0.97] transition-all duration-150 ease-out"
            >
              OPTIONS
              <span className="text-[10px]">&#9660;</span>
            </button>

            {showSessionMenu && (
              <>
                {/* Backdrop */}
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setShowSessionMenu(false)}
                />
                {/* Menu */}
                <div className="dropdown-panel absolute right-0 top-full mt-1 z-20 w-56 py-1">
                  {/* Shift Focus Options */}
                  <div className="px-2 py-1 border-b border-[var(--border)]">
                    <div className="type-micro text-[var(--text-muted)] px-2 py-1">SHIFT FOCUS TO</div>
                    <button
                      onClick={() => shiftFocus('character_deep_dive')}
                      className="dropdown-item hover-glow"
                    >
                      Characters
                    </button>
                    <button
                      onClick={() => shiftFocus('outline')}
                      className="dropdown-item hover-glow"
                    >
                      Story Structure
                    </button>
                    <button
                      onClick={() => shiftFocus('world_building')}
                      className="dropdown-item hover-glow"
                    >
                      World Building
                    </button>
                    <button
                      onClick={() => shiftFocus('general')}
                      className="dropdown-item hover-glow"
                    >
                      Open Exploration
                    </button>
                  </div>

                  <div className="dropdown-separator" />

                  {/* Actions */}
                  <div className="py-1">
                    <button
                      onClick={() => {
                        setShowSessionMenu(false)
                        extractInsights()
                      }}
                      disabled={isExtracting || displayMessages.length < 2}
                      className="dropdown-item hover-lift disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isExtracting ? 'Extracting...' : 'Extract Insights'}
                    </button>
                    <button
                      onClick={() => {
                        setShowSessionMenu(false)
                        setSession(null)
                        setDisplayMessages([])
                        setExtractionResults(null)
                        setShowSessionPicker(true)
                      }}
                      className="dropdown-item hover-fade-danger text-[var(--color-error)]"
                    >
                      New Session
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </Header>

      {/* Main Content */}
      <div className="flex-1 overflow-hidden flex flex-col max-w-4xl mx-auto w-full">
        {/* Session Picker / Start Screen */}
        {!session && (
          <div className="flex-1 flex flex-col items-center justify-center p-8">
            <div className="text-center mb-8">
              <h2 className="type-section mb-2">GUIDED WRITING SESSION</h2>
              <p className="type-meta text-[var(--text-secondary)] max-w-md mx-auto">
                Your AI writing partner will guide you through developing your story,
                asking questions and helping you discover the details that bring it to life.
              </p>
            </div>

            {/* Completeness Summary */}
            {analysis && (
              <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg p-4 mb-6 w-full max-w-md">
                <div className="flex items-center justify-between mb-3">
                  <span className="type-label text-[var(--text-secondary)]">PROJECT COMPLETENESS</span>
                  <span className="type-micro text-[var(--text-secondary)]">{analysis.overallScore}%</span>
                </div>
                <div className="w-full h-1.5 bg-[var(--bg-tertiary)] overflow-hidden">
                  <div
                    className="h-full bg-[var(--color-primary)] transition-all"
                    style={{ width: `${analysis.overallScore}%` }}
                  />
                </div>
                <div className="mt-3">
                  {analysis.suggestedFocus && (
                    <p className="type-micro text-[var(--text-muted)]">
                      SUGGESTED FOCUS: <span className="text-[var(--color-primary)]">{analysis.suggestedFocus}</span>
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Session Type Buttons */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-md mb-6">
              <button
                onClick={() => startNewSession('general')}
                className="p-4 bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)] border border-[var(--border)] hover:border-[var(--border-strong)] text-left hover-glow active:scale-[0.97]"
              >
                <div className="type-label mb-1">OPEN EXPLORATION</div>
                <div className="type-micro text-[var(--text-secondary)]">Let the AI guide based on what&apos;s needed</div>
              </button>
              <button
                onClick={() => startNewSession('character_deep_dive')}
                className="p-4 bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)] border border-[var(--border)] hover:border-[var(--border-strong)] text-left hover-glow active:scale-[0.97]"
              >
                <div className="type-label mb-1">CHARACTER DEEP DIVE</div>
                <div className="type-micro text-[var(--text-secondary)]">Explore motivations, arcs, and voices</div>
              </button>
              <button
                onClick={() => startNewSession('outline')}
                className="p-4 bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)] border border-[var(--border)] hover:border-[var(--border-strong)] text-left hover-glow active:scale-[0.97]"
              >
                <div className="type-label mb-1">STORY STRUCTURE</div>
                <div className="type-micro text-[var(--text-secondary)]">Work out acts, beats, and pacing</div>
              </button>
              <button
                onClick={() => startNewSession('world_building')}
                className="p-4 bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)] border border-[var(--border)] hover:border-[var(--border-strong)] text-left hover-glow active:scale-[0.97]"
              >
                <div className="type-label mb-1">WORLD BUILDING</div>
                <div className="type-micro text-[var(--text-secondary)]">Define locations, rules, and atmosphere</div>
              </button>
            </div>

            {/* Recent Sessions */}
            {recentSessions.length > 0 && (
              <div className="w-full max-w-md">
                <h3 className="type-label text-[var(--text-secondary)] mb-2">RESUME A SESSION</h3>
                <div className="space-y-2">
                  {recentSessions.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => resumeSession(s)}
                      className="w-full p-3 bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)] border border-[var(--border)] text-left hover-glow active:scale-[0.97] hover:border-[var(--border-strong)] hover:shadow-[0_2px_8px_color-mix(in_srgb,var(--text-primary)_8%,transparent)]"
                    >
                      <div className="flex items-center justify-between">
                        <span className="type-label text-[var(--text-primary)]">
                          {s.title || s.session_type.replace(/_/g, ' ').toUpperCase()}
                        </span>
                        <span className="type-micro text-[var(--text-muted)]">
                          {new Date(s.last_active_at).toLocaleDateString()}
                        </span>
                      </div>
                      {s.focus_area && (
                        <div className="type-micro text-[var(--text-muted)] mt-1">
                          LAST EXPLORING: {s.focus_area.toUpperCase()}
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Chat Interface */}
        {session && (
          <>
            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {displayMessages.map((msg, i) => (
                <div
                  key={msg.id}
                  className={`flex animate-message-arrive ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[85%] rounded-lg px-4 py-3 ${
                      msg.role === 'user'
                        ? 'bg-[var(--color-primary)] text-white'
                        : 'bg-[var(--bg-secondary)] border border-[var(--border)] text-[var(--text-primary)]'
                    }`}
                  >
                    <div className="text-sm leading-relaxed">
                      {msg.role === 'assistant' ? (
                        <ChatMessageContent content={msg.content} />
                      ) : (
                        <div className="whitespace-pre-wrap">{msg.content}</div>
                      )}
                    </div>

                    {/* Tool Proposals */}
                    {msg.toolProposals && msg.toolProposals.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-[var(--border)] space-y-2">
                        {msg.toolProposals.map((proposal) => {
                          const display = TOOL_DISPLAY[proposal.toolName] || DEFAULT_TOOL_DISPLAY
                          const summary = getToolSummary(proposal.toolName, proposal.input)

                          return (
                            <div
                              key={proposal.toolUseId}
                              className="border border-dashed rounded-lg p-3 bg-[var(--bg-tertiary)]/50"
                              style={{ borderColor: display.color }}
                            >
                              <div className="flex items-start gap-2 mb-1">
                                <span className="shrink-0" style={{ color: display.color }}>{display.icon}</span>
                                <div className="flex-1 min-w-0">
                                  <p className="type-micro font-medium" style={{ color: display.color }}>
                                    {display.label || proposal.toolName.replace(/_/g, ' ').toUpperCase()}
                                  </p>
                                  <p className="type-micro text-[var(--text-secondary)] mt-0.5">{summary}</p>
                                </div>
                                {proposal.status === 'completed' && (
                                  <span className="type-micro px-1.5 py-0.5 border border-[var(--color-success)]/30 text-[var(--color-success)]">DONE</span>
                                )}
                                {proposal.status === 'dismissed' && (
                                  <span className="type-micro px-1.5 py-0.5 border border-[var(--border)] text-[var(--text-muted)]">SKIPPED</span>
                                )}
                                {proposal.status === 'executing' && (
                                  <span className="type-micro px-1.5 py-0.5 border border-[var(--color-warning)]/30 text-[var(--color-warning)]">RUNNING...</span>
                                )}
                              </div>

                              {proposal.status === 'pending' && (
                                <div className="flex gap-2 mt-2">
                                  <button
                                    onClick={() => handleToolProposal(proposal, true, i)}
                                    disabled={isLoading}
                                    className="flex-1 py-1.5 px-3 type-micro font-medium border border-[var(--text-primary)] text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] hover-lift disabled:opacity-50"
                                  >
                                    CONFIRM
                                  </button>
                                  <button
                                    onClick={() => handleToolProposal(proposal, false, i)}
                                    disabled={isLoading}
                                    className="flex-1 py-1.5 px-3 type-micro font-medium transition-colors border border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--border-strong)] hover:text-[var(--text-secondary)] hover-fade"
                                  >
                                    SKIP
                                  </button>
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {/* Streaming text */}
              {streamingText && (
                <div className="flex justify-start">
                  <div className="max-w-[85%] bg-[var(--bg-secondary)] border border-[var(--border)] text-[var(--text-primary)] rounded-lg px-4 py-3">
                    <div className="text-sm leading-relaxed">
                      <ChatMessageContent content={streamingText} />
                    </div>

                    {streamingToolProposals.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-[var(--border)] space-y-2">
                        {streamingToolProposals.map((proposal) => {
                          const display = TOOL_DISPLAY[proposal.toolName] || DEFAULT_TOOL_DISPLAY
                          return (
                            <div
                              key={proposal.toolUseId}
                              className="border border-dashed rounded-lg p-3 opacity-70 bg-[var(--bg-tertiary)]/50"
                              style={{ borderColor: display.color }}
                            >
                              <div className="flex items-center gap-2">
                                <span className="shrink-0" style={{ color: display.color }}>{display.icon}</span>
                                <p className="type-micro font-medium" style={{ color: display.color }}>
                                  {proposal.status === 'streaming' ? `${display.label || proposal.toolName.replace(/_/g, ' ').toUpperCase()}...` : (display.label || proposal.toolName.replace(/_/g, ' ').toUpperCase())}
                                </p>
                                {proposal.status === 'streaming' && (
                                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-[var(--color-warning)] animate-pulse" />
                                )}
                              </div>
                              {proposal.status === 'pending' && (
                                <p className="type-micro text-[var(--text-secondary)] mt-1">
                                  {getToolSummary(proposal.toolName, proposal.input)}
                                </p>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Loading indicator (before first token) */}
              {isLoading && !streamingText && (
                <div className="flex justify-start">
                  <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg px-4 py-3">
                    <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                      <div className="flex gap-1">
                        <span className="w-1.5 h-1.5 bg-[var(--text-muted)] rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                        <span className="w-1.5 h-1.5 bg-[var(--text-muted)] rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                        <span className="w-1.5 h-1.5 bg-[var(--text-muted)] rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Extraction Results Panel */}
            {extractionResults && (
              <div className="px-4 py-3 bg-[var(--color-success)]/5 border-t border-[var(--color-success)]/30">
                <div className="max-w-2xl mx-auto">
                  <div className="flex items-center justify-between mb-2">
                    <div className="type-label text-[var(--color-success)]">
                      EXTRACTED INSIGHTS
                    </div>
                    <button
                      onClick={() => setExtractionResults(null)}
                      className="type-micro text-[var(--text-secondary)] hover:text-[var(--text-primary)] active:scale-[0.97] transition-all duration-150 ease-out"
                    >
                      &times;
                    </button>
                  </div>

                  {extractionResults.sessionSummary && (
                    <p className="type-micro text-[var(--text-secondary)] mb-2 italic">
                      &quot;{extractionResults.sessionSummary}&quot;
                    </p>
                  )}

                  {extractionResults.insights?.length > 0 ? (
                    <div className="space-y-1.5">
                      {extractionResults.insights.map((insight: any, i: number) => (
                        <div
                          key={i}
                          className="bg-[var(--bg-secondary)] border border-[var(--border)] px-3 py-2 flex items-start gap-2"
                        >
                          <div className="flex-1 min-w-0">
                            <span className="text-sm text-[var(--text-primary)]">{insight.description}</span>
                            <div className="flex items-center gap-2 mt-1">
                              <span className="type-micro bg-[var(--bg-tertiary)] px-1.5 py-0.5">{insight.category}</span>
                              <span className="type-micro text-[var(--text-muted)]">
                                {Math.round(insight.confidence * 100)}% confidence
                              </span>
                              {extractionResults.savedInsights?.some((s: any) =>
                                s.description === insight.description
                              ) && (
                                <span className="type-micro text-[var(--color-success)]">SAVED</span>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="type-micro text-[var(--text-muted)]">
                      No clear insights found yet. Keep exploring your ideas!
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Session Capture Tally */}
            <SessionCaptureTally captures={sessionCaptures} />

            {/* Harvest Review results */}
            {harvestItems && harvestItems.length > 0 && (
              <HarvestReview
                items={harvestItems}
                seriesId={series.id}
                issueId={issueId}
                onDone={() => setHarvestItems(null)}
              />
            )}

            {/* Input */}
            <div className="p-4 border-t border-[var(--border)]">
              <div className="max-w-2xl mx-auto flex gap-3">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Share your thoughts..."
                  className="flex-1 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg px-4 py-3 resize-none text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--color-primary)] transition-colors"
                  rows={2}
                  disabled={isLoading}
                />
                <Tip content="Send message (Enter)">
                  <button
                    onClick={sendMessage}
                    disabled={!input.trim() || isLoading}
                    className="type-label px-4 border border-[var(--text-primary)] text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] hover-lift disabled:border-[var(--border)] disabled:text-[var(--text-muted)]"
                  >
                    SEND
                  </button>
                </Tip>
              </div>
              <div className="max-w-2xl mx-auto mt-2 flex items-center justify-between">
                <div className="type-micro text-[var(--text-muted)]">
                  ENTER TO SEND // SHIFT+ENTER FOR NEW LINE
                </div>
                {/* Harvest button - visible when session has messages */}
                {session && displayMessages.length > 0 && !harvestItems && (
                  <button
                    onClick={handleHarvest}
                    disabled={harvesting}
                    className="hover-lift type-micro px-3 py-1.5 border border-[var(--border)] text-[var(--text-secondary)]"
                  >
                    {harvesting ? 'Harvesting...' : '[HARVEST SESSION]'}
                  </button>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
