# Optimistic Updates Pattern

## Core Principle

Update UI immediately, persist to database in background. Users should never wait for network round-trips.

## Table of Contents
1. [Basic Pattern](#basic-pattern)
2. [Nested State Updates](#nested-state-updates)
3. [Error Handling](#error-handling)
4. [Toast Feedback](#toast-feedback)

## Basic Pattern

```typescript
const saveField = async (id: string, field: string, value: any) => {
  // 1. IMMEDIATE: Update local state
  setState(prev => prev.map(item =>
    item.id === id ? { ...item, [field]: value } : item
  ))

  // 2. BACKGROUND: Persist to database
  try {
    const { error } = await supabase
      .from('table')
      .update({ [field]: value })
      .eq('id', id)

    if (error) throw error
    showToast('Saved', 'success')
  } catch (err) {
    showToast(`Failed: ${err.message}`, 'error')
    // Optionally revert or refresh
  }
}
```

## Nested State Updates

For deeply nested structures (acts → scenes → pages), update at the right level:

```typescript
// Updating a scene within an act within an issue
setIssue(prev => ({
  ...prev,
  acts: prev.acts.map(act => ({
    ...act,
    scenes: (act.scenes || []).map(scene =>
      scene.id === sceneId
        ? { ...scene, title: newTitle }
        : scene
    )
  }))
}))
```

### Pattern for Each Level

```typescript
// Update act
setIssue(prev => ({
  ...prev,
  acts: prev.acts.map(a => a.id === actId ? { ...a, name: newName } : a)
}))

// Update scene within act
setIssue(prev => ({
  ...prev,
  acts: prev.acts.map(a => ({
    ...a,
    scenes: (a.scenes || []).map(s =>
      s.id === sceneId ? { ...s, title: newTitle } : s
    )
  }))
}))

// Update page within scene within act
setIssue(prev => ({
  ...prev,
  acts: prev.acts.map(a => ({
    ...a,
    scenes: (a.scenes || []).map(s => ({
      ...s,
      pages: (s.pages || []).map(p =>
        p.id === pageId ? { ...p, content: newContent } : p
      )
    }))
  }))
}))
```

## Error Handling

### Strategy 1: Toast and Continue
Best for non-critical updates (title changes, summaries):

```typescript
if (error) {
  showToast(`Failed to save: ${error.message}`, 'error')
  // Don't revert - user can retry
}
```

### Strategy 2: Revert on Error
Best for critical structural changes:

```typescript
const previousState = issue // Capture before update

setIssue(newState) // Optimistic update

const { error } = await supabase.from('table').update(...)

if (error) {
  setIssue(previousState) // Revert
  showToast('Failed - changes reverted', 'error')
}
```

### Strategy 3: Refresh from Server
Best for complex multi-table operations:

```typescript
if (error) {
  showToast('Failed to save - refreshing', 'error')
  router.refresh() // Re-fetch from server
}
```

## Toast Feedback

Create a toast context for consistent feedback:

```typescript
// contexts/ToastContext.tsx
interface Toast {
  id: string
  message: string
  type: 'success' | 'error' | 'info'
}

const ToastContext = createContext<{
  showToast: (message: string, type: Toast['type']) => void
}>()

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const showToast = (message: string, type: Toast['type']) => {
    const id = Date.now().toString()
    setToasts(prev => [...prev, { id, message, type }])
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id))
    }, 3000)
  }

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <ToastContainer toasts={toasts} />
    </ToastContext.Provider>
  )
}
```

## When NOT to Use Optimistic Updates

- **Destructive operations** (delete): Always confirm first with `window.confirm()`
- **Operations requiring server validation**: Wait for response
- **Multi-user collaborative edits**: Use Supabase real-time subscriptions instead
