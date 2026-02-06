/**
 * Script Structure Detection
 * Detects acts, scenes, and organizational markers in scripts
 */

export interface DetectedAct {
  name: string
  startLine: number
  endLine?: number
  scenes: DetectedScene[]
  rawMarker: string
}

export interface DetectedScene {
  title: string
  startLine: number
  endLine?: number
  pages: number[] // Page numbers in this scene
  rawMarker: string
  location?: string
  timeOfDay?: string
}

export interface StructureAnalysis {
  acts: DetectedAct[]
  hasActMarkers: boolean
  hasSceneMarkers: boolean
  totalPages: number
  suggestedStructure: 'flat' | 'acts-only' | 'acts-and-scenes' | 'scenes-only'
}

// Act detection patterns
const ACT_PATTERNS = [
  /^[\s]*ACT[\s]+(ONE|TWO|THREE|FOUR|FIVE|I|II|III|IV|V|\d+)[\s]*[:\.]?[\s]*$/i,
  /^[\s]*[-=]{2,}[\s]*ACT[\s]+(ONE|TWO|THREE|FOUR|FIVE|I|II|III|IV|V|\d+)[\s]*[-=]{2,}[\s]*$/i,
  /^[\s]*#{1,3}[\s]*ACT[\s]+(ONE|TWO|THREE|FOUR|FIVE|I|II|III|IV|V|\d+)[\s]*$/i,
  /^[\s]*\[[\s]*ACT[\s]+(ONE|TWO|THREE|FOUR|FIVE|I|II|III|IV|V|\d+)[\s]*\][\s]*$/i,
  /^[\s]*ACT[\s]+(ONE|TWO|THREE|FOUR|FIVE|I|II|III|IV|V|\d+)[\s]*[-:.][\s]*(.+)$/i, // ACT ONE: Title
]

// Scene detection patterns
const SCENE_PATTERNS = [
  // Explicit SCENE markers
  /^[\s]*SCENE[\s]*[:\.]?[\s]*(.+)$/i,
  /^[\s]*SCENE[\s]+(\d+)[\s]*[:\.]?[\s]*(.*)$/i,
  // Screenplay-style INT./EXT.
  /^[\s]*(INT\.|EXT\.|INT\/EXT\.)[\s]+([^-\n]+)(?:[\s]*-[\s]*(.+))?$/i,
  // Location headers (ALL CAPS location)
  /^[\s]*([A-Z][A-Z\s]+)[\s]*-[\s]*(DAY|NIGHT|MORNING|EVENING|LATER|CONTINUOUS|MOMENTS LATER)[\s]*$/,
  // Bracketed scene markers
  /^[\s]*\[[\s]*SCENE[\s]*[:\.]?[\s]*(.+)\][\s]*$/i,
  // Dashed scene breaks
  /^[\s]*[-=]{3,}[\s]*(?:SCENE[\s]*[:\.]?[\s]*)?(.+)[\s]*[-=]{3,}[\s]*$/i,
]

// Page detection (simplified, we use format-detector for full detection)
const PAGE_PATTERN = /^[\s]*(?:PAGE|Pg\.?|P)[\s]*(\d+|ONE|TWO|THREE|FOUR|FIVE|SIX|SEVEN|EIGHT|NINE|TEN|ELEVEN|TWELVE|THIRTEEN|FOURTEEN|FIFTEEN|SIXTEEN|SEVENTEEN|EIGHTEEN|NINETEEN|TWENTY)/i

// Roman numeral and word to number conversion
const TO_NUMBER: Record<string, number> = {
  'I': 1, 'II': 2, 'III': 3, 'IV': 4, 'V': 5,
  'ONE': 1, 'TWO': 2, 'THREE': 3, 'FOUR': 4, 'FIVE': 5,
  'SIX': 6, 'SEVEN': 7, 'EIGHT': 8, 'NINE': 9, 'TEN': 10,
}

function toNumber(str: string): number {
  const upper = str.toUpperCase().trim()
  return TO_NUMBER[upper] || parseInt(upper) || 1
}

/**
 * Detect structure (acts and scenes) in a script
 */
export function detectStructure(scriptText: string): StructureAnalysis {
  const lines = scriptText.split('\n')
  const acts: DetectedAct[] = []
  let currentAct: DetectedAct | null = null
  let currentScene: DetectedScene | null = null
  let currentPageNum: number | null = null
  let totalPages = 0

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const trimmed = line.trim()

    // Skip empty lines
    if (!trimmed) continue

    // Check for page markers (to track which pages belong to which scene)
    const pageMatch = trimmed.match(PAGE_PATTERN)
    if (pageMatch) {
      const numStr = pageMatch[1]
      currentPageNum = toNumber(numStr) || parseInt(numStr)
      totalPages = Math.max(totalPages, currentPageNum)

      // Add page to current scene
      if (currentScene && currentPageNum) {
        if (!currentScene.pages.includes(currentPageNum)) {
          currentScene.pages.push(currentPageNum)
        }
      }
      continue
    }

    // Check for act markers
    let actMatch: RegExpMatchArray | null = null
    for (const pattern of ACT_PATTERNS) {
      actMatch = trimmed.match(pattern)
      if (actMatch) break
    }

    if (actMatch) {
      // Close previous scene
      if (currentScene) {
        currentScene.endLine = i - 1
      }

      // Close previous act
      if (currentAct) {
        currentAct.endLine = i - 1
        acts.push(currentAct)
      }

      // Start new act
      const actNum = toNumber(actMatch[1])
      const actTitle = actMatch[2]?.trim() || null
      currentAct = {
        name: actTitle || `Act ${actNum}`,
        startLine: i,
        scenes: [],
        rawMarker: trimmed,
      }
      currentScene = null
      continue
    }

    // Check for scene markers
    let sceneMatch: RegExpMatchArray | null = null
    for (const pattern of SCENE_PATTERNS) {
      sceneMatch = trimmed.match(pattern)
      if (sceneMatch) break
    }

    if (sceneMatch) {
      // Close previous scene
      if (currentScene) {
        currentScene.endLine = i - 1
        if (currentAct) {
          currentAct.scenes.push(currentScene)
        }
      }

      // Parse scene info
      let title = ''
      let location: string | undefined
      let timeOfDay: string | undefined

      if (sceneMatch[1]?.match(/^(INT\.|EXT\.|INT\/EXT\.)$/i)) {
        // Screenplay format: INT. LOCATION - TIME
        location = sceneMatch[2]?.trim()
        timeOfDay = sceneMatch[3]?.trim()
        title = `${sceneMatch[1]} ${location}${timeOfDay ? ` - ${timeOfDay}` : ''}`
      } else {
        // Generic scene marker
        title = (sceneMatch[2] || sceneMatch[1] || '').trim()
        // Check if it's a location-time format
        const locationTimeMatch = title.match(/^(.+)[\s]*-[\s]*(DAY|NIGHT|MORNING|EVENING|LATER|CONTINUOUS)/i)
        if (locationTimeMatch) {
          location = locationTimeMatch[1].trim()
          timeOfDay = locationTimeMatch[2].trim()
        }
      }

      // Create scene (ensure we have an act to put it in)
      if (!currentAct) {
        currentAct = {
          name: 'Act 1',
          startLine: 0,
          scenes: [],
          rawMarker: '(implicit)',
        }
      }

      currentScene = {
        title: title || `Scene ${currentAct.scenes.length + 1}`,
        startLine: i,
        pages: currentPageNum ? [currentPageNum] : [],
        rawMarker: trimmed,
        location,
        timeOfDay,
      }
      continue
    }
  }

  // Close final scene and act
  if (currentScene) {
    currentScene.endLine = lines.length - 1
    if (currentAct) {
      currentAct.scenes.push(currentScene)
    }
  }
  if (currentAct) {
    currentAct.endLine = lines.length - 1
    acts.push(currentAct)
  }

  // Determine suggested structure
  const hasActMarkers = acts.some(a => a.rawMarker !== '(implicit)')
  const hasSceneMarkers = acts.some(a => a.scenes.length > 0)

  let suggestedStructure: StructureAnalysis['suggestedStructure'] = 'flat'
  if (hasActMarkers && hasSceneMarkers) {
    suggestedStructure = 'acts-and-scenes'
  } else if (hasActMarkers) {
    suggestedStructure = 'acts-only'
  } else if (hasSceneMarkers) {
    suggestedStructure = 'scenes-only'
  }

  return {
    acts,
    hasActMarkers,
    hasSceneMarkers,
    totalPages,
    suggestedStructure,
  }
}

/**
 * Create a default flat structure when no markers are detected
 */
export function createFlatStructure(pageCount: number): StructureAnalysis {
  const pages = Array.from({ length: pageCount }, (_, i) => i + 1)

  return {
    acts: [{
      name: 'Act 1',
      startLine: 0,
      scenes: [{
        title: 'Main',
        startLine: 0,
        pages,
        rawMarker: '(auto-generated)',
      }],
      rawMarker: '(auto-generated)',
    }],
    hasActMarkers: false,
    hasSceneMarkers: false,
    totalPages: pageCount,
    suggestedStructure: 'flat',
  }
}

/**
 * Suggest act breaks based on page count (for comics without explicit acts)
 */
export function suggestActBreaks(pageCount: number): { act: number; startPage: number; endPage: number }[] {
  // Standard 3-act structure
  if (pageCount <= 8) {
    // Short issue - single act
    return [{ act: 1, startPage: 1, endPage: pageCount }]
  } else if (pageCount <= 16) {
    // Medium issue - 2 acts
    const midpoint = Math.ceil(pageCount / 2)
    return [
      { act: 1, startPage: 1, endPage: midpoint },
      { act: 2, startPage: midpoint + 1, endPage: pageCount },
    ]
  } else {
    // Standard comic (20-24 pages) - 3 acts
    // Act 1: ~25%, Act 2: ~50%, Act 3: ~25%
    const act1End = Math.ceil(pageCount * 0.25)
    const act2End = Math.ceil(pageCount * 0.75)
    return [
      { act: 1, startPage: 1, endPage: act1End },
      { act: 2, startPage: act1End + 1, endPage: act2End },
      { act: 3, startPage: act2End + 1, endPage: pageCount },
    ]
  }
}

/**
 * Get structure type label for UI
 */
export function getStructureLabel(structure: StructureAnalysis['suggestedStructure']): string {
  switch (structure) {
    case 'acts-and-scenes': return 'Full Structure (Acts & Scenes)'
    case 'acts-only': return 'Act Structure Only'
    case 'scenes-only': return 'Scene Structure Only'
    case 'flat': return 'No Structure Detected'
  }
}

/**
 * Get structure description for UI
 */
export function getStructureDescription(analysis: StructureAnalysis): string {
  const actCount = analysis.acts.length
  const sceneCount = analysis.acts.reduce((sum, act) => sum + act.scenes.length, 0)

  if (analysis.suggestedStructure === 'flat') {
    return `No act or scene markers detected. Will import as single scene.`
  }

  const parts: string[] = []
  if (actCount > 0) {
    parts.push(`${actCount} act${actCount !== 1 ? 's' : ''}`)
  }
  if (sceneCount > 0) {
    parts.push(`${sceneCount} scene${sceneCount !== 1 ? 's' : ''}`)
  }
  parts.push(`${analysis.totalPages} pages`)

  return `Detected: ${parts.join(', ')}`
}
