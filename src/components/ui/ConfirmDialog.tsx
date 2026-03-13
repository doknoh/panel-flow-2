'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useFocusTrap } from '@/hooks/useFocusTrap'

interface ConfirmDialogProps {
  open: boolean
  title: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: 'danger' | 'default'
  onConfirm: () => void
  onCancel: () => void
}

export default function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Delete',
  cancelLabel = 'Cancel',
  variant = 'danger',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const confirmRef = useRef<HTMLButtonElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const focusTrapRef = useFocusTrap(open)

  // Focus the cancel button when dialog opens (safer default)
  useEffect(() => {
    if (open) {
      // Focus cancel button after a short delay to override focus trap's default
      const timer = setTimeout(() => {
        cancelRef.current?.focus()
      }, 60)

      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          onCancel()
        }
      }
      document.addEventListener('keydown', handleKeyDown)
      return () => {
        clearTimeout(timer)
        document.removeEventListener('keydown', handleKeyDown)
      }
    }
  }, [open, onCancel])

  const handleBackdropClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onCancel()
    }
  }, [onCancel])

  if (!open) return null

  return (
    <div
      ref={focusTrapRef}
      className="fixed inset-0 z-50 flex items-center justify-center"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      aria-describedby={description ? 'confirm-dialog-desc' : undefined}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

      {/* Dialog */}
      <div
        ref={dialogRef}
        className="relative bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg p-6 max-w-sm w-full mx-4 shadow-xl animate-in fade-in zoom-in-95 duration-150"
      >
        <h2
          id="confirm-dialog-title"
          className="text-base font-semibold text-[var(--text-primary)] mb-2"
        >
          {title}
        </h2>

        {description && (
          <p
            id="confirm-dialog-desc"
            className="text-sm text-[var(--text-secondary)] mb-6"
          >
            {description}
          </p>
        )}

        <div className="flex justify-end gap-3">
          <button
            ref={cancelRef}
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-[var(--text-secondary)] bg-[var(--bg-tertiary)] hover:bg-[var(--border)] rounded transition-colors hover-fade"
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            onClick={onConfirm}
            className={`px-4 py-2 text-sm font-medium rounded transition-colors ${
              variant === 'danger'
                ? 'bg-[var(--color-error)] hover:bg-[var(--color-error)]/90 text-white hover-fade-danger'
                : 'bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white hover-lift'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

// Hook for easy usage pattern
export function useConfirmDialog() {
  const resolveRef = useRef<((value: boolean) => void) | null>(null)
  const [state, setState] = useState<{
    open: boolean
    title: string
    description?: string
    confirmLabel?: string
    variant?: 'danger' | 'default'
  }>({ open: false, title: '' })

  const confirm = useCallback(
    (opts: { title: string; description?: string; confirmLabel?: string; variant?: 'danger' | 'default' }) => {
      return new Promise<boolean>((resolve) => {
        resolveRef.current = resolve
        setState({ ...opts, open: true })
      })
    },
    []
  )

  const handleConfirm = useCallback(() => {
    resolveRef.current?.(true)
    setState(prev => ({ ...prev, open: false }))
  }, [])

  const handleCancel = useCallback(() => {
    resolveRef.current?.(false)
    setState(prev => ({ ...prev, open: false }))
  }, [])

  const dialogProps = {
    open: state.open,
    title: state.title,
    description: state.description,
    confirmLabel: state.confirmLabel,
    variant: state.variant,
    onConfirm: handleConfirm,
    onCancel: handleCancel,
  }

  return { confirm, dialogProps }
}

