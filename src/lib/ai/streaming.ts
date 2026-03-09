// Server-Sent Events streaming utilities
import type { StreamEvent } from './client'

// ============================================
// TOOL USE EVENT TYPES (for SSE transport)
// ============================================

export type ToolUseSSEEvent =
  | { event: 'start'; toolUseId: string; toolName: string }
  | { event: 'input_delta'; toolUseId: string; partialJson: string }
  | { event: 'complete'; toolUseId: string; toolName: string; input: Record<string, unknown> }

// ============================================
// SSE ENCODER
// ============================================

export function createSSEEncoder() {
  const encoder = new TextEncoder()

  return {
    encode(data: string): Uint8Array {
      return encoder.encode(`data: ${JSON.stringify({ content: data })}\n\n`)
    },

    encodeToolStart(toolUseId: string, toolName: string): Uint8Array {
      return encoder.encode(`data: ${JSON.stringify({
        toolUse: { event: 'start', toolUseId, toolName } as ToolUseSSEEvent
      })}\n\n`)
    },

    encodeToolInputDelta(toolUseId: string, partialJson: string): Uint8Array {
      return encoder.encode(`data: ${JSON.stringify({
        toolUse: { event: 'input_delta', toolUseId, partialJson } as ToolUseSSEEvent
      })}\n\n`)
    },

    encodeToolComplete(toolUseId: string, toolName: string, input: Record<string, unknown>): Uint8Array {
      return encoder.encode(`data: ${JSON.stringify({
        toolUse: { event: 'complete', toolUseId, toolName, input } as ToolUseSSEEvent
      })}\n\n`)
    },

    encodeError(error: string): Uint8Array {
      return encoder.encode(`data: ${JSON.stringify({ error })}\n\n`)
    },

    encodeDone(): Uint8Array {
      return encoder.encode('data: [DONE]\n\n')
    },
  }
}

// ============================================
// STREAM GENERATOR → READABLE STREAM
// ============================================

const KEEPALIVE_INTERVAL_MS = 15_000

export function createStreamFromGenerator(
  generator: AsyncGenerator<StreamEvent, void, unknown>
): ReadableStream<Uint8Array> {
  const sse = createSSEEncoder()
  const encoder = new TextEncoder()
  // SSE comment line as keepalive — ignored by SSE parsers but keeps connection alive
  const keepaliveBytes = encoder.encode(':\n\n')

  return new ReadableStream({
    async start(controller) {
      // Set up keepalive ping interval
      const keepaliveTimer = setInterval(() => {
        try {
          controller.enqueue(keepaliveBytes)
        } catch {
          // Controller may be closed — ignore
        }
      }, KEEPALIVE_INTERVAL_MS)

      try {
        for await (const event of generator) {
          switch (event.type) {
            case 'text_delta':
              controller.enqueue(sse.encode(event.text))
              break
            case 'tool_use_start':
              controller.enqueue(sse.encodeToolStart(event.toolUseId, event.toolName))
              break
            case 'tool_input_delta':
              controller.enqueue(sse.encodeToolInputDelta(event.toolUseId, event.partialJson))
              break
            case 'tool_use_complete':
              controller.enqueue(sse.encodeToolComplete(event.toolUseId, event.toolName, event.input))
              break
          }
        }
        controller.enqueue(sse.encodeDone())
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error'
        controller.enqueue(sse.encodeError(message))
      } finally {
        clearInterval(keepaliveTimer)
        controller.close()
      }
    },
  })
}

// ============================================
// SSE PARSER (Client-side)
// ============================================

export function parseSSEData(data: string): {
  content?: string
  error?: string
  done?: boolean
  toolUse?: ToolUseSSEEvent
} {
  if (data === '[DONE]') {
    return { done: true }
  }

  try {
    return JSON.parse(data)
  } catch {
    return { content: data }
  }
}

/**
 * Standard SSE response headers
 */
export function getSSEHeaders(): HeadersInit {
  return {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  }
}
