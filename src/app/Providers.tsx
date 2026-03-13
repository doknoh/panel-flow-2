'use client'

import * as Tooltip from '@radix-ui/react-tooltip'
import { ToastProvider } from '@/contexts/ToastContext'
import { OfflineProvider } from '@/contexts/OfflineContext'
import { ThemeProvider } from '@/contexts/ThemeContext'
import AuthGuard from '@/components/AuthGuard'
import { ReactNode } from 'react'

export default function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <Tooltip.Provider delayDuration={400} skipDelayDuration={100}>
        <ToastProvider>
          <OfflineProvider>
            <AuthGuard />
            {children}
          </OfflineProvider>
        </ToastProvider>
      </Tooltip.Provider>
    </ThemeProvider>
  )
}
