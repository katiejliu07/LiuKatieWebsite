import { ProjectNode } from '../types'
import { parseNodeDate } from './treeLayout'

export const FINAL_COMPLETED_COLOR = '#22c55e'

function safeDateMs(node: ProjectNode) {
  const date = node.dateEnd ?? node.dateStart
  if (!date) return 0
  const ms = parseNodeDate(date)
  return Number.isFinite(ms) ? ms : 0
}

/**
 * Highlights one completed terminal project per tree: the leaf with the biggest
 * upstream chain. This keeps "final result" nodes distinct from ordinary done work.
 */
export function getFinalCompletedNodeIds(nodes: ProjectNode[]) {
  const result = new Set<string>()
  const byTree = new Map<string, ProjectNode[]>()

  for (const node of nodes) {
    if (!byTree.has(node.treeId)) byTree.set(node.treeId, [])
    byTree.get(node.treeId)!.push(node)
  }

  for (const treeNodes of byTree.values()) {
    const ids = new Set(treeNodes.map((node) => node.id))
    const childIds = new Set<string>()
    const nodeById = new Map(treeNodes.map((node) => [node.id, node]))
    const ancestorMemo = new Map<string, Set<string>>()

    for (const node of treeNodes) {
      for (const parentId of node.parentIds) {
        if (ids.has(parentId)) childIds.add(parentId)
      }
    }

    function ancestors(id: string, visiting = new Set<string>()): Set<string> {
      if (ancestorMemo.has(id)) return ancestorMemo.get(id)!
      if (visiting.has(id)) return new Set()
      visiting.add(id)

      const node = nodeById.get(id)
      const found = new Set<string>()
      if (node) {
        for (const parentId of node.parentIds) {
          if (!ids.has(parentId)) continue
          found.add(parentId)
          for (const upstreamId of ancestors(parentId, visiting)) found.add(upstreamId)
        }
      }

      visiting.delete(id)
      ancestorMemo.set(id, found)
      return found
    }

    const terminalCompleted = treeNodes.filter((node) =>
      node.status === 'completed' && !childIds.has(node.id),
    )
    if (terminalCompleted.length === 0) continue

    terminalCompleted.sort((a, b) => {
      const aAncestors = ancestors(a.id).size
      const bAncestors = ancestors(b.id).size
      const aParents = a.parentIds.filter((id) => ids.has(id)).length
      const bParents = b.parentIds.filter((id) => ids.has(id)).length

      return (
        bAncestors - aAncestors ||
        bParents - aParents ||
        safeDateMs(b) - safeDateMs(a) ||
        a.title.localeCompare(b.title)
      )
    })

    result.add(terminalCompleted[0].id)
  }

  return result
}
