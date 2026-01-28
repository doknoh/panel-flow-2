'use client'

import { ToastProvider } from '@/contexts/ToastContext'
import { OfflineProvider } from '@/contexts/OfflineContext'
import { ThemeProvider } from '@/contexts/ThemeContext'
import { ReactNode } from 'react'

export default function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <ToastProvider>
        <OfflineProvider>
          {children}
        </OfflineProvider>
      </ToastProvider>
    </ThemeProvider>
  )
}
