'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/contexts/ToastContext'

interface Character {
  id: string
  name: string
  role: string | null
  description: string | null
  visual_description: string | null
  personality_traits: string | null
  background: string | null
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
      const { error } = await supabase.from('characters').insert({
        series_id: seriesId,
        name: trimmedName,
        role: form.role?.trim() || null,
        description: form.description?.trim() || null,
        visual_description: form.visual_description?.trim() || null,
        personality_traits: form.personality_traits?.trim() || null,
        background: form.background?.trim() || null,
      })

      if (error) {
        showToast('Failed to create character: ' + error.message, 'error')
        return
      }
      showToast('Character created', 'success')
    } else if (editingId) {
      const { error } = await supabase.from('characters').update({
        name: trimmedName,
        role: form.role?.trim() || null,
        description: form.description?.trim() || null,
        visual_description: form.visual_description?.trim() || null,
        personality_traits: form.personality_traits?.trim() || null,
        background: form.background?.trim() || null,
      }).eq('id', editingId)

      if (error) {
        showToast('Failed to update character: ' + error.message, 'error')
        return
      }
      showToast('Character updated', 'success')
    }

    cancelEdit()
    refreshCharacters()
  }

  const deleteCharacter = async (id: string) => {
    if (!confirm('Are you sure you want to delete this character?')) return

    const supabase = createClient()
    const { error } = await supabase.from('characters').delete().eq('id', id)

    if (error) {
      showToast('Failed to delete character: ' + error.message, 'error')
      return
    }

    showToast('Character deleted', 'success')
    refreshCharacters()
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
              className="w-full bg-[var(--bg-tertiary)] border border-[var(--border)] rounded px-3 py-2 focus:border-blue-500 focus:outline-none"
              placeholder="Character name"
            />
          </div>
          <div>
            <label className="block text-sm text-[var(--text-secondary)] mb-1">Role</label>
            <select
              value={form.role || ''}
              onChange={(e) => setForm(prev => ({ ...prev, role: e.target.value }))}
              className="w-full bg-[var(--bg-tertiary)] border border-[var(--border)] rounded px-3 py-2 focus:border-blue-500 focus:outline-none"
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
            className="w-full bg-[var(--bg-tertiary)] border border-[var(--border)] rounded px-3 py-2 resize-none focus:border-blue-500 focus:outline-none"
            rows={2}
            placeholder="Brief character description"
          />
        </div>

        <div>
          <label className="block text-sm text-[var(--text-secondary)] mb-1">Visual Description</label>
          <textarea
            value={form.visual_description || ''}
            onChange={(e) => setForm(prev => ({ ...prev, visual_description: e.target.value }))}
            className="w-full bg-[var(--bg-tertiary)] border border-[var(--border)] rounded px-3 py-2 resize-none focus:border-blue-500 focus:outline-none"
            rows={2}
            placeholder="Physical appearance, clothing, distinctive features"
          />
        </div>

        <div>
          <label className="block text-sm text-[var(--text-secondary)] mb-1">Personality Traits</label>
          <textarea
            value={form.personality_traits || ''}
            onChange={(e) => setForm(prev => ({ ...prev, personality_traits: e.target.value }))}
            className="w-full bg-[var(--bg-tertiary)] border border-[var(--border)] rounded px-3 py-2 resize-none focus:border-blue-500 focus:outline-none"
            rows={2}
            placeholder="Key personality characteristics"
          />
        </div>

        <div>
          <label className="block text-sm text-[var(--text-secondary)] mb-1">Background</label>
          <textarea
            value={form.background || ''}
            onChange={(e) => setForm(prev => ({ ...prev, background: e.target.value }))}
            className="w-full bg-[var(--bg-tertiary)] border border-[var(--border)] rounded px-3 py-2 resize-none focus:border-blue-500 focus:outline-none"
            rows={3}
            placeholder="Character history and backstory"
          />
        </div>

        <div className="flex gap-2">
          <button
            onClick={saveCharacter}
            disabled={!form.name?.trim()}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-[var(--border)] disabled:cursor-not-allowed px-4 py-2 rounded font-medium"
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
      <div className="flex items-center justify-between mb-6">
        <p className="text-[var(--text-secondary)]">{characters.length} character{characters.length !== 1 ? 's' : ''}</p>
        {!isCreating && !editingId && (
          <button
            onClick={startCreate}
            className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded font-medium"
          >
            + New Character
          </button>
        )}
      </div>

      {(isCreating || editingId) && renderForm()}

      {characters.length === 0 && !isCreating ? (
        <div className="text-center py-12 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg">
          <div className="text-5xl mb-4 opacity-30">👤</div>
          <h3 className="text-lg font-medium text-[var(--text-primary)] mb-2">No characters yet</h3>
          <p className="text-[var(--text-muted)] text-sm max-w-md mx-auto mb-6">
            Characters appear in autocomplete when writing dialogue.
            Define their visual descriptions to help your artist.
          </p>
          <button
            onClick={startCreate}
            className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded font-medium"
          >
            Create Your First Character
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {characters.map((character) => (
            <div
              key={character.id}
              className={`bg-[var(--bg-secondary)] border rounded-lg p-4 ${
                editingId === character.id ? 'border-blue-500' : 'border-[var(--border)]'
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="font-semibold text-lg">{character.name}</h3>
                    {character.role && (
                      <span className={`text-xs px-2 py-0.5 rounded ${
                        character.role === 'protagonist' ? 'bg-blue-900 text-blue-300' :
                        character.role === 'antagonist' ? 'bg-red-900 text-red-300' :
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
                </div>
                <div className="flex gap-2 ml-4">
                  <button
                    onClick={() => startEdit(character)}
                    className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-sm"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => deleteCharacter(character.id)}
                    className="text-[var(--text-secondary)] hover:text-red-400 text-sm"
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
