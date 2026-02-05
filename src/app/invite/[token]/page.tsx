import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import AcceptInvitation from './AcceptInvitation'

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()

  // Fetch the invitation
  const { data: invitation, error } = await supabase
    .from('collaboration_invitations')
    .select(`
      *,
      series:series_id (
        id,
        title,
        user_id
      )
    `)
    .eq('token', token)
    .single()

  // Handle invalid or expired invitation
  if (error || !invitation) {
    return (
      <div className="min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)] flex items-center justify-center">
        <div className="text-center max-w-md p-8">
          <div className="text-5xl mb-4">🔗</div>
          <h1 className="text-2xl font-bold mb-2">Invalid Invitation</h1>
          <p className="text-[var(--text-muted)] mb-6">
            This invitation link is invalid or has expired.
          </p>
          <Link
            href="/dashboard"
            className="inline-block bg-[var(--color-primary)] text-white px-6 py-2 rounded-lg hover:opacity-90"
          >
            Go to Dashboard
          </Link>
        </div>
      </div>
    )
  }

  // Check if invitation has expired
  if (new Date(invitation.expires_at) < new Date()) {
    return (
      <div className="min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)] flex items-center justify-center">
        <div className="text-center max-w-md p-8">
          <div className="text-5xl mb-4">⏰</div>
          <h1 className="text-2xl font-bold mb-2">Invitation Expired</h1>
          <p className="text-[var(--text-muted)] mb-6">
            This invitation has expired. Please ask the series owner to send a new invitation.
          </p>
          <Link
            href="/dashboard"
            className="inline-block bg-[var(--color-primary)] text-white px-6 py-2 rounded-lg hover:opacity-90"
          >
            Go to Dashboard
          </Link>
        </div>
      </div>
    )
  }

  // Check if already accepted
  if (invitation.accepted_at) {
    return (
      <div className="min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)] flex items-center justify-center">
        <div className="text-center max-w-md p-8">
          <div className="text-5xl mb-4">✅</div>
          <h1 className="text-2xl font-bold mb-2">Already Accepted</h1>
          <p className="text-[var(--text-muted)] mb-6">
            You've already accepted this invitation.
          </p>
          <Link
            href={`/series/${invitation.series_id}`}
            className="inline-block bg-[var(--color-primary)] text-white px-6 py-2 rounded-lg hover:opacity-90"
          >
            Go to Series
          </Link>
        </div>
      </div>
    )
  }

  // If not logged in, redirect to login with return URL
  if (!user) {
    redirect(`/login?redirect=/invite/${token}`)
  }

  // Check if user email matches invitation
  const emailMatch = user.email?.toLowerCase() === invitation.email.toLowerCase()

  const roleLabels: Record<string, string> = {
    editor: 'Editor',
    commenter: 'Commenter',
    viewer: 'Viewer',
  }

  const roleDescriptions: Record<string, string> = {
    editor: 'You will be able to edit all content in this series.',
    commenter: 'You will be able to view content and add feedback comments.',
    viewer: 'You will have read-only access to view the series.',
  }

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)] flex items-center justify-center">
      <div className="max-w-md w-full p-8">
        <div className="text-center mb-8">
          <div className="text-5xl mb-4">🤝</div>
          <h1 className="text-2xl font-bold mb-2">You're Invited!</h1>
          <p className="text-[var(--text-muted)]">
            You've been invited to collaborate on a comic series.
          </p>
        </div>

        <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">{invitation.series?.title || 'Unknown Series'}</h2>

          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-[var(--text-muted)]">Your Role:</span>
              <span className="font-medium text-[var(--color-primary)]">
                {roleLabels[invitation.role]}
              </span>
            </div>
            <div className="text-[var(--text-secondary)] text-sm">
              {roleDescriptions[invitation.role]}
            </div>
          </div>
        </div>

        {!emailMatch && (
          <div className="bg-yellow-500/10 border border-yellow-500/50 rounded-lg p-4 mb-6 text-sm">
            <p className="text-yellow-400">
              <strong>Note:</strong> This invitation was sent to {invitation.email}, but you're logged in as {user.email}.
              You can still accept if you have access to both accounts.
            </p>
          </div>
        )}

        <AcceptInvitation
          invitationId={invitation.id}
          seriesId={invitation.series_id}
          role={invitation.role}
          userId={user.id}
        />

        <div className="text-center mt-6">
          <Link
            href="/dashboard"
            className="text-[var(--text-muted)] hover:text-[var(--text-primary)] text-sm"
          >
            Decline and go to Dashboard
          </Link>
        </div>
      </div>
    </div>
  )
}
