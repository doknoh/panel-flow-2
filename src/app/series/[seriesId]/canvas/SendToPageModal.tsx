'use client'

import { useState, useEffect, useCallback } from 'react'
import { Tip } from '@/components/ui/Tip'
import { FilingTarget } from './NotebookClient'
import { X, ChevronRight, ChevronDown, Search, FileText } from 'lucide-react'
import { useFocusTrap } from '@/hooks/useFocusTrap'

interface SendToPageModalProps {
  seriesId: string
  filingTargets: FilingTarget[]
  onLoadTargets: () => void
  onFile: (target: FilingTarget) => void
  onClose: () => void
}

export default function SendToPageModal({
  seriesId,
  filingTargets,
  onLoadTargets,
  onFile,
  onClose,
}: SendToPageModalProps) {
  const [search, setSearch] = useState('')
  const [expandedIssues, setExpandedIssues] = useState<Set<string>>(new Set())
  const [expandedScenes, setExpandedScenes] = useState<Set<string>>(new Set())
  const focusTrapRef = useFocusTrap(true)

  useEffect(() => {
    onLoadTargets()
  }, [onLoadTargets])

  // Build hierarchical structure: Issue -> Scene -> Page
  const hierarchy = useCallback(() => {
    const issues = new Map<string, {
      issueId: string
      issueNumber: number
      issueTitle: string | null
      scenes: Map<string, {
        sceneId: string
        sceneName: string | null
        pages: FilingTarget[]
      }>
    }>()

    const lowerSearch = search.toLowerCase()
    const filtered = search
      ? filingTargets.filter(t =>
          (t.sceneName?.toLowerCase() || '').includes(lowerSearch) ||
          `page ${t.pageNumber}`.includes(lowerSearch) ||
          `#${t.issueNumber}`.includes(lowerSearch) ||
          (t.issueTitle?.toLowerCase() || '').includes(lowerSearch)
        )
      : filingTargets

    for (const target of filtered) {
      if (!issues.has(target.issueId)) {
        issues.set(target.issueId, {
          issueId: target.issueId,
          issueNumber: target.issueNumber,
          issueTitle: target.issueTitle,
          scenes: new Map(),
        })
      }
      const issue = issues.get(target.issueId)!
      if (!issue.scenes.has(target.sceneId)) {
        issue.scenes.set(target.sceneId, {
          sceneId: target.sceneId,
          sceneName: target.sceneName,
          pages: [],
        })
      }
      issue.scenes.get(target.sceneId)!.pages.push(target)
    }

    return Array.from(issues.values()).sort((a, b) => a.issueNumber - b.issueNumber)
  }, [filingTargets, search])()

  const toggleIssue = (issueId: string) => {
    setExpandedIssues(prev => {
      const next = new Set(prev)
      if (next.has(issueId)) next.delete(issueId)
      else next.add(issueId)
      return next
    })
  }

  const toggleScene = (sceneId: string) => {
    setExpandedScenes(prev => {
      const next = new Set(prev)
      if (next.has(sceneId)) next.delete(sceneId)
      else next.add(sceneId)
      return next
    })
  }

  // Auto-expand when there is a single issue
  useEffect(() => {
    if (hierarchy.length === 1) {
      setExpandedIssues(new Set([hierarchy[0].issueId]))
      const sceneIds = Array.from(hierarchy[0].scenes.keys())
      setExpandedScenes(new Set(sceneIds))
    }
  }, [filingTargets.length]) // eslint-disable-line react-hooks/exhaustive-deps

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" role="dialog" aria-modal="true">
      <div ref={focusTrapRef} className="bg-[var(--bg-primary)] border border-[var(--border)] rounded-lg w-full max-w-lg mx-4 max-h-[70vh] flex flex-col shadow-lg">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
          <div className="flex items-center gap-2">
            <FileText size={16} className="text-[var(--text-muted)]" />
            <h3 className="type-label text-[var(--text-primary)]">SEND TO PAGE</h3>
          </div>
          <Tip content="Close">
            <button
              onClick={onClose}
              className="p-1 rounded hover:bg-[var(--bg-tertiary)] hover-fade text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
              aria-label="Close modal"
            >
              <X size={18} />
            </button>
          </Tip>
        </div>

        {/* Search */}
        <div className="px-4 py-3 border-b border-[var(--border)]">
          <div className="relative">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
            />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search issues, scenes, pages..."
              className="w-full bg-[var(--bg-secondary)] border border-[var(--border)] rounded px-3 py-2 pl-9 text-sm focus:border-[var(--color-primary)] focus:outline-none placeholder:text-[var(--text-muted)]"
              autoFocus
            />
          </div>
        </div>

        {/* Tree */}
        <div className="overflow-y-auto flex-1 p-4">
          {filingTargets.length === 0 ? (
            <p className="type-micro text-[var(--text-muted)] text-center py-4">Loading pages...</p>
          ) : hierarchy.length === 0 ? (
            <p className="type-micro text-[var(--text-muted)] text-center py-4">
              No pages match your search
            </p>
          ) : (
            <div className="space-y-1">
              {hierarchy.map(issue => (
                <div key={issue.issueId}>
                  {/* Issue row */}
                  <button
                    onClick={() => toggleIssue(issue.issueId)}
                    className="w-full text-left flex items-center gap-2 px-2 py-1.5 rounded hover:bg-[var(--bg-secondary)] hover-glow type-meta text-[var(--text-primary)] font-medium"
                  >
                    {expandedIssues.has(issue.issueId)
                      ? <ChevronDown size={14} />
                      : <ChevronRight size={14} />
                    }
                    <span>ISSUE #{issue.issueNumber}</span>
                    {issue.issueTitle && (
                      <span className="text-[var(--text-muted)] font-normal truncate">
                        {issue.issueTitle}
                      </span>
                    )}
                  </button>

                  {expandedIssues.has(issue.issueId) && (
                    <div className="ml-4">
                      {Array.from(issue.scenes.values()).map(scene => (
                        <div key={scene.sceneId}>
                          {/* Scene row */}
                          <button
                            onClick={() => toggleScene(scene.sceneId)}
                            className="w-full text-left flex items-center gap-2 px-2 py-1 rounded hover:bg-[var(--bg-secondary)] hover-glow type-micro text-[var(--text-secondary)]"
                          >
                            {expandedScenes.has(scene.sceneId)
                              ? <ChevronDown size={12} />
                              : <ChevronRight size={12} />
                            }
                            <span>{scene.sceneName || 'Untitled Scene'}</span>
                          </button>

                          {expandedScenes.has(scene.sceneId) && (
                            <div className="ml-6 space-y-0.5 py-1">
                              {scene.pages.map(page => (
                                <div
                                  key={page.pageId}
                                  className="flex items-center justify-between px-2 py-1.5 rounded hover:bg-[var(--bg-secondary)] group"
                                >
                                  <span className="type-micro text-[var(--text-secondary)]">
                                    Page {page.pageNumber} ({page.pageNumber % 2 === 0 ? 'LEFT' : 'RIGHT'})
                                  </span>
                                  <button
                                    onClick={() => onFile(page)}
                                    className="type-micro px-2 py-0.5 border border-[var(--text-primary)] text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] hover-lift opacity-0 group-hover:opacity-100 transition-opacity active:scale-[0.97]"
                                  >
                                    SEND
                                  </button>
                                </div>
                              ))}
                            </div>
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
      </div>
    </div>
  )
}
