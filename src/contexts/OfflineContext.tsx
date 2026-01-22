'use client'

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useToast } from './ToastContext'

interface QueuedChange {
  id: string
  table: string
  operation: 'insert' | 'update' | 'delete'
  data: Record<string, unknown>
  filter?: { column: string; value: string }
  timestamp: number
}

interface OfflineContextType {
  isOnline: boolean
  pendingChanges: number
  queueChange: (change: Omit<QueuedChange, 'id' | 'timestamp'>) => void
  syncNow: () => Promise<void>
}

const OfflineContext = createContext<OfflineContextType | null>(null)

const QUEUE_KEY = 'panelflow_offline_queue'

export function useOffline() {
  const context = useContext(OfflineContext)
  if (!context) {
    throw new Error('useOffline must be used within an OfflineProvider')
  }
  return context
}

export function OfflineProvider({ children }: { children: ReactNode }) {
  const [isOnline, setIsOnline] = useState(true)
  const [queue, setQueue] = useState<QueuedChange[]>([])
  const [isSyncing, setIsSyncing] = useState(false)
  const { showToast } = useToast()

  // Load queue from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(QUEUE_KEY)
    if (stored) {
      try {
        setQueue(JSON.parse(stored))
      } catch {
        localStorage.removeItem(QUEUE_KEY)
      }
    }
  }, [])

  // Save queue to localStorage whenever it changes
  useEffect(() => {
    if (queue.length > 0) {
      localStorage.setItem(QUEUE_KEY, JSON.stringify(queue))
    } else {
      localStorage.removeItem(QUEUE_KEY)
    }
  }, [queue])

  // Monitor online status
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true)
      showToast('Back online', 'success')
    }

    const handleOffline = () => {
      setIsOnline(false)
      showToast('You are offline. Changes will be saved locally.', 'warning')
    }

    // Set initial state
    setIsOnline(navigator.onLine)

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [showToast])

  // Auto-sync when coming back online
  useEffect(() => {
    if (isOnline && queue.length > 0 && !isSyncing) {
      syncNow()
    }
  }, [isOnline])

  const queueChange = useCallback((change: Omit<QueuedChange, 'id' | 'timestamp'>) => {
    const newChange: QueuedChange = {
      ...change,
      id: Math.random().toString(36).substring(2, 9),
      timestamp: Date.now(),
    }
    setQueue(prev => [...prev, newChange])
  }, [])

  const syncNow = useCallback(async () => {
    if (queue.length === 0 || isSyncing || !isOnline) return

    setIsSyncing(true)
    const supabase = createClient()
    const failed: QueuedChange[] = []

    for (const change of queue) {
      try {
        if (change.operation === 'insert') {
          const { error } = await supabase.from(change.table).insert(change.data)
          if (error) throw error
        } else if (change.operation === 'update' && change.filter) {
          const { error } = await supabase
            .from(change.table)
            .update(change.data)
            .eq(change.filter.column, change.filter.value)
          if (error) throw error
        } else if (change.operation === 'delete' && change.filter) {
          const { error } = await supabase
            .from(change.table)
            .delete()
            .eq(change.filter.column, change.filter.value)
          if (error) throw error
        }
      } catch (error) {
        console.error('Failed to sync change:', error)
        failed.push(change)
      }
    }

    setQueue(failed)
    setIsSyncing(false)

    if (failed.length === 0 && queue.length > 0) {
      showToast('All offline changes synced', 'success')
    } else if (failed.length > 0) {
      showToast(`${failed.length} change(s) failed to sync`, 'error')
    }
  }, [queue, isSyncing, isOnline, showToast])

  return (
    <OfflineContext.Provider value={{ isOnline, pendingChanges: queue.length, queueChange, syncNow }}>
      {children}
      {!isOnline && (
        <div className="fixed top-0 left-0 right-0 bg-yellow-600 text-white text-center py-1 text-sm z-50">
          Offline - changes will sync when reconnected
          {queue.length > 0 && ` (${queue.length} pending)`}
        </div>
      )}
    </OfflineContext.Provider>
  )
}
