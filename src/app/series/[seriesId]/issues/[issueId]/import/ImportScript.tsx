'use client'

import { useState, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/contexts/ToastContext'
import ConfirmDialog, { useConfirmDialog } from '@/components/ui/ConfirmDialog'
import { useRouter } from 'next/navigation'
import {
  detectScriptFormat,
  getBestFormat,
  extractPagesWithFormat,
  getConfidenceLabel,
  getConfidenceColor,
  FORMAT_PATTERNS,
  type DetectedFormat,
  type FormatPattern,
} from '@/lib/script-format-detector'
import {
  detectStructure,
  createFlatStructure,
  getStructureLabel,
  getStructureDescription,
  type StructureAnalysis,
  type DetectedAct,
} from '@/lib/script-structure-detector'
import {
  comparePages,
  generateDiffSummary,
  type PageDiff,
} from '@/lib/version-diff'
import VersionDiff from '@/components/VersionDiff'
import { Tip } from '@/components/ui/Tip'
import SearchableSelect from '@/components/ui/SearchableSelect'
import { batchMatchSpeakers } from '@/lib/character-matching'

interface Character {
  id: string
  name: string
  display_name?: string | null
  aliases?: string[]
}

interface Location {
  id: string
  name: string
}

interface Page {
  id: string
  page_number: number
  panels: Array<{
    id: string
    panel_number: number
    visual_description: string | null
  }>
}

interface Scene {
  id: string
  title: string | null
  sort_order: number
  pages?: Page[]
}

interface Act {
  id: string
  name: string | null
  sort_order: number
  scenes?: Scene[]
}

interface Issue {
  id: string
  number: number
  title: string | null
  series: {
    id: string
    title: string
    characters?: Character[] | null
    locations?: Location[] | null
  }
  acts?: Act[]
}

interface ParsedDialogue {
  speaker: string
  type: 'standard' | 'vo' | 'os' | 'whisper' | 'thought'
  text: string
}

interface ParsedCaption {
  type: 'narration' | 'location' | 'time'
  text: string
}

interface ParsedPanel {
  number: number
  visualDescription: string
  dialogue: ParsedDialogue[]
  captions: ParsedCaption[]
  sfx: string[]
  characters: string[]
}

interface ParsedPage {
  number: number
  orientation: 'left' | 'right'
  panels: ParsedPanel[]
  actIndex?: number
  sceneIndex?: number
}

interface ImportScriptProps {
  issue: Issue
  seriesId: string
}

interface DetectedSpeaker {
  name: string
  count: number
  dialogueCount?: number
  appearanceCount?: number
  mapping: 'new' | 'existing' | 'skip'
  existingCharacterId?: string
  linkToDetected?: string
  confidence?: 'exact' | 'alias' | 'fuzzy' | 'none'
}

// AI Script Analysis Types
interface AIPlotline {
  id: string
  name: string
  description: string
  pages: number[]
}

interface AISceneBreak {
  id: string
  name: string
  startPage: number
  endPage: number
  plotlineId: string
  description: string
}

interface AIActBreak {
  id: string
  name: string
  startPage: number
  endPage: number
  description: string
  scenes: string[]
}

interface AIScriptAnalysis {
  plotlines: AIPlotline[]
  scenes: AISceneBreak[]
  acts: AIActBreak[]
  summary: string
}

type ImportStep = 'upload' | 'format' | 'structure' | 'parse' | 'characters' | 'preview' | 'importing'

export default function ImportScript({ issue, seriesId }: ImportScriptProps) {
  // Step management
  const [currentStep, setCurrentStep] = useState<ImportStep>('upload')

  // Script content
  const [scriptText, setScriptText] = useState('')
  const [fileName, setFileName] = useState<string | null>(null)

  // Format detection
  const [detectedFormats, setDetectedFormats] = useState<DetectedFormat[]>([])
  const [selectedFormat, setSelectedFormat] = useState<FormatPattern | null>(null)

  // Structure detection
  const [structureAnalysis, setStructureAnalysis] = useState<StructureAnalysis | null>(null)
  const [useDetectedStructure, setUseDetectedStructure] = useState(true)

  // AI Structure Analysis
  const [aiAnalysis, setAiAnalysis] = useState<AIScriptAnalysis | null>(null)
  const [isAnalyzingStructure, setIsAnalyzingStructure] = useState(false)
  const [useAiStructure, setUseAiStructure] = useState(false)
  const [aiAnalysisError, setAiAnalysisError] = useState<string | null>(null)

  // Parsing
  const [isParsing, setIsParsing] = useState(false)
  const [parsedPages, setParsedPages] = useState<ParsedPage[]>([])
  const [parseError, setParseError] = useState<string | null>(null)
  const [currentParsingPage, setCurrentParsingPage] = useState(0)
  const [totalPagesToProcess, setTotalPagesToProcess] = useState(0)

  // Character review
  const [detectedSpeakers, setDetectedSpeakers] = useState<DetectedSpeaker[]>([])

  // Import
  const [isImporting, setIsImporting] = useState(false)
  const [importProgress, setImportProgress] = useState(0)

  // Diff view
  const [pageDiffs, setPageDiffs] = useState<PageDiff[]>([])
  const [previewMode, setPreviewMode] = useState<'preview' | 'diff'>('preview')

  // Preview editing
  const [editingPage, setEditingPage] = useState<number | null>(null)
  const [editingPanel, setEditingPanel] = useState<{ pageNum: number; panelNum: number } | null>(null)

  // File input ref
  const fileInputRef = useRef<HTMLInputElement>(null)

  const { showToast } = useToast()
  const { confirm, dialogProps } = useConfirmDialog()
  const router = useRouter()

  // Update a panel's visual description
  const updatePanelDescription = useCallback((pageNum: number, panelNum: number, newDescription: string) => {
    setParsedPages(prev => prev.map(page => {
      if (page.number !== pageNum) return page
      return {
        ...page,
        panels: page.panels.map(panel => {
          if (panel.number !== panelNum) return panel
          return { ...panel, visualDescription: newDescription }
        })
      }
    }))
  }, [])

  // Update a dialogue line
  const updateDialogue = useCallback((pageNum: number, panelNum: number, dialogueIdx: number, updates: Partial<ParsedDialogue>) => {
    setParsedPages(prev => prev.map(page => {
      if (page.number !== pageNum) return page
      return {
        ...page,
        panels: page.panels.map(panel => {
          if (panel.number !== panelNum) return panel
          return {
            ...panel,
            dialogue: panel.dialogue.map((d, idx) => {
              if (idx !== dialogueIdx) return d
              return { ...d, ...updates }
            })
          }
        })
      }
    }))
  }, [])

  // Delete a panel
  const deletePanel = useCallback((pageNum: number, panelNum: number) => {
    setParsedPages(prev => prev.map(page => {
      if (page.number !== pageNum) return page
      return {
        ...page,
        panels: page.panels
          .filter(panel => panel.number !== panelNum)
          .map((panel, idx) => ({ ...panel, number: idx + 1 })) // Renumber
      }
    }))
    setEditingPanel(null)
  }, [])

  // Delete a page
  const deletePage = useCallback((pageNum: number) => {
    setParsedPages(prev =>
      prev
        .filter(page => page.number !== pageNum)
        .map((page, idx) => ({ ...page, number: idx + 1 })) // Renumber
    )
    setEditingPage(null)
  }, [])

  // Add a new panel to a page
  const addPanel = useCallback((pageNum: number) => {
    setParsedPages(prev => prev.map(page => {
      if (page.number !== pageNum) return page
      const newPanelNum = page.panels.length + 1
      return {
        ...page,
        panels: [
          ...page.panels,
          {
            number: newPanelNum,
            visualDescription: '',
            dialogue: [],
            captions: [],
            sfx: [],
            characters: [],
          }
        ]
      }
    }))
  }, [])

  // Compute diff between existing and new content
  const computeDiff = useCallback(() => {
    // Get existing pages from issue structure
    const existingPages: Array<{ pageNumber: number; panels: any[] }> = []
    for (const act of issue.acts || []) {
      for (const scene of act.scenes || []) {
        for (const page of scene.pages || []) {
          existingPages.push({
            pageNumber: page.page_number,
            panels: page.panels.map(p => ({
              visual_description: p.visual_description,
              panelNumber: p.panel_number,
            }))
          })
        }
      }
    }

    // Convert parsed pages to same format
    const newPages = parsedPages.map(p => ({
      pageNumber: p.number,
      panels: p.panels.map(panel => ({
        visual_description: panel.visualDescription,
        panelNumber: panel.number,
      }))
    }))

    // Sort both by page number
    existingPages.sort((a, b) => a.pageNumber - b.pageNumber)
    newPages.sort((a, b) => a.pageNumber - b.pageNumber)

    // Compute diff
    const diffs = comparePages(existingPages, newPages)
    setPageDiffs(diffs)

    // Show diff view if there's existing content
    if (existingPages.length > 0) {
      setPreviewMode('diff')
    }
  }, [issue.acts, parsedPages])

  // Get all scenes flattened for dropdown
  const allScenes = (issue.acts || [])
    .sort((a, b) => a.sort_order - b.sort_order)
    .flatMap(act =>
      (act.scenes || [])
        .sort((a, b) => a.sort_order - b.sort_order)
        .map(scene => ({
          ...scene,
          actName: act.name || `Act ${act.sort_order}`,
          actId: act.id,
        }))
    )

  // Handle file drop/upload
  const handleFile = useCallback(async (file: File) => {
    setFileName(file.name)

    if (file.name.endsWith('.txt')) {
      const text = await file.text()
      setScriptText(text)
      analyzeScript(text)
    } else if (file.name.endsWith('.docx')) {
      // Use mammoth for docx
      try {
        const mammoth = await import('mammoth')
        const arrayBuffer = await file.arrayBuffer()
        const result = await mammoth.extractRawText({ arrayBuffer })
        setScriptText(result.value)
        analyzeScript(result.value)
      } catch {
        showToast('Could not read .docx file. Try exporting as .txt', 'error')
      }
    } else {
      showToast('Please upload a .txt or .docx file', 'error')
    }
  }, [])

  // Analyze script for format and structure
  const analyzeScript = useCallback((text: string) => {
    // Detect formats
    const formats = detectScriptFormat(text)
    setDetectedFormats(formats)

    if (formats.length > 0) {
      setSelectedFormat(formats[0].pattern)
    }

    // Detect structure
    const structure = detectStructure(text)
    setStructureAnalysis(structure)

    // Move to format step
    setCurrentStep('format')
  }, [])

  // Handle paste
  const handlePaste = useCallback((text: string) => {
    setScriptText(text)
    setFileName(null)
    analyzeScript(text)
  }, [analyzeScript])

  // Drag and drop handlers
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()

    const files = Array.from(e.dataTransfer.files)
    if (files.length > 0) {
      handleFile(files[0])
    }
  }, [handleFile])

  // AI-powered structure analysis
  const analyzeStructureWithAI = async () => {
    setIsAnalyzingStructure(true)
    setAiAnalysisError(null)

    try {
      const response = await fetch('/api/analyze-script-structure', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scriptText,
          issueTitle: issue.title,
          seriesTitle: issue.series.title,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to analyze script')
      }

      const { analysis } = await response.json()
      setAiAnalysis(analysis)
      setUseAiStructure(true)
      showToast(`AI detected ${analysis.acts.length} acts, ${analysis.scenes.length} scenes, ${analysis.plotlines.length} plotlines`, 'success')
    } catch (error: any) {
      console.error('AI analysis error:', error)
      setAiAnalysisError(error.message || 'Failed to analyze script structure')
      showToast('Failed to analyze script with AI', 'error')
    } finally {
      setIsAnalyzingStructure(false)
    }
  }

  // Convert AI analysis to StructureAnalysis format for import
  const convertAiToStructure = (): StructureAnalysis | null => {
    if (!aiAnalysis) return null

    // Group scenes by act
    const acts: DetectedAct[] = aiAnalysis.acts.map((act, actIdx) => {
      const actScenes = aiAnalysis.scenes.filter(scene =>
        act.scenes.includes(scene.id)
      )

      return {
        name: act.name,
        startLine: act.startPage, // Use page as proxy for line
        rawMarker: `AI: ${act.name}`,
        scenes: actScenes.map(scene => ({
          title: scene.name,
          startLine: scene.startPage,
          rawMarker: `AI: ${scene.name}`,
          pages: Array.from(
            { length: scene.endPage - scene.startPage + 1 },
            (_, i) => scene.startPage + i
          ),
        })),
      }
    })

    return {
      suggestedStructure: acts.length > 0 ? 'acts-and-scenes' : 'flat',
      acts,
      hasActMarkers: true,
      hasSceneMarkers: true,
      totalPages: aiAnalysis.scenes.reduce((max, s) => Math.max(max, s.endPage), 0),
    }
  }

  // Parse a single page with AI
  const parseSinglePage = async (pageContent: string, pageNum: number): Promise<ParsedPage | null> => {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: `Parse this single comic book page into JSON. Extract panels, visual descriptions, dialogue, captions, sound effects, AND character names that appear in each panel.

Return ONLY a JSON object (no markdown, no explanation) in this exact format:
{
  "number": ${pageNum},
  "orientation": "${pageNum % 2 === 1 ? 'right' : 'left'}",
  "panels": [
    {
      "number": 1,
      "visualDescription": "Description of what we see",
      "characters": ["CHARACTER1", "CHARACTER2"],
      "dialogue": [
        { "speaker": "CHARACTER NAME", "type": "standard", "text": "What they say" }
      ],
      "captions": [
        { "type": "narration", "text": "Caption text" }
      ],
      "sfx": ["CRASH!"]
    }
  ]
}

IMPORTANT: The "characters" array should include ALL character names mentioned in the visual description, even if they don't have dialogue. Look for proper names (capitalized words that are people/characters). This helps track which characters appear in each scene.

Dialogue types: standard, vo, os, whisper, thought
Caption types: narration, location, time

Page content:
${pageContent}`,
        context: { pageNumber: pageNum },
        maxTokens: 2048,
      }),
    })

    if (!response.ok) return null

    const data = await response.json()
    let jsonStr = data.response || data.message

    if (!jsonStr) return null

    // Clean up response
    jsonStr = jsonStr.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()

    // Find JSON object
    const startIdx = jsonStr.indexOf('{')
    const endIdx = jsonStr.lastIndexOf('}')
    if (startIdx === -1 || endIdx === -1) return null

    jsonStr = jsonStr.slice(startIdx, endIdx + 1)

    try {
      return JSON.parse(jsonStr) as ParsedPage
    } catch {
      console.error(`Failed to parse page ${pageNum}:`, jsonStr.slice(0, 200))
      return null
    }
  }

  // Parse the entire script
  const parseScript = async (overrideStructure?: StructureAnalysis) => {
    if (!scriptText.trim() || !selectedFormat) {
      showToast('Please select a format first', 'error')
      return
    }

    // Use override structure if provided (for AI analysis), otherwise use state
    const effectiveStructure = overrideStructure || structureAnalysis
    const shouldUseStructure = overrideStructure ? true : useDetectedStructure

    setIsParsing(true)
    setParseError(null)
    setParsedPages([])
    setCurrentStep('parse')

    try {
      // Extract pages using selected format
      const extractedPages = extractPagesWithFormat(scriptText, selectedFormat)

      if (extractedPages.length === 0) {
        throw new Error('Could not find any pages. Try a different format or check your script.')
      }

      setTotalPagesToProcess(extractedPages.length)
      showToast(`Found ${extractedPages.length} pages, parsing...`, 'success')

      const parsed: ParsedPage[] = []

      // Parse each page
      for (let i = 0; i < extractedPages.length; i++) {
        const { pageNum, content } = extractedPages[i]
        setCurrentParsingPage(i + 1)
        setImportProgress(Math.round(((i + 1) / extractedPages.length) * 100))

        const result = await parseSinglePage(content, pageNum)
        if (result) {
          // Assign act/scene based on structure analysis
          if (shouldUseStructure && effectiveStructure) {
            for (let actIdx = 0; actIdx < effectiveStructure.acts.length; actIdx++) {
              const act = effectiveStructure.acts[actIdx]
              for (let sceneIdx = 0; sceneIdx < act.scenes.length; sceneIdx++) {
                const scene = act.scenes[sceneIdx]
                if (scene.pages.includes(pageNum)) {
                  result.actIndex = actIdx
                  result.sceneIndex = sceneIdx
                  break
                }
              }
            }
          }
          parsed.push(result)
          setParsedPages([...parsed])
        } else {
          console.warn(`Failed to parse page ${pageNum}, skipping`)
        }
      }

      if (parsed.length === 0) {
        throw new Error('Failed to parse any pages')
      }

      // Sort by page number
      parsed.sort((a, b) => a.number - b.number)
      setParsedPages(parsed)

      // Detect characters
      const characterCounts = new Map<string, { dialogue: number; appearances: number }>()

      for (const page of parsed) {
        for (const panel of page.panels) {
          for (const dialogue of panel.dialogue) {
            if (dialogue.speaker?.trim()) {
              const name = dialogue.speaker.trim()
              const existing = characterCounts.get(name) || { dialogue: 0, appearances: 0 }
              characterCounts.set(name, { ...existing, dialogue: existing.dialogue + 1 })
            }
          }
          if (panel.characters && Array.isArray(panel.characters)) {
            for (const charName of panel.characters) {
              if (charName?.trim()) {
                const name = charName.trim()
                const existing = characterCounts.get(name) || { dialogue: 0, appearances: 0 }
                characterCounts.set(name, { ...existing, appearances: existing.appearances + 1 })
              }
            }
          }
        }
      }

      // Run batch matching using character-matching lib (supports aliases + display_name)
      const existingCharacters = issue.series.characters || []
      const speakerNames = Array.from(characterCounts.keys())
      const matchResults = batchMatchSpeakers(speakerNames, existingCharacters.map(c => ({
        id: c.id,
        name: c.name,
        display_name: c.display_name ?? null,
        aliases: c.aliases,
      })))

      // Create detected speakers list
      const speakers: DetectedSpeaker[] = []
      for (const [name, counts] of characterCounts) {
        const match = matchResults.get(name)
        const hasMatch = match && match.characterId && (match.confidence === 'exact' || match.confidence === 'alias' || match.confidence === 'fuzzy')
        speakers.push({
          name,
          count: counts.dialogue + counts.appearances,
          dialogueCount: counts.dialogue,
          appearanceCount: counts.appearances,
          mapping: hasMatch ? 'existing' : 'new',
          existingCharacterId: hasMatch ? match!.characterId! : undefined,
          confidence: match?.confidence ?? 'none',
        })
      }

      speakers.sort((a, b) => b.count - a.count)
      setDetectedSpeakers(speakers)

      // Move to character review step if speakers found
      if (speakers.length > 0) {
        setCurrentStep('characters')
        showToast(`Parsed ${parsed.length} pages. Please review ${speakers.length} detected characters.`, 'success')
      } else {
        // Compute diff for preview
        setTimeout(computeDiff, 0)
        setCurrentStep('preview')
        showToast(`Successfully parsed ${parsed.length} pages. Ready to import!`, 'success')
      }
    } catch (error) {
      console.error('Parse error:', error)
      setParseError(error instanceof Error ? error.message : 'Failed to parse script')
      setCurrentStep('format')
      showToast('Failed to parse script', 'error')
    } finally {
      setIsParsing(false)
      setTotalPagesToProcess(0)
    }
  }

  // Import the parsed script
  const importParsedScript = async () => {
    if (parsedPages.length === 0) return

    // Confirm import
    const hasExistingContent = issue.acts && issue.acts.length > 0
    if (hasExistingContent) {
      const confirmed = await confirm({
        title: `Replace all content in Issue #${issue.number}?`,
        description: `This will import ${parsedPages.length} pages with ${parsedPages.reduce((sum, p) => sum + p.panels.length, 0)} panels. All existing acts, scenes, and pages will be replaced. A backup snapshot will be saved to version history before import.`,
        confirmLabel: 'Replace',
      })
      if (!confirmed) return
    }

    setIsImporting(true)
    setImportProgress(0)
    setCurrentStep('importing')

    const supabase = createClient()

    try {
      // Step 0: Save a version snapshot before destructive import
      // This ensures data can be recovered if creation fails midway
      console.log('[Import] Step 0: Saving safety snapshot before import...')
      const { data: currentPages } = await supabase
        .from('pages')
        .select(`
          id,
          page_number,
          panels (
            id,
            panel_number,
            sort_order,
            visual_description,
            camera,
            shot_type,
            panel_size,
            notes_to_artist,
            internal_notes,
            dialogue_blocks (text, speaker_name, character_id, dialogue_type, delivery_instruction, modifier, balloon_number, sort_order),
            captions (text, caption_type, sort_order),
            sound_effects (text, sort_order)
          )
        `)
        .eq('issue_id', issue.id)
        .order('page_number')

      if (currentPages && currentPages.length > 0) {
        const snapshotData = {
          pages: currentPages.map((page: any) => ({
            id: page.id,
            page_number: page.page_number,
            panels: (page.panels || []).map((panel: any) => ({
              id: panel.id,
              panel_number: panel.panel_number,
              sort_order: panel.sort_order,
              visual_description: panel.visual_description,
              camera: panel.camera || null,
              shot_type: panel.shot_type || null,
              panel_size: panel.panel_size || null,
              notes_to_artist: panel.notes_to_artist || null,
              internal_notes: panel.internal_notes || null,
              dialogue_blocks: (panel.dialogue_blocks || []).map((db: any) => ({
                text: db.text,
                speaker_name: db.speaker_name || null,
                character_id: db.character_id || null,
                dialogue_type: db.dialogue_type || 'dialogue',
                delivery_instruction: db.delivery_instruction || null,
                modifier: db.modifier || null,
                balloon_number: db.balloon_number || 1,
                sort_order: db.sort_order || 1,
              })),
              captions: (panel.captions || []).map((c: any) => ({
                text: c.text,
                caption_type: c.caption_type || 'narrative',
                sort_order: c.sort_order || 1,
              })),
              sound_effects: (panel.sound_effects || []).map((sfx: any) => ({
                text: sfx.text,
                sort_order: sfx.sort_order || 1,
              })),
            })),
          })),
        }

        const { error: snapshotError } = await supabase.from('version_snapshots').insert({
          issue_id: issue.id,
          snapshot_data: snapshotData,
          description: 'Auto-save before import',
        })

        if (snapshotError) {
          console.error('[Import] Snapshot save error:', snapshotError)
          // Don't proceed with import if we can't save the safety snapshot
          throw new Error(`Failed to save safety snapshot before import: ${snapshotError.message}`)
        }
        console.log('[Import] Safety snapshot saved successfully')
      } else {
        console.log('[Import] No existing pages to snapshot')
      }

      console.log('[Import] Step 1: Deleting existing content...')
      // Delete existing content
      const { error: deleteError, count: deleteCount } = await supabase
        .from('acts')
        .delete()
        .eq('issue_id', issue.id)

      if (deleteError) {
        console.error('[Import] Delete error:', deleteError)
        throw new Error(`Failed to delete existing content: ${deleteError.message}`)
      }
      console.log('[Import] Delete completed, removed:', deleteCount, 'acts')

      console.log('[Import] Step 2: Creating structure...')
      // Create structure based on detection or flat
      const structure = useDetectedStructure && structureAnalysis?.suggestedStructure !== 'flat'
        ? structureAnalysis
        : createFlatStructure(parsedPages.length)
      console.log('[Import] Structure:', structure)

      console.log('[Import] Step 3: Building character map...')
      console.log('[Import] issue.series:', issue.series)
      console.log('[Import] issue.series.characters:', issue.series?.characters)
      // Build character map (handle case where no characters exist yet)
      const characterMap = new Map<string, string>(
        (issue.series?.characters || []).map(c => [c.name.toLowerCase(), c.id])
      )
      console.log('[Import] Character map built:', characterMap.size, 'entries')

      // Create new characters
      const speakersToCreate = detectedSpeakers.filter(s => s.mapping === 'new')
      for (const speaker of speakersToCreate) {
        const { data: newChar, error: charError } = await supabase
          .from('characters')
          .insert({
            series_id: seriesId,
            name: speaker.name,
          })
          .select()
          .single()

        if (!charError && newChar) {
          characterMap.set(speaker.name.toLowerCase(), newChar.id)
        }
      }

      // Map linked characters
      for (const speaker of detectedSpeakers) {
        if (speaker.mapping === 'existing') {
          if (speaker.linkToDetected) {
            const linkedName = speaker.linkToDetected.replace('detected:', '')
            const linkedId = characterMap.get(linkedName.toLowerCase())
            if (linkedId) {
              characterMap.set(speaker.name.toLowerCase(), linkedId)
            }
          } else if (speaker.existingCharacterId) {
            characterMap.set(speaker.name.toLowerCase(), speaker.existingCharacterId)
          }
        }
      }

      console.log('[Import] Step 4: Creating acts and scenes...')
      // Create acts and scenes from structure
      const actIdMap = new Map<number, string>()
      const sceneIdMap = new Map<string, string>() // "actIdx-sceneIdx" -> sceneId

      if (structure && structure.acts) {
        console.log('[Import] Structure has', structure.acts.length, 'acts')
        for (let actIdx = 0; actIdx < structure.acts.length; actIdx++) {
          const detectedAct = structure.acts[actIdx]
          // Note: acts table has number (NOT NULL) but no 'name' column
          const actData = {
            issue_id: issue.id,
            number: actIdx + 1,
            sort_order: actIdx + 1,
          }
          console.log('[Import] Creating act', actIdx + 1, 'with data:', JSON.stringify(actData))

          const { data: newAct, error: actError } = await supabase
            .from('acts')
            .insert(actData)
            .select()
            .single()

          if (actError) {
            console.error('[Import] Act creation error:', actError)
            console.error('[Import] Act error message:', actError.message)
            console.error('[Import] Act error code:', actError.code)
            console.error('[Import] Act error hint:', actError.hint)
            console.error('[Import] Act error details:', actError.details)
            throw new Error(`Failed to create act: ${actError.message}`)
          }
          if (!newAct) {
            console.error('[Import] Act creation returned null')
            throw new Error('Failed to create act: no data returned')
          }
          console.log('[Import] Created act with id:', newAct.id)
          actIdMap.set(actIdx, newAct.id)

          // Create scenes for this act
          const scenes = detectedAct?.scenes || []
          console.log('[Import] Act', actIdx + 1, 'has', scenes.length, 'scenes')
          for (let sceneIdx = 0; sceneIdx < scenes.length; sceneIdx++) {
            const detectedScene = scenes[sceneIdx]
            console.log('[Import] Creating scene', sceneIdx + 1, ':', detectedScene?.title)

            const { data: newScene, error: sceneError } = await supabase
              .from('scenes')
              .insert({
                act_id: newAct.id,
                title: detectedScene?.title || `Scene ${sceneIdx + 1}`,
                sort_order: sceneIdx + 1,
              })
              .select()
              .single()

            if (sceneError) {
              console.error('[Import] Scene creation error:', sceneError)
              throw new Error(`Failed to create scene: ${sceneError.message}`)
            }
            if (!newScene) {
              console.error('[Import] Scene creation returned null')
              throw new Error('Failed to create scene: no data returned')
            }
            console.log('[Import] Created scene with id:', newScene.id)
            sceneIdMap.set(`${actIdx}-${sceneIdx}`, newScene.id)
          }
        }
      } else {
        console.log('[Import] No structure or acts found')
      }

      // Default scene for pages without assignment
      let defaultSceneId: string | null = null
      if (sceneIdMap.size > 0) {
        defaultSceneId = sceneIdMap.get('0-0') || null
      }

      // Import pages
      for (let i = 0; i < parsedPages.length; i++) {
        const parsedPage = parsedPages[i]
        setImportProgress(Math.round(((i + 1) / parsedPages.length) * 100))

        // Determine which scene this page belongs to
        let sceneId = defaultSceneId
        if (parsedPage.actIndex !== undefined && parsedPage.sceneIndex !== undefined) {
          const key = `${parsedPage.actIndex}-${parsedPage.sceneIndex}`
          sceneId = sceneIdMap.get(key) || defaultSceneId
        }

        if (!sceneId) {
          console.error('No scene ID for page', parsedPage.number)
          continue
        }

        // Create page
        const { data: page, error: pageError } = await supabase
          .from('pages')
          .insert({
            scene_id: sceneId,
            page_number: parsedPage.number,
            sort_order: i + 1,
          })
          .select()
          .single()

        if (pageError) throw pageError

        // Create panels
        for (const parsedPanel of parsedPage.panels) {
          const { data: panel, error: panelError } = await supabase
            .from('panels')
            .insert({
              page_id: page.id,
              panel_number: parsedPanel.number,
              sort_order: parsedPanel.number,
              visual_description: parsedPanel.visualDescription,
            })
            .select()
            .single()

          if (panelError) throw panelError

          // Create dialogue blocks
          for (let j = 0; j < parsedPanel.dialogue.length; j++) {
            const dialogue = parsedPanel.dialogue[j]
            const characterId = characterMap.get(dialogue.speaker.toLowerCase()) || null

            const dialogueType =
              dialogue.type === 'vo' ? 'radio' :
              dialogue.type === 'os' ? 'dialogue' :
              dialogue.type === 'whisper' ? 'whisper' :
              dialogue.type === 'thought' ? 'thought' :
              'dialogue'

            const dialogueData = {
              panel_id: panel.id,
              character_id: characterId,
              dialogue_type: dialogueType,
              text: dialogue.text,
              sort_order: j + 1,
            }

            let dialogueResult = await supabase.from('dialogue_blocks').insert(dialogueData)

            if (dialogueResult.error?.message?.includes('dialogue_type')) {
              const { dialogue_type, ...dataWithoutType } = dialogueData
              dialogueResult = await supabase.from('dialogue_blocks').insert(dataWithoutType)
            }
          }

          // Create captions
          for (let j = 0; j < parsedPanel.captions.length; j++) {
            const caption = parsedPanel.captions[j]
            await supabase.from('captions').insert({
              panel_id: panel.id,
              caption_type: caption.type === 'location' ? 'location' :
                           caption.type === 'time' ? 'time' : 'narrative',
              text: caption.text,
              sort_order: j + 1,
            })
          }

          // Create sound effects
          for (let j = 0; j < parsedPanel.sfx.length; j++) {
            await supabase.from('sound_effects').insert({
              panel_id: panel.id,
              text: parsedPanel.sfx[j],
              sort_order: j + 1,
            })
          }
        }
      }

      showToast(`Successfully imported ${parsedPages.length} pages`, 'success')
      router.push(`/series/${seriesId}/issues/${issue.id}`)
    } catch (error: any) {
      console.error('Import error:', error)
      console.error('Import error message:', error?.message)
      console.error('Import error details:', JSON.stringify(error, null, 2))
      console.error('Import error code:', error?.code)
      console.error('Import error hint:', error?.hint)
      showToast(`Failed to import: ${error?.message || 'Unknown error'}`, 'error')
      setCurrentStep('preview')
    } finally {
      setIsImporting(false)
    }
  }

  // Render step indicator
  const renderStepIndicator = () => {
    const steps: { key: ImportStep; label: string }[] = [
      { key: 'upload', label: '1. Upload' },
      { key: 'format', label: '2. Format' },
      { key: 'structure', label: '3. Structure' },
      { key: 'parse', label: '4. Parse' },
      { key: 'characters', label: '5. Characters' },
      { key: 'preview', label: '6. Preview' },
    ]

    const currentIndex = steps.findIndex(s => s.key === currentStep)

    return (
      <div className="flex items-center justify-center gap-2 mb-6">
        {steps.map((step, i) => (
          <div key={step.key} className="flex items-center">
            <div
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                i <= currentIndex
                  ? 'bg-[var(--color-primary)] text-white'
                  : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)]'
              }`}
            >
              {step.label}
            </div>
            {i < steps.length - 1 && (
              <div className={`w-8 h-0.5 mx-1 ${
                i < currentIndex ? 'bg-[var(--color-primary)]' : 'bg-[var(--bg-tertiary)]'
              }`} />
            )}
          </div>
        ))}
      </div>
    )
  }

  // Step 1: Upload
  const renderUploadStep = () => (
    <div className="space-y-6">
      <div
        className="border-2 border-dashed border-[var(--border)] rounded-lg p-12 text-center hover:border-[var(--color-primary)] transition-colors cursor-pointer"
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".txt,.docx"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) handleFile(file)
          }}
          className="hidden"
        />
        <div className="text-5xl mb-4">📄</div>
        <h3 className="text-lg font-medium mb-2">Drop your script here</h3>
        <p className="text-sm text-[var(--text-secondary)] mb-4">
          or click to browse • Supports .txt and .docx files
        </p>
        <p className="text-xs text-[var(--text-muted)]">
          Tip: In Google Docs, go to File → Download → Plain Text (.txt)
        </p>
      </div>

      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-[var(--border)]" />
        </div>
        <div className="relative flex justify-center text-sm">
          <span className="px-2 bg-[var(--bg-primary)] text-[var(--text-secondary)]">or paste directly</span>
        </div>
      </div>

      <div>
        <textarea
          value={scriptText}
          onChange={(e) => setScriptText(e.target.value)}
          onPaste={(e) => {
            setTimeout(() => {
              if (e.currentTarget.value) {
                handlePaste(e.currentTarget.value)
              }
            }, 0)
          }}
          placeholder="Paste your script here..."
          className="w-full h-64 bg-[var(--bg-tertiary)] border border-[var(--border)] rounded-lg px-4 py-3 text-sm font-mono resize-none focus:border-[var(--color-primary)] focus:outline-none"
        />
        {scriptText && (
          <Tip content="Detect format and structure of pasted script">
            <button
              onClick={() => analyzeScript(scriptText)}
              className="mt-2 bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] px-4 py-2 rounded font-medium hover-lift"
            >
              Analyze Script
            </button>
          </Tip>
        )}
      </div>
    </div>
  )

  // Step 2: Format Detection
  const renderFormatStep = () => (
    <div className="space-y-6">
      <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg p-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-semibold">Format Detection</h3>
            <p className="text-sm text-[var(--text-secondary)]">
              {fileName ? `Analyzing: ${fileName}` : 'Analyzing pasted script'}
            </p>
          </div>
          <span className="text-sm text-[var(--text-muted)]">
            {scriptText.length.toLocaleString()} characters
          </span>
        </div>

        {detectedFormats.length > 0 ? (
          <div className="space-y-3">
            <p className="text-sm text-[var(--color-success)]">
              ✓ Detected {detectedFormats.length} possible format{detectedFormats.length !== 1 ? 's' : ''}
            </p>

            {detectedFormats.map((format, i) => (
              <label
                key={format.pattern.name}
                className={`block p-3 rounded-lg border cursor-pointer transition-colors ${
                  selectedFormat?.name === format.pattern.name
                    ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/10'
                    : 'border-[var(--border)] hover:border-[var(--border-hover)]'
                }`}
              >
                <div className="flex items-start gap-3">
                  <input
                    type="radio"
                    name="format"
                    checked={selectedFormat?.name === format.pattern.name}
                    onChange={() => setSelectedFormat(format.pattern)}
                    className="mt-1"
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{format.pattern.description}</span>
                      <span className={`text-xs ${getConfidenceColor(format.confidence)}`}>
                        {getConfidenceLabel(format.confidence)}
                      </span>
                    </div>
                    <div className="text-sm text-[var(--text-secondary)] mt-1">
                      Found {format.pageMatches} page{format.pageMatches !== 1 ? 's' : ''}, {format.panelMatches} panel markers
                    </div>
                    {format.sampleMatches.length > 0 && (
                      <div className="mt-2 text-xs font-mono text-[var(--text-muted)] bg-[var(--bg-tertiary)] rounded p-2">
                        {format.sampleMatches.slice(0, 2).map((m, j) => (
                          <div key={j}>{m}</div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </label>
            ))}
          </div>
        ) : (
          <div className="text-[var(--color-warning)] p-4 bg-[var(--color-warning)]/10 rounded-lg">
            <p className="font-medium">No standard format detected</p>
            <p className="text-sm mt-1">
              Your script may use a custom format. Select a format manually or try adding PAGE markers.
            </p>
          </div>
        )}

        {/* Manual format selection */}
        <details className="mt-4">
          <summary className="text-sm text-[var(--text-secondary)] cursor-pointer hover:text-[var(--text-primary)]">
            Don't see your format? Select manually...
          </summary>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {FORMAT_PATTERNS.map(pattern => (
              <button
                key={pattern.name}
                onClick={() => setSelectedFormat(pattern)}
                className={`text-left p-2 rounded text-sm hover-glow ${
                  selectedFormat?.name === pattern.name
                    ? 'bg-[var(--color-primary)] text-white'
                    : 'bg-[var(--bg-tertiary)] hover:bg-[var(--bg-tertiary)]/80'
                }`}
              >
                <div className="font-medium">{pattern.description}</div>
                <div className="text-xs opacity-70">{pattern.examples[0]}</div>
              </button>
            ))}
          </div>
        </details>
      </div>

      <div className="flex justify-between">
        <button
          onClick={() => {
            setCurrentStep('upload')
            setScriptText('')
            setFileName(null)
            setDetectedFormats([])
          }}
          className="px-4 py-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
        >
          ← Back
        </button>
        <Tip content="Proceed to structure detection step">
          <button
            onClick={() => setCurrentStep('structure')}
            disabled={!selectedFormat}
            className="bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] disabled:bg-[var(--bg-tertiary)] disabled:cursor-not-allowed px-4 py-2 rounded font-medium hover-lift"
          >
            Continue to Structure →
          </button>
        </Tip>
      </div>
    </div>
  )

  // Step 3: Structure Detection
  const renderStructureStep = () => (
    <div className="space-y-6">
      {/* AI Analysis Section */}
      <div className="bg-gradient-to-r from-[var(--accent-hover)]/10 to-[var(--color-primary)]/10 border border-[var(--accent-hover)]/30 rounded-lg p-4">
        <div className="flex items-center gap-3 mb-3">
          <span className="text-2xl">🤖</span>
          <div>
            <h3 className="font-semibold">AI-Powered Structure Analysis</h3>
            <p className="text-sm text-[var(--text-secondary)]">
              Let AI analyze your script to identify acts, scenes, and plotlines
            </p>
          </div>
        </div>

        {!aiAnalysis && !isAnalyzingStructure && (
          <Tip content="Use AI to identify acts, scenes, and plotlines in your script">
            <button
              onClick={analyzeStructureWithAI}
              className="w-full bg-[var(--accent-hover)] hover:opacity-90 px-4 py-3 rounded-lg font-medium flex items-center justify-center gap-2 hover-lift"
            >
              <span>✨</span>
              Analyze Structure with AI
            </button>
          </Tip>
        )}

        {isAnalyzingStructure && (
          <div className="bg-[var(--accent-hover)]/20 rounded-lg p-4 text-center">
            <div className="text-3xl mb-2 animate-pulse">🔮</div>
            <p className="text-sm">AI is analyzing your script structure...</p>
            <p className="text-xs text-[var(--text-muted)] mt-1">This may take 15-30 seconds</p>
          </div>
        )}

        {aiAnalysisError && (
          <div className="bg-[var(--color-error)]/10 border border-[var(--color-error)]/30 rounded-lg p-3 mt-3">
            <p className="text-sm text-[var(--color-error)]">{aiAnalysisError}</p>
            <button
              onClick={analyzeStructureWithAI}
              className="text-sm text-[var(--color-error)] underline mt-1"
            >
              Try again
            </button>
          </div>
        )}

        {aiAnalysis && (
          <div className="space-y-4 mt-4">
            <div className="flex items-center gap-2 text-[var(--color-success)]">
              <span>✓</span>
              <span className="font-medium">AI Analysis Complete</span>
            </div>

            {/* Summary */}
            <div className="bg-[var(--bg-tertiary)] rounded-lg p-3 text-sm">
              <p className="text-[var(--text-secondary)]">{aiAnalysis.summary}</p>
            </div>

            {/* Plotlines */}
            {aiAnalysis.plotlines.length > 1 && (
              <div>
                <h4 className="text-sm font-medium mb-2 text-[var(--accent-hover)]">
                  📊 Plotlines ({aiAnalysis.plotlines.length})
                </h4>
                <div className="space-y-2">
                  {aiAnalysis.plotlines.map((plotline) => (
                    <div key={plotline.id} className="bg-[var(--bg-tertiary)] rounded p-2">
                      <div className="font-medium text-sm">{plotline.name}</div>
                      <div className="text-xs text-[var(--text-muted)]">
                        {plotline.description}
                      </div>
                      <div className="text-xs text-[var(--text-muted)] mt-1">
                        Pages: {plotline.pages.join(', ')}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Acts & Scenes */}
            <div>
              <h4 className="text-sm font-medium mb-2 text-[var(--color-primary)]">
                🎬 Acts & Scenes
              </h4>
              <div className="bg-[var(--bg-tertiary)] rounded-lg p-3 max-h-64 overflow-y-auto">
                {aiAnalysis.acts.map((act) => (
                  <div key={act.id} className="mb-4 last:mb-0">
                    <div className="font-medium text-[var(--color-primary)] flex items-center gap-2">
                      <span>{act.name}</span>
                      <span className="text-xs text-[var(--text-muted)]">
                        (pages {act.startPage}-{act.endPage})
                      </span>
                    </div>
                    <div className="text-xs text-[var(--text-secondary)] mb-2">
                      {act.description}
                    </div>
                    <div className="ml-4 space-y-1">
                      {aiAnalysis.scenes
                        .filter(scene => act.scenes.includes(scene.id))
                        .map((scene) => {
                          const plotline = aiAnalysis.plotlines.find(p => p.id === scene.plotlineId)
                          return (
                            <div key={scene.id} className="text-sm text-[var(--text-secondary)]">
                              <span className="text-[var(--text-muted)]">└</span> {scene.name}
                              <span className="text-xs text-[var(--text-muted)]">
                                {' '}(pp. {scene.startPage}-{scene.endPage})
                              </span>
                              {plotline && aiAnalysis.plotlines.length > 1 && (
                                <span className="text-xs text-[var(--accent-hover)] ml-2">
                                  [{plotline.name.split(':')[0]}]
                                </span>
                              )}
                            </div>
                          )
                        })}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <label className="flex items-center gap-3 cursor-pointer p-2 bg-[var(--bg-tertiary)] rounded-lg">
              <input
                type="radio"
                name="structureChoice"
                checked={useAiStructure}
                onChange={() => {
                  setUseAiStructure(true)
                  setUseDetectedStructure(false)
                }}
                className="w-4 h-4"
              />
              <span className="font-medium">Use AI-suggested structure</span>
            </label>
          </div>
        )}
      </div>

      {/* Rule-based Detection Section */}
      <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg p-4">
        <h3 className="font-semibold mb-2">Rule-Based Detection</h3>
        <p className="text-sm text-[var(--text-secondary)] mb-3">
          Pattern matching for explicit ACT/SCENE markers in your script
        </p>

        {structureAnalysis && (
          <>
            <div className={`p-3 rounded-lg mb-4 ${
              structureAnalysis.suggestedStructure === 'flat'
                ? 'bg-[var(--color-warning)]/10 border border-[var(--color-warning)]/30'
                : 'bg-[var(--color-success)]/10 border border-[var(--color-success)]/30'
            }`}>
              <div className="font-medium">
                {getStructureLabel(structureAnalysis.suggestedStructure)}
              </div>
              <div className="text-sm text-[var(--text-secondary)] mt-1">
                {getStructureDescription(structureAnalysis)}
              </div>
            </div>

            {structureAnalysis.suggestedStructure !== 'flat' && (
              <div className="space-y-3">
                <label className="flex items-center gap-3 cursor-pointer p-2 bg-[var(--bg-tertiary)] rounded-lg">
                  <input
                    type="radio"
                    name="structureChoice"
                    checked={useDetectedStructure && !useAiStructure}
                    onChange={() => {
                      setUseDetectedStructure(true)
                      setUseAiStructure(false)
                    }}
                    className="w-4 h-4"
                  />
                  <span>Use rule-based structure</span>
                </label>

                {useDetectedStructure && !useAiStructure && (
                  <div className="bg-[var(--bg-tertiary)] rounded-lg p-3 max-h-48 overflow-y-auto">
                    {structureAnalysis.acts.map((act, actIdx) => (
                      <div key={actIdx} className="mb-3 last:mb-0">
                        <div className="font-medium text-[var(--color-primary)]">{act.name}</div>
                        {act.scenes.length > 0 && (
                          <div className="ml-4 mt-1 space-y-1">
                            {act.scenes.map((scene, sceneIdx) => (
                              <div key={sceneIdx} className="text-sm text-[var(--text-secondary)]">
                                └ {scene.title}
                                {scene.pages.length > 0 && (
                                  <span className="text-[var(--text-muted)]">
                                    {' '}(pages {scene.pages.join(', ')})
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {structureAnalysis.suggestedStructure === 'flat' && !aiAnalysis && (
              <p className="text-sm text-[var(--text-secondary)]">
                No explicit markers found. Use AI analysis above for intelligent structure detection,
                or all pages will be imported into a single "Act 1 / Main" structure.
              </p>
            )}

            {structureAnalysis.suggestedStructure === 'flat' && aiAnalysis && (
              <label className="flex items-center gap-3 cursor-pointer p-2 bg-[var(--bg-tertiary)] rounded-lg">
                <input
                  type="radio"
                  name="structureChoice"
                  checked={!useAiStructure}
                  onChange={() => {
                    setUseAiStructure(false)
                    setUseDetectedStructure(false)
                  }}
                  className="w-4 h-4"
                />
                <span>Use flat structure (Act 1 / Main)</span>
              </label>
            )}
          </>
        )}
      </div>

      <div className="flex justify-between">
        <button
          onClick={() => setCurrentStep('format')}
          className="px-4 py-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
        >
          ← Back
        </button>
        <button
          onClick={() => {
            // If using AI structure, convert and pass directly to avoid async state timing issues
            if (useAiStructure && aiAnalysis) {
              const converted = convertAiToStructure()
              if (converted) {
                // Also update state for later use, but pass directly to parseScript
                setStructureAnalysis(converted)
                setUseDetectedStructure(true)
                parseScript(converted) // Pass structure directly!
                return
              }
            }
            parseScript()
          }}
          disabled={isAnalyzingStructure}
          className="bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] disabled:bg-[var(--bg-tertiary)] disabled:cursor-not-allowed px-4 py-2 rounded font-medium hover-lift"
        >
          Parse Script →
        </button>
      </div>
    </div>
  )

  // Step 4: Parsing Progress
  const renderParseStep = () => (
    <div className="space-y-6">
      <div className="bg-[var(--color-primary)]/10 border border-[var(--color-primary)]/30 rounded-lg p-6 text-center">
        <div className="text-4xl mb-4 animate-pulse">🔄</div>
        <h3 className="font-semibold text-lg mb-2">Parsing Script...</h3>
        <p className="text-sm text-[var(--text-secondary)] mb-4">
          Page {currentParsingPage} of {totalPagesToProcess}
        </p>
        <div className="w-full bg-[var(--bg-tertiary)] rounded-full h-2 mb-2">
          <div
            className="bg-[var(--color-primary)] h-2 rounded-full transition-all duration-300"
            style={{ width: `${importProgress}%` }}
          />
        </div>
        <p className="text-xs text-[var(--text-muted)]">
          AI is analyzing each page for panels, dialogue, and structure
        </p>
      </div>
    </div>
  )

  // Step 5: Character Review
  const renderCharactersStep = () => {
    const exactMatches = detectedSpeakers.filter(s => s.confidence === 'exact')
    const unmatched = detectedSpeakers.filter(s => s.confidence === 'none')

    // Build options for SearchableSelect
    const existingCharOptions = (issue.series.characters || []).map(char => ({
      value: char.id,
      label: char.display_name || char.name,
      sublabel: '(existing)',
    }))
    const newCharOptions = detectedSpeakers
      .filter(s => s.mapping === 'new')
      .map(s => ({
        value: `detected:${s.name}`,
        label: s.name,
        sublabel: '(new)',
      }))
    const allCharOptions = [...existingCharOptions, ...newCharOptions]

    return (
    <div className="space-y-6">
      <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg p-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-semibold">Review Detected Characters</h3>
            <p className="text-sm text-[var(--text-secondary)]">
              {detectedSpeakers.length} character{detectedSpeakers.length !== 1 ? 's' : ''} found
            </p>
          </div>
          {/* Bulk action buttons */}
          <div className="flex gap-2">
            {exactMatches.length > 0 && (
              <button
                onClick={() => {
                  setDetectedSpeakers(prev => prev.map(s =>
                    s.confidence === 'exact' ? { ...s, mapping: 'existing' } : s
                  ))
                }}
                className="text-xs px-3 py-1.5 bg-[var(--color-success)]/10 text-[var(--color-success)] border border-[var(--color-success)]/30 rounded hover:bg-[var(--color-success)]/20"
              >
                Confirm all exact matches ({exactMatches.length})
              </button>
            )}
            {unmatched.length > 0 && (
              <button
                onClick={() => {
                  setDetectedSpeakers(prev => prev.map(s =>
                    s.confidence === 'none' ? { ...s, mapping: 'new' } : s
                  ))
                }}
                className="text-xs px-3 py-1.5 bg-[var(--bg-tertiary)] text-[var(--text-secondary)] border border-[var(--border)] rounded hover:bg-[var(--bg-tertiary)]/80"
              >
                Create all unmatched as new ({unmatched.length})
              </button>
            )}
          </div>
        </div>

        <div className="space-y-2 max-h-80 overflow-y-auto">
          {detectedSpeakers.map((speaker, idx) => (
            <div
              key={speaker.name}
              className="bg-[var(--bg-tertiary)] rounded-lg p-3 flex items-center gap-4"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{speaker.name}</span>
                  {/* Confidence badge */}
                  {speaker.confidence === 'exact' && (
                    <span className="flex items-center gap-1 text-xs text-[var(--color-success)]">
                      <span className="w-2 h-2 rounded-full bg-[var(--color-success)] inline-block" />
                      Exact match
                    </span>
                  )}
                  {speaker.confidence === 'alias' && (
                    <span className="flex items-center gap-1 text-xs text-[var(--color-warning)]">
                      <span className="w-2 h-2 rounded-full bg-[var(--color-warning)] inline-block" />
                      Alias match — confirm?
                    </span>
                  )}
                  {(speaker.confidence === 'none' || speaker.confidence === 'fuzzy') && (
                    <span className="flex items-center gap-1 text-xs text-[var(--color-error)]">
                      <span className="w-2 h-2 rounded-full bg-[var(--color-error)] inline-block" />
                      No match
                    </span>
                  )}
                </div>
                <div className="text-xs text-[var(--text-secondary)]">
                  {speaker.dialogueCount ? `${speaker.dialogueCount} line(s)` : 'No dialogue'}
                  {speaker.appearanceCount ? ` · ${speaker.appearanceCount} panel(s)` : ''}
                </div>
              </div>

              <select
                value={speaker.mapping}
                onChange={(e) => {
                  const newSpeakers = [...detectedSpeakers]
                  newSpeakers[idx] = {
                    ...speaker,
                    mapping: e.target.value as 'new' | 'existing' | 'skip',
                    existingCharacterId: e.target.value === 'existing' ? speaker.existingCharacterId : undefined,
                  }
                  setDetectedSpeakers(newSpeakers)
                }}
                className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded px-2 py-1 text-sm"
              >
                <option value="new">Create New</option>
                <option value="existing">Link Existing</option>
                <option value="skip">Skip</option>
              </select>

              {speaker.mapping === 'existing' && (
                <div className="w-52">
                  <SearchableSelect
                    options={allCharOptions.filter(o =>
                      // Exclude the "will be created" option for self
                      o.value !== `detected:${speaker.name}`
                    )}
                    value={speaker.existingCharacterId || speaker.linkToDetected || null}
                    onChange={(val) => {
                      const newSpeakers = [...detectedSpeakers]
                      if (val && val.startsWith('detected:')) {
                        newSpeakers[idx] = {
                          ...speaker,
                          existingCharacterId: undefined,
                          linkToDetected: val,
                        }
                      } else {
                        newSpeakers[idx] = {
                          ...speaker,
                          existingCharacterId: val || undefined,
                          linkToDetected: undefined,
                        }
                      }
                      setDetectedSpeakers(newSpeakers)
                    }}
                    placeholder="Select character..."
                  />
                </div>
              )}

              <div className="w-20 text-right">
                {speaker.mapping === 'new' && (
                  <span className="text-xs text-[var(--color-success)] bg-[var(--color-success)]/10 px-2 py-1 rounded">Create</span>
                )}
                {speaker.mapping === 'skip' && (
                  <span className="text-xs text-[var(--text-muted)] bg-[var(--bg-secondary)] px-2 py-1 rounded">Skip</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex justify-between">
        <button
          onClick={() => setCurrentStep('structure')}
          className="px-4 py-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
        >
          ← Back
        </button>
        <button
          onClick={() => {
            computeDiff()
            setCurrentStep('preview')
          }}
          className="bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] px-4 py-2 rounded font-medium"
        >
          Continue to Preview →
        </button>
      </div>
    </div>
    )
  }

  // Get existing page count
  const existingPageCount = (issue.acts || []).reduce((total, act) =>
    total + (act.scenes || []).reduce((sceneTotal, scene) =>
      sceneTotal + (scene.pages?.length || 0), 0), 0)

  // Step 6: Preview
  const renderPreviewStep = () => (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold">Preview ({parsedPages.length} pages)</h3>
          <p className="text-sm text-[var(--text-secondary)]">
            {parsedPages.reduce((sum, p) => sum + p.panels.length, 0)} panels total
            {existingPageCount > 0 && (
              <span className="text-[var(--color-warning)] ml-2">
                • Will replace {existingPageCount} existing pages
              </span>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setCurrentStep('characters')}
            className="px-3 py-1.5 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          >
            ← Edit Characters
          </button>
          <button
            onClick={importParsedScript}
            className="bg-[var(--color-success)] hover:opacity-90 px-4 py-2 rounded font-medium"
          >
            Import Script
          </button>
        </div>
      </div>

      {/* View toggle - only show if there's existing content */}
      {existingPageCount > 0 && (
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-lg bg-[var(--bg-tertiary)] p-1">
            <button
              onClick={() => setPreviewMode('preview')}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                previewMode === 'preview'
                  ? 'bg-[var(--bg-secondary)] text-[var(--text-primary)] shadow'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              Preview
            </button>
            <button
              onClick={() => setPreviewMode('diff')}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                previewMode === 'diff'
                  ? 'bg-[var(--bg-secondary)] text-[var(--text-primary)] shadow'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              Changes ({generateDiffSummary(pageDiffs)})
            </button>
          </div>
        </div>
      )}

      {/* Diff View */}
      {previewMode === 'diff' && existingPageCount > 0 ? (
        <VersionDiff pageDiffs={pageDiffs} compact={false} />
      ) : (
        /* Preview View */
        <div className="space-y-4 max-h-[500px] overflow-y-auto">
          {parsedPages.map((page) => (
            <div
              key={page.number}
              className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg overflow-hidden group"
            >
              <div className="px-4 py-2 bg-[var(--bg-tertiary)]/50 border-b border-[var(--border)] flex items-center justify-between">
                <span className="font-medium">Page {page.number}</span>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-[var(--text-secondary)]">
                    {page.panels.length} panel{page.panels.length !== 1 ? 's' : ''}
                  </span>
                  <Tip content="Add panel">
                    <button
                      onClick={() => addPanel(page.number)}
                      className="opacity-0 group-hover:opacity-100 text-xs px-2 py-1 bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] rounded hover-lift transition-opacity"
                    >
                      + Panel
                    </button>
                  </Tip>
                  {parsedPages.length > 1 && (
                    <Tip content="Delete page">
                      <button
                        onClick={() => deletePage(page.number)}
                        className="opacity-0 group-hover:opacity-100 text-xs px-2 py-1 bg-[var(--color-error)] hover:opacity-90 rounded hover-fade-danger transition-opacity"
                      >
                        ×
                      </button>
                    </Tip>
                  )}
                </div>
              </div>
              <div className="p-4 space-y-3">
                {page.panels.map((panel) => {
                  const isEditing = editingPanel?.pageNum === page.number && editingPanel?.panelNum === panel.number

                  return (
                    <div
                      key={panel.number}
                      className={`border-l-2 pl-3 group/panel transition-colors ${
                        isEditing
                          ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/5'
                          : 'border-[var(--border)] hover:border-[var(--border-hover)]'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <div className="text-sm font-medium text-[var(--text-secondary)]">
                          Panel {panel.number}
                        </div>
                        <div className="flex items-center gap-1 opacity-0 group-hover/panel:opacity-100 transition-opacity">
                          {isEditing ? (
                            <button
                              onClick={() => setEditingPanel(null)}
                              className="text-xs px-2 py-0.5 bg-[var(--color-success)] hover:opacity-90 rounded"
                            >
                              Done
                            </button>
                          ) : (
                            <button
                              onClick={() => setEditingPanel({ pageNum: page.number, panelNum: panel.number })}
                              className="text-xs px-2 py-0.5 bg-[var(--bg-tertiary)] hover:bg-[var(--bg-tertiary)]/80 rounded"
                            >
                              Edit
                            </button>
                          )}
                          {page.panels.length > 1 && (
                            <Tip content="Delete panel">
                              <button
                                onClick={() => deletePanel(page.number, panel.number)}
                                className="text-xs px-2 py-0.5 bg-[var(--color-error)]/50 hover:bg-[var(--color-error)] rounded hover-fade-danger"
                              >
                                ×
                              </button>
                            </Tip>
                          )}
                        </div>
                      </div>

                      {isEditing ? (
                        <div className="space-y-3">
                          <div>
                            <label className="block text-xs text-[var(--text-muted)] mb-1">Visual Description</label>
                            <textarea
                              value={panel.visualDescription}
                              onChange={(e) => updatePanelDescription(page.number, panel.number, e.target.value)}
                              className="w-full bg-[var(--bg-tertiary)] border border-[var(--border)] rounded px-3 py-2 text-sm resize-none focus:outline-none focus:border-[var(--color-primary)]"
                              rows={3}
                            />
                          </div>

                          {panel.dialogue.length > 0 && (
                            <div>
                              <label className="block text-xs text-[var(--text-muted)] mb-1">Dialogue</label>
                              {panel.dialogue.map((d, i) => (
                                <div key={i} className="flex gap-2 mb-2">
                                  <input
                                    value={d.speaker}
                                    onChange={(e) => updateDialogue(page.number, panel.number, i, { speaker: e.target.value })}
                                    className="w-32 bg-[var(--bg-tertiary)] border border-[var(--border)] rounded px-2 py-1 text-sm focus:outline-none focus:border-[var(--color-primary)]"
                                    placeholder="Speaker"
                                  />
                                  <input
                                    value={d.text}
                                    onChange={(e) => updateDialogue(page.number, panel.number, i, { text: e.target.value })}
                                    className="flex-1 bg-[var(--bg-tertiary)] border border-[var(--border)] rounded px-2 py-1 text-sm focus:outline-none focus:border-[var(--color-primary)]"
                                    placeholder="Dialogue text"
                                  />
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ) : (
                        <>
                          {panel.visualDescription && (
                            <p className="text-sm mb-2">{panel.visualDescription}</p>
                          )}
                          {panel.captions.map((caption, i) => (
                            <div key={i} className="text-sm text-[var(--color-warning)] mb-1">
                              CAP: {caption.text}
                            </div>
                          ))}
                          {panel.dialogue.map((d, i) => (
                            <div key={i} className="text-sm mb-1">
                              <span className="font-medium text-[var(--color-primary)]">{d.speaker}:</span> {d.text}
                            </div>
                          ))}
                          {panel.sfx.map((sfx, i) => (
                            <div key={i} className="text-sm text-[var(--color-success)] font-bold">
                              SFX: {sfx}
                            </div>
                          ))}
                        </>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )

  // Step 7: Importing
  const renderImportingStep = () => (
    <div className="space-y-6">
      <div className="bg-[var(--color-success)]/10 border border-[var(--color-success)]/30 rounded-lg p-6 text-center">
        <div className="text-4xl mb-4 animate-pulse">📥</div>
        <h3 className="font-semibold text-lg mb-2">Importing to Panel Flow...</h3>
        <div className="w-full bg-[var(--bg-tertiary)] rounded-full h-2 mb-2">
          <div
            className="bg-[var(--color-success)] h-2 rounded-full transition-all duration-300"
            style={{ width: `${importProgress}%` }}
          />
        </div>
        <p className="text-sm text-[var(--text-secondary)]">
          Creating pages, panels, dialogue, and captions...
        </p>
      </div>
    </div>
  )

  return (
    <div className="max-w-3xl mx-auto py-6">
      <ConfirmDialog {...dialogProps} />
      {renderStepIndicator()}

      {parseError && (
        <div className="bg-[var(--color-error)]/10 border border-[var(--color-error)]/30 rounded-lg p-4 mb-6">
          <h3 className="font-medium text-[var(--color-error)] mb-1">Error</h3>
          <p className="text-sm">{parseError}</p>
        </div>
      )}

      {currentStep === 'upload' && renderUploadStep()}
      {currentStep === 'format' && renderFormatStep()}
      {currentStep === 'structure' && renderStructureStep()}
      {currentStep === 'parse' && renderParseStep()}
      {currentStep === 'characters' && renderCharactersStep()}
      {currentStep === 'preview' && renderPreviewStep()}
      {currentStep === 'importing' && renderImportingStep()}
    </div>
  )
}
