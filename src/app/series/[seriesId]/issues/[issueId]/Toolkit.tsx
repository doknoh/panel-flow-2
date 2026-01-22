'use client'

import { useState, useRef, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

interface Issue {
  id: string
  number: number
  title: string | null
  summary: string | null
  themes: string | null
  status: string
  series: {
    id: string
    title: string
    characters: any[]
    locations: any[]
  }
  acts: any[]
}

interface ToolkitProps {
  issue: Issue
}

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export default function Toolkit({ issue }: ToolkitProps) {
  const [activeTab, setActiveTab] = useState<'context' | 'characters' | 'locations' | 'ai'>('context')
  const [isEditingContext, setIsEditingContext] = useState(false)
  const [contextForm, setContextForm] = useState({
    title: issue.title || '',
    summary: issue.summary || '',
    themes: issue.themes || '',
  })
  const [saving, setSaving] = useState(false)

  // AI Chat state
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [chatInput, setChatInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const chatEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages])

  const saveContext = async () => {
    setSaving(true)
    const supabase = createClient()

    const { error } = await supabase
      .from('issues')
      .update({
        title: contextForm.title || null,
        summary: contextForm.summary || null,
        themes: contextForm.themes || null,
      })
      .eq('id', issue.id)

    if (!error) {
      setIsEditingContext(false)
    }
    setSaving(false)
  }

  const sendMessage = async () => {
    if (!chatInput.trim() || isLoading) return

    const userMessage = chatInput.trim()
    setChatInput('')
    setChatMessages(prev => [...prev, { role: 'user', content: userMessage }])
    setIsLoading(true)

    try {
      // Build context string
      const context = `
Series: ${issue.series.title}
Issue #${issue.number}${issue.title ? `: ${issue.title}` : ''}
${issue.summary ? `Summary: ${issue.summary}` : ''}
${issue.themes ? `Themes: ${issue.themes}` : ''}

Characters: ${issue.series.characters.map((c: any) => c.name).join(', ') || 'None defined'}
Locations: ${issue.series.locations.map((l: any) => l.name).join(', ') || 'None defined'}
`.trim()

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMessage, context }),
      })

      const data = await response.json()

      if (data.error) {
        setChatMessages(prev => [...prev, { role: 'assistant', content: `Error: ${data.error}` }])
      } else {
        setChatMessages(prev => [...prev, { role: 'assistant', content: data.response }])
      }
    } catch {
      setChatMessages(prev => [...prev, { role: 'assistant', content: 'Failed to connect to AI assistant.' }])
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
      <div className="flex gap-1 mb-4 bg-zinc-800 rounded-lg p-1 shrink-0">
        <button
          onClick={() => setActiveTab('context')}
          className={`flex-1 py-1.5 px-2 rounded text-xs transition-colors ${
            activeTab === 'context'
              ? 'bg-zinc-700 text-white'
              : 'text-zinc-400 hover:text-white'
          }`}
        >
          Context
        </button>
        <button
          onClick={() => setActiveTab('characters')}
          className={`flex-1 py-1.5 px-2 rounded text-xs transition-colors ${
            activeTab === 'characters'
              ? 'bg-zinc-700 text-white'
              : 'text-zinc-400 hover:text-white'
          }`}
        >
          Chars
        </button>
        <button
          onClick={() => setActiveTab('locations')}
          className={`flex-1 py-1.5 px-2 rounded text-xs transition-colors ${
            activeTab === 'locations'
              ? 'bg-zinc-700 text-white'
              : 'text-zinc-400 hover:text-white'
          }`}
        >
          Locs
        </button>
        <button
          onClick={() => setActiveTab('ai')}
          className={`flex-1 py-1.5 px-2 rounded text-xs transition-colors ${
            activeTab === 'ai'
              ? 'bg-blue-600 text-white'
              : 'text-zinc-400 hover:text-white'
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
              <div className="bg-zinc-800 rounded p-3">
                <div className="text-2xl font-bold">{issue.acts?.length || 0}</div>
                <div className="text-xs text-zinc-400">Acts</div>
              </div>
              <div className="bg-zinc-800 rounded p-3">
                <div className="text-2xl font-bold">{totalPages}</div>
                <div className="text-xs text-zinc-400">Pages</div>
              </div>
              <div className="bg-zinc-800 rounded p-3">
                <div className="text-2xl font-bold">{totalPanels}</div>
                <div className="text-xs text-zinc-400">Panels</div>
              </div>
            </div>

            {/* Issue Context */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
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
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs text-zinc-400 mb-1">Title</label>
                    <input
                      type="text"
                      value={contextForm.title}
                      onChange={(e) => setContextForm(prev => ({ ...prev, title: e.target.value }))}
                      placeholder="Issue title..."
                      className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-zinc-400 mb-1">Summary</label>
                    <textarea
                      value={contextForm.summary}
                      onChange={(e) => setContextForm(prev => ({ ...prev, summary: e.target.value }))}
                      placeholder="Brief summary of this issue..."
                      className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm resize-none focus:border-blue-500 focus:outline-none"
                      rows={3}
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-zinc-400 mb-1">Themes</label>
                    <textarea
                      value={contextForm.themes}
                      onChange={(e) => setContextForm(prev => ({ ...prev, themes: e.target.value }))}
                      placeholder="Key themes explored..."
                      className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm resize-none focus:border-blue-500 focus:outline-none"
                      rows={2}
                    />
                  </div>
                  <button
                    onClick={saveContext}
                    disabled={saving}
                    className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-zinc-700 py-2 rounded text-sm"
                  >
                    {saving ? 'Saving...' : 'Save Context'}
                  </button>
                </div>
              ) : (
                <div className="space-y-3 text-sm">
                  {issue.title ? (
                    <div>
                      <span className="text-zinc-400">Title: </span>
                      <span>{issue.title}</span>
                    </div>
                  ) : null}
                  {issue.summary ? (
                    <div>
                      <span className="text-zinc-400 block mb-1">Summary</span>
                      <p className="text-zinc-300">{issue.summary}</p>
                    </div>
                  ) : null}
                  {issue.themes ? (
                    <div>
                      <span className="text-zinc-400 block mb-1">Themes</span>
                      <p className="text-zinc-300">{issue.themes}</p>
                    </div>
                  ) : null}
                  {!issue.title && !issue.summary && !issue.themes && (
                    <p className="text-zinc-500 text-center py-2">
                      No context set. Click Edit to add details.
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Status */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
              <h3 className="font-semibold text-sm mb-3">Status</h3>
              <select
                value={issue.status}
                onChange={async (e) => {
                  const supabase = createClient()
                  await supabase
                    .from('issues')
                    .update({ status: e.target.value })
                    .eq('id', issue.id)
                }}
                className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm"
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
          <div className="space-y-2 overflow-y-auto">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold text-sm text-zinc-400">Series Characters</h3>
            </div>
            {issue.series.characters.length === 0 ? (
              <p className="text-zinc-500 text-sm text-center py-4">
                No characters defined yet. Add characters from the series page.
              </p>
            ) : (
              <div className="space-y-2">
                {issue.series.characters.map((char: any) => (
                  <div
                    key={char.id}
                    className="bg-zinc-800 rounded p-3"
                  >
                    <div className="font-medium text-sm">{char.name}</div>
                    {char.role && (
                      <div className="text-xs text-zinc-400">{char.role}</div>
                    )}
                    {char.description && (
                      <p className="text-xs text-zinc-500 mt-1 line-clamp-2">{char.description}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Locations Tab */}
        {activeTab === 'locations' && (
          <div className="space-y-2 overflow-y-auto">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold text-sm text-zinc-400">Series Locations</h3>
            </div>
            {issue.series.locations.length === 0 ? (
              <p className="text-zinc-500 text-sm text-center py-4">
                No locations defined yet. Add locations from the series page.
              </p>
            ) : (
              <div className="space-y-2">
                {issue.series.locations.map((loc: any) => (
                  <div
                    key={loc.id}
                    className="bg-zinc-800 rounded p-3"
                  >
                    <div className="font-medium text-sm">{loc.name}</div>
                    {loc.description && (
                      <p className="text-xs text-zinc-500 mt-1 line-clamp-2">{loc.description}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* AI Chat Tab */}
        {activeTab === 'ai' && (
          <div className="flex flex-col h-full">
            {/* Chat Messages */}
            <div className="flex-1 overflow-y-auto space-y-3 mb-3">
              {chatMessages.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-zinc-500 text-sm mb-2">AI Writing Assistant</p>
                  <p className="text-zinc-600 text-xs">Ask for help with dialogue, descriptions, or story ideas.</p>
                </div>
              ) : (
                chatMessages.map((msg, i) => (
                  <div
                    key={i}
                    className={`p-3 rounded-lg text-sm ${
                      msg.role === 'user'
                        ? 'bg-blue-900/30 ml-4'
                        : 'bg-zinc-800 mr-4'
                    }`}
                  >
                    <p className="text-xs text-zinc-500 mb-1">
                      {msg.role === 'user' ? 'You' : 'AI Assistant'}
                    </p>
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                  </div>
                ))
              )}
              {isLoading && (
                <div className="bg-zinc-800 p-3 rounded-lg mr-4">
                  <p className="text-xs text-zinc-500 mb-1">AI Assistant</p>
                  <p className="text-zinc-400">Thinking...</p>
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
                  placeholder="Ask the AI assistant..."
                  className="flex-1 bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  disabled={isLoading}
                />
                <button
                  onClick={sendMessage}
                  disabled={isLoading || !chatInput.trim()}
                  className="bg-blue-600 hover:bg-blue-700 disabled:bg-zinc-700 px-4 py-2 rounded text-sm shrink-0"
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
