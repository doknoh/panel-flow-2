export interface DescriptionIssue {
  type:
    | 'passive_voice'
    | 'vague_description'
    | 'too_long'
    | 'repeated_words'
    | 'missing_shot_type'
  severity: 'warning' | 'info'
  message: string
  suggestion?: string
}

// Common passive voice patterns: "is/was/are/were/been/being + past participle"
// Past participles typically end in -ed, -en, -t, -n, or -d
const PASSIVE_PATTERNS = [
  /\b(?:is|are|was|were|been|being|gets?|got)\s+\w+ed\b/gi,
  /\b(?:is|are|was|were|been|being|gets?|got)\s+\w+en\b/gi,
  /\b(?:is|are|was|were|been|being)\s+(?:seen|shown|thrown|drawn|torn|worn|born|known|grown|blown|flown|broken|chosen|frozen|spoken|stolen|woven|written|driven|given|hidden|risen|taken|shaken|beaten|bitten|eaten|forgotten|ridden)\b/gi,
]

const VAGUE_PHRASES = [
  'something happens',
  'stuff happens',
  'stuff occurs',
  'things happen',
  'things are happening',
  'something occurs',
  'things occur',
  'some stuff',
  'something is going on',
  'things going on',
  'stuff going on',
  'action happens',
  'action occurs',
  'a moment',
  'some kind of',
  'sort of',
  'kind of a',
  'whatever',
  'etc',
  'and so on',
  'and stuff',
  'you get the idea',
  'somehow',
  'for some reason',
  'does something',
  'does stuff',
  'various things',
  'generic',
]

const SHOT_TYPE_INDICATORS = [
  'close-up',
  'close up',
  'closeup',
  'cu',
  'ecu',
  'extreme close',
  'wide shot',
  'wide angle',
  'wideshot',
  'establishing shot',
  'establishing',
  'medium shot',
  'mid-shot',
  'midshot',
  'full shot',
  'long shot',
  'bird',
  'aerial',
  'overhead',
  'high angle',
  'low angle',
  'dutch angle',
  'tilted',
  'pov',
  'point of view',
  'over the shoulder',
  'ots',
  'two-shot',
  'two shot',
  'insert',
  'splash',
  'inset',
  'tight on',
  'pull back',
  'pullback',
  'zoom',
  'pan',
  'from above',
  'from below',
  'eye level',
  'worm',
]

// Words to exclude from repeated-word checks (common, non-significant)
const STOP_WORDS = new Set([
  'their',
  'there',
  'these',
  'those',
  'about',
  'above',
  'after',
  'again',
  'being',
  'below',
  'between',
  'could',
  'would',
  'should',
  'other',
  'under',
  'which',
  'while',
  'where',
  'before',
  'through',
  'during',
  'without',
  'within',
  'around',
  'still',
  'behind',
])

function checkPassiveVoice(description: string): DescriptionIssue[] {
  const issues: DescriptionIssue[] = []
  const matches: string[] = []

  for (const pattern of PASSIVE_PATTERNS) {
    // Reset regex state for global patterns
    pattern.lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = pattern.exec(description)) !== null) {
      matches.push(match[0])
    }
  }

  if (matches.length > 0) {
    const uniqueMatches = [...new Set(matches.map((m) => m.toLowerCase()))]
    issues.push({
      type: 'passive_voice',
      severity: 'warning',
      message: `Passive voice detected: "${uniqueMatches.join('", "')}"`,
      suggestion:
        'Use active voice for stronger visual descriptions. Instead of "the door is opened by Marshall", write "Marshall opens the door".',
    })
  }

  return issues
}

function checkVagueDescriptions(description: string): DescriptionIssue[] {
  const issues: DescriptionIssue[] = []
  const lower = description.toLowerCase()
  const found: string[] = []

  for (const phrase of VAGUE_PHRASES) {
    if (lower.includes(phrase)) {
      found.push(phrase)
    }
  }

  if (found.length > 0) {
    issues.push({
      type: 'vague_description',
      severity: 'warning',
      message: `Vague language detected: "${found.join('", "')}"`,
      suggestion:
        'Be specific about what the artist should draw. Describe concrete actions, expressions, and compositions.',
    })
  }

  return issues
}

function checkLength(description: string): DescriptionIssue[] {
  const words = description.trim().split(/\s+/).filter(Boolean)
  if (words.length > 80) {
    return [
      {
        type: 'too_long',
        severity: 'warning',
        message: `Description is ${words.length} words. Consider trimming to under 80.`,
        suggestion:
          'Long descriptions slow down the artist. Focus on the essential visual information and cut anything the art can imply.',
      },
    ]
  }
  return []
}

function checkRepeatedWords(description: string): DescriptionIssue[] {
  const words = description
    .toLowerCase()
    .replace(/[^a-z\s'-]/g, '')
    .split(/\s+/)
    .filter((w) => w.length > 4 && !STOP_WORDS.has(w))

  const counts = new Map<string, number>()
  for (const word of words) {
    counts.set(word, (counts.get(word) || 0) + 1)
  }

  const repeated = [...counts.entries()]
    .filter(([, count]) => count >= 3)
    .map(([word, count]) => `"${word}" (${count}x)`)

  if (repeated.length > 0) {
    return [
      {
        type: 'repeated_words',
        severity: 'info',
        message: `Repeated words: ${repeated.join(', ')}`,
        suggestion:
          'Vary your word choice to keep descriptions fresh. Use synonyms or restructure sentences.',
      },
    ]
  }
  return []
}

function checkMissingShotType(
  description: string,
  shotType?: string | null
): DescriptionIssue[] {
  // If a shot type is already provided via the panel's camera field, skip
  if (shotType && shotType.trim().length > 0) {
    return []
  }

  const words = description.trim().split(/\s+/).filter(Boolean)
  if (words.length <= 40) {
    return []
  }

  const lower = description.toLowerCase()
  const hasShotIndicator = SHOT_TYPE_INDICATORS.some((indicator) =>
    lower.includes(indicator)
  )

  if (!hasShotIndicator) {
    return [
      {
        type: 'missing_shot_type',
        severity: 'info',
        message:
          'No camera angle or shot type specified in this longer description.',
        suggestion:
          'Consider adding a shot type (e.g., "Close-up", "Wide shot", "Over the shoulder") to help the artist frame the panel.',
      },
    ]
  }
  return []
}

export function checkDescription(
  visualDescription: string,
  shotType?: string | null
): DescriptionIssue[] {
  if (!visualDescription || visualDescription.trim().length === 0) {
    return []
  }

  return [
    ...checkPassiveVoice(visualDescription),
    ...checkVagueDescriptions(visualDescription),
    ...checkLength(visualDescription),
    ...checkRepeatedWords(visualDescription),
    ...checkMissingShotType(visualDescription, shotType),
  ]
}
