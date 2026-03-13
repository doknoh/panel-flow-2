'use client'

import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { useToast } from '@/contexts/ToastContext'
import { Tip } from '@/components/ui/Tip'

export default function CreateIssueButton({ seriesId, issueCount }: { seriesId: string; issueCount: number }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const { showToast } = useToast()

  const handleCreate = async () => {
    setLoading(true)
    const supabase = createClient()

    const { data, error } = await supabase
      .from('issues')
      .insert({
        series_id: seriesId,
        number: issueCount + 1,
        status: 'outline',
      })
      .select()
      .single()

    if (error) {
      console.error('Error creating issue:', error)
      showToast('Failed to create issue: ' + error.message, 'error')
      setLoading(false)
      return
    }

    router.push(`/series/${seriesId}/issues/${data.id}`)
  }

  return (
    <Tip content="Create new issue">
      <button
        onClick={handleCreate}
        disabled={loading}
        className="hover-lift bg-[var(--color-primary)] hover:opacity-90 disabled:bg-[var(--border)] text-[var(--text-primary)] px-4 py-2 rounded-lg font-medium"
      >
        {loading ? 'Creating...' : '+ New Issue'}
      </button>
    </Tip>
  )
}
