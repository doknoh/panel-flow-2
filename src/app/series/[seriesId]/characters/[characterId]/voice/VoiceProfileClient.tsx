'use client'

import { useState, useMemo, useCallback } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import {
  trainVoiceProfile,
  checkDialogueConsistency,
  generateProfileSummary,
  VoiceProfile,
  DialogueFlag,
  VocabularyLevel,
  getVocabularyLabel,
  getVocabularyColor,
} from '@/lib/character-voice'

interface Character {
  id: string
  name: string
  role: string | null
  description: string | null
}

interface Dialogue {
  id: string
  text: string
  issueNumber?: number
  pageNumber?: number
  sceneName?: string
}

interface ExistingFlag {
  id: string
  dialogue_id: string
  flag_type: string
  message: string
  flagged_word: string | null
  suggested_alternative: string | null
  severity: string
  dismissed: boolean
}

interface VoiceProfileClientProps {
  seriesId: string
  seriesTitle: string
  character: Character
  dialogues: Dialogue[]
  existingProfile: any | null
  existingFlags: ExistingFlag[]
}

export default function VoiceProfileClient({
  seriesId,
  seriesTitle,
  character,
  dialogues,
  existingProfile,
  existingFlags,
}: VoiceProfileClientProps) {
  const [profile, setProfile] = useState<VoiceProfile | null>(
    existingProfile ? {
      characterId: existingProfile.character_id,
      vocabularyLevel: existingProfile.vocabulary_level as VocabularyLevel,
      avgSentenceLength: existingProfile.avg_sentence_length,
      commonWords: existingProfile.common_words || [],
      avoidedWords: existingProfile.avoided_words || [],
      toneMarkers: existingProfile.tone_markers || [],
      speechQuirks: existingProfile.speech_quirks || [],
      sampleQuotes: existingProfile.sample_quotes || [],
      profileSummary: existingProfile.profile_summary,
      dialogueCount: existingProfile.dialogue_count,
      trainedAt: existingProfile.trained_at ? new Date(existingProfile.trained_at) : undefined,
    } : null
  )
  const [flags, setFlags] = useState<ExistingFlag[]>(existingFlags)
  const [isTraining, setIsTraining] = useState(false)
  const [isChecking, setIsChecking] = useState(false)
  const [activeTab, setActiveTab] = useState<'profile' | 'flags' | 'samples'>('profile')

  const supabase = createClient()

  // Train voice profile from dialogue
  const handleTrain = useCallback(async () => {
    if (dialogues.length < 5) {
      alert('Need at least 5 dialogue samples to train a voice profile')
      return
    }

    setIsTraining(true)

    try {
      const dialogueBlocks = dialogues.map(d => ({
        id: d.id,
        text: d.text,
        character_id: character.id,
      }))

      const newProfile = trainVoiceProfile(character.id, dialogueBlocks)
      newProfile.profileSummary = generateProfileSummary(newProfile, character.name)

      // Save to database
      const profileData = {
        character_id: character.id,
        vocabulary_level: newProfile.vocabularyLevel,
        avg_sentence_length: newProfile.avgSentenceLength,
        common_words: newProfile.commonWords,
        avoided_words: newProfile.avoidedWords,
        tone_markers: newProfile.toneMarkers,
        speech_quirks: newProfile.speechQuirks,
        sample_quotes: newProfile.sampleQuotes,
        profile_summary: newProfile.profileSummary,
        dialogue_count: newProfile.dialogueCount,
        trained_at: new Date().toISOString(),
      }

      const { error } = await supabase
        .from('character_voice_profiles')
        .upsert(profileData, { onConflict: 'character_id' })

      if (error) throw error

      setProfile(newProfile)
    } catch (err) {
      console.error('Training error:', err)
      alert('Failed to train voice profile')
    } finally {
      setIsTraining(false)
    }
  }, [dialogues, character, supabase])

  // Check all dialogues for consistency
  const handleCheckConsistency = useCallback(async () => {
    if (!profile) {
      alert('Train a voice profile first')
      return
    }

    setIsChecking(true)

    try {
      const newFlags: DialogueFlag[] = []

      for (const dialogue of dialogues) {
        const dialogueFlags = checkDialogueConsistency(
          { id: dialogue.id, text: dialogue.text, character_id: character.id },
          profile
        )
        newFlags.push(...dialogueFlags)
      }

      // Save new flags to database
      if (newFlags.length > 0) {
        const flagsToInsert = newFlags.map(f => ({
          dialogue_id: f.dialogueId,
          character_id: character.id,
          flag_type: f.flagType,
          message: f.message,
          flagged_word: f.flaggedWord,
          suggested_alternative: f.suggestedAlternative,
          severity: f.severity,
          dismissed: false,
        }))

        // First delete existing non-dismissed flags for this character
        await supabase
          .from('dialogue_flags')
          .delete()
          .eq('character_id', character.id)
          .eq('dismissed', false)

        // Then insert new ones
        const { error } = await supabase
          .from('dialogue_flags')
          .insert(flagsToInsert)

        if (error) throw error

        // Refresh flags
        const { data: refreshedFlags } = await supabase
          .from('dialogue_flags')
          .select('*')
          .eq('character_id', character.id)
          .eq('dismissed', false)

        setFlags(refreshedFlags || [])
      } else {
        // No flags found, clear existing
        await supabase
          .from('dialogue_flags')
          .delete()
          .eq('character_id', character.id)
          .eq('dismissed', false)

        setFlags([])
      }

      setActiveTab('flags')
    } catch (err) {
      console.error('Consistency check error:', err)
      alert('Failed to check consistency')
    } finally {
      setIsChecking(false)
    }
  }, [profile, dialogues, character, supabase])

  // Dismiss a flag
  const handleDismissFlag = useCallback(async (flagId: string) => {
    try {
      await supabase
        .from('dialogue_flags')
        .update({ dismissed: true, dismissed_at: new Date().toISOString() })
        .eq('id', flagId)

      setFlags(prev => prev.filter(f => f.id !== flagId))
    } catch (err) {
      console.error('Dismiss error:', err)
    }
  }, [supabase])

  // Find dialogue text for a flag
  const getDialogueForFlag = useCallback((dialogueId: string) => {
    return dialogues.find(d => d.id === dialogueId)
  }, [dialogues])

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)]">
      {/* Header */}
      <header className="border-b border-[var(--border)] bg-[var(--bg-secondary)]">
        <div className="max-w-5xl mx-auto px-4 py-4">
          <div className="flex items-center gap-3 text-sm text-[var(--text-muted)] mb-2">
            <Link href={`/series/${seriesId}`} className="hover:text-[var(--text-primary)]">
              {seriesTitle}
            </Link>
            <span>/</span>
            <Link href={`/series/${seriesId}/characters`} className="hover:text-[var(--text-primary)]">
              Characters
            </Link>
            <span>/</span>
            <span className="text-[var(--text-primary)]">{character.name}</span>
            <span>/</span>
            <span className="text-[var(--text-primary)]">Voice Profile</span>
          </div>
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-semibold flex items-center gap-2">
              <span>🗣️</span>
              Voice Profile: {character.name}
            </h1>
            <div className="flex gap-2">
              <button
                onClick={handleTrain}
                disabled={isTraining || dialogues.length < 5}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 rounded-lg font-medium transition-colors"
              >
                {isTraining ? 'Training...' : profile ? 'Retrain' : 'Train Profile'}
              </button>
              {profile && (
                <button
                  onClick={handleCheckConsistency}
                  disabled={isChecking}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-500 disabled:bg-gray-700 disabled:text-gray-500 rounded-lg font-medium transition-colors"
                >
                  {isChecking ? 'Checking...' : 'Check Consistency'}
                </button>
              )}
            </div>
          </div>
          {character.role && (
            <p className="text-[var(--text-muted)] mt-1 capitalize">{character.role}</p>
          )}
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg p-4">
            <div className="text-2xl font-bold">{dialogues.length}</div>
            <div className="text-[var(--text-muted)] text-sm">Dialogue Samples</div>
          </div>
          <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg p-4">
            <div className={`text-2xl font-bold ${profile ? 'text-green-400' : 'text-[var(--text-muted)]'}`}>
              {profile ? 'Trained' : 'Not Trained'}
            </div>
            <div className="text-[var(--text-muted)] text-sm">Profile Status</div>
          </div>
          <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg p-4">
            <div className={`text-2xl font-bold ${flags.length > 0 ? 'text-yellow-400' : 'text-green-400'}`}>
              {flags.length}
            </div>
            <div className="text-[var(--text-muted)] text-sm">Inconsistencies</div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6 border-b border-[var(--border)]">
          <button
            onClick={() => setActiveTab('profile')}
            className={`px-4 py-2 -mb-px border-b-2 transition-colors ${
              activeTab === 'profile'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]'
            }`}
          >
            Profile
          </button>
          <button
            onClick={() => setActiveTab('flags')}
            className={`px-4 py-2 -mb-px border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === 'flags'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]'
            }`}
          >
            Flags
            {flags.length > 0 && (
              <span className="px-1.5 py-0.5 text-xs bg-yellow-500/20 text-yellow-400 rounded">
                {flags.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('samples')}
            className={`px-4 py-2 -mb-px border-b-2 transition-colors ${
              activeTab === 'samples'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]'
            }`}
          >
            Sample Dialogue
          </button>
        </div>

        {/* Tab Content */}
        {activeTab === 'profile' && (
          <div className="space-y-6">
            {profile ? (
              <>
                {/* Summary */}
                {profile.profileSummary && (
                  <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg p-4">
                    <h3 className="font-medium mb-2">Summary</h3>
                    <p className="text-[var(--text-secondary)]">{profile.profileSummary}</p>
                  </div>
                )}

                <div className="grid md:grid-cols-2 gap-6">
                  {/* Vocabulary Level */}
                  <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg p-4">
                    <h3 className="font-medium mb-2">Vocabulary Level</h3>
                    <span className={`inline-block px-3 py-1 rounded-full text-sm ${getVocabularyColor(profile.vocabularyLevel)}`}>
                      {getVocabularyLabel(profile.vocabularyLevel)}
                    </span>
                  </div>

                  {/* Avg Sentence Length */}
                  <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg p-4">
                    <h3 className="font-medium mb-2">Avg Words/Line</h3>
                    <div className="text-2xl font-bold">
                      {profile.avgSentenceLength.toFixed(1)}
                    </div>
                    <div className="text-sm text-[var(--text-muted)]">
                      {profile.avgSentenceLength < 8 ? 'Short, punchy' :
                       profile.avgSentenceLength < 15 ? 'Moderate length' : 'Long, elaborate'}
                    </div>
                  </div>

                  {/* Common Words */}
                  <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg p-4">
                    <h3 className="font-medium mb-2">Common Words</h3>
                    <div className="flex flex-wrap gap-2">
                      {profile.commonWords.slice(0, 10).map((word, i) => (
                        <span key={i} className="px-2 py-1 bg-blue-500/20 text-blue-300 rounded text-sm">
                          {word}
                        </span>
                      ))}
                      {profile.commonWords.length === 0 && (
                        <span className="text-[var(--text-muted)] text-sm">None identified</span>
                      )}
                    </div>
                  </div>

                  {/* Avoided Words */}
                  <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg p-4">
                    <h3 className="font-medium mb-2">Avoided Words</h3>
                    <div className="flex flex-wrap gap-2">
                      {profile.avoidedWords.slice(0, 10).map((word, i) => (
                        <span key={i} className="px-2 py-1 bg-red-500/20 text-red-300 rounded text-sm">
                          {word}
                        </span>
                      ))}
                      {profile.avoidedWords.length === 0 && (
                        <span className="text-[var(--text-muted)] text-sm">None identified</span>
                      )}
                    </div>
                  </div>

                  {/* Tone Markers */}
                  <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg p-4">
                    <h3 className="font-medium mb-2">Tone Markers</h3>
                    <div className="flex flex-wrap gap-2">
                      {profile.toneMarkers.map((marker, i) => (
                        <span key={i} className="px-2 py-1 bg-purple-500/20 text-purple-300 rounded text-sm capitalize">
                          {marker}
                        </span>
                      ))}
                      {profile.toneMarkers.length === 0 && (
                        <span className="text-[var(--text-muted)] text-sm">None identified</span>
                      )}
                    </div>
                  </div>

                  {/* Speech Quirks */}
                  <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg p-4">
                    <h3 className="font-medium mb-2">Speech Quirks</h3>
                    <div className="flex flex-wrap gap-2">
                      {profile.speechQuirks.map((quirk, i) => (
                        <span key={i} className="px-2 py-1 bg-green-500/20 text-green-300 rounded text-sm capitalize">
                          {quirk.replace('_', ' ')}
                        </span>
                      ))}
                      {profile.speechQuirks.length === 0 && (
                        <span className="text-[var(--text-muted)] text-sm">None identified</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Sample Quotes */}
                {profile.sampleQuotes.length > 0 && (
                  <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg p-4">
                    <h3 className="font-medium mb-3">Representative Quotes</h3>
                    <div className="space-y-3">
                      {profile.sampleQuotes.map((quote, i) => (
                        <blockquote key={i} className="border-l-2 border-blue-500 pl-3 text-[var(--text-secondary)] italic">
                          &ldquo;{quote}&rdquo;
                        </blockquote>
                      ))}
                    </div>
                  </div>
                )}

                {/* Training metadata */}
                <div className="text-sm text-[var(--text-muted)]">
                  Trained on {profile.dialogueCount} dialogue samples
                  {profile.trainedAt && ` • Last trained ${profile.trainedAt.toLocaleDateString()}`}
                </div>
              </>
            ) : (
              <div className="text-center py-12">
                <div className="text-6xl mb-4 opacity-30">🗣️</div>
                <h2 className="text-xl font-medium text-[var(--text-secondary)] mb-2">No Voice Profile Yet</h2>
                <p className="text-[var(--text-muted)] mb-6">
                  {dialogues.length < 5
                    ? `Need at least 5 dialogue samples (have ${dialogues.length})`
                    : 'Click "Train Profile" to analyze dialogue patterns'}
                </p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'flags' && (
          <div className="space-y-3">
            {flags.length > 0 ? (
              flags.map(flag => {
                const dialogue = getDialogueForFlag(flag.dialogue_id)
                return (
                  <div
                    key={flag.id}
                    className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg p-4"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className={`flex items-center gap-2 mb-2 ${
                          flag.severity === 'warning' ? 'text-yellow-400' : 'text-blue-400'
                        }`}>
                          <span>{flag.severity === 'warning' ? '⚠️' : '💡'}</span>
                          <span className="font-medium">{flag.message}</span>
                        </div>
                        {dialogue && (
                          <blockquote className="text-sm text-[var(--text-secondary)] border-l-2 border-[var(--border)] pl-3 mb-2">
                            &ldquo;{dialogue.text}&rdquo;
                            {dialogue.issueNumber && (
                              <span className="text-[var(--text-muted)] ml-2">
                                (Issue #{dialogue.issueNumber}, Page {dialogue.pageNumber})
                              </span>
                            )}
                          </blockquote>
                        )}
                        {flag.flagged_word && (
                          <div className="text-sm">
                            <span className="text-[var(--text-muted)]">Flagged word: </span>
                            <span className="text-red-400">{flag.flagged_word}</span>
                            {flag.suggested_alternative && (
                              <>
                                <span className="text-[var(--text-muted)]"> → try: </span>
                                <span className="text-green-400">{flag.suggested_alternative}</span>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                      <button
                        onClick={() => handleDismissFlag(flag.id)}
                        className="text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] shrink-0"
                      >
                        Dismiss
                      </button>
                    </div>
                  </div>
                )
              })
            ) : (
              <div className="text-center py-12">
                <div className="text-6xl mb-4 opacity-30">✅</div>
                <h2 className="text-xl font-medium text-[var(--text-secondary)] mb-2">No Inconsistencies</h2>
                <p className="text-[var(--text-muted)]">
                  {profile
                    ? 'All dialogue matches the voice profile'
                    : 'Train a voice profile first to check for inconsistencies'}
                </p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'samples' && (
          <div className="space-y-3">
            {dialogues.length > 0 ? (
              dialogues.slice(0, 50).map((dialogue, i) => (
                <div
                  key={dialogue.id}
                  className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg p-3"
                >
                  <blockquote className="text-[var(--text-secondary)]">
                    &ldquo;{dialogue.text}&rdquo;
                  </blockquote>
                  {dialogue.issueNumber && (
                    <div className="mt-2 text-xs text-[var(--text-muted)]">
                      Issue #{dialogue.issueNumber}, Page {dialogue.pageNumber}
                      {dialogue.sceneName && ` • ${dialogue.sceneName}`}
                    </div>
                  )}
                </div>
              ))
            ) : (
              <div className="text-center py-12">
                <div className="text-6xl mb-4 opacity-30">💬</div>
                <h2 className="text-xl font-medium text-[var(--text-secondary)] mb-2">No Dialogue Yet</h2>
                <p className="text-[var(--text-muted)]">
                  Add dialogue for this character in your issues
                </p>
              </div>
            )}
            {dialogues.length > 50 && (
              <p className="text-center text-[var(--text-muted)] text-sm">
                Showing 50 of {dialogues.length} samples
              </p>
            )}
          </div>
        )}
      </main>
    </div>
  )
}
