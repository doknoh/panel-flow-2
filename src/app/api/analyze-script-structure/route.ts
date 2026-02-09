import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { rateLimiters } from '@/lib/rate-limit'
import { logger } from '@/lib/logger'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

export interface Plotline {
  id: string
  name: string
  description: string
  pages: number[]
}

export interface SceneBreak {
  id: string
  name: string
  startPage: number
  endPage: number
  plotlineId: string
  description: string
}

export interface ActBreak {
  id: string
  name: string
  startPage: number
  endPage: number
  description: string
  scenes: string[] // Scene IDs that belong to this act
}

export interface ScriptStructureAnalysis {
  plotlines: Plotline[]
  scenes: SceneBreak[]
  acts: ActBreak[]
  summary: string
}

const ANALYSIS_PROMPT = `You are an expert script analyst specializing in comic books, graphic novels, and visual storytelling. Analyze the following script and identify its narrative structure.

Your task is to identify:

1. **PLOTLINES**: Distinct narrative threads that may intercut with each other. Look for:
   - Different character perspectives (e.g., "A-Story: Main Character", "B-Story: Supporting Characters")
   - Parallel storylines happening simultaneously
   - Subplots that weave through the main narrative
   - Format notes in the script that indicate different visual treatments (like "9-panel grid" or specific page layouts)

2. **SCENES**: Natural groupings of pages based on:
   - Location changes
   - Time jumps
   - Significant shifts in action or tone
   - Character groupings (e.g., all pages with specific characters together)
   - Format/layout changes that suggest distinct sequences

   Give each scene a descriptive name that captures its essence (e.g., "Ken's Phone Call", "The Rally at City Hall", "Paul & Tracy Investigate")

3. **ACTS**: Major story beats that divide the narrative:
   - Act 1: Setup/Introduction (typically 20-25% of story)
   - Act 2: Confrontation/Rising Action (typically 50% of story)
   - Act 3: Climax/Resolution (typically 25-30% of story)

   Name each act based on its narrative function (e.g., "Act 1: The Awakening", "Act 2: Into the Maelstrom")

IMPORTANT GUIDELINES:
- Page numbers should match exactly as they appear in the script
- Every page must belong to exactly one scene
- Every scene must belong to exactly one act
- Scenes within the same plotline may be non-contiguous (intercut with other plotlines)
- Look for explicit format notes (like "PAUL & TRACY" pages or "9-panel grid" notes) as strong indicators of plotlines

Return your analysis as a JSON object with this exact structure:
{
  "plotlines": [
    {
      "id": "plotline-1",
      "name": "A-Story: [Name]",
      "description": "Brief description of this narrative thread",
      "pages": [1, 2, 3, ...]
    }
  ],
  "scenes": [
    {
      "id": "scene-1",
      "name": "Scene Name",
      "startPage": 1,
      "endPage": 3,
      "plotlineId": "plotline-1",
      "description": "What happens in this scene"
    }
  ],
  "acts": [
    {
      "id": "act-1",
      "name": "Act 1: [Descriptive Name]",
      "startPage": 1,
      "endPage": 15,
      "description": "The narrative function of this act",
      "scenes": ["scene-1", "scene-2", ...]
    }
  ],
  "summary": "A brief summary of the overall narrative structure"
}

SCRIPT TO ANALYZE:
`

export async function POST(request: Request) {
  const start = performance.now()
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Rate limiting: Use a separate limiter for analysis (more expensive)
    const rateLimit = rateLimiters.chat(user.id)
    if (!rateLimit.success) {
      return NextResponse.json(
        {
          error: 'Rate limit exceeded. Please wait before analyzing.',
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

    const { scriptText, issueTitle, seriesTitle } = await request.json()

    if (!scriptText) {
      return NextResponse.json({ error: 'Script text is required' }, { status: 400 })
    }

    // Build context for the analysis
    let contextPrefix = ''
    if (seriesTitle) {
      contextPrefix += `Series: ${seriesTitle}\n`
    }
    if (issueTitle) {
      contextPrefix += `Issue: ${issueTitle}\n`
    }
    if (contextPrefix) {
      contextPrefix += '\n'
    }

    const fullPrompt = ANALYSIS_PROMPT + contextPrefix + scriptText

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      messages: [
        {
          role: 'user',
          content: fullPrompt
        }
      ],
    })

    const textContent = response.content.find(block => block.type === 'text')
    const text = textContent?.type === 'text' ? textContent.text : ''

    // Extract JSON from the response (handle markdown code blocks)
    let jsonStr = text
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (jsonMatch) {
      jsonStr = jsonMatch[1].trim()
    }

    // Parse the JSON
    let analysis: ScriptStructureAnalysis
    try {
      analysis = JSON.parse(jsonStr)
    } catch (parseError) {
      logger.error('Failed to parse script analysis JSON', {
        userId: user.id,
        action: 'analyze-script-structure',
        error: parseError instanceof Error ? parseError.message : String(parseError),
        rawResponse: text.substring(0, 500), // Log first 500 chars for debugging
      })
      return NextResponse.json(
        { error: 'Failed to parse analysis results. Please try again.' },
        { status: 500 }
      )
    }

    // Validate the structure
    if (!analysis.plotlines || !analysis.scenes || !analysis.acts) {
      return NextResponse.json(
        { error: 'Invalid analysis structure returned' },
        { status: 500 }
      )
    }

    const duration = Math.round(performance.now() - start)
    logger.info('Script structure analysis completed', {
      userId: user.id,
      action: 'analyze-script-structure',
      duration,
      tokensUsed: response.usage?.output_tokens,
      plotlineCount: analysis.plotlines.length,
      sceneCount: analysis.scenes.length,
      actCount: analysis.acts.length,
    })

    return NextResponse.json({ analysis })
  } catch (error) {
    const duration = Math.round(performance.now() - start)
    logger.error('Script structure analysis error', {
      action: 'analyze-script-structure',
      duration,
      error: error instanceof Error ? error.message : String(error),
    })
    return NextResponse.json(
      { error: 'Failed to analyze script structure' },
      { status: 500 }
    )
  }
}
