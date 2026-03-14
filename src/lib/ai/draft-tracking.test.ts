import { describe, it, expect } from 'vitest'
import { DraftTracker } from './draft-tracking'

describe('DraftTracker', () => {
  it('stores and retrieves original draft text', () => {
    const tracker = new DraftTracker()
    tracker.recordDraft('panel-1', 'Wide shot of the city at dawn.')
    expect(tracker.getOriginal('panel-1')).toBe('Wide shot of the city at dawn.')
  })

  it('computes diff between original and edited text', () => {
    const tracker = new DraftTracker()
    tracker.recordDraft('panel-1', 'Wide shot of the city at dawn.')
    const diff = tracker.computeEditDiff('panel-1', 'Close on MARSHALL standing at the window, dawn light.')
    expect(diff).not.toBeNull()
    expect(diff!.original).toBe('Wide shot of the city at dawn.')
    expect(diff!.edited).toBe('Close on MARSHALL standing at the window, dawn light.')
    expect(diff!.panelId).toBe('panel-1')
  })

  it('returns null diff for untracked panels', () => {
    const tracker = new DraftTracker()
    const diff = tracker.computeEditDiff('unknown', 'some text')
    expect(diff).toBeNull()
  })

  it('returns null diff when text is unchanged', () => {
    const tracker = new DraftTracker()
    tracker.recordDraft('panel-1', 'Same text.')
    const diff = tracker.computeEditDiff('panel-1', 'Same text.')
    expect(diff).toBeNull()
  })

  it('clears tracked draft after diff is computed', () => {
    const tracker = new DraftTracker()
    tracker.recordDraft('panel-1', 'Original.')
    tracker.computeEditDiff('panel-1', 'Edited.')
    expect(tracker.getOriginal('panel-1')).toBeNull()
  })
})
