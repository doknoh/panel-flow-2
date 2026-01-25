'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/contexts/ToastContext'

type NoteType = 'OPEN_QUESTION' | 'DECISION' | 'AI_INSIGHT' | 'GENERAL'

interface ProjectNote {
  id: string
  series_id: string
  type: NoteType
  content: string
  resolved: boolean
  resolved_at: string | null
  created_at: string
  updated_at: string
}

interface NotesListProps {
  seriesId: string
  initialNotes: ProjectNote[]
}

const NOTE_TYPES: { value: NoteType; label: string; color: string }[] = [
  { value: 'OPEN_QUESTION', label: 'Open Question', color: 'bg-amber-500' },
  { value: 'DECISION', label: 'Decision', color: 'bg-blue-500' },
  { value: 'AI_INSIGHT', label: 'AI Insight', color: 'bg-purple-500' },
  { value: 'GENERAL', label: 'General', color: 'bg-zinc-500' },
]

export default function NotesList({ seriesId, initialNotes }: NotesListProps) {
  const [notes, setNotes] = useState<ProjectNote[]>(initialNotes)
  const [filterType, setFilterType] = useState<NoteType | 'ALL'>('ALL')
  const [filterResolved, setFilterResolved] = useState<'ALL' | 'OPEN' | 'RESOLVED'>('OPEN')
  const [isCreating, setIsCreating] = useState(false)
  const [newNoteType, setNewNoteType] = useState<NoteType>('OPEN_QUESTION')
  const [newNoteContent, setNewNoteContent] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingContent, setEditingContent] = useState('')
  const { showToast } = useToast()

  const filteredNotes = notes.filter(note => {
    if (filterType !== 'ALL' && note.type !== filterType) return false
    if (filterResolved === 'OPEN' && note.resolved) return false
    if (filterResolved === 'RESOLVED' && !note.resolved) return false
    return true
  })

  const createNote = async () => {
    if (!newNoteContent.trim()) {
      showToast('Note content cannot be empty', 'error')
      return
    }

    const supabase = createClient()
    const { data, error } = await supabase
      .from('project_notes')
      .insert({
        series_id: seriesId,
        type: newNoteType,
        content: newNoteContent.trim(),
      })
      .select()
      .single()

    if (error) {
      showToast(`Failed to create note: ${error.message}`, 'error')
    } else if (data) {
      setNotes([data, ...notes])
      setNewNoteContent('')
      setIsCreating(false)
      showToast('Note created', 'success')
    }
  }

  const updateNote = async (id: string) => {
    if (!editingContent.trim()) {
      showToast('Note content cannot be empty', 'error')
      return
    }

    const supabase = createClient()
    const { error } = await supabase
      .from('project_notes')
      .update({ content: editingContent.trim() })
      .eq('id', id)

    if (error) {
      showToast(`Failed to update note: ${error.message}`, 'error')
    } else {
      setNotes(notes.map(n => n.id === id ? { ...n, content: editingContent.trim() } : n))
      setEditingId(null)
      showToast('Note updated', 'success')
    }
  }

  const toggleResolved = async (note: ProjectNote) => {
    const supabase = createClient()
    const newResolved = !note.resolved
    const { error } = await supabase
      .from('project_notes')
      .update({
        resolved: newResolved,
        resolved_at: newResolved ? new Date().toISOString() : null,
      })
      .eq('id', note.id)

    if (error) {
      showToast(`Failed to update note: ${error.message}`, 'error')
    } else {
      setNotes(notes.map(n => n.id === note.id ? {
        ...n,
        resolved: newResolved,
        resolved_at: newResolved ? new Date().toISOString() : null,
      } : n))
    }
  }

  const deleteNote = async (id: string) => {
    const confirmed = window.confirm('Delete this note?')
    if (!confirmed) return

    const supabase = createClient()
    const { error } = await supabase
      .from('project_notes')
      .delete()
      .eq('id', id)

    if (error) {
      showToast(`Failed to delete note: ${error.message}`, 'error')
    } else {
      setNotes(notes.filter(n => n.id !== id))
      showToast('Note deleted', 'success')
    }
  }

  const getTypeInfo = (type: NoteType) => {
    return NOTE_TYPES.find(t => t.value === type) || NOTE_TYPES[3]
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  }

  // Count stats
  const openCount = notes.filter(n => !n.resolved).length
  const resolvedCount = notes.filter(n => n.resolved).length

  return (
    <div>
      {/* Stats */}
      <div className="flex items-center gap-6 mb-6 text-sm">
        <span className="text-zinc-400">
          <span className="text-white font-medium">{openCount}</span> open
        </span>
        <span className="text-zinc-400">
          <span className="text-white font-medium">{resolvedCount}</span> resolved
        </span>
      </div>

      {/* Filters and Add Button */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          {/* Type filter */}
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value as NoteType | 'ALL')}
            className="bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-sm focus:border-indigo-500 focus:outline-none"
          >
            <option value="ALL">All Types</option>
            {NOTE_TYPES.map(type => (
              <option key={type.value} value={type.value}>{type.label}</option>
            ))}
          </select>

          {/* Resolved filter */}
          <div className="flex items-center gap-1 bg-zinc-800 border border-zinc-700 rounded p-0.5">
            <button
              onClick={() => setFilterResolved('OPEN')}
              className={`px-3 py-1 text-sm rounded ${
                filterResolved === 'OPEN' ? 'bg-zinc-700 text-white' : 'text-zinc-400 hover:text-white'
              }`}
            >
              Open
            </button>
            <button
              onClick={() => setFilterResolved('RESOLVED')}
              className={`px-3 py-1 text-sm rounded ${
                filterResolved === 'RESOLVED' ? 'bg-zinc-700 text-white' : 'text-zinc-400 hover:text-white'
              }`}
            >
              Resolved
            </button>
            <button
              onClick={() => setFilterResolved('ALL')}
              className={`px-3 py-1 text-sm rounded ${
                filterResolved === 'ALL' ? 'bg-zinc-700 text-white' : 'text-zinc-400 hover:text-white'
              }`}
            >
              All
            </button>
          </div>
        </div>

        <button
          onClick={() => setIsCreating(true)}
          className="bg-indigo-600 hover:bg-indigo-500 px-4 py-2 rounded text-sm font-medium"
        >
          + Add Note
        </button>
      </div>

      {/* Create Note Form */}
      {isCreating && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 mb-6">
          <div className="flex items-center gap-4 mb-3">
            <select
              value={newNoteType}
              onChange={(e) => setNewNoteType(e.target.value as NoteType)}
              className="bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-sm focus:border-indigo-500 focus:outline-none"
            >
              {NOTE_TYPES.map(type => (
                <option key={type.value} value={type.value}>{type.label}</option>
              ))}
            </select>
          </div>
          <textarea
            value={newNoteContent}
            onChange={(e) => setNewNoteContent(e.target.value)}
            placeholder="What's on your mind?"
            className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm resize-none focus:border-indigo-500 focus:outline-none mb-3"
            rows={3}
            autoFocus
          />
          <div className="flex items-center gap-2">
            <button
              onClick={createNote}
              className="bg-indigo-600 hover:bg-indigo-500 px-4 py-1.5 rounded text-sm font-medium"
            >
              Save
            </button>
            <button
              onClick={() => {
                setIsCreating(false)
                setNewNoteContent('')
              }}
              className="text-zinc-400 hover:text-white px-4 py-1.5 text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Notes List */}
      {filteredNotes.length === 0 ? (
        <div className="text-center py-12 text-zinc-500">
          {notes.length === 0
            ? 'No notes yet. Click "+ Add Note" to create one.'
            : 'No notes match your filters.'
          }
        </div>
      ) : (
        <div className="space-y-3">
          {filteredNotes.map(note => {
            const typeInfo = getTypeInfo(note.type)
            return (
              <div
                key={note.id}
                className={`bg-zinc-900 border border-zinc-800 rounded-lg p-4 ${
                  note.resolved ? 'opacity-60' : ''
                }`}
              >
                <div className="flex items-start gap-3">
                  {/* Checkbox */}
                  <button
                    onClick={() => toggleResolved(note)}
                    className={`mt-0.5 w-5 h-5 rounded border flex items-center justify-center flex-shrink-0 ${
                      note.resolved
                        ? 'bg-green-600 border-green-600 text-white'
                        : 'border-zinc-600 hover:border-zinc-500'
                    }`}
                  >
                    {note.resolved && (
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </button>

                  <div className="flex-1 min-w-0">
                    {/* Header */}
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`${typeInfo.color} text-white text-xs px-2 py-0.5 rounded`}>
                        {typeInfo.label}
                      </span>
                      <span className="text-zinc-500 text-xs">
                        {formatDate(note.created_at)}
                      </span>
                      {note.resolved && note.resolved_at && (
                        <span className="text-green-500 text-xs">
                          Resolved {formatDate(note.resolved_at)}
                        </span>
                      )}
                    </div>

                    {/* Content */}
                    {editingId === note.id ? (
                      <div>
                        <textarea
                          value={editingContent}
                          onChange={(e) => setEditingContent(e.target.value)}
                          className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm resize-none focus:border-indigo-500 focus:outline-none mb-2"
                          rows={3}
                          autoFocus
                        />
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => updateNote(note.id)}
                            className="bg-indigo-600 hover:bg-indigo-500 px-3 py-1 rounded text-xs font-medium"
                          >
                            Save
                          </button>
                          <button
                            onClick={() => setEditingId(null)}
                            className="text-zinc-400 hover:text-white px-3 py-1 text-xs"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <p className={`text-sm whitespace-pre-wrap ${note.resolved ? 'text-zinc-400 line-through' : 'text-zinc-200'}`}>
                        {note.content}
                      </p>
                    )}
                  </div>

                  {/* Actions */}
                  {editingId !== note.id && (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => {
                          setEditingId(note.id)
                          setEditingContent(note.content)
                        }}
                        className="text-zinc-500 hover:text-white p-1"
                        title="Edit"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => deleteNote(note.id)}
                        className="text-zinc-500 hover:text-red-400 p-1"
                        title="Delete"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
