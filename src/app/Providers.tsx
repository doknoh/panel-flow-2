'use client'

import { ToastProvider } from '@/contexts/ToastContext'
import { OfflineProvider } from '@/contexts/OfflineContext'
import { ReactNode } from 'react'

export default function Providers({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      <OfflineProvider>
        {children}
      </OfflineProvider>
    </ToastProvider>
  )
}
