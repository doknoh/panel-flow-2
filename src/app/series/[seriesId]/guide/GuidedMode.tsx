'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useToast } from '@/contexts/ToastContext'
import { analyzeProjectCompleteness, type CompletenessAnalysis } from './analyzeCompleteness'

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
  const [messages, setMessages] = useState<GuidedMessage[]>(initialMessages)
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [showSessionPicker, setShowSessionPicker] = useState(!existingSession && recentSessions.length > 0)
  const [analysis, setAnalysis] = useState<CompletenessAnalysis | null>(null)
  const [pendingExtraction, setPendingExtraction] = useState<any>(null)

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
  }, [messages])

  // Auto-focus input
  useEffect(() => {
    inputRef.current?.focus()
  }, [session])

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
    setMessages([])
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
    setMessages(msgs || [])
    setShowSessionPicker(false)

    // Update last_active_at
    await supabase
      .from('guided_sessions')
      .update({ last_active_at: new Date().toISOString() })
      .eq('id', sessionToResume.id)
  }

  // Generate the initial AI message
  const generateInitialMessage = async (sessionId: string, sessionType: string) => {
    setIsLoading(true)

    try {
      const response = await fetch('/api/guide', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          series,
          issue: currentIssue,
          scene: currentScene,
          page: currentPage,
          analysis,
          writerInsights,
          isInitial: true,
          sessionType,
        }),
      })

      if (!response.ok) throw new Error('Failed to generate response')

      const data = await response.json()

      // Save assistant message
      const supabase = createClient()
      const { data: savedMessage } = await supabase
        .from('guided_messages')
        .insert({
          session_id: sessionId,
          role: 'assistant',
          content: data.response,
          extracted_data: null,
        })
        .select()
        .single()

      if (savedMessage) {
        setMessages([savedMessage])
      }
    } catch (error) {
      showToast('Failed to start conversation', 'error')
    } finally {
      setIsLoading(false)
    }
  }

  // Send a message
  const sendMessage = async () => {
    if (!input.trim() || !session || isLoading) return

    const userMessage = input.trim()
    setInput('')
    setIsLoading(true)

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

    if (savedUserMessage) {
      setMessages(prev => [...prev, savedUserMessage])
    }

    try {
      const response = await fetch('/api/guide', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: session.id,
          series,
          issue: currentIssue,
          scene: currentScene,
          page: currentPage,
          analysis,
          writerInsights,
          messages: [...messages, { role: 'user', content: userMessage }],
          userMessage,
        }),
      })

      if (!response.ok) throw new Error('Failed to generate response')

      const data = await response.json()

      // Save assistant message
      const { data: savedAssistantMessage } = await supabase
        .from('guided_messages')
        .insert({
          session_id: session.id,
          role: 'assistant',
          content: data.response,
          extracted_data: data.extractedData || null,
        })
        .select()
        .single()

      if (savedAssistantMessage) {
        setMessages(prev => [...prev, savedAssistantMessage])
      }

      // Check if there's data to extract/save
      if (data.extractedData) {
        setPendingExtraction(data.extractedData)
      }

      // Update session focus area if provided
      if (data.focusArea) {
        await supabase
          .from('guided_sessions')
          .update({ focus_area: data.focusArea })
          .eq('id', session.id)
      }
    } catch (error) {
      showToast('Failed to send message', 'error')
    } finally {
      setIsLoading(false)
    }
  }

  // Save extracted data
  const saveExtractedData = async () => {
    if (!pendingExtraction) return

    const supabase = createClient()
    const { type, table, id, data } = pendingExtraction

    try {
      const { error } = await supabase
        .from(table)
        .update(data)
        .eq('id', id)

      if (error) throw error

      showToast(`${type} saved successfully`, 'success')
      setPendingExtraction(null)
      router.refresh()
    } catch (error) {
      showToast('Failed to save', 'error')
    }
  }

  // Handle keyboard shortcuts
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
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
    <div className="h-screen flex flex-col bg-zinc-950 text-white">
      {/* Header */}
      <header className="border-b border-zinc-800 px-4 py-3 shrink-0">
        <div className="flex items-center justify-between max-w-4xl mx-auto">
          <div className="flex items-center gap-3">
            <Link
              href={currentIssue ? `/series/${series.id}/issues/${currentIssue.id}` : `/series/${series.id}`}
              className="text-zinc-400 hover:text-white"
            >
              ←
            </Link>
            <div>
              <h1 className="font-semibold flex items-center gap-2">
                <span className="text-purple-400">Guide</span>
                <span className="text-zinc-600">/</span>
                <span>{contextLabel}</span>
              </h1>
              {session && (
                <p className="text-xs text-zinc-500">
                  {session.session_type === 'general' ? 'General Session' : session.session_type.replace(/_/g, ' ')}
                  {session.focus_area && ` • Exploring: ${session.focus_area}`}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {session && (
              <button
                onClick={() => {
                  setSession(null)
                  setMessages([])
                  setShowSessionPicker(true)
                }}
                className="text-xs text-zinc-400 hover:text-white px-2 py-1"
              >
                New Session
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 overflow-hidden flex flex-col max-w-4xl mx-auto w-full">
        {/* Session Picker / Start Screen */}
        {!session && (
          <div className="flex-1 flex flex-col items-center justify-center p-8">
            <div className="text-center mb-8">
              <div className="text-6xl mb-4">🎭</div>
              <h2 className="text-2xl font-bold mb-2">Guided Writing Session</h2>
              <p className="text-zinc-400 max-w-md">
                Your AI writing partner will guide you through developing your story,
                asking questions and helping you discover the details that bring it to life.
              </p>
            </div>

            {/* Completeness Summary */}
            {analysis && (
              <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 mb-6 w-full max-w-md">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-medium">Project Completeness</span>
                  <span className="text-sm text-zinc-400">{analysis.overallScore}%</span>
                </div>
                <div className="w-full h-2 bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-purple-500 to-blue-500 transition-all"
                    style={{ width: `${analysis.overallScore}%` }}
                  />
                </div>
                <div className="mt-3 text-xs text-zinc-500">
                  {analysis.suggestedFocus && (
                    <p>Suggested focus: <span className="text-purple-400">{analysis.suggestedFocus}</span></p>
                  )}
                </div>
              </div>
            )}

            {/* Session Type Buttons */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-md mb-6">
              <button
                onClick={() => startNewSession('general')}
                className="p-4 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 rounded-lg text-left transition-colors"
              >
                <div className="font-medium mb-1">Open Exploration</div>
                <div className="text-xs text-zinc-400">Let the AI guide based on what's needed</div>
              </button>
              <button
                onClick={() => startNewSession('character_deep_dive')}
                className="p-4 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 rounded-lg text-left transition-colors"
              >
                <div className="font-medium mb-1">Character Deep Dive</div>
                <div className="text-xs text-zinc-400">Explore motivations, arcs, and voices</div>
              </button>
              <button
                onClick={() => startNewSession('outline')}
                className="p-4 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 rounded-lg text-left transition-colors"
              >
                <div className="font-medium mb-1">Story Structure</div>
                <div className="text-xs text-zinc-400">Work out acts, beats, and pacing</div>
              </button>
              <button
                onClick={() => startNewSession('world_building')}
                className="p-4 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 rounded-lg text-left transition-colors"
              >
                <div className="font-medium mb-1">World Building</div>
                <div className="text-xs text-zinc-400">Define locations, rules, and atmosphere</div>
              </button>
            </div>

            {/* Recent Sessions */}
            {recentSessions.length > 0 && (
              <div className="w-full max-w-md">
                <h3 className="text-sm font-medium text-zinc-400 mb-2">Resume a session</h3>
                <div className="space-y-2">
                  {recentSessions.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => resumeSession(s)}
                      className="w-full p-3 bg-zinc-900/50 hover:bg-zinc-800/50 border border-zinc-800 rounded-lg text-left transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm">
                          {s.title || s.session_type.replace(/_/g, ' ')}
                        </span>
                        <span className="text-xs text-zinc-500">
                          {new Date(s.last_active_at).toLocaleDateString()}
                        </span>
                      </div>
                      {s.focus_area && (
                        <div className="text-xs text-zinc-500 mt-1">
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
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                      msg.role === 'user'
                        ? 'bg-blue-600 text-white'
                        : 'bg-zinc-800 text-zinc-100'
                    }`}
                  >
                    <div className="whitespace-pre-wrap text-sm leading-relaxed">
                      {msg.content}
                    </div>
                    {msg.extracted_data && (
                      <div className="mt-3 pt-3 border-t border-white/10">
                        <div className="text-xs text-zinc-300 mb-2">
                          💾 Detected: {msg.extracted_data.type}
                        </div>
                        <button
                          onClick={() => setPendingExtraction(msg.extracted_data)}
                          className="text-xs bg-purple-600 hover:bg-purple-500 px-3 py-1 rounded-full"
                        >
                          Save to project
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {isLoading && (
                <div className="flex justify-start">
                  <div className="bg-zinc-800 rounded-2xl px-4 py-3">
                    <div className="flex items-center gap-2 text-sm text-zinc-400">
                      <div className="flex gap-1">
                        <span className="w-2 h-2 bg-zinc-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                        <span className="w-2 h-2 bg-zinc-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                        <span className="w-2 h-2 bg-zinc-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                      </div>
                      <span>Thinking...</span>
                    </div>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Pending Extraction Banner */}
            {pendingExtraction && (
              <div className="px-4 py-3 bg-purple-900/30 border-t border-purple-500/30">
                <div className="flex items-center justify-between max-w-2xl mx-auto">
                  <div className="text-sm">
                    <span className="text-purple-300">Ready to save:</span>{' '}
                    <span className="text-white">{pendingExtraction.type}</span>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setPendingExtraction(null)}
                      className="text-xs text-zinc-400 hover:text-white px-2 py-1"
                    >
                      Dismiss
                    </button>
                    <button
                      onClick={saveExtractedData}
                      className="text-xs bg-purple-600 hover:bg-purple-500 px-3 py-1 rounded"
                    >
                      Save
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Input */}
            <div className="p-4 border-t border-zinc-800">
              <div className="max-w-2xl mx-auto flex gap-3">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Share your thoughts..."
                  className="flex-1 bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-3 resize-none text-sm focus:outline-none focus:border-purple-500 transition-colors"
                  rows={2}
                  disabled={isLoading}
                />
                <button
                  onClick={sendMessage}
                  disabled={!input.trim() || isLoading}
                  className="px-4 bg-purple-600 hover:bg-purple-500 disabled:bg-zinc-700 disabled:text-zinc-500 rounded-xl font-medium transition-colors"
                >
                  Send
                </button>
              </div>
              <div className="max-w-2xl mx-auto mt-2 text-xs text-zinc-500 text-center">
                Press Enter to send • Shift+Enter for new line
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
