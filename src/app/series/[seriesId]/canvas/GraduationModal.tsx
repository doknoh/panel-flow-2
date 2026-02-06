'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { CanvasItemData, Character, Location } from './CanvasClient'

interface GraduationModalProps {
  item: CanvasItemData
  characters: Character[]
  locations: Location[]
  seriesId: string
  onComplete: (item: CanvasItemData, targetType: 'character' | 'location', targetId: string) => void
  onClose: () => void
}

type GraduationType = 'character' | 'location'
type GraduationMode = 'new' | 'existing'

export default function GraduationModal({
  item,
  characters,
  locations,
  seriesId,
  onComplete,
  onClose,
}: GraduationModalProps) {
  const [step, setStep] = useState<'type' | 'mode' | 'form'>('type')
  const [graduationType, setGraduationType] = useState<GraduationType | null>(null)
  const [graduationMode, setGraduationMode] = useState<GraduationMode | null>(null)
  const [selectedExistingId, setSelectedExistingId] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // New entity form state
  const [newName, setNewName] = useState(item.title)
  const [newRole, setNewRole] = useState<string>('supporting')
  const [newDescription, setNewDescription] = useState(item.content || '')

  const supabase = createClient()

  const handleSelectType = (type: GraduationType) => {
    setGraduationType(type)
    setStep('mode')
  }

  const handleSelectMode = (mode: GraduationMode) => {
    setGraduationMode(mode)
    setStep('form')
  }

  const handleSubmit = async () => {
    if (!graduationType) return

    setIsSubmitting(true)
    setError(null)

    try {
      if (graduationMode === 'existing' && selectedExistingId) {
        // Link to existing entity
        onComplete(item, graduationType, selectedExistingId)
      } else if (graduationMode === 'new') {
        // Create new entity
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) throw new Error('Not authenticated')

        if (graduationType === 'character') {
          const { data: newChar, error: charError } = await supabase
            .from('characters')
            .insert({
              series_id: seriesId,
              name: newName,
              role: newRole,
              description: newDescription,
              sort_order: characters.length,
            })
            .select()
            .single()

          if (charError) throw charError
          onComplete(item, 'character', newChar.id)
        } else {
          const { data: newLoc, error: locError } = await supabase
            .from('locations')
            .insert({
              series_id: seriesId,
              name: newName,
              description: newDescription,
              sort_order: locations.length,
            })
            .select()
            .single()

          if (locError) throw locError
          onComplete(item, 'location', newLoc.id)
        }
      }
    } catch (err) {
      console.error('Graduation error:', err)
      setError(err instanceof Error ? err.message : 'Failed to graduate idea')
      setIsSubmitting(false)
    }
  }

  const existingList = graduationType === 'character' ? characters : locations

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-gray-900 border border-gray-700 rounded-xl shadow-2xl max-w-md w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-800">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-2xl">🎓</span>
              <div>
                <h2 className="text-lg font-semibold">Graduate Idea</h2>
                <p className="text-sm text-gray-400">
                  Promote &ldquo;{item.title}&rdquo; to a structured entity
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1 rounded hover:bg-gray-800 text-gray-400 hover:text-white"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          {/* Step 1: Choose type */}
          {step === 'type' && (
            <div className="space-y-4">
              <p className="text-gray-300">What should this become?</p>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => handleSelectType('character')}
                  className="p-4 bg-gray-800 hover:bg-gray-700 border border-gray-700 hover:border-purple-500 rounded-lg text-left transition-all"
                >
                  <div className="text-2xl mb-2">🎭</div>
                  <div className="font-medium">Character</div>
                  <div className="text-sm text-gray-400">A person in your story</div>
                </button>
                <button
                  onClick={() => handleSelectType('location')}
                  className="p-4 bg-gray-800 hover:bg-gray-700 border border-gray-700 hover:border-blue-500 rounded-lg text-left transition-all"
                >
                  <div className="text-2xl mb-2">📍</div>
                  <div className="font-medium">Location</div>
                  <div className="text-sm text-gray-400">A place in your world</div>
                </button>
              </div>
            </div>
          )}

          {/* Step 2: New or existing */}
          {step === 'mode' && (
            <div className="space-y-4">
              <button
                onClick={() => setStep('type')}
                className="text-sm text-gray-400 hover:text-white flex items-center gap-1"
              >
                ← Back
              </button>
              <p className="text-gray-300">
                Create a new {graduationType} or link to an existing one?
              </p>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => handleSelectMode('new')}
                  className="p-4 bg-gray-800 hover:bg-gray-700 border border-gray-700 hover:border-green-500 rounded-lg text-left transition-all"
                >
                  <div className="text-2xl mb-2">✨</div>
                  <div className="font-medium">Create New</div>
                  <div className="text-sm text-gray-400">Start fresh</div>
                </button>
                <button
                  onClick={() => handleSelectMode('existing')}
                  disabled={existingList.length === 0}
                  className="p-4 bg-gray-800 hover:bg-gray-700 border border-gray-700 hover:border-amber-500 rounded-lg text-left transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <div className="text-2xl mb-2">🔗</div>
                  <div className="font-medium">Link Existing</div>
                  <div className="text-sm text-gray-400">
                    {existingList.length > 0
                      ? `${existingList.length} available`
                      : 'None available'}
                  </div>
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Form */}
          {step === 'form' && (
            <div className="space-y-4">
              <button
                onClick={() => setStep('mode')}
                className="text-sm text-gray-400 hover:text-white flex items-center gap-1"
              >
                ← Back
              </button>

              {graduationMode === 'new' ? (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">
                      Name
                    </label>
                    <input
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
                      placeholder={graduationType === 'character' ? 'Character name' : 'Location name'}
                    />
                  </div>

                  {graduationType === 'character' && (
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-1">
                        Role
                      </label>
                      <select
                        value={newRole}
                        onChange={(e) => setNewRole(e.target.value)}
                        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
                      >
                        <option value="protagonist">Protagonist</option>
                        <option value="antagonist">Antagonist</option>
                        <option value="supporting">Supporting</option>
                        <option value="minor">Minor</option>
                      </select>
                    </div>
                  )}

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">
                      Description
                    </label>
                    <textarea
                      value={newDescription}
                      onChange={(e) => setNewDescription(e.target.value)}
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white focus:border-blue-500 focus:outline-none resize-none h-24"
                      placeholder="Notes, backstory, details..."
                    />
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-gray-300">
                    Select an existing {graduationType} to link:
                  </p>
                  <div className="max-h-60 overflow-y-auto space-y-2">
                    {existingList.map((entity) => {
                      const role = 'role' in entity ? (entity as Character).role : null
                      return (
                        <button
                          key={entity.id}
                          onClick={() => setSelectedExistingId(entity.id)}
                          className={`w-full p-3 text-left rounded-lg border transition-all ${
                            selectedExistingId === entity.id
                              ? 'bg-blue-900/50 border-blue-500'
                              : 'bg-gray-800 border-gray-700 hover:border-gray-600'
                          }`}
                        >
                          <div className="font-medium">{entity.name}</div>
                          {role && (
                            <div className="text-sm text-gray-400 capitalize">{role}</div>
                          )}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              {error && (
                <div className="p-3 bg-red-900/30 border border-red-800 rounded-lg text-red-300 text-sm">
                  {error}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        {step === 'form' && (
          <div className="px-6 py-4 border-t border-gray-800 flex justify-end gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-400 hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={
                isSubmitting ||
                (graduationMode === 'new' && !newName.trim()) ||
                (graduationMode === 'existing' && !selectedExistingId)
              }
              className="px-4 py-2 bg-green-600 hover:bg-green-500 disabled:bg-gray-700 disabled:text-gray-500 rounded-lg font-medium transition-colors"
            >
              {isSubmitting ? 'Graduating...' : '🎓 Graduate'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
