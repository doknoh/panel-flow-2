import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { rateLimiters } from '@/lib/rate-limit'
import { logger } from '@/lib/logger'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

// System prompt for extracting insights from a conversation
const EXTRACTION_PROMPT = `You are an expert at analyzing creative writing conversations to extract actionable insights.

Given a conversation between a writer and their editor about a comic/graphic novel project, identify:

1. **CHARACTER INSIGHTS** - Clear decisions about character motivation, arc, relationships, voice, or backstory
2. **STORY INSIGHTS** - Structural decisions about plot, themes, stakes, or pacing
3. **WORLD INSIGHTS** - Details about locations, rules of the world, atmosphere, or setting
4. **WRITER PATTERNS** - Observations about the writer's creative process, preferences, or tendencies

For each insight, provide:
- A clear, concise description (1-2 sentences)
- A confidence score (0.5-1.0) based on how explicitly the writer confirmed it
- The category it belongs to

IMPORTANT: Only extract insights that the WRITER explicitly stated or confirmed. Don't infer or assume.

Respond in this exact JSON format:
{
  "insights": [
    {
      "type": "character|story|world|writer_pattern",
      "category": "motivation|arc|relationship|voice|theme|structure|stakes|location|atmosphere|preference|strength|pattern",
      "description": "Clear description of the insight",
      "confidence": 0.8,
      "entity_type": "character|location|series|issue|null",
      "entity_name": "Name if applicable or null"
    }
  ],
  "session_summary": "1-2 sentence summary of what was accomplished in this session"
}`

export async function POST(request: Request) {
  const start = performance.now()

  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Rate limiting
    const rateLimit = rateLimiters.chat(user.id)
    if (!rateLimit.success) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Please wait before extracting.' },
        { status: 429 }
      )
    }

    const { sessionId, messages, series } = await request.json()

    if (!sessionId || !messages || messages.length === 0) {
      return NextResponse.json(
        { error: 'Session ID and messages required' },
        { status: 400 }
      )
    }

    // Build conversation transcript
    let transcript = `PROJECT: "${series?.title || 'Unknown'}"\n\n`
    transcript += `CONVERSATION:\n`
    messages.forEach((m: { role: string; content: string }) => {
      const speaker = m.role === 'assistant' ? 'EDITOR' : 'WRITER'
      transcript += `${speaker}: ${m.content}\n\n`
    })

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: EXTRACTION_PROMPT,
      messages: [
        {
          role: 'user',
          content: `Please analyze this writing session conversation and extract any clear insights:\n\n${transcript}`,
        },
      ],
    })

    const textContent = response.content.find(block => block.type === 'text')
    const text = textContent?.type === 'text' ? textContent.text : ''

    // Parse JSON response
    let extractedData = { insights: [], session_summary: '' }
    try {
      // Find JSON in response (it might have markdown code blocks)
      const jsonMatch = text.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        extractedData = JSON.parse(jsonMatch[0])
      }
    } catch (e) {
      logger.warn('Failed to parse extraction response', { error: e })
    }

    // Save insights to writer_insights table
    const savedInsights = []
    for (const insight of extractedData.insights) {
      // Only save insights with reasonable confidence
      if (insight.confidence >= 0.6) {
        const { data: savedInsight, error } = await supabase
          .from('writer_insights')
          .insert({
            user_id: user.id,
            insight_type: insight.type === 'writer_pattern' ? 'pattern' : 'preference',
            category: insight.category,
            description: insight.description,
            confidence: insight.confidence,
            evidence_session_ids: [sessionId],
          })
          .select()
          .single()

        if (!error && savedInsight) {
          savedInsights.push(savedInsight)
        }
      }
    }

    // Update session with summary if provided
    if (extractedData.session_summary) {
      await supabase
        .from('guided_sessions')
        .update({
          title: extractedData.session_summary.substring(0, 100),
          completion_areas: extractedData.insights.map((i: { category: string }) => i.category).filter(Boolean)
        })
        .eq('id', sessionId)
    }

    const duration = Math.round(performance.now() - start)
    logger.info('Guide extraction completed', {
      userId: user.id,
      sessionId,
      action: 'extract',
      duration,
      insightsFound: extractedData.insights.length,
      insightsSaved: savedInsights.length,
    })

    return NextResponse.json({
      insights: extractedData.insights,
      savedInsights,
      sessionSummary: extractedData.session_summary,
    })
  } catch (error) {
    const duration = Math.round(performance.now() - start)
    logger.error('Guide extraction error', {
      action: 'extract',
      duration,
      error: error instanceof Error ? error.message : String(error),
    })
    return NextResponse.json(
      { error: 'Failed to extract insights' },
      { status: 500 }
    )
  }
}
