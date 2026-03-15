'use client'

interface WeaveSelectionToolbarProps {
  selectedCount: number
  scenes: Array<{ id: string; title: string | null }>
  plotlines: Array<{ id: string; name: string; color: string }>
  onMoveToScene: (sceneId: string) => void
  onAssignPlotline: (plotlineId: string) => void
  onDeselectAll: () => void
}

export function WeaveSelectionToolbar({
  selectedCount,
  scenes,
  plotlines,
  onMoveToScene,
  onAssignPlotline,
  onDeselectAll,
}: WeaveSelectionToolbarProps) {
  return (
    <div className="bg-[var(--color-primary)]/10 border border-[var(--color-primary)]/20 rounded px-4 py-2 mx-5 flex items-center justify-between">
      <span className="font-mono text-[0.625rem] text-[var(--color-primary)]">
        {selectedCount} PAGES SELECTED
      </span>
      <div className="flex items-center gap-3">
        <select
          className="bg-transparent border border-[var(--border)] rounded px-2 py-1 text-[0.5rem] font-bold tracking-wider uppercase cursor-pointer font-mono"
          value=""
          onChange={(e) => {
            if (e.target.value) {
              onMoveToScene(e.target.value)
              e.target.value = ''
            }
          }}
        >
          <option value="" disabled>
            MOVE TO SCENE ▾
          </option>
          {scenes.map((scene) => (
            <option key={scene.id} value={scene.id}>
              {scene.title || 'Untitled Scene'}
            </option>
          ))}
        </select>
        <select
          className="bg-transparent border border-[var(--border)] rounded px-2 py-1 text-[0.5rem] font-bold tracking-wider uppercase cursor-pointer font-mono"
          value=""
          onChange={(e) => {
            if (e.target.value) {
              onAssignPlotline(e.target.value)
              e.target.value = ''
            }
          }}
        >
          <option value="" disabled>
            ASSIGN PLOTLINE ▾
          </option>
          {plotlines.map((plotline) => (
            <option key={plotline.id} value={plotline.id}>
              {plotline.name}
            </option>
          ))}
        </select>
        <button
          onClick={onDeselectAll}
          className="font-mono text-[0.5rem] font-bold tracking-wider text-[var(--color-error)] hover:opacity-80 cursor-pointer"
        >
          DESELECT ALL
        </button>
      </div>
    </div>
  )
}
