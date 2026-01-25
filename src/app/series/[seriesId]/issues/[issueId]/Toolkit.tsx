'use client'

import { useState, useRef, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'

interface ContinuityAlert {
  id: string
  type: 'character' | 'dialogue' | 'pacing' | 'structure'
  severity: 'warning' | 'info'
  message: string
  details: string
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
  const [activeTab, setActiveTab] = useState<'context' | 'characters' | 'locations' | 'alerts' | 'ai'>('context')
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
  })
  const [saving, setSaving] = useState(false)

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
  const chatEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages])

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
          onClick={() => setActiveTab('alerts')}
          className={`flex-1 py-1.5 px-2 rounded text-xs transition-colors relative ${
            activeTab === 'alerts'
              ? 'bg-zinc-700 text-white'
              : 'text-zinc-400 hover:text-white'
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
                <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
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
                    <label className="block text-xs text-zinc-400 mb-1">Tagline</label>
                    <input
                      type="text"
                      value={contextForm.tagline}
                      onChange={(e) => setContextForm(prev => ({ ...prev, tagline: e.target.value }))}
                      placeholder="One-line hook for this issue..."
                      className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-zinc-400 mb-1">Summary (TL;DR)</label>
                    <textarea
                      value={contextForm.summary}
                      onChange={(e) => setContextForm(prev => ({ ...prev, summary: e.target.value }))}
                      placeholder="Brief summary of this issue..."
                      className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm resize-none focus:border-blue-500 focus:outline-none"
                      rows={2}
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
                  <div>
                    <label className="block text-xs text-zinc-400 mb-1">Stakes</label>
                    <textarea
                      value={contextForm.stakes}
                      onChange={(e) => setContextForm(prev => ({ ...prev, stakes: e.target.value }))}
                      placeholder="What's at risk in this issue..."
                      className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm resize-none focus:border-blue-500 focus:outline-none"
                      rows={2}
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-zinc-400 mb-1">Motifs</label>
                    <textarea
                      value={contextForm.motifs}
                      onChange={(e) => setContextForm(prev => ({ ...prev, motifs: e.target.value }))}
                      placeholder="Visual/narrative motifs for this issue..."
                      className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm resize-none focus:border-blue-500 focus:outline-none"
                      rows={2}
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-zinc-400 mb-1">Visual Style</label>
                    <textarea
                      value={contextForm.visual_style}
                      onChange={(e) => setContextForm(prev => ({ ...prev, visual_style: e.target.value }))}
                      placeholder="Visual style notes for artist..."
                      className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm resize-none focus:border-blue-500 focus:outline-none"
                      rows={2}
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-zinc-400 mb-1">Issue Rules</label>
                    <textarea
                      value={contextForm.rules}
                      onChange={(e) => setContextForm(prev => ({ ...prev, rules: e.target.value }))}
                      placeholder="Issue-specific conventions (e.g., 9-panel grid for introspection)..."
                      className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm resize-none focus:border-blue-500 focus:outline-none"
                      rows={2}
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-zinc-400 mb-1">Series Position</label>
                    <select
                      value={contextForm.series_act}
                      onChange={(e) => setContextForm(prev => ({ ...prev, series_act: e.target.value }))}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
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
                    className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-zinc-700 py-2 rounded text-sm sticky bottom-0"
                  >
                    {saving ? 'Saving...' : 'Save Context'}
                  </button>
                </div>
              ) : (
                <div className="space-y-3 text-sm max-h-80 overflow-y-auto">
                  {issue.title && (
                    <div>
                      <span className="text-zinc-400">Title: </span>
                      <span>{issue.title}</span>
                    </div>
                  )}
                  {issue.tagline && (
                    <div className="italic text-zinc-300">&ldquo;{issue.tagline}&rdquo;</div>
                  )}
                  {issue.series_act && (
                    <div className="inline-block px-2 py-0.5 bg-zinc-800 rounded text-xs">
                      Series {issue.series_act.toLowerCase()}
                    </div>
                  )}
                  {issue.summary && (
                    <div>
                      <span className="text-zinc-500 block text-xs mb-1">Summary</span>
                      <p className="text-zinc-300">{issue.summary}</p>
                    </div>
                  )}
                  {issue.themes && (
                    <div>
                      <span className="text-zinc-500 block text-xs mb-1">Themes</span>
                      <p className="text-zinc-300">{issue.themes}</p>
                    </div>
                  )}
                  {issue.stakes && (
                    <div>
                      <span className="text-zinc-500 block text-xs mb-1">Stakes</span>
                      <p className="text-zinc-300">{issue.stakes}</p>
                    </div>
                  )}
                  {issue.motifs && (
                    <div>
                      <span className="text-zinc-500 block text-xs mb-1">Motifs</span>
                      <p className="text-zinc-300">{issue.motifs}</p>
                    </div>
                  )}
                  {issue.visual_style && (
                    <div>
                      <span className="text-zinc-500 block text-xs mb-1">Visual Style</span>
                      <p className="text-zinc-300">{issue.visual_style}</p>
                    </div>
                  )}
                  {issue.rules && (
                    <div>
                      <span className="text-zinc-500 block text-xs mb-1">Issue Rules</span>
                      <p className="text-zinc-300">{issue.rules}</p>
                    </div>
                  )}
                  {!issue.title && !issue.summary && !issue.themes && !issue.tagline && (
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

        {/* Alerts Tab */}
        {activeTab === 'alerts' && (
          <div className="space-y-3 overflow-y-auto">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold text-sm text-zinc-400">Continuity Alerts</h3>
              {dismissedAlerts.size > 0 && (
                <button
                  onClick={clearDismissed}
                  className="text-xs text-zinc-500 hover:text-zinc-400"
                >
                  Show dismissed ({dismissedAlerts.size})
                </button>
              )}
            </div>

            {activeAlerts.length === 0 ? (
              <div className="text-center py-8">
                <div className="text-green-400 text-2xl mb-2">✓</div>
                <p className="text-zinc-400 text-sm">No issues detected</p>
                <p className="text-zinc-600 text-xs mt-1">
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
                        <p className="text-xs text-zinc-400">{alert.details}</p>
                      </div>
                      <button
                        onClick={() => dismissAlert(alert.id)}
                        className="text-zinc-500 hover:text-zinc-300 text-sm shrink-0"
                        title="Dismiss"
                      >
                        ×
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="pt-4 border-t border-zinc-800">
              <a
                href={`/series/${issue.series.id}/continuity`}
                className="text-xs text-blue-400 hover:text-blue-300"
              >
                Run full continuity check →
              </a>
            </div>
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
