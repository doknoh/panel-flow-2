'use client'

import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { useToast } from '@/contexts/ToastContext'

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
    <button
      onClick={handleCreate}
      disabled={loading}
      className="bg-blue-600 hover:bg-blue-700 disabled:bg-zinc-700 text-white px-4 py-2 rounded-lg font-medium transition-colors"
    >
      {loading ? 'Creating...' : '+ New Issue'}
    </button>
  )
}
