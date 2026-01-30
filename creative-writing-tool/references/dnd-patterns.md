# Drag-and-Drop Patterns

Using @dnd-kit for smooth, accessible drag-and-drop in React.

## Table of Contents
1. [Setup](#setup)
2. [Critical: Sync Handlers](#critical-sync-handlers)
3. [Local State for Render Order](#local-state-for-render-order)
4. [Nested DnD Contexts](#nested-dnd-contexts)
5. [Multi-Select Drag](#multi-select-drag)
6. [Hydration Safety](#hydration-safety)

## Setup

```bash
npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
```

```typescript
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
```

### SortableItem Component

```typescript
function SortableItem({ id, children }: { id: string; children: React.ReactNode }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : undefined,
  }

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      {children}
    </div>
  )
}
```

## Critical: Sync Handlers

**THE MOST IMPORTANT PATTERN IN THIS FILE**

Never make `handleDragEnd` an async function. Even if state updates come before awaits, the async context causes React to schedule updates differently, resulting in ~1 second visible lag.

### WRONG - Causes Lag

```typescript
const handleDragEnd = useCallback(async (event: DragEndEvent) => {
  const { active, over } = event
  if (!over || active.id === over.id) return

  const newOrder = arrayMove(items, oldIndex, newIndex)
  setItems(newOrder)  // This update is delayed!

  await Promise.all(
    newOrder.map((item, i) =>
      supabase.from('items').update({ sort_order: i }).eq('id', item.id)
    )
  )
}, [items])
```

### CORRECT - Instant Response

```typescript
const handleDragEnd = useCallback((event: DragEndEvent) => {
  const { active, over } = event
  if (!over || active.id === over.id) return

  const newOrder = arrayMove(items, oldIndex, newIndex)
  setItems(newOrder)  // Instant!

  // Fire-and-forget IIFE for database
  void (async () => {
    try {
      await Promise.all(
        newOrder.map((item, i) =>
          supabase.from('items').update({ sort_order: i }).eq('id', item.id)
        )
      )
    } catch (error) {
      showToast('Failed to save order', 'error')
      // Optionally revert
    }
  })()
}, [items])
```

## Local State for Render Order

When items come from nested structures, use local state to control render order directly:

```typescript
// Items derived from nested structure: issue.acts[].scenes[].pages[]
const [localPageOrder, setLocalPageOrder] = useState<string[] | null>(null)

// Base pages from nested structure
const baseFlatPages = useMemo(() => {
  return issue.acts.flatMap(act =>
    act.scenes.flatMap(scene =>
      scene.pages.map(page => ({ ...page, actId: act.id, sceneId: scene.id }))
    )
  )
}, [issue])

// Map for quick lookup
const pageMap = useMemo(() => {
  const map = new Map()
  baseFlatPages.forEach(p => map.set(p.id, p))
  return map
}, [baseFlatPages])

// Final order: local state if set, otherwise derived
const flatPages = useMemo(() => {
  if (localPageOrder) {
    return localPageOrder.map(id => pageMap.get(id)).filter(Boolean)
  }
  return baseFlatPages
}, [localPageOrder, baseFlatPages, pageMap])

// In handleDragEnd:
const handleDragEnd = useCallback((event) => {
  // ... calculate newOrder
  setLocalPageOrder(newOrder.map(p => p.id))  // Instant visual update
  // ... fire-and-forget DB update
}, [])
```

## Nested DnD Contexts

For hierarchical structures (acts containing scenes containing pages), use nested contexts with unique IDs:

```tsx
<DndContext
  id="acts-dnd"
  sensors={sensors}
  collisionDetection={closestCenter}
  onDragEnd={handleActDragEnd}
>
  <SortableContext items={acts.map(a => a.id)} strategy={verticalListSortingStrategy}>
    {acts.map(act => (
      <SortableItem key={act.id} id={act.id}>
        {/* Nested context for scenes */}
        <DndContext
          id={`scenes-${act.id}`}
          sensors={sensors}
          onDragEnd={(e) => handleSceneDragEnd(act.id, e)}
        >
          <SortableContext items={act.scenes.map(s => s.id)}>
            {act.scenes.map(scene => (
              <SortableItem key={scene.id} id={scene.id}>
                {/* Scene content */}
              </SortableItem>
            ))}
          </SortableContext>
        </DndContext>
      </SortableItem>
    ))}
  </SortableContext>
</DndContext>
```

## Multi-Select Drag

Allow users to select multiple items and drag them together:

```typescript
const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

const handleDragEnd = useCallback((event) => {
  const { active } = event

  // Get items to move
  let itemsToMove: string[]
  if (selectedIds.has(active.id) && selectedIds.size > 1) {
    // Moving multiple selected items - maintain relative order
    itemsToMove = items
      .filter(item => selectedIds.has(item.id))
      .map(item => item.id)
  } else {
    itemsToMove = [active.id]
  }

  // Remove from current positions
  const remaining = items.filter(item => !itemsToMove.includes(item.id))

  // Insert at new position
  const insertIdx = remaining.findIndex(item => item.id === over.id)
  remaining.splice(insertIdx, 0, ...items.filter(item => itemsToMove.includes(item.id)))

  setItems(remaining)
  setSelectedIds(new Set())  // Clear selection after move
}, [items, selectedIds])
```

## Hydration Safety

Wrap DnD in client-only render to avoid Next.js hydration mismatches:

```typescript
const [isMounted, setIsMounted] = useState(false)

useEffect(() => {
  setIsMounted(true)
}, [])

if (!isMounted) {
  // Simple SSR fallback without drag functionality
  return (
    <div>
      {items.map(item => (
        <div key={item.id}>{item.title}</div>
      ))}
    </div>
  )
}

return (
  <DndContext ...>
    {/* Full drag-and-drop UI */}
  </DndContext>
)
```

## Sensors Configuration

```typescript
const sensors = useSensors(
  useSensor(PointerSensor, {
    activationConstraint: {
      distance: 8,  // Pixels before drag starts (prevents accidental drags)
    },
  }),
  useSensor(KeyboardSensor, {
    coordinateGetter: sortableKeyboardCoordinates,
  })
)
```
