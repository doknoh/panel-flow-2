'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/contexts/ToastContext'
import ImageUploader from '@/components/ImageUploader'
import { useEntityImages } from '@/hooks/useEntityImages'
import EmptyState from '@/components/ui/EmptyState'
import ConfirmDialog, { useConfirmDialog } from '@/components/ui/ConfirmDialog'
import { ChevronDown, X } from 'lucide-react'

const SCAN_FIELDS = [
  { key: 'age', label: 'Age' },
  { key: 'eye_color', label: 'Eye Color' },
  { key: 'hair_color_style', label: 'Hair Color/Style' },
  { key: 'height', label: 'Height' },
  { key: 'build', label: 'Build' },
  { key: 'skin_tone', label: 'Skin Tone' },
  { key: 'distinguishing_marks', label: 'Distinguishing Marks' },
  { key: 'style_wardrobe', label: 'Style/Wardrobe' },
  { key: 'physical_description', label: 'Physical Description' },
  { key: 'personality_traits', label: 'Personality Traits' },
  { key: 'speech_patterns', label: 'Speech Patterns' },
  { key: 'relationships', label: 'Relationships' },
  { key: 'arc_notes', label: 'Arc Notes' },
]

interface Character {
  id: string
  name: string
  role: string | null
  description: string | null
  visual_description: string | null
  personality_traits: string | null
  background: string | null
  physical_description: string | null
  speech_patterns: string | null
  relationships: string | null
  arc_notes: string | null
  // Structured physical fields
  age: string | null
  eye_color: string | null
  hair_color_style: string | null
  height: string | null
  build: string | null
  skin_tone: string | null
  distinguishing_marks: string | null
  style_wardrobe: string | null
}

interface CharacterListProps {
  seriesId: string
  initialCharacters: Character[]
}

export default function CharacterList({ seriesId, initialCharacters }: CharacterListProps) {
  const [characters, setCharacters] = useState<Character[]>(initialCharacters)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [form, setForm] = useState<Partial<Character>>({})
  const { showToast } = useToast()
  const { confirm, dialogProps } = useConfirmDialog()

  // AI Scan state
  const [scanningId, setScanningId] = useState<string | null>(null)
  const [scanResults, setScanResults] = useState<{ characterId: string; suggestions: Record<string, string | null>; descriptionsAnalyzed: number; dialoguesAnalyzed: number } | null>(null)
  const [selectedSuggestions, setSelectedSuggestions] = useState<Record<string, boolean>>({})

  // Scene Appearances state
  const [appearancesMap, setAppearancesMap] = useState<Record<string, any[]>>({})
  const [loadingAppearances, setLoadingAppearances] = useState<string | null>(null)

  // Image management for the character being edited
  const { images, setImages, loading: imagesLoading } = useEntityImages(
    'character',
    editingId
  )

  const refreshCharacters = async () => {
    const supabase = createClient()
    const { data } = await supabase
      .from('characters')
      .select('*')
      .eq('series_id', seriesId)
      .order('name')

    if (data) setCharacters(data)
  }

  const startCreate = () => {
    setIsCreating(true)
    setEditingId(null)
    setForm({
      name: '',
      role: '',
      description: '',
      visual_description: '',
      personality_traits: '',
      background: '',
      age: '',
      eye_color: '',
      hair_color_style: '',
      height: '',
      build: '',
      skin_tone: '',
      distinguishing_marks: '',
      style_wardrobe: '',
    })
  }

  const startEdit = (character: Character) => {
    setEditingId(character.id)
    setIsCreating(false)
    setForm({
      name: character.name,
      role: character.role || '',
      description: character.description || '',
      visual_description: character.visual_description || '',
      personality_traits: character.personality_traits || '',
      background: character.background || '',
      age: character.age || '',
      eye_color: character.eye_color || '',
      hair_color_style: character.hair_color_style || '',
      height: character.height || '',
      build: character.build || '',
      skin_tone: character.skin_tone || '',
      distinguishing_marks: character.distinguishing_marks || '',
      style_wardrobe: character.style_wardrobe || '',
    })
  }

  const cancelEdit = () => {
    setEditingId(null)
    setIsCreating(false)
    setForm({})
  }

  const saveCharacter = async () => {
    const trimmedName = form.name?.trim()
    if (!trimmedName) {
      showToast('Character name cannot be empty', 'error')
      return
    }

    const supabase = createClient()

    if (isCreating) {
      const tempId = `temp-char-${Date.now()}`
      const newCharacter: Character = {
        id: tempId,
        name: trimmedName,
        role: form.role?.trim() || null,
        description: form.description?.trim() || null,
        visual_description: form.visual_description?.trim() || null,
        personality_traits: form.personality_traits?.trim() || null,
        background: form.background?.trim() || null,
        physical_description: form.physical_description?.trim() || null,
        speech_patterns: form.speech_patterns?.trim() || null,
        relationships: form.relationships?.trim() || null,
        arc_notes: form.arc_notes?.trim() || null,
        age: form.age?.trim() || null,
        eye_color: form.eye_color?.trim() || null,
        hair_color_style: form.hair_color_style?.trim() || null,
        height: form.height?.trim() || null,
        build: form.build?.trim() || null,
        skin_tone: form.skin_tone?.trim() || null,
        distinguishing_marks: form.distinguishing_marks?.trim() || null,
        style_wardrobe: form.style_wardrobe?.trim() || null,
      }

      // Optimistic update FIRST
      setCharacters(prev => [...prev, newCharacter].sort((a, b) => a.name.localeCompare(b.name)))
      cancelEdit()
      showToast('Character created', 'success')

      // Then persist to database
      const { data, error } = await supabase.from('characters').insert({
        series_id: seriesId,
        name: trimmedName,
        role: form.role?.trim() || null,
        description: form.description?.trim() || null,
        visual_description: form.visual_description?.trim() || null,
        personality_traits: form.personality_traits?.trim() || null,
        background: form.background?.trim() || null,
        age: form.age?.trim() || null,
        eye_color: form.eye_color?.trim() || null,
        hair_color_style: form.hair_color_style?.trim() || null,
        height: form.height?.trim() || null,
        build: form.build?.trim() || null,
        skin_tone: form.skin_tone?.trim() || null,
        distinguishing_marks: form.distinguishing_marks?.trim() || null,
        style_wardrobe: form.style_wardrobe?.trim() || null,
      }).select().single()

      if (error) {
        // Rollback on error
        setCharacters(prev => prev.filter(c => c.id !== tempId))
        showToast('Failed to create character: ' + error.message, 'error')
      } else if (data) {
        // Replace temp ID with real ID
        setCharacters(prev => prev.map(c => c.id === tempId ? data : c))
      }
    } else if (editingId) {
      // Store previous value for rollback
      const previousCharacter = characters.find(c => c.id === editingId)
      const updatedCharacter: Character = {
        id: editingId,
        name: trimmedName,
        role: form.role?.trim() || null,
        description: form.description?.trim() || null,
        visual_description: form.visual_description?.trim() || null,
        personality_traits: form.personality_traits?.trim() || null,
        background: form.background?.trim() || null,
        physical_description: form.physical_description?.trim() || null,
        speech_patterns: form.speech_patterns?.trim() || null,
        relationships: form.relationships?.trim() || null,
        arc_notes: form.arc_notes?.trim() || null,
        age: form.age?.trim() || null,
        eye_color: form.eye_color?.trim() || null,
        hair_color_style: form.hair_color_style?.trim() || null,
        height: form.height?.trim() || null,
        build: form.build?.trim() || null,
        skin_tone: form.skin_tone?.trim() || null,
        distinguishing_marks: form.distinguishing_marks?.trim() || null,
        style_wardrobe: form.style_wardrobe?.trim() || null,
      }

      // Optimistic update FIRST
      setCharacters(prev => prev.map(c => c.id === editingId ? updatedCharacter : c).sort((a, b) => a.name.localeCompare(b.name)))
      cancelEdit()
      showToast('Character updated', 'success')

      // Then persist to database
      const { error } = await supabase.from('characters').update({
        name: trimmedName,
        role: form.role?.trim() || null,
        description: form.description?.trim() || null,
        visual_description: form.visual_description?.trim() || null,
        personality_traits: form.personality_traits?.trim() || null,
        background: form.background?.trim() || null,
        age: form.age?.trim() || null,
        eye_color: form.eye_color?.trim() || null,
        hair_color_style: form.hair_color_style?.trim() || null,
        height: form.height?.trim() || null,
        build: form.build?.trim() || null,
        skin_tone: form.skin_tone?.trim() || null,
        distinguishing_marks: form.distinguishing_marks?.trim() || null,
        style_wardrobe: form.style_wardrobe?.trim() || null,
      }).eq('id', editingId)

      if (error) {
        // Rollback on error
        if (previousCharacter) {
          setCharacters(prev => prev.map(c => c.id === editingId ? previousCharacter : c))
        }
        showToast('Failed to update character: ' + error.message, 'error')
      }
    }
  }

  const deleteCharacter = async (id: string) => {
    const character = characters.find(c => c.id === id)
    if (!character) return

    // Check usage before deleting
    const supabase = createClient()
    const { count } = await supabase
      .from('dialogue_blocks')
      .select('id', { count: 'exact', head: true })
      .eq('character_id', id)

    const usageWarning = count && count > 0
      ? `This character appears in ${count} dialogue block(s). Deleting will leave those blocks without a speaker.`
      : undefined

    const confirmed = await confirm({
      title: `Delete "${character.name}"?`,
      description: usageWarning || 'This character will be permanently removed.',
    })
    if (!confirmed) return

    // Optimistic update FIRST
    setCharacters(prev => prev.filter(c => c.id !== id))
    showToast('Character deleted', 'success')

    const { error } = await supabase.from('characters').delete().eq('id', id)

    if (error) {
      // Rollback on error
      setCharacters(prev => [...prev, character].sort((a, b) => a.name.localeCompare(b.name)))
      showToast('Failed to delete character: ' + error.message, 'error')
    }
  }

  const runAIScan = async (characterId: string) => {
    setScanningId(characterId)
    try {
      const res = await fetch('/api/ai/character-scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ characterId, seriesId }),
      })
      const data = await res.json()
      if (data.suggestions) {
        setScanResults({ characterId, suggestions: data.suggestions, descriptionsAnalyzed: data.descriptionsAnalyzed, dialoguesAnalyzed: data.dialoguesAnalyzed })
        // Pre-select all non-null suggestions where current value is empty
        const character = characters.find(c => c.id === characterId)
        const preSelected: Record<string, boolean> = {}
        for (const [key, value] of Object.entries(data.suggestions)) {
          if (value !== null && value !== undefined) {
            const currentValue = character?.[key as keyof Character]
            preSelected[key] = !currentValue || currentValue === ''
          }
        }
        setSelectedSuggestions(preSelected)
      } else {
        showToast(data.message || 'No suggestions generated', 'info')
      }
    } catch (error) {
      showToast('Failed to scan character', 'error')
    } finally {
      setScanningId(null)
    }
  }

  const applySuggestions = async () => {
    if (!scanResults) return
    const character = characters.find(c => c.id === scanResults.characterId)
    if (!character) return

    const updates: Record<string, string | null> = {}
    for (const [key, selected] of Object.entries(selectedSuggestions)) {
      if (selected && scanResults.suggestions[key]) {
        updates[key] = scanResults.suggestions[key]
      }
    }

    if (Object.keys(updates).length === 0) {
      showToast('No suggestions selected', 'info')
      return
    }

    const supabase = createClient()
    const { error } = await supabase.from('characters').update(updates).eq('id', scanResults.characterId)

    if (error) {
      showToast('Failed to apply suggestions', 'error')
    } else {
      // Update local state
      setCharacters(prev => prev.map(c => c.id === scanResults.characterId ? { ...c, ...updates } : c))
      showToast(`Applied ${Object.keys(updates).length} suggestion(s)`, 'success')
      setScanResults(null)
    }
  }

  const loadAppearances = async (characterId: string) => {
    if (appearancesMap[characterId]) {
      // Already loaded, just toggle visibility
      setAppearancesMap(prev => {
        const copy = { ...prev }
        delete copy[characterId]
        return copy
      })
      return
    }

    setLoadingAppearances(characterId)
    const supabase = createClient()

    // Query panels where this character appears
    const { data: panels } = await supabase
      .from('panels')
      .select(`
        id,
        panel_number,
        pages!inner (
          id,
          page_number,
          scenes!inner (
            id,
            title,
            acts!inner (
              id,
              title,
              issues!inner (
                id,
                number,
                title
              )
            )
          )
        )
      `)
      .contains('characters_present', [characterId])

    // Also check dialogue blocks
    const { data: dialoguePanels } = await supabase
      .from('dialogue_blocks')
      .select(`
        id,
        panels!inner (
          id,
          panel_number,
          pages!inner (
            id,
            page_number,
            scenes!inner (
              id,
              title,
              acts!inner (
                id,
                title,
                issues!inner (
                  id,
                  number,
                  title
                )
              )
            )
          )
        )
      `)
      .eq('character_id', characterId)

    // Combine and deduplicate by page
    const pageMap = new Map<string, { pageId: string; pageNumber: number; sceneTitle: string; issueNumber: number; issueId: string; issueTitle: string | null }>()

    const processPanel = (panel: any) => {
      const page = panel.pages
      if (!page) return
      const scene = page.scenes
      const act = scene?.acts
      const issue = act?.issues
      if (!issue) return

      pageMap.set(page.id, {
        pageId: page.id,
        pageNumber: page.page_number,
        sceneTitle: scene.title || 'Untitled Scene',
        issueNumber: issue.number,
        issueId: issue.id,
        issueTitle: issue.title,
      })
    }

    panels?.forEach(processPanel)
    dialoguePanels?.forEach((dp: any) => {
      if (dp.panels) processPanel(dp.panels)
    })

    // Group by issue
    const byIssue = new Map<number, { issueId: string; issueTitle: string | null; pages: { pageId: string; pageNumber: number; sceneTitle: string; issueNumber: number; issueId: string; issueTitle: string | null }[] }>()
    Array.from(pageMap.values()).forEach(page => {
      if (!byIssue.has(page.issueNumber)) {
        byIssue.set(page.issueNumber, { issueId: page.issueId, issueTitle: page.issueTitle, pages: [] })
      }
      byIssue.get(page.issueNumber)!.pages.push(page)
    })

    // Sort pages within each issue by page number
    Array.from(byIssue.values()).forEach(issue => {
      issue.pages.sort((a, b) => a.pageNumber - b.pageNumber)
    })

    // Convert to sorted array
    const result = Array.from(byIssue.entries())
      .sort(([a], [b]) => a - b)
      .map(([issueNumber, data]) => ({
        issueNumber,
        ...data,
      }))

    setAppearancesMap(prev => ({ ...prev, [characterId]: result }))
    setLoadingAppearances(null)
  }

  const renderForm = () => (
    <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg p-4 sm:p-6 mb-6">
      <h3 className="font-semibold mb-4">{isCreating ? 'New Character' : 'Edit Character'}</h3>
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-[var(--text-secondary)] mb-1">Name *</label>
            <input
              type="text"
              value={form.name || ''}
              onChange={(e) => setForm(prev => ({ ...prev, name: e.target.value }))}
              className="w-full bg-[var(--bg-tertiary)] border border-[var(--border)] rounded px-3 py-2 focus:border-[var(--color-primary)] focus:outline-none"
              placeholder="Character name"
            />
          </div>
          <div>
            <label className="block text-sm text-[var(--text-secondary)] mb-1">Role</label>
            <select
              value={form.role || ''}
              onChange={(e) => setForm(prev => ({ ...prev, role: e.target.value }))}
              className="w-full bg-[var(--bg-tertiary)] border border-[var(--border)] rounded px-3 py-2 focus:border-[var(--color-primary)] focus:outline-none"
            >
              <option value="">Select role</option>
              <option value="protagonist">Protagonist</option>
              <option value="antagonist">Antagonist</option>
              <option value="supporting">Supporting</option>
              <option value="recurring">Recurring</option>
              <option value="minor">Minor</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm text-[var(--text-secondary)] mb-1">Description</label>
          <textarea
            value={form.description || ''}
            onChange={(e) => setForm(prev => ({ ...prev, description: e.target.value }))}
            className="w-full bg-[var(--bg-tertiary)] border border-[var(--border)] rounded px-3 py-2 resize-none focus:border-[var(--color-primary)] focus:outline-none"
            rows={2}
            placeholder="Brief character description"
          />
        </div>

        <div>
          <label className="block text-sm text-[var(--text-secondary)] mb-1">Visual Description</label>
          <textarea
            value={form.visual_description || ''}
            onChange={(e) => setForm(prev => ({ ...prev, visual_description: e.target.value }))}
            className="w-full bg-[var(--bg-tertiary)] border border-[var(--border)] rounded px-3 py-2 resize-none focus:border-[var(--color-primary)] focus:outline-none"
            rows={2}
            placeholder="Physical appearance, clothing, distinctive features"
          />
        </div>

        <details className="group">
          <summary className="type-label text-[var(--text-secondary)] cursor-pointer py-2 flex items-center gap-2">
            <span>PHYSICAL DETAILS</span>
            <ChevronDown size={14} className="group-open:rotate-180 transition-transform" />
          </summary>
          <div className="space-y-3 pt-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <div>
                <label className="block text-sm text-[var(--text-secondary)] mb-1">Age</label>
                <input
                  type="text"
                  value={form.age || ''}
                  onChange={(e) => setForm(prev => ({ ...prev, age: e.target.value }))}
                  className="w-full bg-[var(--bg-tertiary)] border border-[var(--border)] rounded px-3 py-2 focus:border-[var(--color-primary)] focus:outline-none"
                  placeholder="e.g. mid-30s"
                />
              </div>
              <div>
                <label className="block text-sm text-[var(--text-secondary)] mb-1">Eye Color</label>
                <input
                  type="text"
                  value={form.eye_color || ''}
                  onChange={(e) => setForm(prev => ({ ...prev, eye_color: e.target.value }))}
                  className="w-full bg-[var(--bg-tertiary)] border border-[var(--border)] rounded px-3 py-2 focus:border-[var(--color-primary)] focus:outline-none"
                  placeholder="e.g. brown"
                />
              </div>
              <div>
                <label className="block text-sm text-[var(--text-secondary)] mb-1">Hair Color / Style</label>
                <input
                  type="text"
                  value={form.hair_color_style || ''}
                  onChange={(e) => setForm(prev => ({ ...prev, hair_color_style: e.target.value }))}
                  className="w-full bg-[var(--bg-tertiary)] border border-[var(--border)] rounded px-3 py-2 focus:border-[var(--color-primary)] focus:outline-none"
                  placeholder="e.g. black, short locs"
                />
              </div>
              <div>
                <label className="block text-sm text-[var(--text-secondary)] mb-1">Height</label>
                <input
                  type="text"
                  value={form.height || ''}
                  onChange={(e) => setForm(prev => ({ ...prev, height: e.target.value }))}
                  className="w-full bg-[var(--bg-tertiary)] border border-[var(--border)] rounded px-3 py-2 focus:border-[var(--color-primary)] focus:outline-none"
                  placeholder="e.g. 5'10&quot;"
                />
              </div>
              <div>
                <label className="block text-sm text-[var(--text-secondary)] mb-1">Build</label>
                <input
                  type="text"
                  value={form.build || ''}
                  onChange={(e) => setForm(prev => ({ ...prev, build: e.target.value }))}
                  className="w-full bg-[var(--bg-tertiary)] border border-[var(--border)] rounded px-3 py-2 focus:border-[var(--color-primary)] focus:outline-none"
                  placeholder="e.g. athletic, lean"
                />
              </div>
              <div>
                <label className="block text-sm text-[var(--text-secondary)] mb-1">Skin Tone</label>
                <input
                  type="text"
                  value={form.skin_tone || ''}
                  onChange={(e) => setForm(prev => ({ ...prev, skin_tone: e.target.value }))}
                  className="w-full bg-[var(--bg-tertiary)] border border-[var(--border)] rounded px-3 py-2 focus:border-[var(--color-primary)] focus:outline-none"
                  placeholder="e.g. dark brown"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm text-[var(--text-secondary)] mb-1">Distinguishing Marks</label>
                <textarea
                  value={form.distinguishing_marks || ''}
                  onChange={(e) => setForm(prev => ({ ...prev, distinguishing_marks: e.target.value }))}
                  className="w-full bg-[var(--bg-tertiary)] border border-[var(--border)] rounded px-3 py-2 resize-none focus:border-[var(--color-primary)] focus:outline-none"
                  rows={2}
                  placeholder="Scars, tattoos, birthmarks, etc."
                />
              </div>
              <div>
                <label className="block text-sm text-[var(--text-secondary)] mb-1">Style / Wardrobe</label>
                <textarea
                  value={form.style_wardrobe || ''}
                  onChange={(e) => setForm(prev => ({ ...prev, style_wardrobe: e.target.value }))}
                  className="w-full bg-[var(--bg-tertiary)] border border-[var(--border)] rounded px-3 py-2 resize-none focus:border-[var(--color-primary)] focus:outline-none"
                  rows={2}
                  placeholder="Typical clothing, accessories, style notes"
                />
              </div>
            </div>
          </div>
        </details>

        <div>
          <label className="block text-sm text-[var(--text-secondary)] mb-1">Personality Traits</label>
          <textarea
            value={form.personality_traits || ''}
            onChange={(e) => setForm(prev => ({ ...prev, personality_traits: e.target.value }))}
            className="w-full bg-[var(--bg-tertiary)] border border-[var(--border)] rounded px-3 py-2 resize-none focus:border-[var(--color-primary)] focus:outline-none"
            rows={2}
            placeholder="Key personality characteristics"
          />
        </div>

        <div>
          <label className="block text-sm text-[var(--text-secondary)] mb-1">Background</label>
          <textarea
            value={form.background || ''}
            onChange={(e) => setForm(prev => ({ ...prev, background: e.target.value }))}
            className="w-full bg-[var(--bg-tertiary)] border border-[var(--border)] rounded px-3 py-2 resize-none focus:border-[var(--color-primary)] focus:outline-none"
            rows={3}
            placeholder="Character history and backstory"
          />
        </div>

        {/* Reference Images */}
        {!isCreating && editingId && (
          <div>
            <label className="block text-sm text-[var(--text-secondary)] mb-2">Reference Images</label>
            {imagesLoading ? (
              <div className="text-center py-4 text-[var(--text-muted)]">Loading images...</div>
            ) : (
              <ImageUploader
                entityType="character"
                entityId={editingId}
                existingImages={images}
                onImagesChange={setImages}
                maxImages={10}
              />
            )}
          </div>
        )}

        {isCreating && (
          <div className="bg-[var(--bg-tertiary)] rounded-lg p-4 text-sm text-[var(--text-secondary)]">
            <p>💡 Save the character first, then you can add reference images.</p>
          </div>
        )}

        <div className="flex gap-2">
          <button
            onClick={saveCharacter}
            disabled={!form.name?.trim()}
            className="bg-[var(--color-primary)] hover:opacity-90 disabled:bg-[var(--border)] disabled:cursor-not-allowed px-4 py-2 rounded font-medium"
          >
            {isCreating ? 'Create Character' : 'Save Changes'}
          </button>
          <button
            onClick={cancelEdit}
            className="bg-[var(--border)] hover:bg-[var(--bg-tertiary)] px-4 py-2 rounded"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )

  return (
    <div>
      <ConfirmDialog {...dialogProps} />

      {/* AI Scan Review Modal */}
      {scanResults && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-[var(--bg-primary)] border border-[var(--text-primary)] rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="type-label text-[var(--text-primary)]">
                AI SCAN RESULTS <span className="type-separator">{'//'}</span> {characters.find(c => c.id === scanResults.characterId)?.name}
              </h3>
              <button onClick={() => setScanResults(null)} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]">
                <X size={18} />
              </button>
            </div>

            <p className="type-micro text-[var(--text-muted)] mb-4">
              Based on {scanResults.descriptionsAnalyzed} description(s) and {scanResults.dialoguesAnalyzed} dialogue(s)
            </p>

            <div className="space-y-3">
              {SCAN_FIELDS.map(({ key, label }) => {
                const suggestion = scanResults.suggestions[key]
                if (suggestion === null || suggestion === undefined) return null
                const character = characters.find(c => c.id === scanResults.characterId)
                const current = character?.[key as keyof Character] as string | null

                return (
                  <div key={key} className="flex items-start gap-3 p-3 rounded border border-[var(--border)] bg-[var(--bg-secondary)]">
                    <input
                      type="checkbox"
                      checked={selectedSuggestions[key] || false}
                      onChange={(e) => setSelectedSuggestions(prev => ({ ...prev, [key]: e.target.checked }))}
                      className="mt-1 shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="type-micro text-[var(--text-secondary)] mb-1 uppercase">{label}</div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div>
                          <span className="type-micro text-[var(--text-muted)] block">Current</span>
                          <span className="text-sm text-[var(--text-secondary)]">{current || '\u2014'}</span>
                        </div>
                        <div>
                          <span className="type-micro text-[var(--text-muted)] block">Suggested</span>
                          <span className="text-sm text-[var(--text-primary)]">{suggestion}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={applySuggestions}
                className="type-meta border border-[var(--text-primary)] text-[var(--text-primary)] px-4 py-2 rounded hover:bg-[var(--bg-secondary)] transition-colors"
              >
                APPLY SELECTED
              </button>
              <button
                onClick={() => setScanResults(null)}
                className="type-meta text-[var(--text-muted)] px-4 py-2 hover:text-[var(--text-primary)]"
              >
                DISMISS
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between mb-6">
        <p className="text-[var(--text-secondary)]">{characters.length} character{characters.length !== 1 ? 's' : ''}</p>
        {!isCreating && !editingId && (
          <button
            onClick={startCreate}
            className="bg-[var(--color-primary)] hover:opacity-90 px-4 py-2 rounded font-medium"
          >
            + New Character
          </button>
        )}
      </div>

      {(isCreating || editingId) && renderForm()}

      {characters.length === 0 && !isCreating ? (
        <EmptyState
          icon="👤"
          title="No characters yet"
          description="Characters appear in autocomplete when writing dialogue. Define their visual descriptions to help your artist."
          actionLabel="Create Your First Character"
          onAction={startCreate}
        />
      ) : (
        <div className="space-y-3">
          {characters.map((character) => (
            <div
              key={character.id}
              className={`bg-[var(--bg-secondary)] border rounded-lg p-4 ${
                editingId === character.id ? 'border-[var(--color-primary)]' : 'border-[var(--border)]'
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="font-semibold text-lg">{character.name}</h3>
                    {character.role && (
                      <span className={`text-xs px-2 py-0.5 rounded ${
                        character.role === 'protagonist' ? 'bg-[var(--color-primary)]/20 text-[var(--color-primary)]' :
                        character.role === 'antagonist' ? 'bg-[var(--color-error)]/20 text-[var(--color-error)]' :
                        'bg-[var(--bg-tertiary)] text-[var(--text-secondary)]'
                      }`}>
                        {character.role}
                      </span>
                    )}
                  </div>
                  {character.description && (
                    <p className="text-[var(--text-secondary)] text-sm mb-2">{character.description}</p>
                  )}
                  {character.visual_description && (
                    <p className="text-[var(--text-muted)] text-sm">
                      <span className="text-[var(--text-secondary)]">Visual: </span>
                      {character.visual_description}
                    </p>
                  )}
                  {/* Physical details summary */}
                  {(character.age || character.build || character.height || character.distinguishing_marks) && (
                    <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1">
                      {character.age && (
                        <span className="type-micro text-[var(--text-muted)]">
                          <span className="text-[var(--text-secondary)]">Age:</span> {character.age}
                        </span>
                      )}
                      {character.build && (
                        <span className="type-micro text-[var(--text-muted)]">
                          <span className="text-[var(--text-secondary)]">Build:</span> {character.build}
                        </span>
                      )}
                      {character.height && (
                        <span className="type-micro text-[var(--text-muted)]">
                          <span className="text-[var(--text-secondary)]">Height:</span> {character.height}
                        </span>
                      )}
                      {character.distinguishing_marks && (
                        <span className="type-micro text-[var(--text-muted)]">
                          <span className="text-[var(--text-secondary)]">Marks:</span> {character.distinguishing_marks}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Scene Appearances */}
                  <div className="mt-2">
                    <button
                      onClick={() => loadAppearances(character.id)}
                      disabled={loadingAppearances === character.id}
                      className="type-micro text-[var(--accent-hover)] hover:opacity-80 disabled:opacity-50"
                    >
                      {loadingAppearances === character.id ? 'Loading...' :
                       appearancesMap[character.id] ? 'HIDE APPEARANCES' : 'SHOW APPEARANCES'}
                    </button>

                    {appearancesMap[character.id] && (
                      <div className="mt-2 space-y-2">
                        {appearancesMap[character.id].length === 0 ? (
                          <p className="type-micro text-[var(--text-muted)]">No panel appearances found</p>
                        ) : (
                          appearancesMap[character.id].map((issue: any) => (
                            <div key={issue.issueNumber} className="pl-3 border-l-2 border-[var(--border)]">
                              <p className="type-micro text-[var(--text-secondary)] font-medium">
                                ISSUE #{issue.issueNumber}{issue.issueTitle ? `: ${issue.issueTitle}` : ''} ({issue.pages.length} page{issue.pages.length !== 1 ? 's' : ''})
                              </p>
                              <div className="flex flex-wrap gap-1 mt-1">
                                {issue.pages.map((page: any) => (
                                  <a
                                    key={page.pageId}
                                    href={`/series/${seriesId}/issues/${issue.issueId}?page=${page.pageId}`}
                                    className="type-micro text-[var(--text-muted)] hover:text-[var(--text-primary)] bg-[var(--bg-tertiary)] px-2 py-0.5 rounded"
                                    title={page.sceneTitle}
                                  >
                                    Pg {page.pageNumber}
                                  </a>
                                ))}
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex gap-2 ml-4">
                  <a
                    href={`/series/${seriesId}/characters/${character.id}/voice`}
                    className="text-[var(--accent-hover)] hover:opacity-80 text-sm"
                  >
                    Voice
                  </a>
                  <button
                    onClick={() => runAIScan(character.id)}
                    disabled={scanningId === character.id}
                    className="text-[var(--accent-hover)] hover:opacity-80 text-sm disabled:opacity-50"
                  >
                    {scanningId === character.id ? 'Scanning...' : 'AI Scan'}
                  </button>
                  <button
                    onClick={() => startEdit(character)}
                    className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-sm"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => deleteCharacter(character.id)}
                    className="text-[var(--text-secondary)] hover:text-[var(--color-error)] text-sm"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
