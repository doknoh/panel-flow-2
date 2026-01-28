'use client'

import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import Link from 'next/link'
import { useToast } from '@/contexts/ToastContext'

export default function NewSeriesPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const { showToast } = useToast()
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

    const { data, error } = await supabase
      .from('series')
      .insert({
        user_id: user.id,
        title: formData.title,
        logline: formData.logline || null,
        central_theme: formData.central_theme || null,
      })
      .select()
      .single()

    if (error) {
      console.error('Error creating series:', error)
      showToast('Failed to create series: ' + error.message, 'error')
      setLoading(false)
      return
    }

    router.push(`/series/${data.id}`)
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

          <div className="flex gap-4 pt-4">
            <button
              type="submit"
              disabled={loading || !formData.title}
              className="bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] disabled:bg-[var(--bg-tertiary)] disabled:cursor-not-allowed text-white px-6 py-3 rounded-lg font-medium transition-colors"
            >
              {loading ? 'Creating...' : 'Create Series'}
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
