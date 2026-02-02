'use client'

import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import Link from 'next/link'
import { useToast } from '@/contexts/ToastContext'

type CreationMode = 'manual' | 'guided'

export default function NewSeriesPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const { showToast } = useToast()
  const [mode, setMode] = useState<CreationMode>('manual')
  const [formData, setFormData] = useState({
    title: '',
    logline: '',
    central_theme: '',
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      router.push('/login')
      return
    }

    // Create the series
    const { data: series, error: seriesError } = await supabase
      .from('series')
      .insert({
        user_id: user.id,
        title: formData.title,
        logline: mode === 'manual' ? (formData.logline || null) : null,
        central_theme: mode === 'manual' ? (formData.central_theme || null) : null,
      })
      .select()
      .single()

    if (seriesError) {
      console.error('Error creating series:', seriesError)
      showToast('Failed to create series: ' + seriesError.message, 'error')
      setLoading(false)
      return
    }

    // If guided mode, create a guided session and redirect there
    if (mode === 'guided') {
      const { data: session, error: sessionError } = await supabase
        .from('guided_sessions')
        .insert({
          user_id: user.id,
          series_id: series.id,
          session_type: 'general',
          status: 'active',
          focus_area: 'series_concept',
        })
        .select()
        .single()

      if (sessionError) {
        console.error('Error creating guided session:', sessionError)
        // Still redirect to series page even if session creation fails
        showToast('Series created, but could not start guided session', 'error')
        router.push(`/series/${series.id}`)
        return
      }

      router.push(`/series/${series.id}/guide?session=${session.id}`)
    } else {
      // Manual mode - redirect to series page
      router.push(`/series/${series.id}`)
    }
  }

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)]">
      <header className="border-b border-[var(--border)] px-6 py-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <Link href="/dashboard" className="text-xl font-bold hover:text-[var(--text-secondary)]">
            ← Back
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-8">
        <h1 className="text-3xl font-bold mb-8">Create New Series</h1>

        {/* Mode Toggle */}
        <div className="mb-8">
          <label className="block text-sm font-medium mb-3 text-[var(--text-secondary)]">
            How would you like to start?
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setMode('manual')}
              className={`flex-1 px-4 py-3 rounded-lg border-2 transition-all text-left ${
                mode === 'manual'
                  ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/10'
                  : 'border-[var(--border)] hover:border-[var(--text-tertiary)]'
              }`}
            >
              <div className="font-medium mb-1">Manual</div>
              <div className="text-sm text-[var(--text-secondary)]">
                Fill out the details yourself
              </div>
            </button>
            <button
              type="button"
              onClick={() => setMode('guided')}
              className={`flex-1 px-4 py-3 rounded-lg border-2 transition-all text-left ${
                mode === 'guided'
                  ? 'border-purple-500 bg-purple-500/10'
                  : 'border-[var(--border)] hover:border-[var(--text-tertiary)]'
              }`}
            >
              <div className="font-medium mb-1">
                Guided AI <span className="text-purple-400">✨</span>
              </div>
              <div className="text-sm text-[var(--text-secondary)]">
                Develop your concept through dialogue
              </div>
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label htmlFor="title" className="block text-sm font-medium mb-2">
              Series Title *
            </label>
            <input
              id="title"
              type="text"
              required
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              className="w-full bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg px-4 py-3 focus:outline-none focus:border-[var(--color-primary)]"
              placeholder="e.g., The Marshall Mathers GN"
            />
          </div>

          {mode === 'manual' ? (
            <>
              <div>
                <label htmlFor="logline" className="block text-sm font-medium mb-2">
                  Logline
                </label>
                <textarea
                  id="logline"
                  value={formData.logline}
                  onChange={(e) => setFormData({ ...formData, logline: e.target.value })}
                  rows={3}
                  className="w-full bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg px-4 py-3 focus:outline-none focus:border-[var(--color-primary)]"
                  placeholder="One paragraph describing your series concept..."
                />
              </div>

              <div>
                <label htmlFor="theme" className="block text-sm font-medium mb-2">
                  Central Theme
                </label>
                <input
                  id="theme"
                  type="text"
                  value={formData.central_theme}
                  onChange={(e) => setFormData({ ...formData, central_theme: e.target.value })}
                  className="w-full bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg px-4 py-3 focus:outline-none focus:border-[var(--color-primary)]"
                  placeholder="e.g., The cost of creative genius"
                />
              </div>
            </>
          ) : (
            <div className="bg-purple-500/5 border border-purple-500/20 rounded-lg p-6">
              <p className="text-[var(--text-secondary)] mb-2">
                After creating your series, you&apos;ll enter a guided conversation with your AI writing partner.
              </p>
              <p className="text-[var(--text-secondary)]">
                Together, you&apos;ll explore your ideas and develop a compelling logline and central theme through a Socratic dialogue.
              </p>
            </div>
          )}

          <div className="flex gap-4 pt-4">
            <button
              type="submit"
              disabled={loading || !formData.title}
              className={`${
                mode === 'guided'
                  ? 'bg-purple-600 hover:bg-purple-700'
                  : 'bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)]'
              } disabled:bg-[var(--bg-tertiary)] disabled:cursor-not-allowed text-white px-6 py-3 rounded-lg font-medium transition-colors`}
            >
              {loading
                ? 'Creating...'
                : mode === 'guided'
                  ? 'Create & Start Guided Session'
                  : 'Create Series'
              }
            </button>
            <Link
              href="/dashboard"
              className="bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)] text-[var(--text-primary)] px-6 py-3 rounded-lg font-medium transition-colors"
            >
              Cancel
            </Link>
          </div>
        </form>
      </main>
    </div>
  )
}
