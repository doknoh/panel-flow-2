export interface DraftEditDiff {
  original: string
  edited: string
  panelId: string
  timestamp: string
}

/**
 * Session-scoped in-memory tracker for AI-drafted panel content.
 * Stores the original AI text so we can diff when the writer edits it.
 * Ephemeral — lives only in the browser tab, not persisted.
 */
export class DraftTracker {
  private originals = new Map<string, string>()

  /** Record the original AI draft for a panel */
  recordDraft(panelId: string, text: string): void {
    this.originals.set(panelId, text)
  }

  /** Get the original draft text (if tracked) */
  getOriginal(panelId: string): string | null {
    return this.originals.get(panelId) ?? null
  }

  /** Check if a panel has a tracked draft */
  hasDraft(panelId: string): boolean {
    return this.originals.has(panelId)
  }

  /**
   * Compute the edit diff between original draft and current text.
   * Returns null if the panel isn't tracked or text is unchanged.
   * Clears the tracked draft after computing (one-shot).
   */
  computeEditDiff(panelId: string, currentText: string): DraftEditDiff | null {
    const original = this.originals.get(panelId)
    if (!original) return null
    if (original === currentText) return null

    this.originals.delete(panelId)

    return {
      original,
      edited: currentText,
      panelId,
      timestamp: new Date().toISOString(),
    }
  }

  /** Clear all tracked drafts */
  clear(): void {
    this.originals.clear()
  }
}

// Singleton instance for the browser session
let _instance: DraftTracker | null = null

export function getDraftTracker(): DraftTracker {
  if (!_instance) _instance = new DraftTracker()
  return _instance
}
