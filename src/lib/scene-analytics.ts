// Scene-Level Analytics
// Evaluates if each scene is "earning its pages"

import { countWords } from './pacing'

// ============================================
// TYPES
// ============================================

export interface PanelData {
  id: string
  visual_description?: string | null
  dialogue_blocks?: Array<{ text: string; character_id?: string }> | null
  captions?: Array<{ text: string }> | null
}

export interface PageData {
  id: string
  page_number: number
  panels: PanelData[]
}

export interface SceneData {
  id: string
  title?: string | null
  name?: string | null
  sort_order: number
  pages: PageData[]
}

export interface ActData {
  id: string
  name?: string | null
  sort_order: number
  scenes: SceneData[]
}

export type DramaticFunction =
  | 'exposition'
  | 'rising_action'
  | 'climax'
  | 'falling_action'
  | 'resolution'
  | 'character_moment'
  | 'world_building'
  | 'transition'

export interface SceneMetrics {
  sceneId: string
  sceneName: string
  pageCount: number
  panelCount: number
  wordCount: number
  dialoguePanels: number
  silentPanels: number
  wordsPerPage: number
  panelsPerPage: number
  dialogueRatio: number
}

export interface SceneInsight {
  type: 'warning' | 'suggestion' | 'strength'
  severity: 'low' | 'medium' | 'high'
  message: string
  suggestion?: string
}

export interface SceneAnalysis {
  metrics: SceneMetrics
  dramaticFunction: DramaticFunction
  efficiencyScore: number
  insights: SceneInsight[]
}

// ============================================
// THRESHOLDS
// ============================================

export const SCENE_THRESHOLDS = {
  wordsPerPage: {
    ideal: { min: 30, max: 100 },
    sparse: 20,
    dense: 120,
  },
  panelsPerPage: {
    ideal: { min: 4, max: 6 },
    sparse: 3,
    cramped: 8,
  },
  dialogueRatio: {
    ideal: { min: 0.3, max: 0.7 },
    talkingHeads: 0.85,
    allAction: 0.1,
  },
  pagesPerScene: {
    typical: { min: 2, max: 6 },
    short: 1,
    long: 10,
  },
}

// ============================================
// CALCULATIONS
// ============================================

/**
 * Calculate metrics for a single scene
 */
export function calculateSceneMetrics(scene: SceneData): SceneMetrics {
  const pages = scene.pages || []
  let wordCount = 0
  let panelCount = 0
  let dialoguePanels = 0
  let silentPanels = 0

  for (const page of pages) {
    const panels = page.panels || []
    panelCount += panels.length

    for (const panel of panels) {
      // Count dialogue words
      const dialogueWords = (panel.dialogue_blocks || [])
        .reduce((sum, d) => sum + countWords(d.text), 0)

      // Count caption words
      const captionWords = (panel.captions || [])
        .reduce((sum, c) => sum + countWords(c.text), 0)

      const panelWords = dialogueWords + captionWords
      wordCount += panelWords

      // Track dialogue vs silent panels
      if ((panel.dialogue_blocks?.length || 0) > 0) {
        dialoguePanels++
      }
      if (panelWords === 0) {
        silentPanels++
      }
    }
  }

  const pageCount = pages.length
  const wordsPerPage = pageCount > 0 ? Math.round((wordCount / pageCount) * 10) / 10 : 0
  const panelsPerPage = pageCount > 0 ? Math.round((panelCount / pageCount) * 10) / 10 : 0
  const dialogueRatio = panelCount > 0 ? Math.round((dialoguePanels / panelCount) * 1000) / 1000 : 0

  return {
    sceneId: scene.id,
    sceneName: scene.title || scene.name || 'Untitled Scene',
    pageCount,
    panelCount,
    wordCount,
    dialoguePanels,
    silentPanels,
    wordsPerPage,
    panelsPerPage,
    dialogueRatio,
  }
}

/**
 * Assess the dramatic function of a scene based on position and characteristics
 */
export function assessDramaticFunction(
  scene: SceneData,
  actIndex: number,
  sceneIndexInAct: number,
  totalScenesInAct: number,
  totalActs: number
): DramaticFunction {
  const metrics = calculateSceneMetrics(scene)

  // Position-based heuristics
  const isFirstAct = actIndex === 0
  const isLastAct = actIndex === totalActs - 1
  const isMiddleAct = !isFirstAct && !isLastAct
  const isFirstScene = sceneIndexInAct === 0
  const isLastScene = sceneIndexInAct === totalScenesInAct - 1

  // Content-based heuristics
  const isDialogueHeavy = metrics.dialogueRatio > 0.7
  const isActionHeavy = metrics.dialogueRatio < 0.3
  const isShort = metrics.pageCount <= 1
  const isLong = metrics.pageCount >= 5

  // Determine function
  if (isFirstAct && isFirstScene) {
    return 'exposition'
  }

  if (isLastAct && isLastScene) {
    return 'resolution'
  }

  if (isMiddleAct && isLong && !isDialogueHeavy) {
    return 'climax'
  }

  if (isMiddleAct && isLastScene) {
    return 'climax'
  }

  if (isLastAct && isFirstScene) {
    return 'falling_action'
  }

  if (isFirstAct && !isFirstScene) {
    return 'rising_action'
  }

  if (isShort && isDialogueHeavy) {
    return 'character_moment'
  }

  if (isShort) {
    return 'transition'
  }

  if (isDialogueHeavy && metrics.pageCount >= 3) {
    return 'character_moment'
  }

  return 'rising_action'
}

/**
 * Generate insights based on scene metrics and dramatic function
 */
export function generateSceneInsights(
  metrics: SceneMetrics,
  dramaticFunction: DramaticFunction
): SceneInsight[] {
  const insights: SceneInsight[] = []
  const { wordsPerPage, panelsPerPage, dialogueRatio, pageCount, silentPanels, panelCount } = metrics

  // Word density checks
  if (wordsPerPage > SCENE_THRESHOLDS.wordsPerPage.dense) {
    insights.push({
      type: 'warning',
      severity: 'high',
      message: `Heavy dialogue (${wordsPerPage} words/page)`,
      suggestion: 'Consider adding visual beats or splitting dialogue across panels',
    })
  } else if (wordsPerPage < SCENE_THRESHOLDS.wordsPerPage.sparse && pageCount > 1) {
    insights.push({
      type: 'suggestion',
      severity: 'low',
      message: `Sparse dialogue (${wordsPerPage} words/page)`,
      suggestion: 'This scene may benefit from character moments or internal captions',
    })
  } else if (
    wordsPerPage >= SCENE_THRESHOLDS.wordsPerPage.ideal.min &&
    wordsPerPage <= SCENE_THRESHOLDS.wordsPerPage.ideal.max
  ) {
    insights.push({
      type: 'strength',
      severity: 'low',
      message: 'Well-balanced dialogue density',
    })
  }

  // Panel density checks
  if (panelsPerPage > SCENE_THRESHOLDS.panelsPerPage.cramped) {
    insights.push({
      type: 'warning',
      severity: 'medium',
      message: `Cramped layout (${panelsPerPage} panels/page)`,
      suggestion: 'Consider expanding key moments across more pages',
    })
  } else if (panelsPerPage < SCENE_THRESHOLDS.panelsPerPage.sparse && pageCount > 1) {
    insights.push({
      type: 'suggestion',
      severity: 'low',
      message: `Sparse panels (${panelsPerPage} panels/page)`,
      suggestion: 'Ensure each splash/spread earns its space with impact',
    })
  }

  // Dialogue ratio checks
  if (dialogueRatio > SCENE_THRESHOLDS.dialogueRatio.talkingHeads) {
    insights.push({
      type: 'warning',
      severity: 'medium',
      message: 'Talking heads syndrome',
      suggestion: 'Add visual variety—characters interacting with environment',
    })
  } else if (dialogueRatio < SCENE_THRESHOLDS.dialogueRatio.allAction && dramaticFunction !== 'transition') {
    insights.push({
      type: 'suggestion',
      severity: 'low',
      message: 'Pure action sequence',
      suggestion: 'Consider if character voice would strengthen emotional impact',
    })
  }

  // Silent panel analysis
  const silentRatio = panelCount > 0 ? silentPanels / panelCount : 0
  if (silentRatio > 0.15 && silentRatio < 0.3) {
    insights.push({
      type: 'strength',
      severity: 'low',
      message: 'Good visual breathing room',
    })
  }

  // Function-specific checks
  if (dramaticFunction === 'climax' && pageCount < 3) {
    insights.push({
      type: 'suggestion',
      severity: 'medium',
      message: 'Climax may be underserved',
      suggestion: 'Key dramatic moments typically need 3+ pages to land',
    })
  }

  if (dramaticFunction === 'transition' && pageCount > 2) {
    insights.push({
      type: 'suggestion',
      severity: 'low',
      message: 'Long transition',
      suggestion: 'Transitions work best as quick beats—can this be tightened?',
    })
  }

  return insights
}

/**
 * Calculate an efficiency score (1-100) for a scene
 */
export function calculateEfficiencyScore(
  metrics: SceneMetrics,
  dramaticFunction: DramaticFunction,
  insights: SceneInsight[]
): number {
  let score = 75 // Base score

  // Penalize warnings
  const warnings = insights.filter(i => i.type === 'warning')
  score -= warnings.filter(i => i.severity === 'high').length * 15
  score -= warnings.filter(i => i.severity === 'medium').length * 8
  score -= warnings.filter(i => i.severity === 'low').length * 3

  // Reward strengths
  const strengths = insights.filter(i => i.type === 'strength')
  score += strengths.length * 5

  // Bonus for ideal ranges
  const { wordsPerPage, panelsPerPage, dialogueRatio } = metrics

  if (
    wordsPerPage >= SCENE_THRESHOLDS.wordsPerPage.ideal.min &&
    wordsPerPage <= SCENE_THRESHOLDS.wordsPerPage.ideal.max
  ) {
    score += 5
  }

  if (
    panelsPerPage >= SCENE_THRESHOLDS.panelsPerPage.ideal.min &&
    panelsPerPage <= SCENE_THRESHOLDS.panelsPerPage.ideal.max
  ) {
    score += 5
  }

  if (
    dialogueRatio >= SCENE_THRESHOLDS.dialogueRatio.ideal.min &&
    dialogueRatio <= SCENE_THRESHOLDS.dialogueRatio.ideal.max
  ) {
    score += 5
  }

  // Function-specific adjustments
  if (dramaticFunction === 'climax' && metrics.pageCount >= 3) {
    score += 5 // Climax has room to breathe
  }

  return Math.max(1, Math.min(100, Math.round(score)))
}

/**
 * Analyze a complete scene
 */
export function analyzeScene(
  scene: SceneData,
  actIndex: number,
  sceneIndexInAct: number,
  totalScenesInAct: number,
  totalActs: number
): SceneAnalysis {
  const metrics = calculateSceneMetrics(scene)
  const dramaticFunction = assessDramaticFunction(
    scene,
    actIndex,
    sceneIndexInAct,
    totalScenesInAct,
    totalActs
  )
  const insights = generateSceneInsights(metrics, dramaticFunction)
  const efficiencyScore = calculateEfficiencyScore(metrics, dramaticFunction, insights)

  return {
    metrics,
    dramaticFunction,
    efficiencyScore,
    insights,
  }
}

/**
 * Analyze all scenes in an issue
 */
export function analyzeIssueScenes(acts: ActData[]): SceneAnalysis[] {
  const results: SceneAnalysis[] = []
  const totalActs = acts.length

  for (let actIndex = 0; actIndex < acts.length; actIndex++) {
    const act = acts[actIndex]
    const scenes = act.scenes || []
    const totalScenesInAct = scenes.length

    for (let sceneIndex = 0; sceneIndex < scenes.length; sceneIndex++) {
      const scene = scenes[sceneIndex]
      const analysis = analyzeScene(
        scene,
        actIndex,
        sceneIndex,
        totalScenesInAct,
        totalActs
      )
      results.push(analysis)
    }
  }

  return results
}

// ============================================
// HELPERS
// ============================================

export function getScoreColor(score: number): string {
  if (score >= 85) return 'text-green-400'
  if (score >= 70) return 'text-blue-400'
  if (score >= 50) return 'text-yellow-400'
  return 'text-red-400'
}

export function getScoreLabel(score: number): string {
  if (score >= 85) return 'Excellent'
  if (score >= 70) return 'Good'
  if (score >= 50) return 'Fair'
  return 'Needs Work'
}

export function getFunctionLabel(func: DramaticFunction): string {
  const labels: Record<DramaticFunction, string> = {
    exposition: 'Exposition',
    rising_action: 'Rising Action',
    climax: 'Climax',
    falling_action: 'Falling Action',
    resolution: 'Resolution',
    character_moment: 'Character Moment',
    world_building: 'World Building',
    transition: 'Transition',
  }
  return labels[func]
}

export function getFunctionColor(func: DramaticFunction): string {
  const colors: Record<DramaticFunction, string> = {
    exposition: 'bg-blue-900 text-blue-300',
    rising_action: 'bg-amber-900 text-amber-300',
    climax: 'bg-red-900 text-red-300',
    falling_action: 'bg-purple-900 text-purple-300',
    resolution: 'bg-green-900 text-green-300',
    character_moment: 'bg-pink-900 text-pink-300',
    world_building: 'bg-cyan-900 text-cyan-300',
    transition: 'bg-gray-700 text-gray-300',
  }
  return colors[func]
}
