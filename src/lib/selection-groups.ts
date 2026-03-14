export type GroupPosition = 'solo' | 'first' | 'middle' | 'last'

/**
 * Compute each selected item's position within its adjacency group.
 *
 * Adjacent selected items form groups. Within a group:
 * - Single item → 'solo'
 * - First item → 'first'
 * - Last item → 'last'
 * - Everything between → 'middle'
 *
 * @param selectedIds - Set of currently selected item IDs
 * @param orderedIdsInParent - Ordered IDs within the same parent container
 *   (e.g., pages within one scene, scenes within one act)
 * @returns Map of selected ID → position for O(1) lookup during render
 */
export function getSelectionGroups(
  selectedIds: Set<string>,
  orderedIdsInParent: string[]
): Map<string, GroupPosition> {
  const result = new Map<string, GroupPosition>()

  // Filter to only selected items in this parent, preserving order
  const selected = orderedIdsInParent.filter(id => selectedIds.has(id))
  if (selected.length === 0) return result

  // Build groups of consecutive items
  const groups: string[][] = []
  let currentGroup: string[] = [selected[0]]

  for (let i = 1; i < selected.length; i++) {
    const prevIndex = orderedIdsInParent.indexOf(selected[i - 1])
    const currIndex = orderedIdsInParent.indexOf(selected[i])

    if (currIndex === prevIndex + 1) {
      // Adjacent — continue group
      currentGroup.push(selected[i])
    } else {
      // Gap — start new group
      groups.push(currentGroup)
      currentGroup = [selected[i]]
    }
  }
  groups.push(currentGroup)

  // Assign positions
  for (const group of groups) {
    if (group.length === 1) {
      result.set(group[0], 'solo')
    } else {
      result.set(group[0], 'first')
      for (let i = 1; i < group.length - 1; i++) {
        result.set(group[i], 'middle')
      }
      result.set(group[group.length - 1], 'last')
    }
  }

  return result
}
