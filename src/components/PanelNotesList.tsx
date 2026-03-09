'use client'

interface PanelNote {
  id: string
  content: string
  source: 'ai' | 'user' | 'collaborator'
  status: 'pending' | 'accepted' | 'dismissed'
  created_at: string
}

interface PanelNotesListProps {
  notes: PanelNote[]
  onAccept: (noteId: string) => void
  onDismiss: (noteId: string) => void
}

const SOURCE_CONFIG = {
  ai: { label: 'AI', colorVar: '--accent-hover' },
  user: { label: 'User', colorVar: '--color-primary' },
  collaborator: { label: 'Collaborator', colorVar: '--color-info' },
} as const

export default function PanelNotesList({ notes, onAccept, onDismiss }: PanelNotesListProps) {
  if (notes.length === 0) {
    return (
      <p
        className="text-sm italic py-4 text-center"
        style={{ color: 'var(--text-muted)' }}
      >
        No notes for this panel.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      {notes.map((note) => {
        const sourceConfig = SOURCE_CONFIG[note.source]

        return (
          <div
            key={note.id}
            className="rounded-lg p-3 transition-colors duration-150"
            style={{
              backgroundColor: 'var(--bg-secondary)',
              border: '1px solid var(--border)',
            }}
          >
            {/* Header: source badge + status */}
            <div className="flex items-center justify-between mb-2">
              <span
                className="inline-block px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider"
                style={{
                  backgroundColor: `var(${sourceConfig.colorVar})`,
                  color: '#fff',
                }}
              >
                {sourceConfig.label}
              </span>

              {note.status !== 'pending' && (
                <span
                  className="text-[10px] font-medium uppercase tracking-wider"
                  style={{
                    color:
                      note.status === 'accepted'
                        ? 'var(--color-success)'
                        : 'var(--text-muted)',
                  }}
                >
                  {note.status === 'accepted' ? 'Accepted' : 'Dismissed'}
                </span>
              )}
            </div>

            {/* Content */}
            <p
              className="text-sm leading-relaxed mb-2"
              style={{ color: 'var(--text-primary)' }}
            >
              {note.content}
            </p>

            {/* Action buttons for pending notes */}
            {note.status === 'pending' && (
              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => onAccept(note.id)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium cursor-pointer transition-all duration-150 ease-out active:scale-[0.95] hover:opacity-90"
                  style={{
                    backgroundColor: 'var(--color-success)',
                    color: '#fff',
                  }}
                  title="Accept note"
                >
                  {/* Checkmark icon */}
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 16 16"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      d="M3 8.5l3.5 3.5L13 4"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  Accept
                </button>

                <button
                  type="button"
                  onClick={() => onDismiss(note.id)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium cursor-pointer transition-all duration-150 ease-out active:scale-[0.95] hover:opacity-90"
                  style={{
                    backgroundColor: 'var(--bg-tertiary)',
                    color: 'var(--color-error)',
                    border: '1px solid var(--border)',
                  }}
                  title="Dismiss note"
                >
                  {/* X icon */}
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 16 16"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      d="M4 4l8 8M12 4l-8 8"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  Dismiss
                </button>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

export type { PanelNote, PanelNotesListProps }
