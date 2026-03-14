import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

interface ScaffoldInput {
  storyBeat: string
  sceneContext: {
    title?: string
    plotline?: string
    characters?: string[]
    location?: string
  }
  writerProfile?: string | null
  previousPageSummary?: string | null
}

interface ScaffoldedPanel {
  panel_number: number
  visual_description: string
  shot_type?: string
  dialogue?: { speaker: string; text: string; type: string }[]
}

export async function scaffoldPanelsFromBeat(input: ScaffoldInput): Promise<ScaffoldedPanel[]> {
  const { storyBeat, sceneContext, writerProfile, previousPageSummary } = input

  const contextParts: string[] = []
  if (sceneContext.title) contextParts.push(`Scene: ${sceneContext.title}`)
  if (sceneContext.plotline) contextParts.push(`Plotline: ${sceneContext.plotline}`)
  if (sceneContext.characters?.length) contextParts.push(`Characters in scene: ${sceneContext.characters.join(', ')}`)
  if (sceneContext.location) contextParts.push(`Location: ${sceneContext.location}`)
  if (previousPageSummary) contextParts.push(`Previous page: ${previousPageSummary}`)

  const systemPrompt = `You are drafting comic panel descriptions for a professional comic book script.

${writerProfile ? `Writer's style profile:\n${writerProfile}\n` : ''}

Rules:
- Draft 4-7 panels for one page based on the story beat
- Each panel needs a visual description written in present tense, camera-direction style
- Character names in ALL CAPS in descriptions
- Match the density to the beat's specificity: vague beats get sparse directional notes, detailed beats get fuller descriptions
- Only include dialogue if the beat specifically mentions spoken exchanges
- Include shot type suggestions (wide, medium, close, extreme_close, pov)
- Think cinematically: establish location, then focus, then payoff

Return JSON array: [{ panel_number, visual_description, shot_type, dialogue?: [{ speaker, text, type }] }]`

  const userMessage = `Story beat for this page: "${storyBeat}"

Context:
${contextParts.join('\n')}

Draft the panel descriptions.`

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2048,
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : ''

  try {
    const match = text.match(/\[[\s\S]*\]/)
    if (match) return JSON.parse(match[0])
  } catch {
    // Fall through
  }

  return []
}
