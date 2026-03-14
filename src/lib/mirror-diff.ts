export interface MirrorPanel {
  panel_number: number
  characters_present: string[]
  dialogue_blocks: { text: string | null }[]
}

export interface MirrorPanelStatus {
  leftIndex: number | null  // null = unmatched
  rightIndex: number | null
  status: 'green' | 'yellow'
}

function setsEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false
  const setA = new Set(a)
  return b.every(item => setA.has(item))
}

function hasDialogue(panel: MirrorPanel): boolean {
  return panel.dialogue_blocks.some(d => d.text && d.text.trim().length > 0)
}

export function computeMirrorAlignment(
  leftPanels: MirrorPanel[],
  rightPanels: MirrorPanel[]
): MirrorPanelStatus[] {
  const maxLen = Math.max(leftPanels.length, rightPanels.length)
  const results: MirrorPanelStatus[] = []

  for (let i = 0; i < maxLen; i++) {
    const left = leftPanels[i] ?? null
    const right = rightPanels[i] ?? null

    if (!left || !right) {
      results.push({ leftIndex: left ? i : null, rightIndex: right ? i : null, status: 'yellow' })
      continue
    }

    const charsMatch = setsEqual(left.characters_present || [], right.characters_present || [])
    const dialogueMatch = hasDialogue(left) === hasDialogue(right)

    results.push({
      leftIndex: i,
      rightIndex: i,
      status: charsMatch && dialogueMatch ? 'green' : 'yellow',
    })
  }

  return results
}
