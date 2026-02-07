'use client'

import { useState, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/contexts/ToastContext'
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

interface Character {
  id: string
  name: string
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
    characters: Character[]
    locations: Location[]
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
  const parseScript = async () => {
    if (!scriptText.trim() || !selectedFormat) {
      showToast('Please select a format first', 'error')
      return
    }

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
          if (useDetectedStructure && structureAnalysis) {
            for (let actIdx = 0; actIdx < structureAnalysis.acts.length; actIdx++) {
              const act = structureAnalysis.acts[actIdx]
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

      // Build existing character map (handle case where no characters exist yet)
      const existingCharacters = new Map(
        (issue.series.characters || []).map(c => [c.name.toLowerCase(), c.id])
      )

      // Create detected speakers list
      const speakers: DetectedSpeaker[] = []
      for (const [name, counts] of characterCounts) {
        const existingId = existingCharacters.get(name.toLowerCase())
        speakers.push({
          name,
          count: counts.dialogue + counts.appearances,
          dialogueCount: counts.dialogue,
          appearanceCount: counts.appearances,
          mapping: existingId ? 'existing' : 'new',
          existingCharacterId: existingId,
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
      const confirmed = window.confirm(
        `This will REPLACE ALL existing content in Issue #${issue.number}.\n\n` +
        `You are about to import ${parsedPages.length} pages with ${parsedPages.reduce((sum, p) => sum + p.panels.length, 0)} panels.\n\n` +
        `All existing acts, scenes, and pages will be deleted.\n` +
        `This action cannot be undone. Continue?`
      )
      if (!confirmed) return
    }

    setIsImporting(true)
    setImportProgress(0)
    setCurrentStep('importing')

    const supabase = createClient()

    try {
      // Delete existing content
      await supabase
        .from('acts')
        .delete()
        .eq('issue_id', issue.id)

      // Create structure based on detection or flat
      const structure = useDetectedStructure && structureAnalysis?.suggestedStructure !== 'flat'
        ? structureAnalysis
        : createFlatStructure(parsedPages.length)

      // Build character map (handle case where no characters exist yet)
      const characterMap = new Map<string, string>(
        (issue.series.characters || []).map(c => [c.name.toLowerCase(), c.id])
      )

      // Create new characters
      const speakersToCreate = detectedSpeakers.filter(s => s.mapping === 'new')
      for (const speaker of speakersToCreate) {
        const { data: newChar, error: charError } = await supabase
          .from('characters')
          .insert({
            series_id: issue.series.id,
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

      // Create acts and scenes from structure
      const actIdMap = new Map<number, string>()
      const sceneIdMap = new Map<string, string>() // "actIdx-sceneIdx" -> sceneId

      if (structure) {
        for (let actIdx = 0; actIdx < structure.acts.length; actIdx++) {
          const detectedAct = structure.acts[actIdx]

          const { data: newAct, error: actError } = await supabase
            .from('acts')
            .insert({
              issue_id: issue.id,
              number: actIdx + 1,
              name: detectedAct.name,
              sort_order: actIdx + 1,
            })
            .select()
            .single()

          if (actError) throw actError
          actIdMap.set(actIdx, newAct.id)

          // Create scenes for this act
          for (let sceneIdx = 0; sceneIdx < detectedAct.scenes.length; sceneIdx++) {
            const detectedScene = detectedAct.scenes[sceneIdx]

            const { data: newScene, error: sceneError } = await supabase
              .from('scenes')
              .insert({
                act_id: newAct.id,
                title: detectedScene.title,
                sort_order: sceneIdx + 1,
              })
              .select()
              .single()

            if (sceneError) throw sceneError
            sceneIdMap.set(`${actIdx}-${sceneIdx}`, newScene.id)
          }
        }
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
    } catch (error) {
      console.error('Import error:', error)
      showToast('Failed to import script', 'error')
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
                  ? 'bg-blue-600 text-white'
                  : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)]'
              }`}
            >
              {step.label}
            </div>
            {i < steps.length - 1 && (
              <div className={`w-8 h-0.5 mx-1 ${
                i < currentIndex ? 'bg-blue-600' : 'bg-[var(--bg-tertiary)]'
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
        className="border-2 border-dashed border-[var(--border)] rounded-lg p-12 text-center hover:border-blue-500 transition-colors cursor-pointer"
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
          className="w-full h-64 bg-[var(--bg-tertiary)] border border-[var(--border)] rounded-lg px-4 py-3 text-sm font-mono resize-none focus:border-blue-500 focus:outline-none"
        />
        {scriptText && (
          <button
            onClick={() => analyzeScript(scriptText)}
            className="mt-2 bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded font-medium"
          >
            Analyze Script
          </button>
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
            <p className="text-sm text-green-400">
              ✓ Detected {detectedFormats.length} possible format{detectedFormats.length !== 1 ? 's' : ''}
            </p>

            {detectedFormats.map((format, i) => (
              <label
                key={format.pattern.name}
                className={`block p-3 rounded-lg border cursor-pointer transition-colors ${
                  selectedFormat?.name === format.pattern.name
                    ? 'border-blue-500 bg-blue-500/10'
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
          <div className="text-amber-400 p-4 bg-amber-900/20 rounded-lg">
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
                className={`text-left p-2 rounded text-sm ${
                  selectedFormat?.name === pattern.name
                    ? 'bg-blue-600 text-white'
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
        <button
          onClick={() => setCurrentStep('structure')}
          disabled={!selectedFormat}
          className="bg-blue-600 hover:bg-blue-700 disabled:bg-[var(--bg-tertiary)] disabled:cursor-not-allowed px-4 py-2 rounded font-medium"
        >
          Continue to Structure →
        </button>
      </div>
    </div>
  )

  // Step 3: Structure Detection
  const renderStructureStep = () => (
    <div className="space-y-6">
      <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg p-4">
        <h3 className="font-semibold mb-2">Structure Detection</h3>

        {structureAnalysis && (
          <>
            <div className={`p-3 rounded-lg mb-4 ${
              structureAnalysis.suggestedStructure === 'flat'
                ? 'bg-amber-900/20 border border-amber-800'
                : 'bg-green-900/20 border border-green-800'
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
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={useDetectedStructure}
                    onChange={(e) => setUseDetectedStructure(e.target.checked)}
                    className="w-4 h-4"
                  />
                  <span>Use detected structure (recommended)</span>
                </label>

                {useDetectedStructure && (
                  <div className="bg-[var(--bg-tertiary)] rounded-lg p-3 max-h-64 overflow-y-auto">
                    {structureAnalysis.acts.map((act, actIdx) => (
                      <div key={actIdx} className="mb-3 last:mb-0">
                        <div className="font-medium text-blue-400">{act.name}</div>
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

            {structureAnalysis.suggestedStructure === 'flat' && (
              <p className="text-sm text-[var(--text-secondary)]">
                All pages will be imported into a single "Act 1 / Main" structure.
                You can reorganize them in the Issue Editor after import.
              </p>
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
          onClick={parseScript}
          className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded font-medium"
        >
          Parse Script →
        </button>
      </div>
    </div>
  )

  // Step 4: Parsing Progress
  const renderParseStep = () => (
    <div className="space-y-6">
      <div className="bg-blue-900/20 border border-blue-800 rounded-lg p-6 text-center">
        <div className="text-4xl mb-4 animate-pulse">🔄</div>
        <h3 className="font-semibold text-lg mb-2">Parsing Script...</h3>
        <p className="text-sm text-[var(--text-secondary)] mb-4">
          Page {currentParsingPage} of {totalPagesToProcess}
        </p>
        <div className="w-full bg-[var(--bg-tertiary)] rounded-full h-2 mb-2">
          <div
            className="bg-blue-500 h-2 rounded-full transition-all duration-300"
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
  const renderCharactersStep = () => (
    <div className="space-y-6">
      <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg p-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-semibold">Review Detected Characters</h3>
            <p className="text-sm text-[var(--text-secondary)]">
              {detectedSpeakers.length} character{detectedSpeakers.length !== 1 ? 's' : ''} found
            </p>
          </div>
        </div>

        <div className="space-y-2 max-h-80 overflow-y-auto">
          {detectedSpeakers.map((speaker, idx) => (
            <div
              key={speaker.name}
              className="bg-[var(--bg-tertiary)] rounded-lg p-3 flex items-center gap-4"
            >
              <div className="flex-1 min-w-0">
                <div className="font-medium">{speaker.name}</div>
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
                <select
                  value={speaker.existingCharacterId || speaker.linkToDetected || ''}
                  onChange={(e) => {
                    const newSpeakers = [...detectedSpeakers]
                    if (e.target.value.startsWith('detected:')) {
                      newSpeakers[idx] = {
                        ...speaker,
                        existingCharacterId: undefined,
                        linkToDetected: e.target.value,
                      }
                    } else {
                      newSpeakers[idx] = {
                        ...speaker,
                        existingCharacterId: e.target.value || undefined,
                        linkToDetected: undefined,
                      }
                    }
                    setDetectedSpeakers(newSpeakers)
                  }}
                  className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded px-2 py-1 text-sm"
                >
                  <option value="">Select...</option>
                  {issue.series.characters.length > 0 && (
                    <optgroup label="Existing Characters">
                      {issue.series.characters.map((char) => (
                        <option key={char.id} value={char.id}>{char.name}</option>
                      ))}
                    </optgroup>
                  )}
                  {detectedSpeakers.filter(s => s.mapping === 'new' && s.name !== speaker.name).length > 0 && (
                    <optgroup label="Will Be Created">
                      {detectedSpeakers
                        .filter(s => s.mapping === 'new' && s.name !== speaker.name)
                        .map((s) => (
                          <option key={`detected:${s.name}`} value={`detected:${s.name}`}>
                            {s.name} (new)
                          </option>
                        ))}
                    </optgroup>
                  )}
                </select>
              )}

              <div className="w-20 text-right">
                {speaker.mapping === 'new' && (
                  <span className="text-xs text-green-400 bg-green-400/10 px-2 py-1 rounded">Create</span>
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
          className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded font-medium"
        >
          Continue to Preview →
        </button>
      </div>
    </div>
  )

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
              <span className="text-amber-400 ml-2">
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
            className="bg-green-600 hover:bg-green-700 px-4 py-2 rounded font-medium"
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
                  <button
                    onClick={() => addPanel(page.number)}
                    className="opacity-0 group-hover:opacity-100 text-xs px-2 py-1 bg-blue-600 hover:bg-blue-700 rounded transition-opacity"
                    title="Add panel"
                  >
                    + Panel
                  </button>
                  {parsedPages.length > 1 && (
                    <button
                      onClick={() => deletePage(page.number)}
                      className="opacity-0 group-hover:opacity-100 text-xs px-2 py-1 bg-red-600 hover:bg-red-700 rounded transition-opacity"
                      title="Delete page"
                    >
                      ×
                    </button>
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
                          ? 'border-blue-500 bg-blue-500/5'
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
                              className="text-xs px-2 py-0.5 bg-green-600 hover:bg-green-700 rounded"
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
                            <button
                              onClick={() => deletePanel(page.number, panel.number)}
                              className="text-xs px-2 py-0.5 bg-red-600/50 hover:bg-red-600 rounded"
                              title="Delete panel"
                            >
                              ×
                            </button>
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
                              className="w-full bg-[var(--bg-tertiary)] border border-[var(--border)] rounded px-3 py-2 text-sm resize-none focus:outline-none focus:border-blue-500"
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
                                    className="w-32 bg-[var(--bg-tertiary)] border border-[var(--border)] rounded px-2 py-1 text-sm focus:outline-none focus:border-blue-500"
                                    placeholder="Speaker"
                                  />
                                  <input
                                    value={d.text}
                                    onChange={(e) => updateDialogue(page.number, panel.number, i, { text: e.target.value })}
                                    className="flex-1 bg-[var(--bg-tertiary)] border border-[var(--border)] rounded px-2 py-1 text-sm focus:outline-none focus:border-blue-500"
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
                            <div key={i} className="text-sm text-amber-400 mb-1">
                              CAP: {caption.text}
                            </div>
                          ))}
                          {panel.dialogue.map((d, i) => (
                            <div key={i} className="text-sm mb-1">
                              <span className="font-medium text-blue-400">{d.speaker}:</span> {d.text}
                            </div>
                          ))}
                          {panel.sfx.map((sfx, i) => (
                            <div key={i} className="text-sm text-green-400 font-bold">
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
      <div className="bg-green-900/20 border border-green-800 rounded-lg p-6 text-center">
        <div className="text-4xl mb-4 animate-pulse">📥</div>
        <h3 className="font-semibold text-lg mb-2">Importing to Panel Flow...</h3>
        <div className="w-full bg-[var(--bg-tertiary)] rounded-full h-2 mb-2">
          <div
            className="bg-green-500 h-2 rounded-full transition-all duration-300"
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
      {renderStepIndicator()}

      {parseError && (
        <div className="bg-red-900/20 border border-red-800 rounded-lg p-4 mb-6">
          <h3 className="font-medium text-red-400 mb-1">Error</h3>
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
