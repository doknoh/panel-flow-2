// Analyzes what's filled in vs. missing in a project
// Returns a structured assessment to help the AI know where to focus

export interface CompletenessAnalysis {
  overallScore: number // 0-100
  suggestedFocus: string | null

  series: {
    score: number
    missing: string[]
    filled: string[]
  }

  issue: {
    score: number
    missing: string[]
    filled: string[]
  } | null

  characters: {
    score: number
    total: number
    complete: number
    needsWork: string[] // Names of characters that need more detail
  }

  locations: {
    score: number
    total: number
    complete: number
    needsWork: string[]
  }

  structure: {
    score: number
    hasActs: boolean
    hasScenes: boolean
    hasPages: boolean
    actCount: number
    sceneCount: number
    pageCount: number
    missingIntentions: number
  }

  plotlines: {
    score: number
    total: number
    assigned: number
  }
}

// Check if a field has meaningful content
function hasContent(value: any): boolean {
  if (value === null || value === undefined) return false
  if (typeof value === 'string') return value.trim().length > 0
  if (Array.isArray(value)) return value.length > 0
  return Boolean(value)
}

// Calculate character completeness
function analyzeCharacter(char: any): number {
  const fields = ['name', 'role', 'personality', 'backstory', 'motivation', 'arc', 'relationships', 'appearance', 'voice_notes']
  const filled = fields.filter(f => hasContent(char[f])).length
  return Math.round((filled / fields.length) * 100)
}

// Calculate location completeness
function analyzeLocation(loc: any): number {
  const fields = ['name', 'description', 'atmosphere', 'significance']
  const filled = fields.filter(f => hasContent(loc[f])).length
  return Math.round((filled / fields.length) * 100)
}

export function analyzeProjectCompleteness(
  series: any,
  issue: any | null,
  scene: any | null,
  page: any | null
): CompletenessAnalysis {
  // Series-level analysis
  const seriesFields = ['title', 'central_theme', 'logline', 'genre', 'target_audience']
  const seriesFilled = seriesFields.filter(f => hasContent(series[f]))
  const seriesMissing = seriesFields.filter(f => !hasContent(series[f]))

  // Issue-level analysis
  let issueAnalysis = null
  if (issue) {
    const issueFields = ['title', 'summary', 'themes', 'tagline', 'visual_style', 'motifs', 'stakes', 'series_act']
    const issueFilled = issueFields.filter(f => hasContent(issue[f]))
    const issueMissing = issueFields.filter(f => !hasContent(issue[f]))

    issueAnalysis = {
      score: Math.round((issueFilled.length / issueFields.length) * 100),
      missing: issueMissing,
      filled: issueFilled,
    }
  }

  // Characters analysis
  const characters = series.characters || []
  const characterScores = characters.map(analyzeCharacter)
  const avgCharScore = characters.length > 0
    ? Math.round(characterScores.reduce((a: number, b: number) => a + b, 0) / characters.length)
    : 0
  const needsWorkChars = characters
    .filter((_: any, i: number) => characterScores[i] < 50)
    .map((c: any) => c.name)

  // Locations analysis
  const locations = series.locations || []
  const locationScores = locations.map(analyzeLocation)
  const avgLocScore = locations.length > 0
    ? Math.round(locationScores.reduce((a: number, b: number) => a + b, 0) / locations.length)
    : 0
  const needsWorkLocs = locations
    .filter((_: any, i: number) => locationScores[i] < 50)
    .map((l: any) => l.name)

  // Structure analysis (for current issue)
  const structureAnalysis = {
    score: 0,
    hasActs: false,
    hasScenes: false,
    hasPages: false,
    actCount: 0,
    sceneCount: 0,
    pageCount: 0,
    missingIntentions: 0,
  }

  if (issue) {
    const acts = issue.acts || []
    const scenes = acts.flatMap((a: any) => a.scenes || [])
    const pages = scenes.flatMap((s: any) => s.pages || [])

    structureAnalysis.hasActs = acts.length > 0
    structureAnalysis.hasScenes = scenes.length > 0
    structureAnalysis.hasPages = pages.length > 0
    structureAnalysis.actCount = acts.length
    structureAnalysis.sceneCount = scenes.length
    structureAnalysis.pageCount = pages.length

    // Count missing intentions
    const actsWithoutIntention = acts.filter((a: any) => !hasContent(a.intention)).length
    const scenesWithoutIntention = scenes.filter((s: any) => !hasContent(s.intention)).length
    structureAnalysis.missingIntentions = actsWithoutIntention + scenesWithoutIntention

    // Score based on structure completeness
    let structScore = 0
    if (structureAnalysis.hasActs) structScore += 20
    if (structureAnalysis.hasScenes) structScore += 20
    if (structureAnalysis.hasPages) structScore += 20
    if (structureAnalysis.actCount >= 3) structScore += 10 // Has a proper 3-act structure
    if (structureAnalysis.missingIntentions === 0) structScore += 30
    else if (structureAnalysis.missingIntentions < 5) structScore += 15

    structureAnalysis.score = structScore
  }

  // Plotlines analysis
  const plotlines = series.plotlines || []
  let assignedPlotlines = 0
  if (issue) {
    const scenes = (issue.acts || []).flatMap((a: any) => a.scenes || [])
    assignedPlotlines = scenes.filter((s: any) => hasContent(s.plotline_id)).length
  }

  const plotlineAnalysis = {
    score: plotlines.length > 0 ? Math.round((assignedPlotlines / Math.max(1, plotlines.length * 3)) * 100) : 0,
    total: plotlines.length,
    assigned: assignedPlotlines,
  }

  // Calculate overall score
  const weights = {
    series: 15,
    issue: 15,
    characters: 25,
    locations: 10,
    structure: 25,
    plotlines: 10,
  }

  let overallScore = 0
  overallScore += (seriesFilled.length / seriesFields.length) * weights.series
  if (issueAnalysis) {
    overallScore += (issueAnalysis.score / 100) * weights.issue
  }
  overallScore += (avgCharScore / 100) * weights.characters
  overallScore += (avgLocScore / 100) * weights.locations
  overallScore += (structureAnalysis.score / 100) * weights.structure
  overallScore += (plotlineAnalysis.score / 100) * weights.plotlines

  overallScore = Math.round(overallScore)

  // Determine suggested focus
  let suggestedFocus: string | null = null
  const priorities: [number, string][] = [
    [seriesFilled.length / seriesFields.length, 'series foundation (theme, logline)'],
    [characters.length === 0 ? 0 : avgCharScore / 100, 'character development'],
    [structureAnalysis.score / 100, 'story structure'],
    [issueAnalysis ? issueAnalysis.score / 100 : 1, 'issue details'],
    [plotlineAnalysis.score / 100, 'plotline organization'],
    [locations.length === 0 ? 0 : avgLocScore / 100, 'location details'],
  ]

  // Find lowest priority area
  const sorted = [...priorities].sort((a, b) => a[0] - b[0])
  if (sorted[0][0] < 0.5) {
    suggestedFocus = sorted[0][1]
  }

  return {
    overallScore,
    suggestedFocus,
    series: {
      score: Math.round((seriesFilled.length / seriesFields.length) * 100),
      missing: seriesMissing,
      filled: seriesFilled,
    },
    issue: issueAnalysis,
    characters: {
      score: avgCharScore,
      total: characters.length,
      complete: characterScores.filter((s: number) => s >= 70).length,
      needsWork: needsWorkChars,
    },
    locations: {
      score: avgLocScore,
      total: locations.length,
      complete: locationScores.filter((s: number) => s >= 70).length,
      needsWork: needsWorkLocs,
    },
    structure: structureAnalysis,
    plotlines: plotlineAnalysis,
  }
}
