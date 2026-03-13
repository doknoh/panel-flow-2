'use client'

import { type ReactNode } from 'react'
import Link from 'next/link'

interface EmptyStateProps {
  icon?: string
  lucideIcon?: ReactNode
  title: string
  description?: string
  actionLabel?: string
  onAction?: () => void
  actionHref?: string
}

export default function EmptyState({
  icon,
  lucideIcon,
  title,
  description,
  actionLabel,
  onAction,
  actionHref,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 rounded-lg border-2 border-dashed border-[var(--border)]">
      {lucideIcon ? (
        <div className="mb-4 text-[var(--text-muted)] opacity-60">{lucideIcon}</div>
      ) : icon ? (
        <span className="text-4xl opacity-40 mb-4 grayscale" role="img">
          {icon}
        </span>
      ) : null}
      <h3 className="type-label text-[var(--text-primary)] mb-1">{title}</h3>
      {description && (
        <p className="type-meta text-[var(--text-muted)] max-w-md mx-auto text-center mb-4">
          {description}
        </p>
      )}
      {actionLabel && actionHref && (
        <Link
          href={actionHref}
          className="mt-2 type-meta px-4 py-2 border border-[var(--text-primary)] text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] transition-all duration-150 active:scale-[0.97] hover-lift"
        >
          {actionLabel}
        </Link>
      )}
      {actionLabel && onAction && !actionHref && (
        <button
          onClick={onAction}
          className="mt-2 type-meta px-4 py-2 border border-[var(--text-primary)] text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] transition-all duration-150 active:scale-[0.97] hover-lift"
        >
          {actionLabel}
        </button>
      )}
    </div>
  )
}
