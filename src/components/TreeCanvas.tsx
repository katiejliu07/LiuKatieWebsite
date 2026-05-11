import { useRef, useState, useCallback } from 'react'
import { motion } from 'framer-motion'
import { ProjectNode, ProjectTree, STATUS_COLORS, STATUS_LABELS, NodeStatus } from '../types'
import { computeTreeLayout, NODE_WIDTH, getNodeHeight } from '../utils/treeLayout'
import NodeModal from './NodeModal'
import { FINAL_COMPLETED_COLOR, getFinalCompletedNodeIds } from '../utils/finalProject'

interface TreeCanvasProps {
  tree: ProjectTree
  nodes: ProjectNode[]
  direction: 'forward' | 'backward'
}

function statusGlow(status: NodeStatus, color: string) {
  if (status === 'active') return `0 0 18px ${color}55, 0 0 6px ${color}40`
  if (status === 'completed') return `0 0 10px ${color}30`
  return 'none'
}

export default function TreeCanvas({ tree, nodes, direction }: TreeCanvasProps) {
  const [selectedNode, setSelectedNode] = useState<ProjectNode | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  const { positions, canvasWidth, canvasHeight } = computeTreeLayout(nodes, direction)
  const nodeIds = new Set(nodes.map((n) => n.id))
  const finalCompletedNodeIds = getFinalCompletedNodeIds(nodes)

  // Build edge list: [fromId, toId][]
  const edges: [string, string][] = []
  for (const node of nodes) {
    for (const pid of node.parentIds) {
      if (nodeIds.has(pid)) {
        // In forward mode: edge from parent → child
        // In backward mode we still store parent→child but rendering will differ
        edges.push([pid, node.id])
      }
    }
  }

  const handleNodeClick = useCallback((node: ProjectNode) => {
    setSelectedNode(node)
  }, [])

  return (
    <>
      <div
        ref={scrollRef}
        className="overflow-x-auto overflow-y-hidden pb-4 relative"
        style={{ cursor: 'default' }}
      >
        <div
          className="relative"
          style={{
            width: Math.max(canvasWidth, 400),
            height: Math.max(canvasHeight, 200),
          }}
        >
          {/* SVG edge layer */}
          <svg
            className="absolute inset-0 pointer-events-none overflow-visible"
            width={Math.max(canvasWidth, 400)}
            height={Math.max(canvasHeight, 200)}
          >
            <defs>
              <filter id={`glow-${tree.id}`} x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="2.5" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            {edges.map(([fromId, toId], i) => {
              const src = positions[fromId]
              const tgt = positions[toId]
              if (!src || !tgt) return null

              const fromNode = nodes.find((n) => n.id === fromId)!
              const toNode = nodes.find((n) => n.id === toId)!

              // Edge start: right-center of source; end: left-center of target
              const sx = src.x + NODE_WIDTH
              const sy = src.y + getNodeHeight(fromNode) / 2
              const tx = tgt.x
              const ty = tgt.y + getNodeHeight(toNode) / 2
              const mx = (sx + tx) / 2

              const d = `M ${sx} ${sy} C ${mx} ${sy}, ${mx} ${ty}, ${tx} ${ty}`

              const srcColor = finalCompletedNodeIds.has(fromNode.id) ? FINAL_COMPLETED_COLOR : STATUS_COLORS[fromNode.status]
              const tgtColor = finalCompletedNodeIds.has(toNode.id) ? FINAL_COMPLETED_COLOR : STATUS_COLORS[toNode.status]
              const gradId = `grad-${fromId}-${toId}`

              return (
                <g key={`${fromId}-${toId}`}>
                  <defs>
                    <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor={srcColor} stopOpacity="0.7" />
                      <stop offset="100%" stopColor={tgtColor} stopOpacity="0.5" />
                    </linearGradient>
                  </defs>
                  <motion.path
                    d={d}
                    stroke={`url(#${gradId})`}
                    strokeWidth={1.5}
                    fill="none"
                    filter={`url(#glow-${tree.id})`}
                    initial={{ pathLength: 0, opacity: 0 }}
                    animate={{ pathLength: 1, opacity: 1 }}
                    transition={{ duration: 1.0, delay: 0.15 + i * 0.08, ease: 'easeInOut' }}
                  />
                </g>
              )
            })}
          </svg>

          {/* Node cards */}
          {nodes.map((node, i) => {
            const pos = positions[node.id]
            if (!pos) return null
            const isFinalCompleted = finalCompletedNodeIds.has(node.id)
            const color = isFinalCompleted ? FINAL_COMPLETED_COLOR : STATUS_COLORS[node.status]
            const isSelected = selectedNode?.id === node.id
            const nodeHeight = getNodeHeight(node)

            return (
              <motion.div
                key={node.id}
                className="absolute select-none"
                style={{ left: pos.x, top: pos.y, width: NODE_WIDTH, height: nodeHeight }}
                initial={{ opacity: 0, scale: 0.85 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.35, delay: 0.4 + i * 0.07, ease: 'backOut' }}
                whileHover={{ scale: 1.04, transition: { duration: 0.15 } }}
                onClick={() => handleNodeClick(node)}
              >
                <div
                  className="w-full h-full rounded-xl p-3 flex flex-col cursor-pointer"
                  style={{
                    background: isSelected
                      ? `${color}14`
                      : `rgba(255,255,255,0.030)`,
                    border: `1px solid ${color}${isSelected ? '50' : '28'}`,
                    boxShadow: isSelected
                      ? statusGlow('active', color)
                      : isFinalCompleted
                      ? `0 0 20px ${color}46, 0 0 7px ${color}35`
                      : statusGlow(node.status, color),
                    backdropFilter: 'blur(12px)',
                    transition: 'background 0.2s, border-color 0.2s, box-shadow 0.2s',
                  }}
                >
                  {/* Status dot */}
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <span
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{
                        backgroundColor: color,
                        boxShadow: node.status === 'active' || isFinalCompleted ? `0 0 7px ${color}` : 'none',
                      }}
                    />
                    <span className="text-[10px] font-medium" style={{ color }}>
                      {STATUS_LABELS[node.status]}
                    </span>
                  </div>

                  {/* Title */}
                  <p className="text-[13px] font-semibold text-slate-100 leading-tight line-clamp-3">
                    {node.title}
                  </p>

                  {/* Date */}
                  {node.dateStart && (
                    <p className="text-[10px] text-slate-500 mt-auto pt-1.5 font-mono">
                      {fmtDate(node.dateStart)}
                      {node.dateEnd ? ` – ${fmtDate(node.dateEnd)}` : ' →'}
                    </p>
                  )}
                </div>
              </motion.div>
            )
          })}
        </div>
      </div>

      {/* Detail panel */}
      <NodeModal
        node={selectedNode}
        tree={tree}
        onClose={() => setSelectedNode(null)}
        onNodeClick={handleNodeClick}
      />
    </>
  )
}

function fmtDate(dateStr: string) {
  try {
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
  } catch {
    return dateStr
  }
}
