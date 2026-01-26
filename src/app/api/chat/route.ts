import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { rateLimiters } from '@/lib/rate-limit'
import { logger } from '@/lib/logger'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

export async function POST(request: Request) {
  const start = performance.now()
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Rate limiting: 30 requests per minute per user
    const rateLimit = rateLimiters.chat(user.id)
    if (!rateLimit.success) {
      return NextResponse.json(
        {
          error: 'Rate limit exceeded. Please wait before sending more messages.',
          retryAfter: Math.ceil(rateLimit.resetIn / 1000)
        },
        {
          status: 429,
          headers: {
            'Retry-After': String(Math.ceil(rateLimit.resetIn / 1000)),
            'X-RateLimit-Remaining': String(rateLimit.remaining),
          }
        }
      )
    }

    const { message, context, maxTokens } = await request.json()

    if (!message) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 })
    }

    // Allow custom max_tokens up to 8192, default to 1024
    const tokens = Math.min(maxTokens || 1024, 8192)

    const systemPrompt = `You are a writing partner for a graphic novel scriptwriter. You have been given the complete script and all project context below.

${context ? context : 'No project context provided.'}

Remember: You have READ the full script above. You KNOW this material. Engage with it specifically.`

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: tokens,
      system: systemPrompt,
      messages: [
        { role: 'user', content: message }
      ],
    })

    const textContent = response.content.find(block => block.type === 'text')
    const text = textContent?.type === 'text' ? textContent.text : ''

    const duration = Math.round(performance.now() - start)
    logger.info('Chat API request completed', {
      userId: user.id,
      action: 'chat',
      duration,
      tokensUsed: response.usage?.output_tokens,
    })

    return NextResponse.json({ response: text })
  } catch (error) {
    const duration = Math.round(performance.now() - start)
    logger.error('Chat API error', {
      action: 'chat',
      duration,
      error: error instanceof Error ? error.message : String(error),
    })
    return NextResponse.json(
      { error: 'Failed to generate response' },
      { status: 500 }
    )
  }
}
