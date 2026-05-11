import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { ProjectNode, ProjectTree, STATUS_COLORS, STATUS_LABELS } from '../types'

interface PreviewSelection {
  tree: ProjectTree
  nodes: ProjectNode[]
  focusNodeId: string
  isTree: boolean
}

interface PreviewLayout {
  positions: Record<string, { x: number; y: number }>
  edges: Array<{ from: string; to: string }>
  width: number
  height: number
}

export const ACTIVE_PREVIEW_CARD_W = 174
export const ACTIVE_PREVIEW_CARD_H = 86

const CARD_W = ACTIVE_PREVIEW_CARD_W
const CARD_H = ACTIVE_PREVIEW_CARD_H
const COL_GAP = 154
const ROW_GAP = 22
const PAD = 18
const COL_STEP = CARD_W + COL_GAP
const ROW_STEP = CARD_H + ROW_GAP
const MAX_PREVIEW_W = 900
const MAX_PREVIEW_H = 300

function parseDateMs(date?: string, endOfMonth = false) {
  if (!date) return undefined
  const month = date.match(/^(\d{4})-(\d{2})$/)
  if (month) {
    const year = Number(month[1])
    const monthIndex = Number(month[2]) - 1
    return endOfMonth
      ? new Date(year, monthIndex + 1, 0, 23, 59, 59, 999).getTime()
      : new Date(year, monthIndex, 1).getTime()
  }

  const parsed = new Date(date).getTime()
  return Number.isFinite(parsed) ? parsed : undefined
}

function activeStartMs(node: ProjectNode) {
  return parseDateMs(node.dateStart) ?? parseDateMs(node.dateEnd) ?? Number.POSITIVE_INFINITY
}

function isCurrentActive(node: ProjectNode, now: number) {
  if (node.status !== 'active') return false
  const start = parseDateMs(node.dateStart) ?? Number.NEGATIVE_INFINITY
  const end = parseDateMs(node.dateEnd, true) ?? Number.POSITIVE_INFINITY
  return start <= now && now <= end
}

function buildAdjacency(nodes: ProjectNode[]) {
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const adjacency = new Map<string, Set<string>>()
  for (const node of nodes) adjacency.set(node.id, new Set())

  for (const node of nodes) {
    for (const parentId of node.parentIds) {
      if (!byId.has(parentId)) continue
      adjacency.get(node.id)?.add(parentId)
      adjacency.get(parentId)?.add(node.id)
    }
  }

  return { byId, adjacency }
}

function connectedComponent(focusId: string, nodes: ProjectNode[]) {
  const { byId, adjacency } = buildAdjacency(nodes)
  const focus = byId.get(focusId)
  if (!focus) return []

  const seen = new Set([focusId])
  const queue = [focusId]
  while (queue.length > 0) {
    const id = queue.shift()!
    for (const nextId of adjacency.get(id) ?? []) {
      if (seen.has(nextId)) continue
      seen.add(nextId)
      queue.push(nextId)
    }
  }

  return [...seen]
    .map((id) => byId.get(id))
    .filter((node): node is ProjectNode => !!node)
}

function chooseActivePreview(nodes: ProjectNode[], trees: ProjectTree[]): PreviewSelection | null {
  const treeById = new Map(trees.map((tree) => [tree.id, tree]))
  const now = Date.now()
  const activeNodes = nodes.filter((node) => node.status === 'active')

  if (activeNodes.length === 0) return null

  const candidates = activeNodes
    .map((node) => {
      const component = connectedComponent(node.id, nodes)
      const hasTree = component.length > 1
      const current = isCurrentActive(node, now)
      return { node, component: hasTree ? component : [node], hasTree, current }
    })
    .sort((a, b) => {
      const aRank = a.hasTree ? (a.current ? 0 : 1) : (a.current ? 2 : 3)
      const bRank = b.hasTree ? (b.current ? 0 : 1) : (b.current ? 2 : 3)
      return (
        aRank - bRank ||
        activeStartMs(a.node) - activeStartMs(b.node) ||
        b.component.length - a.component.length ||
        a.node.title.localeCompare(b.node.title)
      )
    })

  const selected = candidates[0]
  if (!selected) return null

  return {
    tree: treeById.get(selected.node.treeId) ?? {
      id: selected.node.treeId,
      name: selected.hasTree ? selected.node.title : 'Active project',
    },
    nodes: selected.component,
    focusNodeId: selected.node.id,
    isTree: selected.hasTree,
  }
}

function buildPreviewLayout(nodes: ProjectNode[], focusNodeId: string): PreviewLayout {
  const nodeIds = new Set(nodes.map((node) => node.id))
  const childrenOf = new Map<string, string[]>()
  const parentsOf = new Map<string, string[]>()

  for (const node of nodes) {
    childrenOf.set(node.id, [])
    parentsOf.set(node.id, node.parentIds.filter((id) => nodeIds.has(id)))
  }
  for (const node of nodes) {
    for (const parentId of parentsOf.get(node.id) ?? []) {
      childrenOf.get(parentId)?.push(node.id)
    }
  }

  const colOf = new Map<string, number>()
  function setCol(id: string, col: number) {
    const current = colOf.get(id)
    if (current !== undefined && Math.abs(current) >= Math.abs(col)) return
    colOf.set(id, col)
  }

  function walkParents(id: string, col: number, seen = new Set<string>()) {
    if (seen.has(id)) return
    seen.add(id)
    for (const parentId of parentsOf.get(id) ?? []) {
      setCol(parentId, col - 1)
      walkParents(parentId, col - 1, seen)
    }
    seen.delete(id)
  }

  function walkChildren(id: string, col: number, seen = new Set<string>()) {
    if (seen.has(id)) return
    seen.add(id)
    for (const childId of childrenOf.get(id) ?? []) {
      setCol(childId, col + 1)
      walkChildren(childId, col + 1, seen)
    }
    seen.delete(id)
  }

  colOf.set(focusNodeId, 0)
  walkParents(focusNodeId, 0)
  walkChildren(focusNodeId, 0)

  // Context for future runs: home preview is one connected component centered on the active node, not every node in the stored treeId.
  for (let pass = 0; pass < nodes.length; pass++) {
    let changed = false
    for (const node of nodes) {
      const nodeCol = colOf.get(node.id)
      for (const parentId of parentsOf.get(node.id) ?? []) {
        const parentCol = colOf.get(parentId)
        if (parentCol !== undefined && nodeCol === undefined) {
          colOf.set(node.id, parentCol + 1)
          changed = true
        } else if (nodeCol !== undefined && parentCol === undefined) {
          colOf.set(parentId, nodeCol - 1)
          changed = true
        }
      }
    }
    if (!changed) break
  }

  for (const node of nodes) if (!colOf.has(node.id)) colOf.set(node.id, 0)

  const minCol = Math.min(...colOf.values(), 0)
  const maxCol = Math.max(...colOf.values(), 0)
  const colGroups = new Map<number, string[]>()
  for (const [id, col] of colOf) {
    const shiftedCol = col - minCol
    const group = colGroups.get(shiftedCol)
    if (group) group.push(id)
    else colGroups.set(shiftedCol, [id])
  }

  const nodeMap = new Map(nodes.map((node) => [node.id, node]))
  const rowOf = new Map<string, number>()
  const sortNodeIds = (ids: string[]) =>
    [...ids].sort((a, b) => {
      if (a === focusNodeId) return -1
      if (b === focusNodeId) return 1
      const an = nodeMap.get(a)!
      const bn = nodeMap.get(b)!
      return (
        (an.rowHint ?? 0) - (bn.rowHint ?? 0) ||
        activeStartMs(an) - activeStartMs(bn) ||
        an.title.localeCompare(bn.title)
      )
    })

  for (const [col, ids] of colGroups) {
    const sorted = sortNodeIds(ids)
    colGroups.set(col, sorted)
    sorted.forEach((id, index) => rowOf.set(id, index))
  }

  const shiftedMaxCol = maxCol - minCol
  for (let col = 1; col <= shiftedMaxCol; col++) {
    const ids = colGroups.get(col) ?? []
    ids.sort((a, b) => {
      if (a === focusNodeId) return -1
      if (b === focusNodeId) return 1
      const aParents = parentsOf.get(a) ?? []
      const bParents = parentsOf.get(b) ?? []
      const aAvg = aParents.length ? aParents.reduce((sum, id) => sum + (rowOf.get(id) ?? 0), 0) / aParents.length : rowOf.get(a) ?? 0
      const bAvg = bParents.length ? bParents.reduce((sum, id) => sum + (rowOf.get(id) ?? 0), 0) / bParents.length : rowOf.get(b) ?? 0
      return aAvg - bAvg || activeStartMs(nodeMap.get(a)!) - activeStartMs(nodeMap.get(b)!)
    })
    ids.forEach((id, index) => rowOf.set(id, index))
  }

  for (let col = shiftedMaxCol - 1; col >= 0; col--) {
    const ids = colGroups.get(col) ?? []
    ids.sort((a, b) => {
      if (a === focusNodeId) return -1
      if (b === focusNodeId) return 1
      const aChildren = childrenOf.get(a) ?? []
      const bChildren = childrenOf.get(b) ?? []
      const aAvg = aChildren.length ? aChildren.reduce((sum, id) => sum + (rowOf.get(id) ?? 0), 0) / aChildren.length : rowOf.get(a) ?? 0
      const bAvg = bChildren.length ? bChildren.reduce((sum, id) => sum + (rowOf.get(id) ?? 0), 0) / bChildren.length : rowOf.get(b) ?? 0
      return aAvg - bAvg || activeStartMs(nodeMap.get(a)!) - activeStartMs(nodeMap.get(b)!)
    })
    ids.forEach((id, index) => rowOf.set(id, index))
  }

  const positions: PreviewLayout['positions'] = {}
  let maxRow = 0
  for (const node of nodes) {
    const col = (colOf.get(node.id) ?? 0) - minCol
    const row = rowOf.get(node.id) ?? 0
    maxRow = Math.max(maxRow, row)
    positions[node.id] = { x: PAD + col * COL_STEP, y: PAD + row * ROW_STEP }
  }

  const edges = nodes.flatMap((node) =>
    (parentsOf.get(node.id) ?? []).map((parentId) => ({ from: parentId, to: node.id })),
  )

  return {
    positions,
    edges,
    width: PAD * 2 + (shiftedMaxCol + 1) * CARD_W + shiftedMaxCol * COL_GAP,
    height: PAD * 2 + (maxRow + 1) * CARD_H + maxRow * ROW_GAP,
  }
}

export function getActivePreviewModel(nodes: ProjectNode[], trees: ProjectTree[]) {
  const selection = chooseActivePreview(nodes, trees)
  if (!selection) return null

  return {
    selection,
    layout: buildPreviewLayout(selection.nodes, selection.focusNodeId),
  }
}

export default function ActiveTreeSnippet({ nodes, trees }: { nodes: ProjectNode[]; trees: ProjectTree[] }) {
  const model = useMemo(() => getActivePreviewModel(nodes, trees), [nodes, trees])

  if (!model) return null
  const { selection, layout } = model
  const previewScale = Math.min(1, MAX_PREVIEW_W / layout.width, MAX_PREVIEW_H / layout.height)
  const scaledWidth = Math.ceil(layout.width * previewScale)
  const scaledHeight = Math.ceil(layout.height * previewScale)

  return (
    <div
      className="relative max-w-[calc(100vw-2rem)] select-none overflow-visible"
      style={{
        width: scaledWidth,
        height: scaledHeight,
      }}
    >
      {/* Keep cards compact while the home preview spends extra width on branch spacing. */}
      <div
        className="absolute left-0 top-0"
        style={{
          width: layout.width,
          height: layout.height,
          transform: `scale(${previewScale})`,
          transformOrigin: 'top left',
        }}
      >
        <motion.div
        className="absolute left-1 top-0 font-mono text-[9px] uppercase tracking-[0.18em] text-slate-500"
        initial={{ opacity: 0, y: -4 }}
        animate={{ opacity: 0.72, y: 0 }}
        transition={{ duration: 0.8, ease: 'easeOut' }}
      >
        {selection.isTree ? selection.tree.name : 'Active node'}
        </motion.div>

        <svg
        className="absolute inset-0 pointer-events-none overflow-visible"
        width={layout.width}
        height={layout.height}
      >
        {layout.edges.map(({ from, to }, index) => {
          const src = layout.positions[from]
          const tgt = layout.positions[to]
          const fromNode = selection.nodes.find((node) => node.id === from)
          if (!src || !tgt || !fromNode) return null
          const sx = src.x + CARD_W
          const sy = src.y + CARD_H / 2
          const tx = tgt.x
          const ty = tgt.y + CARD_H / 2
          const mx = (sx + tx) / 2
          const activeConnection = from === selection.focusNodeId || to === selection.focusNodeId
          const color = activeConnection ? STATUS_COLORS.active : STATUS_COLORS[fromNode.status]

          return (
            <motion.path
              key={`${from}-${to}`}
              d={`M ${sx} ${sy} C ${mx} ${sy}, ${mx} ${ty}, ${tx} ${ty}`}
              stroke={color}
              strokeWidth={activeConnection ? 1.45 : 0.9}
              fill="none"
              strokeDasharray={activeConnection ? '5 4' : '3 4'}
              opacity={activeConnection ? 0.42 : 0.18}
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 1.1, delay: 0.2 + index * 0.08, ease: 'easeOut' }}
            />
          )
        })}
        </svg>

        {selection.nodes.map((node, index) => {
        const pos = layout.positions[node.id]
        if (!pos) return null
        const color = STATUS_COLORS[node.status]
        const isFocus = node.id === selection.focusNodeId
        const opacity = isFocus ? 0.96 : node.status === 'active' ? 0.72 : 0.38

        return (
          <motion.div
            key={node.id}
            className="absolute flex flex-col justify-between"
            style={{
              left: pos.x,
              top: pos.y,
              width: CARD_W,
              height: CARD_H,
              zIndex: isFocus ? 3 : 2,
              transformOrigin: 'center',
            }}
            initial={{ opacity: 0, scale: isFocus ? 1.02 : 0.94, x: 10 }}
            animate={{ opacity, scale: isFocus ? 1.09 : 1, x: 0 }}
            transition={{ duration: 0.72, delay: 0.12 + index * 0.055, ease: 'easeOut' }}
          >
            <div
              className="h-full w-full rounded-xl p-3 flex flex-col justify-between"
              style={{
                background: isFocus ? `${STATUS_COLORS.active}16` : 'rgba(255,255,255,0.018)',
                border: `1px solid ${color}${isFocus ? '66' : '20'}`,
                boxShadow: isFocus ? `0 0 32px ${STATUS_COLORS.active}36, 0 0 10px ${STATUS_COLORS.active}22` : 'none',
              }}
            >
              <div className="flex items-center gap-1.5">
                <motion.span
                  className="h-1.5 w-1.5 flex-shrink-0 rounded-full"
                  style={{ backgroundColor: color, boxShadow: isFocus ? `0 0 8px ${color}` : 'none' }}
                  animate={isFocus ? { opacity: [1, 0.34, 1] } : {}}
                  transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
                />
                <span className="text-[9px] font-semibold tracking-wider uppercase" style={{ color }}>
                  {STATUS_LABELS[node.status]}
                </span>
              </div>

              <p
                className="text-[11px] font-semibold leading-tight line-clamp-2"
                style={{ color: isFocus ? 'rgba(241,245,249,0.96)' : 'rgba(241,245,249,0.72)' }}
              >
                {node.title}
              </p>
            </div>

            {isFocus && (
              <motion.div
                className="absolute left-0 top-3 bottom-3 w-[2px] rounded-full"
                style={{ background: color, boxShadow: `0 0 6px ${color}` }}
                animate={{ opacity: [0.62, 1, 0.62] }}
                transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
              />
            )}
          </motion.div>
        )
        })}
      </div>
    </div>
  )
}
