'use client'

import ErrorDisplay from '@/components/ui/ErrorDisplay'

export default function IssueEditorError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <ErrorDisplay
      error={error}
      reset={reset}
      title="Editor Error"
      description="There was a problem loading the issue editor. Your work has been auto-saved."
      retryLabel="Reload Editor"
      dashboardLabel="Return to Dashboard"
      showDetails={true}
      helpText="If this problem persists, try refreshing the page or clearing your browser cache."
    />
  )
}
