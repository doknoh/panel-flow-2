'use client'

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  type ReactNode,
} from 'react'
import {
  X,
  ChevronDown,
  ChevronRight,
  User,
  Mic,
  BookOpen,
  ScanLine,
  Trash2,
  Loader2,
  AlertCircle,
  RefreshCw,
  Check,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/contexts/ToastContext'
import type { CharacterWithStats } from '@/lib/character-stats'
import {
  trainVoiceProfile,
  getVocabularyLabel,
  getVocabularyColor,
  getFlagSeverityColor,
  getFlagTypeLabel,
  generateProfileSummary,
  type DialogueBlock,
} from '@/lib/character-voice'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type TabId = 'profile' | 'voice' | 'appearances' | 'scan'

interface CharacterDetailPanelProps {
  character: CharacterWithStats
  seriesId: string
  issues: Array<{ id: string; number: number; title: string }>
  allCharacters: Array<{
    id: string
    name: string
    display_name: string | null
    aliases: string[]
  }>
  isOpen: boolean
  onClose: () => void
  onCharacterUpdate: (updated: CharacterWithStats) => void
  onDelete: (id: string) => void
}

// ---------------------------------------------------------------------------
// Role options
// ---------------------------------------------------------------------------

const ROLE_OPTIONS = [
  { value: 'protagonist', label: 'Protagonist' },
  { value: 'antagonist', label: 'Antagonist' },
  { value: 'supporting', label: 'Supporting' },
  { value: 'recurring', label: 'Recurring' },
  { value: 'minor', label: 'Minor' },
] as const

// ---------------------------------------------------------------------------
// Tabs definition
// ---------------------------------------------------------------------------

const TABS: Array<{ id: TabId; label: string; icon: ReactNode }> = [
  { id: 'profile', label: 'Profile', icon: <User size={14} /> },
  { id: 'voice', label: 'Voice', icon: <Mic size={14} /> },
  { id: 'appearances', label: 'Appearances', icon: <BookOpen size={14} /> },
  { id: 'scan', label: 'AI Scan', icon: <ScanLine size={14} /> },
]

// ===========================================================================
// Sub-components
// ===========================================================================

// --- Collapsible Section ---------------------------------------------------

function CollapsibleSection({
  title,
  children,
  defaultOpen = false,
}: {
  title: string
  children: ReactNode
  defaultOpen?: boolean
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen)

  return (
    <div className="border-t border-[var(--border)] pt-3">
      <button
        onClick={() => setIsOpen(p => !p)}
        className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors w-full text-left"
      >
        {isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        {title}
      </button>
      {isOpen && <div className="mt-3 space-y-3">{children}</div>}
    </div>
  )
}

// --- Field Label -----------------------------------------------------------

function FieldLabel({ children }: { children: ReactNode }) {
  return (
    <label className="block text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1">
      {children}
    </label>
  )
}

// --- Text Input (save on blur) ---------------------------------------------

function TextInput({
  value: initialValue,
  onSave,
  placeholder,
}: {
  value: string
  onSave: (value: string) => void
  placeholder?: string
}) {
  const [value, setValue] = useState(initialValue)
  const prevCharValueRef = useRef(initialValue)

  // Sync when character changes
  useEffect(() => {
    if (initialValue !== prevCharValueRef.current) {
      setValue(initialValue)
      prevCharValueRef.current = initialValue
    }
  }, [initialValue])

  const handleBlur = () => {
    if (value !== initialValue) {
      onSave(value)
      prevCharValueRef.current = value
    }
  }

  return (
    <input
      type="text"
      value={value}
      onChange={e => setValue(e.target.value)}
      onBlur={handleBlur}
      placeholder={placeholder}
      className="w-full text-xs bg-[var(--bg-secondary)] border border-[var(--border)] rounded px-2.5 py-1.5 text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--color-primary)] focus:outline-none"
    />
  )
}

// --- Text Area (save on blur) ----------------------------------------------

function TextAreaField({
  value: initialValue,
  onSave,
  placeholder,
  rows = 3,
}: {
  value: string
  onSave: (value: string) => void
  placeholder?: string
  rows?: number
}) {
  const [value, setValue] = useState(initialValue)
  const prevCharValueRef = useRef(initialValue)

  useEffect(() => {
    if (initialValue !== prevCharValueRef.current) {
      setValue(initialValue)
      prevCharValueRef.current = initialValue
    }
  }, [initialValue])

  const handleBlur = () => {
    if (value !== initialValue) {
      onSave(value)
      prevCharValueRef.current = value
    }
  }

  return (
    <textarea
      value={value}
      onChange={e => setValue(e.target.value)}
      onBlur={handleBlur}
      placeholder={placeholder}
      rows={rows}
      className="w-full text-xs bg-[var(--bg-secondary)] border border-[var(--border)] rounded px-2.5 py-1.5 text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--color-primary)] focus:outline-none resize-y"
    />
  )
}

// --- Alias Tag Input -------------------------------------------------------

function AliasTagInput({
  aliases,
  onChange,
}: {
  aliases: string[]
  onChange: (aliases: string[]) => void
}) {
  const [input, setInput] = useState('')

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && input.trim()) {
      e.preventDefault()
      const newAlias = input.trim()
      if (!aliases.includes(newAlias)) {
        onChange([...aliases, newAlias])
      }
      setInput('')
    }
  }

  const handleRemove = (alias: string) => {
    onChange(aliases.filter(a => a !== alias))
  }

  return (
    <div>
      <FieldLabel>Aliases</FieldLabel>
      <div className="flex flex-wrap gap-1 mb-1.5">
        {aliases.map(alias => (
          <span
            key={alias}
            className="inline-flex items-center gap-1 text-xs bg-[var(--bg-tertiary)] text-[var(--text-secondary)] px-2 py-0.5 rounded-full"
          >
            {alias}
            <button
              onClick={() => handleRemove(alias)}
              className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
            >
              <X size={10} />
            </button>
          </span>
        ))}
      </div>
      <input
        type="text"
        value={input}
        onChange={e => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Type alias and press Enter"
        className="w-full text-xs bg-[var(--bg-secondary)] border border-[var(--border)] rounded px-2.5 py-1.5 text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--color-primary)] focus:outline-none"
      />
    </div>
  )
}

// ===========================================================================
// Profile Tab
// ===========================================================================

function ProfileTab({
  character,
  onFieldSave,
}: {
  character: CharacterWithStats
  onFieldSave: (field: string, value: any) => void
}) {
  return (
    <div className="space-y-4">
      {/* Identity */}
      <section className="space-y-3">
        <div>
          <FieldLabel>Name</FieldLabel>
          <TextInput
            value={character.name}
            onSave={v => onFieldSave('name', v)}
          />
        </div>
        <div>
          <FieldLabel>Display Name</FieldLabel>
          <TextInput
            value={character.display_name || ''}
            onSave={v => onFieldSave('display_name', v || null)}
            placeholder="How they appear on-page"
          />
        </div>
        <AliasTagInput
          aliases={character.aliases || []}
          onChange={v => onFieldSave('aliases', v)}
        />
        <div>
          <FieldLabel>Role</FieldLabel>
          <select
            value={character.role || 'minor'}
            onChange={e => onFieldSave('role', e.target.value)}
            className="w-full text-xs bg-[var(--bg-secondary)] border border-[var(--border)] rounded px-2.5 py-1.5 text-[var(--text-primary)] focus:border-[var(--color-primary)] focus:outline-none"
          >
            {ROLE_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </section>

      {/* Description */}
      <section>
        <FieldLabel>Physical Description</FieldLabel>
        <TextAreaField
          value={character.physical_description || ''}
          onSave={v => onFieldSave('physical_description', v || null)}
          placeholder="Describe their appearance for the artist..."
          rows={3}
        />
      </section>

      {/* Physical Details (collapsible) */}
      <CollapsibleSection title="Physical Details">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <FieldLabel>Age</FieldLabel>
            <TextInput
              value={character.age || ''}
              onSave={v => onFieldSave('age', v || null)}
              placeholder="e.g., mid-30s"
            />
          </div>
          <div>
            <FieldLabel>Eye Color</FieldLabel>
            <TextInput
              value={character.eye_color || ''}
              onSave={v => onFieldSave('eye_color', v || null)}
            />
          </div>
          <div>
            <FieldLabel>Hair</FieldLabel>
            <TextInput
              value={character.hair_color_style || ''}
              onSave={v => onFieldSave('hair_color_style', v || null)}
            />
          </div>
          <div>
            <FieldLabel>Height</FieldLabel>
            <TextInput
              value={character.height || ''}
              onSave={v => onFieldSave('height', v || null)}
            />
          </div>
          <div>
            <FieldLabel>Build</FieldLabel>
            <TextInput
              value={character.build || ''}
              onSave={v => onFieldSave('build', v || null)}
            />
          </div>
          <div>
            <FieldLabel>Skin Tone</FieldLabel>
            <TextInput
              value={character.skin_tone || ''}
              onSave={v => onFieldSave('skin_tone', v || null)}
            />
          </div>
        </div>
        <div className="mt-3">
          <FieldLabel>Distinguishing Marks</FieldLabel>
          <TextInput
            value={character.distinguishing_marks || ''}
            onSave={v => onFieldSave('distinguishing_marks', v || null)}
            placeholder="Scars, tattoos, birthmarks..."
          />
        </div>
        <div className="mt-3">
          <FieldLabel>Style / Wardrobe</FieldLabel>
          <TextInput
            value={character.style_wardrobe || ''}
            onSave={v => onFieldSave('style_wardrobe', v || null)}
            placeholder="Typical clothing, accessories..."
          />
        </div>
      </CollapsibleSection>

      {/* Background */}
      <section>
        <FieldLabel>Background</FieldLabel>
        <TextAreaField
          value={character.background || ''}
          onSave={v => onFieldSave('background', v || null)}
          placeholder="Character history and backstory..."
          rows={3}
        />
      </section>

      {/* Personality */}
      <section>
        <FieldLabel>Personality Traits</FieldLabel>
        <TextAreaField
          value={character.personality_traits || ''}
          onSave={v => onFieldSave('personality_traits', v || null)}
          placeholder="Key personality traits..."
          rows={3}
        />
      </section>

      {/* Speech */}
      <section>
        <FieldLabel>Speech Patterns</FieldLabel>
        <TextAreaField
          value={character.speech_patterns || ''}
          onSave={v => onFieldSave('speech_patterns', v || null)}
          placeholder="Verbal tics, vocabulary, rhythm..."
          rows={3}
        />
      </section>

      {/* Relationships */}
      <section>
        <FieldLabel>Relationships</FieldLabel>
        <TextAreaField
          value={character.relationships || ''}
          onSave={v => onFieldSave('relationships', v || null)}
          placeholder="Connections to other characters..."
          rows={3}
        />
      </section>

      {/* Arc */}
      <section>
        <FieldLabel>Arc Notes</FieldLabel>
        <TextAreaField
          value={character.arc_notes || ''}
          onSave={v => onFieldSave('arc_notes', v || null)}
          placeholder="Character development arc..."
          rows={3}
        />
      </section>
    </div>
  )
}

// ===========================================================================
// Voice Tab
// ===========================================================================

interface VoiceData {
  dialogues: Array<{
    id: string
    text: string
    dialogueType: string | null
    deliveryInstruction: string | null
    issueNumber: number | null
    issueTitle: string | null
    issueId: string | null
    pageNumber: number | null
    sceneName: string | null
  }>
  profile: any | null
  flags: Array<{
    id: string
    dialogue_id: string
    flag_type: string
    message: string
    flagged_word: string | null
    suggested_alternative: string | null
    severity: string
    dismissed: boolean
  }>
  dialogueCount: number
}

function VoiceTab({ character }: { character: CharacterWithStats }) {
  const [voiceData, setVoiceData] = useState<VoiceData | null>(null)
  const [voiceLoading, setVoiceLoading] = useState(false)
  const [isTraining, setIsTraining] = useState(false)
  const voiceLoadedRef = useRef(false)
  const { showToast } = useToast()

  // Reset voice data when character changes
  useEffect(() => {
    voiceLoadedRef.current = false
    setVoiceData(null)
  }, [character.id])

  // Load voice data on mount (since this only renders when tab is active)
  useEffect(() => {
    if (!voiceLoadedRef.current) {
      voiceLoadedRef.current = true
      setVoiceLoading(true)
      fetch(`/api/characters/${character.id}/voice`)
        .then(r => r.json())
        .then(data => setVoiceData(data))
        .catch(() => showToast('Failed to load voice data', 'error'))
        .finally(() => setVoiceLoading(false))
    }
  }, [character.id, showToast])

  const handleTrain = useCallback(async () => {
    if (!voiceData || voiceData.dialogues.length < 5) {
      showToast('Need at least 5 dialogues to train voice profile', 'error')
      return
    }

    setIsTraining(true)
    try {
      const blocks: DialogueBlock[] = voiceData.dialogues.map(d => ({
        id: d.id,
        text: d.text,
        dialogue_type: d.dialogueType,
      }))

      const profile = trainVoiceProfile(character.id, blocks)
      const summary = generateProfileSummary(
        profile,
        character.display_name || character.name
      )

      const supabase = createClient()
      const { error } = await supabase.from('character_voice_profiles').upsert(
        {
          character_id: character.id,
          vocabulary_level: profile.vocabularyLevel,
          avg_sentence_length: profile.avgSentenceLength,
          common_words: profile.commonWords,
          avoided_words: profile.avoidedWords,
          tone_markers: profile.toneMarkers,
          speech_quirks: profile.speechQuirks,
          sample_quotes: profile.sampleQuotes,
          dialogue_count: profile.dialogueCount,
          profile_summary: summary,
          trained_at: new Date().toISOString(),
        },
        { onConflict: 'character_id' }
      )

      if (error) throw new Error(error.message)

      const res = await fetch(`/api/characters/${character.id}/voice`)
      const newData = await res.json()
      setVoiceData(newData)
      showToast('Voice profile trained', 'success')
    } catch (err) {
      showToast(
        'Failed to train voice profile: ' +
          (err instanceof Error ? err.message : 'Unknown error'),
        'error'
      )
    } finally {
      setIsTraining(false)
    }
  }, [voiceData, character, showToast])

  const handleDismissFlag = useCallback(
    async (flagId: string) => {
      const supabase = createClient()
      const { error } = await supabase
        .from('dialogue_flags')
        .update({ dismissed: true })
        .eq('id', flagId)

      if (error) {
        showToast('Failed to dismiss flag', 'error')
        return
      }

      setVoiceData(prev => {
        if (!prev) return prev
        return {
          ...prev,
          flags: prev.flags.filter(f => f.id !== flagId),
        }
      })
    },
    [showToast]
  )

  if (voiceLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 size={20} className="animate-spin text-[var(--text-muted)]" />
        <span className="ml-2 text-sm text-[var(--text-muted)]">
          Loading voice data...
        </span>
      </div>
    )
  }

  if (!voiceData) {
    return (
      <div className="text-center py-12 text-[var(--text-muted)] text-sm">
        Failed to load voice data.
      </div>
    )
  }

  const profile = voiceData.profile
  const hasEnoughDialogue = voiceData.dialogueCount >= 5

  return (
    <div className="space-y-5">
      {/* Train button */}
      <div className="flex items-center justify-between">
        <div className="text-xs text-[var(--text-muted)]">
          {voiceData.dialogueCount} dialogue
          {voiceData.dialogueCount !== 1 ? 's' : ''} found
        </div>
        <button
          onClick={handleTrain}
          disabled={!hasEnoughDialogue || isTraining}
          className="flex items-center gap-1.5 text-xs font-medium bg-[var(--color-primary)] text-white rounded px-3 py-1.5 hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
          title={
            !hasEnoughDialogue
              ? 'Need at least 5 dialogues to train'
              : 'Train voice profile from dialogue'
          }
        >
          {isTraining ? (
            <>
              <Loader2 size={12} className="animate-spin" />
              Training...
            </>
          ) : (
            <>
              <RefreshCw size={12} />
              {profile ? 'Retrain' : 'Train'} Profile
            </>
          )}
        </button>
      </div>

      {!hasEnoughDialogue && (
        <div className="flex items-start gap-2 px-3 py-2 bg-[var(--bg-secondary)] border border-[var(--border)] rounded text-xs text-[var(--text-muted)]">
          <AlertCircle size={14} className="mt-0.5 shrink-0" />
          Need at least 5 dialogues to train a voice profile. This character has{' '}
          {voiceData.dialogueCount}.
        </div>
      )}

      {/* Trained profile */}
      {profile && (
        <section className="space-y-3">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            Trained Profile
          </h4>

          {profile.profile_summary && (
            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
              {profile.profile_summary}
            </p>
          )}

          <div className="grid grid-cols-2 gap-2">
            <div className="bg-[var(--bg-secondary)] rounded px-3 py-2">
              <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider mb-0.5">
                Vocabulary
              </div>
              <span
                className={`text-xs font-medium px-2 py-0.5 rounded ${getVocabularyColor(profile.vocabulary_level)}`}
              >
                {getVocabularyLabel(profile.vocabulary_level)}
              </span>
            </div>
            <div className="bg-[var(--bg-secondary)] rounded px-3 py-2">
              <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider mb-0.5">
                Avg. Sentence
              </div>
              <div className="text-xs font-medium text-[var(--text-primary)]">
                {profile.avg_sentence_length} words
              </div>
            </div>
          </div>

          {profile.common_words?.length > 0 && (
            <div>
              <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider mb-1">
                Common Words
              </div>
              <div className="flex flex-wrap gap-1">
                {profile.common_words.map((w: string) => (
                  <span
                    key={w}
                    className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--bg-tertiary)] text-[var(--text-secondary)]"
                  >
                    {w}
                  </span>
                ))}
              </div>
            </div>
          )}

          {profile.avoided_words?.length > 0 && (
            <div>
              <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider mb-1">
                Avoided Words
              </div>
              <div className="flex flex-wrap gap-1">
                {profile.avoided_words.map((w: string) => (
                  <span
                    key={w}
                    className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--color-error)]/10 text-[var(--color-error)]"
                  >
                    {w}
                  </span>
                ))}
              </div>
            </div>
          )}

          {profile.tone_markers?.length > 0 && (
            <div>
              <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider mb-1">
                Tone Markers
              </div>
              <div className="flex flex-wrap gap-1">
                {profile.tone_markers.map((m: string) => (
                  <span
                    key={m}
                    className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--bg-tertiary)] text-[var(--text-secondary)]"
                  >
                    {m}
                  </span>
                ))}
              </div>
            </div>
          )}

          {profile.speech_quirks?.length > 0 && (
            <div>
              <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider mb-1">
                Speech Quirks
              </div>
              <ul className="space-y-0.5">
                {profile.speech_quirks.map((q: string) => (
                  <li
                    key={q}
                    className="text-xs text-[var(--text-secondary)] pl-3 relative before:content-[''] before:absolute before:left-0 before:top-[7px] before:w-1.5 before:h-1.5 before:bg-[var(--text-muted)] before:rounded-full"
                  >
                    {q}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {profile.sample_quotes?.length > 0 && (
            <div>
              <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider mb-1">
                Sample Quotes
              </div>
              <div className="space-y-1">
                {profile.sample_quotes.map((q: string, i: number) => (
                  <p
                    key={i}
                    className="text-xs text-[var(--text-secondary)] italic border-l-2 border-[var(--border)] pl-2"
                  >
                    &ldquo;{q}&rdquo;
                  </p>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {/* Dialogue flags */}
      {voiceData.flags.length > 0 && (
        <section className="space-y-2">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            Dialogue Flags ({voiceData.flags.length})
          </h4>
          {voiceData.flags.map(flag => (
            <div
              key={flag.id}
              className="flex items-start gap-2 px-3 py-2 bg-[var(--bg-secondary)] border border-[var(--border)] rounded"
            >
              <AlertCircle
                size={14}
                className={`mt-0.5 shrink-0 ${getFlagSeverityColor(flag.severity as any)}`}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                    {getFlagTypeLabel(flag.flag_type as any)}
                  </span>
                  <span
                    className={`text-[10px] font-medium ${getFlagSeverityColor(flag.severity as any)}`}
                  >
                    {flag.severity}
                  </span>
                </div>
                <p className="text-xs text-[var(--text-secondary)]">
                  {flag.message}
                </p>
                {flag.suggested_alternative && (
                  <p className="text-[10px] text-[var(--text-muted)] mt-0.5">
                    Suggestion: {flag.suggested_alternative}
                  </p>
                )}
              </div>
              <button
                onClick={() => handleDismissFlag(flag.id)}
                className="shrink-0 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                title="Dismiss flag"
              >
                <X size={14} />
              </button>
            </div>
          ))}
        </section>
      )}

      {/* Sample dialogues */}
      {voiceData.dialogues.length > 0 && (
        <section className="space-y-2">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            Sample Dialogue ({voiceData.dialogues.length})
          </h4>
          <div className="max-h-64 overflow-y-auto space-y-1.5 pr-1">
            {voiceData.dialogues.slice(0, 30).map(d => (
              <div
                key={d.id}
                className="px-3 py-2 bg-[var(--bg-secondary)] border border-[var(--border)] rounded"
              >
                <p className="text-xs text-[var(--text-primary)] leading-relaxed">
                  &ldquo;{d.text}&rdquo;
                </p>
                {(d.issueNumber || d.pageNumber) && (
                  <p className="text-[10px] text-[var(--text-muted)] mt-1">
                    {d.issueNumber != null && `Issue #${d.issueNumber}`}
                    {d.pageNumber != null && ` / Page ${d.pageNumber}`}
                    {d.sceneName && ` / ${d.sceneName}`}
                  </p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

// ===========================================================================
// Appearances Tab
// ===========================================================================

function AppearancesTab({
  character,
  issues,
}: {
  character: CharacterWithStats
  issues: Array<{ id: string; number: number; title: string }>
}) {
  const breakdown = character.stats?.issueBreakdown
  const hasData = breakdown && Object.keys(breakdown).length > 0

  if (!hasData) {
    return (
      <div className="text-center py-12">
        <BookOpen
          size={24}
          className="mx-auto mb-2 text-[var(--text-muted)]"
        />
        <p className="text-sm text-[var(--text-muted)]">
          No appearance data.
        </p>
        <p className="text-xs text-[var(--text-muted)] mt-1">
          Click Refresh Stats in the toolbar to compute.
        </p>
      </div>
    )
  }

  // Sort by issue number
  const entries = Object.entries(breakdown)
    .map(([issueId, data]) => {
      const issue = issues.find(i => i.id === issueId)
      return { issueId, issue, data }
    })
    .sort((a, b) => (a.issue?.number ?? 0) - (b.issue?.number ?? 0))

  return (
    <div className="space-y-3">
      {character.first_appearance && (
        <div className="flex items-start gap-2 px-3 py-2 bg-[var(--bg-secondary)] border border-[var(--border)] rounded text-xs text-[var(--text-muted)]">
          <BookOpen size={14} className="mt-0.5 shrink-0" />
          First appearance: {character.first_appearance}
        </div>
      )}

      <div className="text-xs text-[var(--text-muted)] mb-1">
        Appears in {entries.length} issue{entries.length !== 1 ? 's' : ''}
      </div>

      {entries.map(({ issueId, issue, data }) => (
        <div
          key={issueId}
          className="px-3 py-2.5 bg-[var(--bg-secondary)] border border-[var(--border)] rounded"
        >
          <div className="flex items-baseline justify-between mb-1">
            <h4 className="text-sm font-semibold text-[var(--text-primary)]">
              Issue #{issue?.number ?? '?'}
            </h4>
            {issue?.title && (
              <span className="text-xs text-[var(--text-muted)] truncate ml-2">
                {issue.title}
              </span>
            )}
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-baseline gap-1">
              <span className="text-lg font-bold text-[var(--text-primary)] tabular-nums">
                {data.panels}
              </span>
              <span className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">
                panels
              </span>
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-lg font-bold text-[var(--text-secondary)] tabular-nums">
                {data.dialogues}
              </span>
              <span className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">
                dialogues
              </span>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

// ===========================================================================
// AI Scan Tab
// ===========================================================================

const SCAN_FIELDS: Array<{ key: string; label: string }> = [
  { key: 'age', label: 'Age' },
  { key: 'eye_color', label: 'Eye Color' },
  { key: 'hair_color_style', label: 'Hair Color & Style' },
  { key: 'height', label: 'Height' },
  { key: 'build', label: 'Build' },
  { key: 'skin_tone', label: 'Skin Tone' },
  { key: 'distinguishing_marks', label: 'Distinguishing Marks' },
  { key: 'style_wardrobe', label: 'Style / Wardrobe' },
  { key: 'physical_description', label: 'Physical Description' },
  { key: 'personality_traits', label: 'Personality Traits' },
  { key: 'speech_patterns', label: 'Speech Patterns' },
  { key: 'relationships', label: 'Relationships' },
  { key: 'arc_notes', label: 'Arc Notes' },
]

interface ScanResult {
  suggestions: Record<string, string | null> | null
  descriptionsAnalyzed: number
  dialoguesAnalyzed: number
  message?: string
}

function AIScanTab({
  character,
  seriesId,
  onCharacterUpdate,
}: {
  character: CharacterWithStats
  seriesId: string
  onCharacterUpdate: (updated: CharacterWithStats) => void
}) {
  const [scanResult, setScanResult] = useState<ScanResult | null>(null)
  const [isScanning, setIsScanning] = useState(false)
  const [checkedFields, setCheckedFields] = useState<Set<string>>(new Set())
  const [isApplying, setIsApplying] = useState(false)
  const { showToast } = useToast()

  // Reset scan results when character changes
  useEffect(() => {
    setScanResult(null)
    setCheckedFields(new Set())
  }, [character.id])

  const handleScan = useCallback(async () => {
    setIsScanning(true)
    setScanResult(null)
    setCheckedFields(new Set())

    try {
      const res = await fetch('/api/ai/character-scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          characterId: character.id,
          seriesId,
        }),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Scan failed')
      }

      const data: ScanResult = await res.json()
      setScanResult(data)

      // Pre-check fields that are currently empty on the character
      if (data.suggestions) {
        const preChecked = new Set<string>()
        for (const field of SCAN_FIELDS) {
          const currentVal = (character as any)[field.key]
          const suggestedVal = data.suggestions[field.key]
          if (
            suggestedVal &&
            (!currentVal ||
              (typeof currentVal === 'string' && currentVal.trim() === ''))
          ) {
            preChecked.add(field.key)
          }
        }
        setCheckedFields(preChecked)
      }
    } catch (err) {
      showToast(
        'Scan failed: ' +
          (err instanceof Error ? err.message : 'Unknown error'),
        'error'
      )
    } finally {
      setIsScanning(false)
    }
  }, [character, seriesId, showToast])

  const handleApply = useCallback(async () => {
    if (!scanResult?.suggestions || checkedFields.size === 0) return

    setIsApplying(true)
    try {
      const updates: Record<string, string | null> = {}
      for (const fieldKey of checkedFields) {
        const val = scanResult.suggestions[fieldKey]
        if (val !== undefined) {
          updates[fieldKey] = val
        }
      }

      const supabase = createClient()
      const { error } = await supabase
        .from('characters')
        .update(updates)
        .eq('id', character.id)

      if (error) throw new Error(error.message)

      onCharacterUpdate({ ...character, ...updates } as CharacterWithStats)
      showToast(`Applied ${checkedFields.size} field(s)`, 'success')
    } catch (err) {
      showToast(
        'Failed to apply: ' +
          (err instanceof Error ? err.message : 'Unknown error'),
        'error'
      )
    } finally {
      setIsApplying(false)
    }
  }, [scanResult, checkedFields, character, onCharacterUpdate, showToast])

  const toggleField = (key: string) => {
    setCheckedFields(prev => {
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }

  // Initial state: show scan button
  if (!scanResult && !isScanning) {
    return (
      <div className="text-center py-12">
        <ScanLine
          size={32}
          className="mx-auto mb-3 text-[var(--text-muted)]"
        />
        <p className="text-sm text-[var(--text-secondary)] mb-1">
          AI Manuscript Scan
        </p>
        <p className="text-xs text-[var(--text-muted)] mb-4 max-w-[280px] mx-auto">
          Analyze the manuscript to discover physical details, personality
          traits, speech patterns, and more for this character.
        </p>
        <button
          onClick={handleScan}
          className="inline-flex items-center gap-1.5 text-xs font-medium bg-[var(--color-primary)] text-white rounded px-4 py-2 hover:opacity-90 transition-opacity"
        >
          <ScanLine size={14} />
          Scan Manuscript
        </button>
      </div>
    )
  }

  // Scanning state
  if (isScanning) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <Loader2
          size={24}
          className="animate-spin text-[var(--color-primary)] mb-3"
        />
        <p className="text-sm text-[var(--text-secondary)]">
          Scanning manuscript...
        </p>
        <p className="text-xs text-[var(--text-muted)] mt-1">
          This may take a few seconds.
        </p>
      </div>
    )
  }

  // No content found
  if (scanResult && !scanResult.suggestions) {
    return (
      <div className="text-center py-12">
        <AlertCircle
          size={24}
          className="mx-auto mb-2 text-[var(--text-muted)]"
        />
        <p className="text-sm text-[var(--text-muted)]">
          {scanResult.message ||
            'No script content found for this character.'}
        </p>
        <button
          onClick={handleScan}
          className="mt-4 inline-flex items-center gap-1.5 text-xs font-medium text-[var(--color-primary)] hover:underline"
        >
          <RefreshCw size={12} />
          Try Again
        </button>
      </div>
    )
  }

  // Results
  const suggestions = scanResult!.suggestions!
  const suggestedFields = SCAN_FIELDS.filter(
    f => suggestions[f.key] != null && suggestions[f.key] !== ''
  )

  return (
    <div className="space-y-4">
      {/* Stats line */}
      <div className="flex items-center justify-between">
        <div className="text-xs text-[var(--text-muted)]">
          Analyzed {scanResult!.descriptionsAnalyzed} description
          {scanResult!.descriptionsAnalyzed !== 1 ? 's' : ''},{' '}
          {scanResult!.dialoguesAnalyzed} dialogue
          {scanResult!.dialoguesAnalyzed !== 1 ? 's' : ''}
        </div>
        <button
          onClick={handleScan}
          className="flex items-center gap-1 text-xs text-[var(--color-primary)] hover:underline"
        >
          <RefreshCw size={12} />
          Rescan
        </button>
      </div>

      {suggestedFields.length === 0 ? (
        <div className="text-center py-8 text-sm text-[var(--text-muted)]">
          No suggestions found from the manuscript.
        </div>
      ) : (
        <>
          {/* Suggestion checklist */}
          <div className="space-y-2">
            {suggestedFields.map(field => {
              const currentVal = (character as any)[field.key]
              const suggestedVal = suggestions[field.key]
              const isChecked = checkedFields.has(field.key)
              const isEmpty =
                !currentVal ||
                (typeof currentVal === 'string' &&
                  currentVal.trim() === '')

              return (
                <div
                  key={field.key}
                  className={`px-3 py-2.5 border rounded cursor-pointer transition-colors ${
                    isChecked
                      ? 'border-[var(--color-primary)]/50 bg-[var(--color-primary)]/5'
                      : 'border-[var(--border)] bg-[var(--bg-secondary)]'
                  }`}
                  onClick={() => toggleField(field.key)}
                >
                  <div className="flex items-start gap-2">
                    <div
                      className={`mt-0.5 shrink-0 w-4 h-4 rounded border flex items-center justify-center transition-colors ${
                        isChecked
                          ? 'bg-[var(--color-primary)] border-[var(--color-primary)]'
                          : 'border-[var(--text-secondary)] bg-[var(--bg-primary)]'
                      }`}
                    >
                      {isChecked && (
                        <Check size={10} className="text-white" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-xs font-semibold text-[var(--text-primary)]">
                          {field.label}
                        </span>
                        {isEmpty && (
                          <span className="text-[10px] px-1.5 py-0 rounded bg-[var(--color-primary)]/10 text-[var(--color-primary)]">
                            NEW
                          </span>
                        )}
                      </div>
                      {!isEmpty && (
                        <p className="text-[10px] text-[var(--text-muted)] line-through mb-0.5 truncate">
                          {currentVal}
                        </p>
                      )}
                      <p className="text-xs text-[var(--text-secondary)]">
                        {suggestedVal}
                      </p>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Apply button */}
          <button
            onClick={handleApply}
            disabled={checkedFields.size === 0 || isApplying}
            className="w-full flex items-center justify-center gap-1.5 text-xs font-medium bg-[var(--color-primary)] text-white rounded px-4 py-2 hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isApplying ? (
              <>
                <Loader2 size={12} className="animate-spin" />
                Applying...
              </>
            ) : (
              <>
                <Check size={14} />
                Apply {checkedFields.size} Selected
              </>
            )}
          </button>
        </>
      )}
    </div>
  )
}

// ===========================================================================
// Main Panel
// ===========================================================================

export default function CharacterDetailPanel({
  character,
  seriesId,
  issues,
  allCharacters,
  isOpen,
  onClose,
  onCharacterUpdate,
  onDelete,
}: CharacterDetailPanelProps) {
  const [activeTab, setActiveTab] = useState<TabId>('profile')
  const panelRef = useRef<HTMLDivElement>(null)

  // Handle save for profile fields
  const handleFieldSave = useCallback(
    async (field: string, value: any) => {
      const supabase = createClient()
      const { error } = await supabase
        .from('characters')
        .update({ [field]: value })
        .eq('id', character.id)

      if (error) {
        console.error(`Failed to save ${field}:`, error.message)
        return
      }

      onCharacterUpdate({ ...character, [field]: value })
    },
    [character, onCharacterUpdate]
  )

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 bg-black/30 z-40 transition-opacity duration-300 ${
          isOpen
            ? 'opacity-100 pointer-events-auto'
            : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
      />

      {/* Panel */}
      <div
        ref={panelRef}
        className={`fixed right-0 top-0 h-screen w-[480px] max-w-[90vw] bg-[var(--bg-primary)] border-l border-[var(--border)] shadow-2xl z-50 flex flex-col transition-transform duration-300 ease-out ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--border)] shrink-0">
          <h2 className="font-bold text-base text-[var(--text-primary)] truncate">
            {character.display_name || character.name}
          </h2>
          <div className="flex items-center gap-1">
            <button
              onClick={() => onDelete(character.id)}
              className="w-7 h-7 rounded flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--color-error)] hover:bg-[var(--color-error)]/10 transition-colors"
              title="Delete character"
            >
              <Trash2 size={14} />
            </button>
            <button
              onClick={onClose}
              className="w-7 h-7 rounded flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] transition-colors"
              title="Close panel"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Tab bar */}
        <div className="flex border-b border-[var(--border)] px-5 shrink-0">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-[var(--color-primary)] text-[var(--color-primary)]'
                  : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {activeTab === 'profile' && (
            <ProfileTab
              character={character}
              onFieldSave={handleFieldSave}
            />
          )}
          {activeTab === 'voice' && <VoiceTab character={character} />}
          {activeTab === 'appearances' && (
            <AppearancesTab character={character} issues={issues} />
          )}
          {activeTab === 'scan' && (
            <AIScanTab
              character={character}
              seriesId={seriesId}
              onCharacterUpdate={onCharacterUpdate}
            />
          )}
        </div>
      </div>
    </>
  )
}
