# Multi-View Architecture

Display the same underlying data through multiple perspectives, each optimized for different tasks.

## Table of Contents
1. [Core Concept](#core-concept)
2. [View Types](#view-types)
3. [Shared State Pattern](#shared-state-pattern)
4. [URL-Based View Switching](#url-based-view-switching)
5. [View-Specific Components](#view-specific-components)

## Core Concept

Creative content benefits from multiple viewing angles:
- **Structural view**: See the hierarchy, reorder acts/chapters
- **Flow view**: See how content flows across pages/spreads
- **Outline view**: Focus on summaries and intentions
- **Detail view**: Edit actual content deeply

All views share the same data; changes in one reflect in all.

## View Types

### 1. Navigator/Tree View
Hierarchical expandable tree for structure management.

**Best for**: Adding/removing/reordering structural elements, seeing the big picture

```tsx
// NavigationTree.tsx
export function NavigationTree({ data, setData, onSelect }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  return (
    <DndContext onDragEnd={handleReorder}>
      {data.acts.map(act => (
        <TreeNode
          key={act.id}
          item={act}
          expanded={expanded.has(act.id)}
          onToggle={() => toggleExpanded(act.id)}
          onSelect={onSelect}
        >
          {act.scenes.map(scene => (
            <TreeNode key={scene.id} item={scene} depth={1}>
              {scene.pages.map(page => (
                <TreeLeaf key={page.id} item={page} depth={2} />
              ))}
            </TreeNode>
          ))}
        </TreeNode>
      ))}
    </DndContext>
  )
}
```

### 2. Weave/Timeline View
Visual flow showing spreads, color-coded plotlines, horizontal arrangement.

**Best for**: Pacing, visual rhythm, plotline balance, spread composition

```tsx
// WeaveView.tsx
export function WeaveView({ data, setData }) {
  const flatItems = useMemo(() => flattenToPages(data), [data])

  // Group into spreads (left/right page pairs)
  const spreads = useMemo(() => {
    const result = []
    result.push({ left: null, right: flatItems[0] }) // Inside cover + page 1
    for (let i = 1; i < flatItems.length; i += 2) {
      result.push({
        left: flatItems[i],
        right: flatItems[i + 1] || null
      })
    }
    return result
  }, [flatItems])

  return (
    <div className="space-y-8">
      {spreads.map((spread, idx) => (
        <SpreadView key={idx} spread={spread} />
      ))}
    </div>
  )
}
```

### 3. Outline View
Focus on summaries, intentions, beat sheets - the story logic.

**Best for**: Story planning, checking narrative coherence, writer's overview

```tsx
// OutlineView.tsx
export function OutlineView({ data, setData }) {
  return (
    <div className="prose max-w-none">
      {data.acts.map(act => (
        <section key={act.id}>
          <h2>{act.name}</h2>
          <EditableField
            value={act.beat_summary}
            onSave={(v) => updateAct(act.id, { beat_summary: v })}
            placeholder="Key beats in this act..."
          />

          {act.scenes.map(scene => (
            <div key={scene.id} className="ml-4">
              <h3>{scene.title}</h3>
              <EditableField
                value={scene.scene_summary}
                onSave={(v) => updateScene(scene.id, { scene_summary: v })}
              />
              <EditableField
                value={scene.intention}
                onSave={(v) => updateScene(scene.id, { intention: v })}
                className="text-purple-400"
              />
            </div>
          ))}
        </section>
      ))}
    </div>
  )
}
```

### 4. Detail View
Full content editing - dialogue, descriptions, panel layouts.

**Best for**: Actually writing the content, detailed editing

```tsx
// DetailView.tsx
export function DetailView({ selectedItem, setData }) {
  if (!selectedItem) return <EmptyState />

  return (
    <div className="p-4">
      <h1>{selectedItem.title}</h1>

      {selectedItem.panels?.map(panel => (
        <PanelEditor
          key={panel.id}
          panel={panel}
          onUpdate={(updates) => updatePanel(panel.id, updates)}
        />
      ))}

      <AddPanelButton onClick={() => addPanel(selectedItem.id)} />
    </div>
  )
}
```

## Shared State Pattern

All views share state from the parent page component:

```tsx
// app/[entity]/[id]/page.tsx
export default function EntityPage({ params }) {
  const [data, setData] = useState(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  useEffect(() => {
    fetchData(params.id).then(setData)
  }, [params.id])

  return (
    <div className="flex">
      {/* Sidebar - always visible */}
      <aside className="w-64">
        <NavigationTree
          data={data}
          setData={setData}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />
      </aside>

      {/* Main content - view based on route */}
      <main className="flex-1">
        <Outlet context={{ data, setData, selectedId }} />
      </main>
    </div>
  )
}
```

## URL-Based View Switching

Use Next.js nested routes for view switching:

```
/book/[bookId]/           → Default detail view
/book/[bookId]/weave      → Weave/timeline view
/book/[bookId]/outline    → Outline view
/book/[bookId]/characters → Characters management
```

```tsx
// app/book/[bookId]/layout.tsx
export default function BookLayout({ children, params }) {
  const [book, setBook] = useState(null)

  return (
    <BookContext.Provider value={{ book, setBook }}>
      <div className="flex">
        <NavigationTree />
        <main>{children}</main>
      </div>
    </BookContext.Provider>
  )
}

// app/book/[bookId]/weave/page.tsx
export default function WeavePage() {
  const { book, setBook } = useBookContext()
  return <WeaveView data={book} setData={setBook} />
}
```

## View-Specific Components

### Shared Component Props Pattern

```typescript
interface ViewProps {
  data: Book
  setData: React.Dispatch<React.SetStateAction<Book>>
  selectedId?: string
  onSelect?: (id: string) => void
}

// All view components accept this interface
export function NavigationTree(props: ViewProps) { ... }
export function WeaveView(props: ViewProps) { ... }
export function OutlineView(props: ViewProps) { ... }
```

### Cross-View Selection Sync

```tsx
// Clicking an item in Weave highlights it in Navigator
function WeaveView({ data, setData, onSelect }) {
  return (
    <div>
      {pages.map(page => (
        <PageCard
          key={page.id}
          page={page}
          onClick={() => onSelect?.(page.id)}
        />
      ))}
    </div>
  )
}

// Navigator shows selection state
function NavigationTree({ data, selectedId }) {
  return (
    <div>
      {items.map(item => (
        <TreeNode
          key={item.id}
          selected={item.id === selectedId}
        />
      ))}
    </div>
  )
}
```
