---
name: creative-writing-tool
description: |
  Architecture patterns for building hierarchical creative content management tools (novels, comics, screenplays).
  Covers: nested entity hierarchies (World → Book → Act → Chapter → Scene → Beat), cross-referenced entities
  (Characters, Locations, Events), real-time optimistic UI updates, drag-and-drop reordering, multi-view
  architecture, and Supabase/Next.js patterns. Use when building writing tools, story planners, or any
  application managing deeply nested creative content with multiple viewing perspectives.
---

# Creative Writing Tool Architecture

Patterns for building responsive, real-time creative content management tools. Derived from building Panel Flow, a comic book scripting application.

## Core Architecture

### Tech Stack
- **Frontend**: Next.js 14+ (App Router), React, TypeScript, Tailwind CSS
- **Backend**: Supabase (PostgreSQL + Auth + Real-time)
- **Drag-and-Drop**: @dnd-kit/core, @dnd-kit/sortable
- **State**: React useState/useCallback with optimistic updates (no Redux needed)

### Hierarchical Content Model

Creative content naturally forms deep hierarchies. Design for flexibility:

```
Literary World
  └── Book/Series
        └── Act (3-act, 5-act, custom)
              └── Chapter
                    └── Scene
                          └── Beat/Story Point
```

Plus cross-referenced entities that can appear across the hierarchy:
- **Characters** - linked to scenes where they appear
- **Locations** - linked to scenes where action occurs
- **Plotlines** - color-coded threads weaving through scenes
- **Events** - timeline markers referenced by scenes

### Database Schema Pattern

See [references/database-schema.md](references/database-schema.md) for complete schema.

Key principles:
1. Use `sort_order` INTEGER on all orderable entities
2. Use UUID primary keys for all tables
3. Include `created_at` and `updated_at` timestamps
4. Create junction tables for many-to-many (scene_characters, scene_locations)
5. **Match TypeScript interfaces to actual column names** (e.g., if DB has `name`, don't use `title` in code)

## Critical Patterns

### 1. Optimistic Updates (ESSENTIAL)

Never wait for database round-trips before updating UI. See [references/optimistic-updates.md](references/optimistic-updates.md).

```typescript
// Pattern: Update local state FIRST, then persist
const saveTitle = async (id: string, newTitle: string) => {
  // 1. Optimistic update - instant UI feedback
  setItems(prev => prev.map(item =>
    item.id === id ? { ...item, title: newTitle } : item
  ))

  // 2. Persist to database (background)
  const { error } = await supabase
    .from('items')
    .update({ title: newTitle })
    .eq('id', id)

  // 3. Handle errors (revert or show toast)
  if (error) {
    showToast(`Failed to save: ${error.message}`, 'error')
  }
}
```

### 2. Synchronous Drag-and-Drop Handlers (CRITICAL)

**Never make drag-end handlers async.** This causes visible lag. See [references/dnd-patterns.md](references/dnd-patterns.md).

```typescript
// WRONG - causes ~1 second lag after drop
const handleDragEnd = useCallback(async (event: DragEndEvent) => {
  setLocalOrder(newOrder)
  await Promise.all(dbUpdates)  // Even though state update is first, async context affects React
}, [])

// CORRECT - instant response
const handleDragEnd = useCallback((event: DragEndEvent) => {
  setLocalOrder(newOrder)  // Synchronous state update

  // Fire-and-forget database update using IIFE
  void (async () => {
    try {
      await Promise.all(dbUpdates)
    } catch (error) {
      setLocalOrder(null)  // Revert on error
      showToast('Failed to save', 'error')
    }
  })()
}, [])
```

### 3. Local State for Render Order

When displaying items from nested structures, use a flat local state array to control render order:

```typescript
const [localOrder, setLocalOrder] = useState<string[] | null>(null)

const items = useMemo(() => {
  if (localOrder) {
    return localOrder.map(id => itemMap.get(id)).filter(Boolean)
  }
  return deriveFromNestedStructure(data)
}, [localOrder, data, itemMap])
```

### 4. Multi-View Architecture

Same data, multiple perspectives. See [references/multi-view.md](references/multi-view.md).

| View | Purpose | Shows |
|------|---------|-------|
| **Navigator/Tree** | Structure editing | Hierarchical tree with expand/collapse |
| **Weave/Timeline** | Visual flow | Spreads, plotline colors, drag reorder |
| **Outline** | Writing focus | Summaries, intentions, beat sheets |
| **Detail** | Deep editing | Full content, panels, dialogue |

Each view shares the same state object, updated via setter function.

## Common Pitfalls

### Schema Cache (Supabase)
After adding columns, refresh PostgREST cache:
```sql
ALTER TABLE scenes ADD COLUMN scene_summary TEXT;
NOTIFY pgrst, 'reload schema';
```

### Type/Column Mismatch
If TypeScript says `Property 'name' does not exist on type 'Act'`:
- Check your interface definition
- Check actual database column name
- They must match exactly

### Nested DnD Contexts
Use unique IDs for nested DndContext components:
```tsx
<DndContext id="acts-dnd" onDragEnd={handleActDragEnd}>
  {acts.map(act => (
    <DndContext id={`scenes-${act.id}`} onDragEnd={(e) => handleSceneDragEnd(act.id, e)}>
```

### Hydration Mismatches
Wrap drag-and-drop in client-side only render:
```tsx
const [isMounted, setIsMounted] = useState(false)
useEffect(() => setIsMounted(true), [])

if (!isMounted) return <SimpleFallback />
return <DndContext>...</DndContext>
```

## File Organization

```
src/
├── app/
│   └── [entity]/[id]/
│       ├── page.tsx (main layout + state)
│       ├── NavigationTree.tsx (hierarchical view)
│       ├── Toolkit.tsx (quick actions)
│       └── [subview]/SubView.tsx
├── contexts/
│   └── ToastContext.tsx
└── lib/
    ├── supabase/client.ts
    └── export[Format].ts
```

## Reference Files

| Pattern | Reference |
|---------|-----------|
| Optimistic updates | [references/optimistic-updates.md](references/optimistic-updates.md) |
| Drag-and-drop | [references/dnd-patterns.md](references/dnd-patterns.md) |
| Multi-view architecture | [references/multi-view.md](references/multi-view.md) |
| Database schema | [references/database-schema.md](references/database-schema.md) |
