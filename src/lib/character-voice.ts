// Character Voice Profiles
// Train on speech patterns, flag inconsistencies

// ============================================
// TYPES
// ============================================

export type VocabularyLevel = 'formal' | 'casual' | 'street' | 'technical' | 'poetic' | 'mixed'
export type FlagType = 'vocabulary' | 'tone' | 'length' | 'pattern'
export type FlagSeverity = 'suggestion' | 'warning'

export interface DialogueBlock {
  id: string
  text: string
  character_id?: string | null
  dialogue_type?: string | null
}

export interface VoiceProfile {
  characterId: string
  vocabularyLevel: VocabularyLevel
  avgSentenceLength: number
  commonWords: string[]
  avoidedWords: string[]
  toneMarkers: string[]
  speechQuirks: string[]
  sampleQuotes: string[]
  dialogueCount: number
  profileSummary?: string
  trainedAt?: Date
}

export interface DialogueFlag {
  dialogueId: string
  characterId: string
  flagType: FlagType
  message: string
  flaggedWord?: string
  suggestedAlternative?: string
  severity: FlagSeverity
}

export interface VoiceAnalysis {
  profile: VoiceProfile
  flags: DialogueFlag[]
}

// ============================================
// WORD LISTS
// ============================================

// Formal vocabulary indicators
const FORMAL_WORDS = new Set([
  'furthermore', 'moreover', 'consequently', 'nevertheless', 'notwithstanding',
  'pursuant', 'heretofore', 'aforementioned', 'indubitably', 'indeed',
  'therefore', 'thus', 'hence', 'accordingly', 'subsequently',
  'regarding', 'concerning', 'pertaining', 'whereas', 'whereby',
  'shall', 'ought', 'hitherto', 'therein', 'thereof',
  'magnificent', 'extraordinary', 'unprecedented', 'substantial', 'considerable',
])

// Street/casual vocabulary indicators
const STREET_WORDS = new Set([
  'ain\'t', 'gonna', 'wanna', 'gotta', 'ya', 'yo', 'nah', 'yeah',
  'dude', 'bro', 'man', 'like', 'totally', 'whatever', 'kinda',
  'sorta', 'bout', 'em', 'lemme', 'gimme', 'dunno', 'cuz',
  'real', 'legit', 'tight', 'sick', 'dope', 'lit', 'fire',
  'bruh', 'fam', 'homie', 'dawg', 'chill', 'vibes', 'bet',
])

// Technical vocabulary indicators
const TECHNICAL_WORDS = new Set([
  'algorithm', 'parameter', 'protocol', 'interface', 'implementation',
  'specification', 'configuration', 'optimization', 'initialization', 'instantiate',
  'methodology', 'framework', 'architecture', 'infrastructure', 'synchronize',
  'calibrate', 'diagnostic', 'hypothesis', 'coefficient', 'variable',
  'analysis', 'synthesis', 'quantum', 'vector', 'matrix',
])

// Poetic vocabulary indicators
const POETIC_WORDS = new Set([
  'whisper', 'shadow', 'twilight', 'ethereal', 'gossamer',
  'luminous', 'ephemeral', 'melancholy', 'serenity', 'tranquil',
  'cascade', 'shimmer', 'velvet', 'crimson', 'azure',
  'essence', 'reverie', 'solitude', 'harmony', 'eternal',
  'blossom', 'wistful', 'tender', 'gentle', 'radiant',
])

// Common stop words to ignore
const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
  'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been',
  'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'must', 'can', 'this', 'that', 'these', 'those',
  'i', 'you', 'he', 'she', 'it', 'we', 'they', 'me', 'him', 'her', 'us', 'them',
  'my', 'your', 'his', 'its', 'our', 'their', 'what', 'which', 'who', 'whom',
  'when', 'where', 'why', 'how', 'all', 'each', 'every', 'both', 'few', 'more',
  'most', 'other', 'some', 'such', 'no', 'not', 'only', 'own', 'same', 'so',
  'than', 'too', 'very', 'just', 'also', 'now', 'here', 'there', 'then',
])

// ============================================
// ANALYSIS FUNCTIONS
// ============================================

/**
 * Tokenize text into words
 */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s']/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 0)
}

/**
 * Calculate average sentence length
 */
function calculateAvgSentenceLength(dialogues: string[]): number {
  let totalSentences = 0
  let totalWords = 0

  for (const text of dialogues) {
    // Split by sentence-ending punctuation
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0)
    totalSentences += sentences.length

    for (const sentence of sentences) {
      totalWords += tokenize(sentence).length
    }
  }

  if (totalSentences === 0) return 0
  return Math.round((totalWords / totalSentences) * 10) / 10
}

/**
 * Analyze vocabulary level
 */
function analyzeVocabularyLevel(words: string[]): VocabularyLevel {
  let formalCount = 0
  let streetCount = 0
  let technicalCount = 0
  let poeticCount = 0

  for (const word of words) {
    if (FORMAL_WORDS.has(word)) formalCount++
    if (STREET_WORDS.has(word)) streetCount++
    if (TECHNICAL_WORDS.has(word)) technicalCount++
    if (POETIC_WORDS.has(word)) poeticCount++
  }

  const total = words.length
  if (total === 0) return 'casual'

  const formalRatio = formalCount / total
  const streetRatio = streetCount / total
  const technicalRatio = technicalCount / total
  const poeticRatio = poeticCount / total

  // Determine dominant style
  const ratios = [
    { level: 'formal' as VocabularyLevel, ratio: formalRatio },
    { level: 'street' as VocabularyLevel, ratio: streetRatio },
    { level: 'technical' as VocabularyLevel, ratio: technicalRatio },
    { level: 'poetic' as VocabularyLevel, ratio: poeticRatio },
  ]

  const dominant = ratios.reduce((a, b) => a.ratio > b.ratio ? a : b)

  // Check for mixed
  const significantStyles = ratios.filter(r => r.ratio > 0.02).length
  if (significantStyles >= 2 && dominant.ratio < 0.05) {
    return 'mixed'
  }

  if (dominant.ratio > 0.02) {
    return dominant.level
  }

  return 'casual'
}

/**
 * Find most common non-stop words
 */
function findCommonWords(words: string[], limit: number = 10): string[] {
  const wordCounts = new Map<string, number>()

  for (const word of words) {
    if (STOP_WORDS.has(word) || word.length < 3) continue
    wordCounts.set(word, (wordCounts.get(word) || 0) + 1)
  }

  return Array.from(wordCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([word]) => word)
}

/**
 * Detect speech quirks
 */
function detectSpeechQuirks(dialogues: string[]): string[] {
  const quirks: string[] = []
  const allText = dialogues.join(' ')
  const words = tokenize(allText)

  // Check for repetition patterns (e.g., "real real")
  let repeatCount = 0
  for (let i = 1; i < words.length; i++) {
    if (words[i] === words[i - 1]) repeatCount++
  }
  if (repeatCount > dialogues.length * 0.05) {
    quirks.push('Repeats words for emphasis')
  }

  // Check for rhetorical questions
  const questionCount = (allText.match(/\?/g) || []).length
  const sentenceCount = (allText.match(/[.!?]/g) || []).length
  if (sentenceCount > 0 && questionCount / sentenceCount > 0.3) {
    quirks.push('Asks rhetorical questions')
  }

  // Check for ellipsis (trailing off)
  const ellipsisCount = (allText.match(/\.\.\./g) || []).length
  if (ellipsisCount > dialogues.length * 0.1) {
    quirks.push('Trails off mid-sentence')
  }

  // Check for exclamations
  const exclamationCount = (allText.match(/!/g) || []).length
  if (sentenceCount > 0 && exclamationCount / sentenceCount > 0.4) {
    quirks.push('Speaks emphatically')
  }

  // Check for contractions
  const contractionCount = (allText.match(/\w+'\w+/g) || []).length
  const wordCount = words.length
  if (wordCount > 0 && contractionCount / wordCount > 0.05) {
    quirks.push('Uses contractions frequently')
  } else if (wordCount > 20 && contractionCount === 0) {
    quirks.push('Avoids contractions')
  }

  return quirks
}

/**
 * Detect tone markers from dialogue
 */
function detectToneMarkers(dialogues: string[]): string[] {
  const markers: string[] = []
  const allText = dialogues.join(' ').toLowerCase()

  // Sarcasm indicators
  if (allText.includes('oh, really') || allText.includes('sure') ||
      allText.includes('right') || allText.includes('whatever')) {
    markers.push('sarcastic')
  }

  // Urgency indicators
  if (allText.includes('now') || allText.includes('hurry') ||
      allText.includes('quick') || allText.includes('fast') ||
      (allText.match(/!/g) || []).length > dialogues.length * 0.3) {
    markers.push('urgent')
  }

  // Hesitancy indicators
  if (allText.includes('maybe') || allText.includes('perhaps') ||
      allText.includes('i think') || allText.includes('i guess') ||
      (allText.match(/\.\.\./g) || []).length > 2) {
    markers.push('hesitant')
  }

  // Confident indicators
  if (allText.includes('definitely') || allText.includes('absolutely') ||
      allText.includes('of course') || allText.includes('obviously')) {
    markers.push('confident')
  }

  // Humor indicators
  if (allText.includes('haha') || allText.includes('lol') ||
      allText.includes('kidding') || allText.includes('joke')) {
    markers.push('humorous')
  }

  return markers
}

/**
 * Select representative sample quotes
 */
function selectSampleQuotes(dialogues: string[], limit: number = 5): string[] {
  // Filter to medium-length dialogues (not too short, not too long)
  const candidates = dialogues
    .filter(d => d.length >= 20 && d.length <= 150)
    .sort((a, b) => b.length - a.length) // Prefer longer ones

  return candidates.slice(0, limit)
}

// ============================================
// MAIN TRAINING FUNCTION
// ============================================

/**
 * Train a voice profile from dialogue samples
 */
export function trainVoiceProfile(
  characterId: string,
  dialogues: DialogueBlock[]
): VoiceProfile {
  // Extract text from dialogues
  const texts = dialogues
    .filter(d => d.text && d.text.trim().length > 0)
    .map(d => d.text)

  // Tokenize all words
  const allWords = texts.flatMap(tokenize)

  // Calculate metrics
  const vocabularyLevel = analyzeVocabularyLevel(allWords)
  const avgSentenceLength = calculateAvgSentenceLength(texts)
  const commonWords = findCommonWords(allWords)
  const speechQuirks = detectSpeechQuirks(texts)
  const toneMarkers = detectToneMarkers(texts)
  const sampleQuotes = selectSampleQuotes(texts)

  // Determine avoided words based on vocabulary level
  const avoidedWords: string[] = []
  if (vocabularyLevel === 'street' || vocabularyLevel === 'casual') {
    avoidedWords.push(...Array.from(FORMAL_WORDS).slice(0, 10))
  }
  if (vocabularyLevel === 'formal') {
    avoidedWords.push(...Array.from(STREET_WORDS).slice(0, 10))
  }

  return {
    characterId,
    vocabularyLevel,
    avgSentenceLength,
    commonWords,
    avoidedWords,
    toneMarkers,
    speechQuirks,
    sampleQuotes,
    dialogueCount: dialogues.length,
  }
}

// ============================================
// CONSISTENCY CHECKING
// ============================================

/**
 * Check a single dialogue line for inconsistencies with the profile
 */
export function checkDialogueConsistency(
  dialogue: DialogueBlock,
  profile: VoiceProfile
): DialogueFlag[] {
  const flags: DialogueFlag[] = []
  const text = dialogue.text || ''
  const words = tokenize(text)

  // Check for avoided words
  for (const word of words) {
    if (profile.avoidedWords.includes(word)) {
      flags.push({
        dialogueId: dialogue.id,
        characterId: profile.characterId,
        flagType: 'vocabulary',
        message: `"${word}" doesn't match this character's voice`,
        flaggedWord: word,
        suggestedAlternative: suggestAlternative(word, profile),
        severity: 'warning',
      })
    }

    // Check vocabulary level mismatch
    if (profile.vocabularyLevel === 'street' && FORMAL_WORDS.has(word)) {
      flags.push({
        dialogueId: dialogue.id,
        characterId: profile.characterId,
        flagType: 'vocabulary',
        message: `"${word}" is too formal for this character`,
        flaggedWord: word,
        suggestedAlternative: suggestAlternative(word, profile),
        severity: 'suggestion',
      })
    }

    if (profile.vocabularyLevel === 'formal' && STREET_WORDS.has(word)) {
      flags.push({
        dialogueId: dialogue.id,
        characterId: profile.characterId,
        flagType: 'vocabulary',
        message: `"${word}" is too casual for this character`,
        flaggedWord: word,
        suggestedAlternative: suggestAlternative(word, profile),
        severity: 'suggestion',
      })
    }
  }

  // Check sentence length
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0)
  for (const sentence of sentences) {
    const sentenceWords = tokenize(sentence)
    const length = sentenceWords.length

    // Flag if significantly longer than average
    if (profile.avgSentenceLength > 0 && length > profile.avgSentenceLength * 2) {
      flags.push({
        dialogueId: dialogue.id,
        characterId: profile.characterId,
        flagType: 'length',
        message: `Sentence is ${length} words—unusually long for this character (avg: ${profile.avgSentenceLength})`,
        severity: 'suggestion',
      })
    }
  }

  return flags
}

/**
 * Suggest an alternative word based on the character's vocabulary level
 */
export function suggestAlternative(word: string, profile: VoiceProfile): string {
  const alternatives: Record<string, Record<VocabularyLevel, string>> = {
    'indubitably': { formal: 'certainly', casual: 'definitely', street: 'for real', technical: 'certainly', poetic: 'indeed', mixed: 'sure' },
    'furthermore': { formal: 'additionally', casual: 'also', street: 'plus', technical: 'additionally', poetic: 'moreover', mixed: 'also' },
    'ain\'t': { formal: 'is not', casual: 'isn\'t', street: 'ain\'t', technical: 'is not', poetic: 'is not', mixed: 'isn\'t' },
    'gonna': { formal: 'going to', casual: 'going to', street: 'gonna', technical: 'going to', poetic: 'shall', mixed: 'going to' },
    'yo': { formal: 'excuse me', casual: 'hey', street: 'yo', technical: 'attention', poetic: 'hark', mixed: 'hey' },
    'dude': { formal: 'sir', casual: 'man', street: 'dude', technical: 'colleague', poetic: 'friend', mixed: 'buddy' },
    'magnificent': { formal: 'magnificent', casual: 'amazing', street: 'sick', technical: 'exceptional', poetic: 'magnificent', mixed: 'great' },
    'therefore': { formal: 'therefore', casual: 'so', street: 'so', technical: 'thus', poetic: 'hence', mixed: 'so' },
  }

  const lowerWord = word.toLowerCase()
  if (alternatives[lowerWord] && alternatives[lowerWord][profile.vocabularyLevel]) {
    return alternatives[lowerWord][profile.vocabularyLevel]
  }

  // Generic suggestions based on vocabulary level
  if (FORMAL_WORDS.has(lowerWord) && profile.vocabularyLevel === 'street') {
    return 'simpler word'
  }
  if (STREET_WORDS.has(lowerWord) && profile.vocabularyLevel === 'formal') {
    return 'more formal phrasing'
  }

  return ''
}

/**
 * Check all dialogues for a character against their profile
 */
export function checkAllDialogues(
  dialogues: DialogueBlock[],
  profile: VoiceProfile
): DialogueFlag[] {
  const allFlags: DialogueFlag[] = []

  for (const dialogue of dialogues) {
    const flags = checkDialogueConsistency(dialogue, profile)
    allFlags.push(...flags)
  }

  return allFlags
}

// ============================================
// HELPERS
// ============================================

export function getVocabularyLabel(level: VocabularyLevel): string {
  const labels: Record<VocabularyLevel, string> = {
    formal: 'Formal / Educated',
    casual: 'Casual / Everyday',
    street: 'Street / Colloquial',
    technical: 'Technical / Specialized',
    poetic: 'Poetic / Literary',
    mixed: 'Mixed / Variable',
  }
  return labels[level]
}

export function getVocabularyColor(level: VocabularyLevel): string {
  const colors: Record<VocabularyLevel, string> = {
    formal: 'bg-blue-900 text-blue-300',
    casual: 'bg-green-900 text-green-300',
    street: 'bg-amber-900 text-amber-300',
    technical: 'bg-purple-900 text-purple-300',
    poetic: 'bg-pink-900 text-pink-300',
    mixed: 'bg-gray-700 text-gray-300',
  }
  return colors[level]
}

export function getFlagTypeLabel(type: FlagType): string {
  const labels: Record<FlagType, string> = {
    vocabulary: 'Vocabulary',
    tone: 'Tone',
    length: 'Sentence Length',
    pattern: 'Speech Pattern',
  }
  return labels[type]
}

export function getFlagSeverityColor(severity: FlagSeverity): string {
  return severity === 'warning' ? 'text-red-400' : 'text-yellow-400'
}

/**
 * Generate a summary description of the voice profile
 */
export function generateProfileSummary(profile: VoiceProfile, characterName: string): string {
  const parts: string[] = []

  // Vocabulary
  parts.push(`${characterName} speaks in a ${profile.vocabularyLevel} register`)

  // Sentence length
  if (profile.avgSentenceLength <= 6) {
    parts.push('using short, punchy sentences')
  } else if (profile.avgSentenceLength >= 12) {
    parts.push('with longer, more elaborate sentences')
  }

  // Tone
  if (profile.toneMarkers.length > 0) {
    parts.push(`Their tone is often ${profile.toneMarkers.slice(0, 2).join(' and ')}`)
  }

  // Quirks
  if (profile.speechQuirks.length > 0) {
    parts.push(profile.speechQuirks[0].toLowerCase())
  }

  // Common words
  if (profile.commonWords.length >= 3) {
    parts.push(`frequently using words like "${profile.commonWords.slice(0, 3).join('", "')}"`)
  }

  return parts.join('. ') + '.'
}
