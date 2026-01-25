import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { message, context, maxTokens } = await request.json()

    if (!message) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 })
    }

    // Allow custom max_tokens up to 8192, default to 1024
    const tokens = Math.min(maxTokens || 1024, 8192)

    const systemPrompt = `You are a helpful writing assistant for comic book and graphic novel scriptwriters. You help with:
- Crafting compelling dialogue
- Developing character voices
- Writing visual descriptions for panels
- Pacing and panel layout suggestions
- Story structure and plot development
- Maintaining continuity

${context ? `Here is context about the current project:\n${context}` : ''}

Keep responses concise and actionable. When suggesting dialogue, format it clearly. When describing visuals, be specific enough for an artist to draw.`

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

    return NextResponse.json({ response: text })
  } catch (error) {
    console.error('Chat API error:', error)
    return NextResponse.json(
      { error: 'Failed to generate response' },
      { status: 500 }
    )
  }
}
