import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { rateLimiters } from '@/lib/rate-limit'
import { logger } from '@/lib/logger'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

// The editor persona - an elite veteran of sequential art storytelling
const EDITOR_PERSONA = `You are an elite veteran editor of sequential art storytelling with decades of experience working on acclaimed graphic novels and comics. You've edited Eisner-winning books, worked with legendary writers, and understand the unique craft of visual storytelling at the deepest level.

Your role is to be a Socratic writing partner - you guide writers through discovering their stories by asking incisive questions, not by telling them what to do. You pull the sculpture from the rock by helping them see what's already there.

Your personality:
- Warm but direct - you don't waste time with platitudes
- You ask ONE focused question at a time, then let the writer explore
- You listen carefully and build on what the writer reveals
- You notice patterns and connections the writer might miss
- You push gently on weak spots: "That's interesting, but what does it MEAN for the reader?"
- You celebrate specificity and concrete details
- You're allergic to vagueness - if something is fuzzy, you probe until it's sharp

Your areas of expertise:
- Character motivation and arc
- Story structure and pacing
- Visual storytelling (what can ONLY be told through images)
- Dialogue that reveals character
- The relationship between words and pictures
- Page turns and spread design
- Emotional beats and reader experience
- Theme and meaning

When you identify something the writer has defined clearly, you can offer to save it to their project. Use this format:
[EXTRACT:type:table:id]
{field: value, field2: value2}
[/EXTRACT]

For example:
[EXTRACT:character_motivation:characters:uuid-here]
{motivation: "Marshall needs to prove he's more than where he came from"}
[/EXTRACT]

Remember: You're guiding a creative process, not filling out forms. The conversation should feel like sitting with a brilliant editor who genuinely cares about making the work great.`

// Build context about the project
function buildProjectContext(data: any): string {
  const { series, issue, scene, page, analysis, writerInsights } = data

  let context = `PROJECT CONTEXT:\n\n`

  // Series info
  context += `SERIES: "${series.title}"\n`
  if (series.central_theme) context += `Theme: ${series.central_theme}\n`
  if (series.logline) context += `Logline: ${series.logline}\n`
  if (series.genre) context += `Genre: ${series.genre}\n`
  context += `\n`

  // Characters
  const characters = series.characters || []
  if (characters.length > 0) {
    context += `CHARACTERS (${characters.length}):\n`
    characters.forEach((c: any) => {
      context += `- ${c.name}`
      if (c.role) context += ` (${c.role})`
      if (c.motivation) context += `: ${c.motivation}`
      context += `\n`
    })
    context += `\n`
  }

  // Locations
  const locations = series.locations || []
  if (locations.length > 0) {
    context += `LOCATIONS (${locations.length}):\n`
    locations.forEach((l: any) => {
      context += `- ${l.name}`
      if (l.description) context += `: ${l.description.substring(0, 100)}...`
      context += `\n`
    })
    context += `\n`
  }

  // Current issue
  if (issue) {
    context += `CURRENT ISSUE: #${issue.number}`
    if (issue.title) context += ` - "${issue.title}"`
    context += `\n`
    if (issue.summary) context += `Summary: ${issue.summary}\n`
    if (issue.themes) context += `Themes: ${issue.themes}\n`
    if (issue.stakes) context += `Stakes: ${issue.stakes}\n`

    // Structure
    const acts = issue.acts || []
    context += `\nSTRUCTURE: ${acts.length} acts\n`
    acts.forEach((act: any) => {
      const scenes = act.scenes || []
      context += `  Act ${act.sort_order + 1}: ${scenes.length} scenes`
      if (act.intention) context += ` - "${act.intention}"`
      context += `\n`
    })
    context += `\n`
  }

  // Analysis summary
  if (analysis) {
    context += `COMPLETENESS ANALYSIS:\n`
    context += `- Overall: ${analysis.overallScore}%\n`
    context += `- Characters: ${analysis.characters.complete}/${analysis.characters.total} well-developed\n`
    context += `- Structure: ${analysis.structure.pageCount} pages across ${analysis.structure.sceneCount} scenes\n`
    if (analysis.suggestedFocus) {
      context += `- Suggested focus: ${analysis.suggestedFocus}\n`
    }
    if (analysis.series.missing.length > 0) {
      context += `- Missing series info: ${analysis.series.missing.join(', ')}\n`
    }
    context += `\n`
  }

  // Writer insights
  if (writerInsights && writerInsights.length > 0) {
    context += `WRITER INSIGHTS (learned from previous sessions):\n`
    writerInsights.forEach((i: any) => {
      context += `- ${i.description}\n`
    })
    context += `\n`
  }

  return context
}

// Build initial message based on session type and context
function buildInitialPrompt(data: any): string {
  const { sessionType, analysis, series, issue } = data

  let prompt = `You're starting a new guided session with a writer working on "${series.title}".`

  if (analysis) {
    prompt += ` The project is ${analysis.overallScore}% complete.`
    if (analysis.suggestedFocus) {
      prompt += ` The biggest opportunity is in ${analysis.suggestedFocus}.`
    }
  }

  switch (sessionType) {
    case 'character_deep_dive':
      prompt += `\n\nThis is a CHARACTER DEEP DIVE session. Start by asking about a specific character - either one that needs development or one they want to explore. Focus on motivation, arc, voice, and relationships.`
      break

    case 'outline':
      prompt += `\n\nThis is a STORY STRUCTURE session. Start by understanding where they are in the outlining process. Focus on acts, turning points, emotional beats, and pacing.`
      break

    case 'world_building':
      prompt += `\n\nThis is a WORLD BUILDING session. Start by exploring the physical and emotional landscape of the story. Focus on locations, atmosphere, rules of the world, and how environment shapes character.`
      break

    case 'general':
    default:
      prompt += `\n\nThis is an OPEN EXPLORATION session. Based on the analysis, identify the most valuable area to explore and start there. Be direct about what you see as the biggest opportunity.`
  }

  prompt += `\n\nIntroduce yourself briefly (you're their editor), acknowledge where they are in the project, and ask your first Socratic question. Remember: ONE question at a time, and make it specific to their project.`

  return prompt
}

export async function POST(request: Request) {
  const start = performance.now()

  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Rate limiting: 20 requests per minute for guided sessions
    const rateLimit = rateLimiters.chat(user.id)
    if (!rateLimit.success) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Please wait before sending more messages.' },
        { status: 429 }
      )
    }

    const data = await request.json()
    const { sessionId, isInitial, messages, userMessage } = data

    // Build context
    const projectContext = buildProjectContext(data)

    // Build messages array for Claude
    const claudeMessages: { role: 'user' | 'assistant'; content: string }[] = []

    if (isInitial) {
      // For initial message, we send the prompt as user message
      claudeMessages.push({
        role: 'user',
        content: buildInitialPrompt(data),
      })
    } else {
      // Include conversation history
      if (messages && messages.length > 0) {
        messages.forEach((m: any) => {
          claudeMessages.push({
            role: m.role,
            content: m.content,
          })
        })
      }

      // Add the new user message if not already included
      if (userMessage && (!messages || messages[messages.length - 1]?.content !== userMessage)) {
        claudeMessages.push({
          role: 'user',
          content: userMessage,
        })
      }
    }

    const systemPrompt = `${EDITOR_PERSONA}\n\n${projectContext}`

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: systemPrompt,
      messages: claudeMessages,
    })

    const textContent = response.content.find(block => block.type === 'text')
    const text = textContent?.type === 'text' ? textContent.text : ''

    // Parse for extraction markers
    let extractedData = null
    const extractPattern = /\[EXTRACT:([\w_]+):([\w_]+):([^\]]+)\]([\s\S]*?)\[\/EXTRACT\]/
    const extractMatch = text.match(extractPattern)

    if (extractMatch) {
      try {
        const [, type, table, id, jsonStr] = extractMatch
        const data = JSON.parse(jsonStr.trim())
        extractedData = { type, table, id, data }
      } catch (e) {
        // Failed to parse extraction, ignore
      }
    }

    // Detect focus area from response
    let focusArea = null
    const focusKeywords = [
      'character', 'motivation', 'arc', 'voice',
      'structure', 'act', 'scene', 'pacing',
      'theme', 'meaning', 'stakes',
      'location', 'world', 'setting',
      'dialogue', 'visual', 'panel',
    ]
    const lowerText = text.toLowerCase()
    for (const keyword of focusKeywords) {
      if (lowerText.includes(keyword)) {
        focusArea = keyword
        break
      }
    }

    const duration = Math.round(performance.now() - start)
    logger.info('Guide API request completed', {
      userId: user.id,
      sessionId,
      action: 'guide',
      duration,
      tokensUsed: response.usage?.output_tokens,
    })

    return NextResponse.json({
      response: text,
      extractedData,
      focusArea,
    })
  } catch (error) {
    const duration = Math.round(performance.now() - start)
    logger.error('Guide API error', {
      action: 'guide',
      duration,
      error: error instanceof Error ? error.message : String(error),
    })
    return NextResponse.json(
      { error: 'Failed to generate response' },
      { status: 500 }
    )
  }
}
