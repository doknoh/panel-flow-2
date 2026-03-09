'use client'

import Link from 'next/link'

interface EmptyStateProps {
  icon?: string
  title: string
  description?: string
  actionLabel?: string
  onAction?: () => void
  actionHref?: string
}

export default function EmptyState({
  icon,
  title,
  description,
  actionLabel,
  onAction,
  actionHref,
}: EmptyStateProps) {
  return (
    <div
      className="flex flex-col items-center justify-center py-12 rounded-xl border-2 border-dashed"
      style={{ borderColor: 'var(--border)' }}
    >
      {icon && (
        <span className="text-5xl opacity-60 mb-4" role="img">
          {icon}
        </span>
      )}
      <h3
        className="font-medium text-lg mb-1"
        style={{ color: 'var(--text-secondary)' }}
      >
        {title}
      </h3>
      {description && (
        <p
          className="text-sm max-w-md mx-auto text-center mb-4"
          style={{ color: 'var(--text-muted)' }}
        >
          {description}
        </p>
      )}
      {actionLabel && actionHref && (
        <Link
          href={actionHref}
          className="mt-2 px-4 py-2 text-sm font-medium text-white rounded-lg transition-opacity hover:opacity-90"
          style={{ backgroundColor: 'var(--color-primary)' }}
        >
          {actionLabel}
        </Link>
      )}
      {actionLabel && onAction && !actionHref && (
        <button
          onClick={onAction}
          className="mt-2 px-4 py-2 text-sm font-medium text-white rounded-lg transition-opacity hover:opacity-90"
          style={{ backgroundColor: 'var(--color-primary)' }}
        >
          {actionLabel}
        </button>
      )}
    </div>
  )
}
