'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/contexts/ToastContext'
import { Tip } from '@/components/ui/Tip'
import MirrorLinkModal from './MirrorLinkModal'

type PageType = 'SINGLE' | 'SPLASH' | 'SPREAD_LEFT' | 'SPREAD_RIGHT'

interface PageForLinking {
  id: string
  page_number: number
  page_type: PageType
  linked_page_id: string | null
  mirror_page_id?: string | null
}

interface PageTypeSelectorProps {
  pageId: string
  currentType: PageType
  currentLinkedPageId: string | null
  currentMirrorPageId?: string | null
  pageNumber?: number
  scenePages: PageForLinking[]
  allPages?: { id: string; page_number: number }[]
  onUpdate: () => void
}

const pageTypes: { value: PageType; label: string; icon: string; description: string }[] = [
  { value: 'SINGLE', label: 'Single', icon: '▢', description: 'Standard single page' },
  { value: 'SPLASH', label: 'Splash', icon: '◼', description: 'Full-page single panel' },
  { value: 'SPREAD_LEFT', label: 'Spread (L)', icon: '◧', description: 'Left side of a two-page spread' },
  { value: 'SPREAD_RIGHT', label: 'Spread (R)', icon: '◨', description: 'Right side of a two-page spread' },
]

export default function PageTypeSelector({
  pageId,
  currentType,
  currentLinkedPageId,
  currentMirrorPageId,
  pageNumber,
  scenePages,
  allPages,
  onUpdate,
}: PageTypeSelectorProps) {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const [isLinkingModalOpen, setIsLinkingModalOpen] = useState(false)
  const [isMirrorModalOpen, setIsMirrorModalOpen] = useState(false)
  const [pendingType, setPendingType] = useState<PageType | null>(null)
  const [saving, setSaving] = useState(false)
  const [flipUp, setFlipUp] = useState(false)
  const dropdownContainerRef = useRef<HTMLDivElement>(null)
  const { showToast } = useToast()

  const currentTypeInfo = pageTypes.find(t => t.value === currentType) || pageTypes[0]
  const linkedPage = scenePages.find(p => p.id === currentLinkedPageId)

  // Close dropdown when clicking outside + check viewport bounds
  useEffect(() => {
    const handleClickOutside = () => setIsDropdownOpen(false)
    if (isDropdownOpen) {
      document.addEventListener('click', handleClickOutside)

      // Check if dropdown would overflow viewport bottom
      if (dropdownContainerRef.current) {
        const rect = dropdownContainerRef.current.getBoundingClientRect()
        const dropdownHeight = pageTypes.length * 52 + 8
        const spaceBelow = window.innerHeight - rect.bottom
        setFlipUp(spaceBelow < dropdownHeight && rect.top > dropdownHeight)
      }

      return () => document.removeEventListener('click', handleClickOutside)
    }
  }, [isDropdownOpen])

  const updatePageType = async (newType: PageType, linkedPageId: string | null = null) => {
    setSaving(true)
    const supabase = createClient()

    try {
      // If changing to a spread type and we need to link
      if ((newType === 'SPREAD_LEFT' || newType === 'SPREAD_RIGHT') && linkedPageId) {
        // Update both pages in a transaction-like manner
        const linkedType = newType === 'SPREAD_LEFT' ? 'SPREAD_RIGHT' : 'SPREAD_LEFT'

        // Update the linked page first
        const { error: linkedError } = await supabase
          .from('pages')
          .update({
            page_type: linkedType,
            linked_page_id: pageId,
          })
          .eq('id', linkedPageId)

        if (linkedError) throw linkedError

        // Then update this page
        const { error } = await supabase
          .from('pages')
          .update({
            page_type: newType,
            linked_page_id: linkedPageId,
          })
          .eq('id', pageId)

        if (error) throw error

        showToast('Pages linked as spread', 'success')
      } else {
        // Simple type change (or unlinking)

        // If we're unlinking, also update the previously linked page
        if (currentLinkedPageId && (newType === 'SINGLE' || newType === 'SPLASH')) {
          await supabase
            .from('pages')
            .update({
              page_type: 'SINGLE',
              linked_page_id: null,
            })
            .eq('id', currentLinkedPageId)
        }

        const { error } = await supabase
          .from('pages')
          .update({
            page_type: newType,
            linked_page_id: null,
          })
          .eq('id', pageId)

        if (error) throw error

        showToast(`Page type set to ${newType.toLowerCase()}`, 'success')
      }

      onUpdate()
    } catch (error: any) {
      console.error('Error updating page type:', error)
      showToast(`Failed to update: ${error.message}`, 'error')
    } finally {
      setSaving(false)
      setIsDropdownOpen(false)
      setIsLinkingModalOpen(false)
      setPendingType(null)
    }
  }

  const handleTypeSelect = (type: PageType) => {
    if (type === currentType) {
      setIsDropdownOpen(false)
      return
    }

    // If selecting a spread type, show linking modal
    if (type === 'SPREAD_LEFT' || type === 'SPREAD_RIGHT') {
      setPendingType(type)
      setIsLinkingModalOpen(true)
      setIsDropdownOpen(false)
    } else {
      updatePageType(type)
    }
  }

  // Get available pages for linking (must not already be linked or be this page)
  const availablePagesForLinking = scenePages.filter(p =>
    p.id !== pageId &&
    !p.linked_page_id &&
    (p.page_type === 'SINGLE' || p.page_type === 'SPLASH')
  )

  return (
    <>
      {/* Type Selector Button */}
      <div className="relative" ref={dropdownContainerRef}>
        <Tip content={currentTypeInfo.description}>
          <button
            onClick={(e) => {
              e.stopPropagation()
              setIsDropdownOpen(!isDropdownOpen)
            }}
            disabled={saving}
            className={`hover-glow flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm font-medium transition-all ${
              currentType === 'SINGLE'
                ? 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]'
                : currentType === 'SPLASH'
                ? 'bg-[var(--accent-hover)]/30 text-[var(--accent-hover)] border border-[var(--accent-hover)]/50'
                : 'bg-[var(--color-primary)]/30 text-[var(--color-primary)] border border-[var(--color-primary)]/50'
            }`}
          >
          <span className="text-lg leading-none">{currentTypeInfo.icon}</span>
          <span className="hidden sm:inline">{currentTypeInfo.label}</span>
          {linkedPage && (
            <span className="text-xs opacity-70">→ P{linkedPage.page_number}</span>
          )}
          <svg className="w-3 h-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
          </button>
        </Tip>

        {/* Dropdown */}
        {isDropdownOpen && (
          <div
            className={`dropdown-panel absolute left-0 z-50 min-w-[180px] py-1 ${
              flipUp ? 'bottom-full mb-1' : 'top-full mt-1'
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            {pageTypes.map((type) => (
              <button
                key={type.value}
                onClick={() => handleTypeSelect(type.value)}
                className={`hover-glow w-full px-3 py-2 text-left flex items-center gap-3 transition-colors ${
                  type.value === currentType
                    ? 'active bg-[var(--bg-tertiary)]'
                    : 'hover:bg-[var(--bg-tertiary)] text-[var(--text-secondary)]'
                }`}
              >
                <span className="text-xl w-6 text-center">{type.icon}</span>
                <div>
                  <div className="text-sm font-medium">{type.label}</div>
                  <div className="text-xs opacity-50">{type.description}</div>
                </div>
                {type.value === currentType && (
                  <svg className="w-4 h-4 ml-auto text-[var(--color-primary)]" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                )}
              </button>
            ))}
            {/* Mirror link option */}
            {allPages && pageNumber != null && (
              <>
                <div className="dropdown-separator my-1" />
                <button
                  onClick={() => {
                    setIsDropdownOpen(false)
                    setIsMirrorModalOpen(true)
                  }}
                  className="hover-glow w-full px-3 py-2 text-left flex items-center gap-3 transition-colors hover:bg-[var(--bg-tertiary)] text-[var(--text-secondary)]"
                >
                  <span className="text-xl w-6 text-center">⟷</span>
                  <div>
                    <div className="text-sm font-medium">
                      {currentMirrorPageId ? 'Change Mirror' : 'Link Mirror'}
                    </div>
                    <div className="text-xs opacity-50">
                      {currentMirrorPageId
                        ? `Mirrored with Page ${allPages.find(p => p.id === currentMirrorPageId)?.page_number || '?'}`
                        : 'Side-by-side comparison page'}
                    </div>
                  </div>
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* Mirror Link Modal */}
      {isMirrorModalOpen && allPages && pageNumber != null && (
        <MirrorLinkModal
          pageId={pageId}
          pageNumber={pageNumber}
          currentMirrorId={currentMirrorPageId || null}
          availablePages={allPages.filter(p =>
            p.id !== pageId && !scenePages.find(sp => sp.id === p.id && sp.linked_page_id)
          )}
          onDone={() => {
            setIsMirrorModalOpen(false)
            onUpdate()
          }}
          onCancel={() => setIsMirrorModalOpen(false)}
        />
      )}

      {/* Linking Modal */}
      {isLinkingModalOpen && pendingType && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 modal-backdrop" onClick={() => {
          setIsLinkingModalOpen(false)
          setPendingType(null)
        }}>
          <div
            className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-xl w-full max-w-md mx-4 shadow-2xl modal-dialog"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-[var(--border)]">
              <h3 className="text-lg font-semibold">Link Spread Pages</h3>
              <p className="text-sm text-[var(--text-muted)] mt-1">
                {pendingType === 'SPREAD_LEFT'
                  ? 'Select the right-side page for this spread'
                  : 'Select the left-side page for this spread'
                }
              </p>
            </div>

            <div className="p-4 max-h-[300px] overflow-y-auto">
              {availablePagesForLinking.length === 0 ? (
                <div className="text-center py-6">
                  <div className="text-3xl mb-2 opacity-30">📄</div>
                  <p className="text-sm text-[var(--text-muted)]">
                    No available pages to link in this scene.
                    <br />
                    <span className="text-xs">Pages must be Single or Splash type and not already linked.</span>
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {availablePagesForLinking.map((page) => (
                    <button
                      key={page.id}
                      onClick={() => updatePageType(pendingType, page.id)}
                      disabled={saving}
                      className="w-full px-4 py-3 text-left bg-[var(--bg-tertiary)] hover:bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg transition-colors disabled:opacity-50"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium">Page {page.page_number}</span>
                        <span className="text-xs text-[var(--text-muted)] bg-[var(--bg-secondary)] px-2 py-0.5 rounded">
                          {page.page_type}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="p-4 border-t border-[var(--border)] flex gap-3">
              <button
                onClick={() => {
                  setIsLinkingModalOpen(false)
                  setPendingType(null)
                }}
                className="flex-1 px-4 py-2 bg-[var(--bg-tertiary)] hover:bg-[var(--bg-secondary)] rounded-lg text-sm font-medium"
              >
                Cancel
              </button>
              <button
                onClick={() => updatePageType(pendingType)}
                disabled={saving}
                className="flex-1 px-4 py-2 bg-[var(--color-primary)] hover:opacity-90 rounded-lg text-sm font-medium text-white disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Set Without Linking'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
