'use client'

import * as Tooltip from '@radix-ui/react-tooltip'
import { ReactNode } from 'react'

interface TipProps {
  content: string
  children: ReactNode
  side?: 'top' | 'bottom' | 'left' | 'right'
  delayDuration?: number
}

export function Tip({ content, children, side = 'top', delayDuration = 400 }: TipProps) {
  if (!content) return <>{children}</>

  return (
    <Tooltip.Root delayDuration={delayDuration}>
      <Tooltip.Trigger asChild>
        {children}
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content side={side} sideOffset={6} className="tip-content">
          {content}
          <Tooltip.Arrow className="tip-arrow" />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  )
}
