'use client'

import { createContext, useContext, useState, useCallback, useRef, ReactNode } from 'react'
import { Tip } from '@/components/ui/Tip'

type ToastType = 'success' | 'error' | 'info' | 'warning'

interface ToastAction {
  label: string
  onClick: () => void | Promise<void>
}

interface ToastOptions {
  action?: ToastAction
  duration?: number
}

interface Toast {
  id: string
  message: string
  type: ToastType
  exiting?: boolean
  action?: ToastAction
}

interface ToastContextType {
  toasts: Toast[]
  showToast: (message: string, type?: ToastType, options?: ToastOptions) => void
  dismissToast: (id: string) => void
}

const ToastContext = createContext<ToastContextType | null>(null)

export function useToast() {
  const context = useContext(ToastContext)
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider')
  }
  return context
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const timersRef = useRef<Map<string, NodeJS.Timeout>>(new Map())

  const dismissToast = useCallback((id: string) => {
    // Clear auto-dismiss timer if exists
    const timer = timersRef.current.get(id)
    if (timer) {
      clearTimeout(timer)
      timersRef.current.delete(id)
    }
    // Start exit animation
    setToasts(prev => prev.map(t => t.id === id ? { ...t, exiting: true } : t))
    // Remove after exit animation (200ms)
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id))
    }, 200)
  }, [])

  const handleAction = useCallback(async (toast: Toast) => {
    // Clear auto-dismiss timer
    const timer = timersRef.current.get(toast.id)
    if (timer) {
      clearTimeout(timer)
      timersRef.current.delete(toast.id)
    }
    // Show restoring state
    setToasts(prev => prev.map(t =>
      t.id === toast.id ? { ...t, message: 'Restoring...', action: undefined } : t
    ))
    // Execute the action
    try {
      await toast.action!.onClick()
    } catch {
      // Show error toast after dismissing the current one
      setToasts(prev => prev.filter(t => t.id !== toast.id))
      const errorId = Math.random().toString(36).substring(2, 9)
      setToasts(prev => [...prev, { id: errorId, message: 'Undo failed', type: 'error' }])
      const errorTimer = setTimeout(() => {
        timersRef.current.delete(errorId)
        dismissToast(errorId)
      }, 4000)
      timersRef.current.set(errorId, errorTimer)
      return
    }
    // Dismiss the toast
    dismissToast(toast.id)
  }, [dismissToast])

  const showToast = useCallback((message: string, type: ToastType = 'info', options?: ToastOptions) => {
    const id = Math.random().toString(36).substring(2, 9)
    const toast: Toast = { id, message, type, action: options?.action }
    setToasts(prev => [...prev, toast])

    // Auto-dismiss (default 4s, configurable via options.duration)
    const duration = options?.duration ?? 4000
    const timer = setTimeout(() => {
      timersRef.current.delete(id)
      dismissToast(id)
    }, duration)
    timersRef.current.set(id, timer)
  }, [dismissToast])

  return (
    <ToastContext.Provider value={{ toasts, showToast, dismissToast }}>
      {children}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} onAction={handleAction} />
    </ToastContext.Provider>
  )
}

function ToastContainer({
  toasts,
  onDismiss,
  onAction,
}: {
  toasts: Toast[]
  onDismiss: (id: string) => void
  onAction: (toast: Toast) => void
}) {
  if (toasts.length === 0) return null

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {toasts.map(toast => (
        <div
          key={toast.id}
          className={`px-4 py-3 shadow-lg flex items-center gap-3 min-w-[280px] ${
            toast.exiting ? 'animate-toast-out' : 'animate-toast-in'
          } ${
            toast.type === 'success' ? 'bg-[var(--color-success)] text-white' :
            toast.type === 'error' ? 'bg-[var(--color-error)] text-white' :
            toast.type === 'warning' ? 'bg-[var(--color-warning)] text-white' :
            'bg-[var(--bg-tertiary)] text-[var(--text-primary)] border border-[var(--border)]'
          }`}
        >
          <span className="flex-1 text-sm">{toast.message}</span>
          {toast.action && (
            <button
              onClick={() => onAction(toast)}
              className="text-sm font-semibold underline underline-offset-2 hover:no-underline whitespace-nowrap hover-fade"
            >
              {toast.action.label}
            </button>
          )}
          <Tip content="Dismiss">
            <button
              onClick={() => onDismiss(toast.id)}
              className="text-white/70 hover:text-white active:scale-[0.97] transition-all duration-150 ease-out hover-fade"
              aria-label="Dismiss"
            >
              ×
            </button>
          </Tip>
        </div>
      ))}
    </div>
  )
}
