'use client'

import { useState, useRef, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useToast } from '@/contexts/ToastContext'
import { analyzeProjectCompleteness, type CompletenessAnalysis } from './analyzeCompleteness'
import { parseSSEData, type ToolUseSSEEvent } from '@/lib/ai/streaming'
import ThemeToggle from '@/components/ui/ThemeToggle'

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
    const { data: msgs } = await supabase
      .from('guided_messages')
      .select('*')
      .eq('session_id', sessionToResume.id)
      .order('created_at', { ascending: true })

    setSession(sessionToResume)
    setDisplayMessages((msgs || []).map((m: any) => ({ id: m.id, role: m.role, content: m.content })))
    setShowSessionPicker(false)

    // Update last_active_at
    await supabase
      .from('guided_sessions')
      .update({ last_active_at: new Date().toISOString() })
      .eq('id', sessionToResume.id)
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
      const { data: savedMessage } = await supabase
        .from('guided_messages')
        .insert({
          session_id: sessionId,
          role: 'assistant',
          content: result.text,
          extracted_data: null,
        })
        .select()
        .single()

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
    const { data: savedUserMessage } = await supabase
      .from('guided_messages')
      .insert({
        session_id: session.id,
        role: 'user',
        content: userMessage,
      })
      .select()
      .single()

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
      const { data: savedAssistantMessage } = await supabase
        .from('guided_messages')
        .insert({
          session_id: session.id,
          role: 'assistant',
          content: result.text,
          extracted_data: null,
        })
        .select()
        .single()

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
      await supabase
        .from('guided_sessions')
        .update({ last_active_at: new Date().toISOString() })
        .eq('id', session.id)
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
    const { data: savedUserMessage } = await supabase
      .from('guided_messages')
      .insert({
        session_id: session.id,
        role: 'user',
        content: shiftMessage,
      })
      .select()
      .single()

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
      const { data: savedAssistantMessage } = await supabase
        .from('guided_messages')
        .insert({
          session_id: session.id,
          role: 'assistant',
          content: result.text,
          extracted_data: null,
        })
        .select()
        .single()

      setDisplayMessages(prev => [...prev, {
        id: savedAssistantMessage?.id || `msg-${Date.now()}`,
        role: 'assistant',
        content: result.text,
        toolProposals: result.toolProposals.length > 0 ? result.toolProposals : undefined,
      }])
      setStreamingText('')
      setStreamingToolProposals([])

      // Update session focus area
      await supabase
        .from('guided_sessions')
        .update({
          focus_area: newFocus,
          session_type: newFocus,
        })
        .eq('id', session.id)

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

  // Determine the context label
  const contextLabel = currentPage
    ? `Page ${currentPage.page_number}`
    : currentScene
    ? currentScene.title || currentScene.name || 'Scene'
    : currentIssue
    ? `Issue #${currentIssue.number}${currentIssue.title ? `: ${currentIssue.title}` : ''}`
    : series.title

  return (
    <div className="h-screen flex flex-col bg-[var(--bg-primary)] text-white">
      {/* Header */}
      <header className="border-b border-[var(--border)] px-4 py-3 shrink-0">
        <div className="flex items-center justify-between max-w-4xl mx-auto">
          <div className="flex items-center gap-3">
            <Link
              href={currentIssue ? `/series/${series.id}/issues/${currentIssue.id}` : `/series/${series.id}`}
              className="text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            >
              &larr;
            </Link>
            <div>
              <h1 className="font-semibold flex items-center gap-2">
                <span className="text-[var(--accent-hover)]">Guide</span>
                <span className="text-[var(--text-muted)]">/</span>
                <span>{contextLabel}</span>
              </h1>
              {session && (
                <p className="text-xs text-[var(--text-muted)]">
                  {session.session_type === 'general' ? 'General Session' : session.session_type.replace(/_/g, ' ')}
                  {session.focus_area && ` \u2022 Exploring: ${session.focus_area}`}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {session && (
              <div className="relative">
                <button
                  onClick={() => setShowSessionMenu(!showSessionMenu)}
                  className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] px-3 py-1.5 border border-[var(--border)] rounded-lg flex items-center gap-1 active:scale-[0.97] transition-all duration-150 ease-out"
                >
                  Options
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
                    <div className="absolute right-0 top-full mt-1 z-20 w-56 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg shadow-xl overflow-hidden">
                      {/* Shift Focus Options */}
                      <div className="p-2 border-b border-[var(--border)]">
                        <div className="text-[10px] uppercase text-[var(--text-muted)] px-2 py-1">Shift Focus To</div>
                        <button
                          onClick={() => shiftFocus('character_deep_dive')}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-[var(--bg-tertiary)] rounded active:scale-[0.97] transition-all duration-150 ease-out"
                        >
                          Characters
                        </button>
                        <button
                          onClick={() => shiftFocus('outline')}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-[var(--bg-tertiary)] rounded active:scale-[0.97] transition-all duration-150 ease-out"
                        >
                          Story Structure
                        </button>
                        <button
                          onClick={() => shiftFocus('world_building')}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-[var(--bg-tertiary)] rounded active:scale-[0.97] transition-all duration-150 ease-out"
                        >
                          World Building
                        </button>
                        <button
                          onClick={() => shiftFocus('general')}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-[var(--bg-tertiary)] rounded active:scale-[0.97] transition-all duration-150 ease-out"
                        >
                          Open Exploration
                        </button>
                      </div>

                      {/* Actions */}
                      <div className="p-2">
                        <button
                          onClick={() => {
                            setShowSessionMenu(false)
                            extractInsights()
                          }}
                          disabled={isExtracting || displayMessages.length < 2}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-[var(--bg-tertiary)] rounded disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.97] transition-all duration-150 ease-out"
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
                          className="w-full text-left px-3 py-2 text-sm text-[var(--color-error)] hover:bg-[var(--bg-tertiary)] rounded active:scale-[0.97] transition-all duration-150 ease-out"
                        >
                          New Session
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
            <ThemeToggle />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 overflow-hidden flex flex-col max-w-4xl mx-auto w-full">
        {/* Session Picker / Start Screen */}
        {!session && (
          <div className="flex-1 flex flex-col items-center justify-center p-8">
            <div className="text-center mb-8">
              <h2 className="text-2xl font-bold mb-2">Guided Writing Session</h2>
              <p className="text-[var(--text-secondary)] max-w-md">
                Your AI writing partner will guide you through developing your story,
                asking questions and helping you discover the details that bring it to life.
              </p>
            </div>

            {/* Completeness Summary */}
            {analysis && (
              <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg p-4 mb-6 w-full max-w-md">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-medium">Project Completeness</span>
                  <span className="text-sm text-[var(--text-secondary)]">{analysis.overallScore}%</span>
                </div>
                <div className="w-full h-2 bg-[var(--bg-tertiary)] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-[var(--accent-hover)] to-[var(--color-primary)] transition-all"
                    style={{ width: `${analysis.overallScore}%` }}
                  />
                </div>
                <div className="mt-3 text-xs text-[var(--text-muted)]">
                  {analysis.suggestedFocus && (
                    <p>Suggested focus: <span className="text-[var(--accent-hover)]">{analysis.suggestedFocus}</span></p>
                  )}
                </div>
              </div>
            )}

            {/* Session Type Buttons */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-md mb-6">
              <button
                onClick={() => startNewSession('general')}
                className="p-4 bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)] border border-[var(--border)] rounded-lg text-left active:scale-[0.97] transition-all duration-150 ease-out"
              >
                <div className="font-medium mb-1">Open Exploration</div>
                <div className="text-xs text-[var(--text-secondary)]">Let the AI guide based on what&apos;s needed</div>
              </button>
              <button
                onClick={() => startNewSession('character_deep_dive')}
                className="p-4 bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)] border border-[var(--border)] rounded-lg text-left active:scale-[0.97] transition-all duration-150 ease-out"
              >
                <div className="font-medium mb-1">Character Deep Dive</div>
                <div className="text-xs text-[var(--text-secondary)]">Explore motivations, arcs, and voices</div>
              </button>
              <button
                onClick={() => startNewSession('outline')}
                className="p-4 bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)] border border-[var(--border)] rounded-lg text-left active:scale-[0.97] transition-all duration-150 ease-out"
              >
                <div className="font-medium mb-1">Story Structure</div>
                <div className="text-xs text-[var(--text-secondary)]">Work out acts, beats, and pacing</div>
              </button>
              <button
                onClick={() => startNewSession('world_building')}
                className="p-4 bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)] border border-[var(--border)] rounded-lg text-left active:scale-[0.97] transition-all duration-150 ease-out"
              >
                <div className="font-medium mb-1">World Building</div>
                <div className="text-xs text-[var(--text-secondary)]">Define locations, rules, and atmosphere</div>
              </button>
            </div>

            {/* Recent Sessions */}
            {recentSessions.length > 0 && (
              <div className="w-full max-w-md">
                <h3 className="text-sm font-medium text-[var(--text-secondary)] mb-2">Resume a session</h3>
                <div className="space-y-2">
                  {recentSessions.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => resumeSession(s)}
                      className="w-full p-3 bg-[var(--bg-secondary)]/50 hover:bg-[var(--bg-tertiary)]/50 border border-[var(--border)] rounded-lg text-left active:scale-[0.97] hover:border-[var(--border-strong)] hover:shadow-[0_2px_8px_color-mix(in_srgb,var(--text-primary)_8%,transparent)] transition-all duration-150 ease-out"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm">
                          {s.title || s.session_type.replace(/_/g, ' ')}
                        </span>
                        <span className="text-xs text-[var(--text-muted)]">
                          {new Date(s.last_active_at).toLocaleDateString()}
                        </span>
                      </div>
                      {s.focus_area && (
                        <div className="text-xs text-[var(--text-muted)] mt-1">
                          Last exploring: {s.focus_area}
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
                    className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                      msg.role === 'user'
                        ? 'bg-[var(--color-primary)] text-white'
                        : 'bg-[var(--bg-tertiary)] text-[var(--text-primary)]'
                    }`}
                  >
                    <div className="whitespace-pre-wrap text-sm leading-relaxed">
                      {msg.content}
                    </div>

                    {/* Tool Proposals */}
                    {msg.toolProposals && msg.toolProposals.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-white/10 space-y-2">
                        {msg.toolProposals.map((proposal) => {
                          const display = TOOL_DISPLAY[proposal.toolName] || { icon: '🔧', label: proposal.toolName, color: 'var(--text-secondary)' }
                          const summary = getToolSummary(proposal.toolName, proposal.input)

                          return (
                            <div
                              key={proposal.toolUseId}
                              className="border border-dashed rounded-lg p-3 bg-[var(--bg-primary)]/30"
                              style={{ borderColor: display.color }}
                            >
                              <div className="flex items-start gap-2 mb-1">
                                <span className="text-base">{display.icon}</span>
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-medium" style={{ color: display.color }}>
                                    {display.label}
                                  </p>
                                  <p className="text-xs text-[var(--text-secondary)] mt-0.5">{summary}</p>
                                </div>
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
                                    className="flex-1 py-1.5 px-3 rounded text-xs font-medium transition-colors border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]"
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
                </div>
              ))}

              {/* Streaming text */}
              {streamingText && (
                <div className="flex justify-start">
                  <div className="max-w-[85%] bg-[var(--bg-tertiary)] text-[var(--text-primary)] rounded-2xl px-4 py-3">
                    <div className="whitespace-pre-wrap text-sm leading-relaxed">
                      {streamingText}
                    </div>

                    {streamingToolProposals.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-white/10 space-y-2">
                        {streamingToolProposals.map((proposal) => {
                          const display = TOOL_DISPLAY[proposal.toolName] || { icon: '🔧', label: proposal.toolName, color: 'var(--text-secondary)' }
                          return (
                            <div
                              key={proposal.toolUseId}
                              className="border border-dashed rounded-lg p-3 opacity-70 bg-[var(--bg-primary)]/30"
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
                </div>
              )}

              {/* Loading indicator (before first token) */}
              {isLoading && !streamingText && (
                <div className="flex justify-start">
                  <div className="bg-[var(--bg-tertiary)] rounded-2xl px-4 py-3">
                    <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                      <div className="flex gap-1">
                        <span className="w-2 h-2 bg-[var(--text-muted)] rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                        <span className="w-2 h-2 bg-[var(--text-muted)] rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                        <span className="w-2 h-2 bg-[var(--text-muted)] rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Extraction Results Panel */}
            {extractionResults && (
              <div className="px-4 py-3 bg-emerald-900/20 border-t border-emerald-500/30">
                <div className="max-w-2xl mx-auto">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-sm font-medium text-emerald-300">
                      Extracted Insights
                    </div>
                    <button
                      onClick={() => setExtractionResults(null)}
                      className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] active:scale-[0.97] transition-all duration-150 ease-out"
                    >
                      &times;
                    </button>
                  </div>

                  {extractionResults.sessionSummary && (
                    <p className="text-xs text-[var(--text-secondary)] mb-2 italic">
                      &quot;{extractionResults.sessionSummary}&quot;
                    </p>
                  )}

                  {extractionResults.insights?.length > 0 ? (
                    <div className="space-y-1.5">
                      {extractionResults.insights.map((insight: any, i: number) => (
                        <div
                          key={i}
                          className="text-xs bg-[var(--bg-secondary)]/50 px-3 py-2 rounded flex items-start gap-2"
                        >
                          <div className="flex-1 min-w-0">
                            <span className="text-[var(--text-primary)]">{insight.description}</span>
                            <div className="flex items-center gap-2 mt-1 text-[10px] text-[var(--text-muted)]">
                              <span className="bg-[var(--bg-tertiary)] px-1.5 py-0.5 rounded">{insight.category}</span>
                              <span>
                                {Math.round(insight.confidence * 100)}% confidence
                              </span>
                              {extractionResults.savedInsights?.some((s: any) =>
                                s.description === insight.description
                              ) && (
                                <span className="text-emerald-400">Saved</span>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-[var(--text-muted)]">
                      No clear insights found yet. Keep exploring your ideas!
                    </p>
                  )}
                </div>
              </div>
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
                  className="flex-1 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-xl px-4 py-3 resize-none text-sm focus:outline-none focus:border-[var(--accent-hover)] transition-colors"
                  rows={2}
                  disabled={isLoading}
                />
                <button
                  onClick={sendMessage}
                  disabled={!input.trim() || isLoading}
                  className="px-4 bg-[var(--accent-hover)] hover:opacity-90 disabled:bg-[var(--bg-tertiary)] disabled:text-[var(--text-muted)] rounded-xl font-medium active:scale-[0.97] transition-all duration-150 ease-out"
                >
                  Send
                </button>
              </div>
              <div className="max-w-2xl mx-auto mt-2 text-xs text-[var(--text-muted)] text-center">
                Press Enter to send &bull; Shift+Enter for new line
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
