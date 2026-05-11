import { useRef, useState, useCallback, useMemo, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowRight, ArrowLeft, Pencil, Plus, X } from 'lucide-react'
import { useStore } from '../store/useStore'
import {
  computeUnifiedLayout,
  xToMs,
  NODE_WIDTH,
  NODE_HEIGHT,
  NODE_MAX_HEIGHT,
  fmtMonthYear,
  getNodeHeight,
  rowIndexFromY,
  yForRowIndex,
} from '../utils/treeLayout'
import { STATUS_COLORS, STATUS_LABELS, ProjectNode, CATEGORY_COLORS, CATEGORY_LABELS, CATEGORY_CYCLE } from '../types'
import NodeModal from '../components/NodeModal'
import SmartEdge, { controlPoints } from '../components/SmartEdge'
import InlineNodeEditor from '../components/InlineNodeEditor'
import { FINAL_COMPLETED_COLOR, getFinalCompletedNodeIds } from '../utils/finalProject'

type SortDir = 'forward' | 'backward'

interface DrawState {
  fromId: string
  /** Position of the drag handle in canvas space */
  handleX: number
  handleY: number
  /** Current cursor position in canvas space */
  curX: number
  curY: number
  /** Left handle = this node becomes the child; right handle = this node becomes the parent */
  isLeftHandle: boolean
}

interface EditorState {
  node: ProjectNode | null
  treeId?: string
  initialDate?: string
  screenX: number
  screenY: number
}

interface NodeDragState {
  id: string
  startPointerY: number
  startY: number
  currentY: number
  targetRow: number
  moved: boolean
}

export default function Trees() {
  const { trees, nodes, addNode, updateNode } = useStore()
  const adminAuthed = useStore((s) => s.adminAuthed)

  const [direction, setDirection] = useState<SortDir>('forward')
  const [editMode, setEditMode] = useState(false)
  const [selectedNode, setSelectedNode] = useState<ProjectNode | null>(null)
  const [selectedTree, setSelectedTree] = useState<{ id: string; name: string } | null>(null)
  const [draw, setDraw] = useState<DrawState | null>(null)
  const [nodeDrag, setNodeDrag] = useState<NodeDragState | null>(null)
  const [hoverTarget, setHoverTarget] = useState<string | null>(null)
  const [editor, setEditor] = useState<EditorState | null>(null)
  const suppressNextCanvasClick = useRef(false)

  const treeScrollRef = useRef<HTMLDivElement>(null)
  const timelineScrollRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLDivElement>(null)

  // Turn off edit mode if admin logs out
  useEffect(() => { if (!adminAuthed) setEditMode(false) }, [adminAuthed])

  // Derive layout groups from node connectivity — includes solo nodes for layout, all groups treated equally
  const effectiveTrees = useMemo(() => {
    const grouped = new Map<string, ProjectNode[]>()
    for (const n of nodes) {
      if (!grouped.has(n.treeId)) grouped.set(n.treeId, [])
      grouped.get(n.treeId)!.push(n)
    }
    return [...grouped.entries()].map(([treeId, treeNodes]) => {
      const stored = trees.find((t) => t.id === treeId)
      if (stored) return stored
      const nodeIds = new Set(treeNodes.map((n) => n.id))
      const roots = treeNodes.filter((n) => !n.parentIds.some((pid) => nodeIds.has(pid)))
      return { id: treeId, name: roots[0]?.title ?? treeNodes[0]?.title ?? 'Untitled', description: undefined }
    })
  }, [nodes, trees])

  const treesData = useMemo(
    () => effectiveTrees.map((t) => ({ treeId: t.id, label: t.name, nodes: nodes.filter((n) => n.treeId === t.id) })),
    [effectiveTrees, nodes],
  )
  const layout = useMemo(() => computeUnifiedLayout(treesData, direction), [treesData, direction])
  const displayPositions = useMemo(() => {
    if (!nodeDrag) return layout.positions
    const pos = layout.positions[nodeDrag.id]
    if (!pos) return layout.positions
    return { ...layout.positions, [nodeDrag.id]: { ...pos, y: nodeDrag.currentY } }
  }, [layout.positions, nodeDrag])

  const todayX = useMemo(() => {
    const ts = layout.timeScale
    if (!ts.pxPerMs || !ts.rangeMs) return null
    const now = Date.now()
    const offset = direction === 'forward'
      ? (now - ts.minMs) * ts.pxPerMs
      : (ts.maxMs - now) * ts.pxPerMs
    return Math.max(0, Math.min(layout.totalWidth, ts.xOffset + offset))
  }, [direction, layout.timeScale, layout.totalWidth])

  const nodeIds = useMemo(() => new Set(nodes.map((n) => n.id)), [nodes])
  const edges = useMemo(
    () =>
      nodes.flatMap((n) =>
        n.parentIds
          .filter((pid) => nodeIds.has(pid))
          .map((pid) => ({
            from: pid,
            to: n.id,
            fromNode: nodes.find((x) => x.id === pid)!,
            toNode: n,
          })),
      ),
    [nodes, nodeIds],
  )

  const leafNodeIds = useMemo(() => {
    const parentSet = new Set(nodes.flatMap((n) => n.parentIds))
    return new Set(nodes.filter((n) => !parentSet.has(n.id)).map((n) => n.id))
  }, [nodes])
  const finalCompletedNodeIds = useMemo(() => getFinalCompletedNodeIds(nodes), [nodes])

  // Sync timeline scrollbar with tree canvas
  function syncTimeline(e: React.UIEvent<HTMLDivElement>) {
    if (timelineScrollRef.current) timelineScrollRef.current.scrollLeft = e.currentTarget.scrollLeft
  }

  // ── Node view (read mode) ──────────────────────────────────────────────────
  const handleNodeClick = useCallback(
    (node: ProjectNode) => {
      if (editMode) return
      setSelectedNode(node)
      setSelectedTree(effectiveTrees.find((t) => t.id === node.treeId) ?? null)
    },
    [editMode, effectiveTrees],
  )

  // ── Connection drawing ────────────────────────────────────────────────────
  function startDraw(e: React.MouseEvent, fromId: string, side: 'left' | 'right') {
    e.stopPropagation()
    const pos = displayPositions[fromId]
    if (!pos) return
    const sourceNode = nodes.find((n) => n.id === fromId)
    const nodeHeight = sourceNode ? getNodeHeight(sourceNode) : NODE_HEIGHT
    const hx = side === 'left' ? pos.x : pos.x + NODE_WIDTH
    setDraw({
      fromId,
      handleX: hx,
      handleY: pos.y + nodeHeight / 2,
      curX: hx + (side === 'left' ? -10 : 10),
      curY: pos.y + nodeHeight / 2,
      isLeftHandle: side === 'left',
    })
  }

  function onCanvasMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    if (nodeDrag) {
      const point = canvasPointFromEvent(e)
      const deltaY = point.y - nodeDrag.startPointerY
      const currentY = Math.max(yForRowIndex(0), nodeDrag.startY + deltaY)
      setNodeDrag((drag) => drag ? {
        ...drag,
        currentY,
        targetRow: rowIndexFromY(currentY),
        moved: drag.moved || Math.abs(deltaY) > 3,
      } : null)
      return
    }

    if (!draw) return
    const point = canvasPointFromEvent(e)
    setDraw((d) => d ? { ...d, curX: point.x, curY: point.y } : null)
  }

  function onCanvasMouseUp(e: React.MouseEvent<HTMLDivElement>) {
    if (nodeDrag) {
      if (nodeDrag.moved) {
        updateNode(nodeDrag.id, { rowHint: nodeDrag.targetRow })
        suppressNextCanvasClick.current = true
      }
      setNodeDrag(null)
      return
    }

    if (!draw) return
    if (hoverTarget && hoverTarget !== draw.fromId) {
      if (draw.isLeftHandle) {
        // Left handle: fromId is the child, hoverTarget is the parent
        const source = nodes.find((n) => n.id === draw.fromId)!
        if (!source.parentIds.includes(hoverTarget)) {
          updateNode(draw.fromId, { parentIds: [...source.parentIds, hoverTarget] })
        }
      } else {
        // Right handle: fromId is the parent, hoverTarget is the child
        const target = nodes.find((n) => n.id === hoverTarget)!
        if (!target.parentIds.includes(draw.fromId)) {
          updateNode(hoverTarget, { parentIds: [...target.parentIds, draw.fromId] })
        }
      }
    }
    setDraw(null)
    setHoverTarget(null)
  }

  // ── Click-to-add node ─────────────────────────────────────────────────────
  function onCanvasClick(e: React.MouseEvent<HTMLDivElement>) {
    if (suppressNextCanvasClick.current) {
      suppressNextCanvasClick.current = false
      return
    }
    if (!editMode || draw) return
    // Only fire if clicking the background, not a node
    if ((e.target as HTMLElement).closest('[data-node]')) return
    const { x: canvasX, y: canvasY } = canvasPointFromEvent(e)

    // Prefer the tree band the click is actually inside; fall back to x-only so adding near a tree still feels natural.
    const band = layout.treeBands.find((b) =>
      canvasX >= b.xMin && canvasX <= b.xMax &&
      canvasY >= b.yStart - 24 && canvasY <= b.yStart + b.height + 24
    ) ?? layout.treeBands.find((b) => canvasX >= b.xMin && canvasX <= b.xMax)

    const ms = xToMs(canvasX, layout.timeScale)
    const d = new Date(Math.max(ms, 0))
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`

    setEditor({
      node: null,
      treeId: band?.treeId,
      initialDate: dateStr,
      screenX: e.clientX,
      screenY: e.clientY,
    })
  }

  // ── Edit an existing node ─────────────────────────────────────────────────
  function openEdit(e: React.MouseEvent, node: ProjectNode) {
    e.stopPropagation()
    setEditor({ node, treeId: node.treeId, screenX: e.clientX - 144, screenY: e.clientY - 20 })
  }

  // ── Remove a connection ───────────────────────────────────────────────────
  function removeEdge(fromId: string, toId: string) {
    const target = nodes.find((n) => n.id === toId)!
    updateNode(toId, { parentIds: target.parentIds.filter((p) => p !== fromId) })
  }

  function canvasPointFromEvent(e: React.MouseEvent) {
    const rect = canvasRef.current!.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  function startNodeDrag(e: React.MouseEvent, node: ProjectNode) {
    if (!editMode || draw) return
    if ((e.target as HTMLElement).closest('button')) return
    const pos = displayPositions[node.id]
    if (!pos) return

    e.preventDefault()
    e.stopPropagation()

    const point = canvasPointFromEvent(e)
    setEditor(null)
    setNodeDrag({
      id: node.id,
      startPointerY: point.y,
      startY: pos.y,
      currentY: pos.y,
      targetRow: rowIndexFromY(pos.y),
      moved: false,
    })
  }

  return (
    <>
      <div className="flex flex-col" style={{ height: 'calc(100vh - 64px)' }}>
        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div
          className="flex-shrink-0 flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-6 md:px-10 py-4"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
        >
          <div>
            <p className="text-[10px] tracking-[0.22em] uppercase text-slate-600 font-mono mb-0.5">
              All project arcs
            </p>
            <h1 className="text-xl font-bold text-slate-100">Project Trees</h1>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            {/* Direction toggle */}
            <div
              className="flex items-center rounded-xl overflow-hidden"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
            >
              <button
                onClick={() => setDirection('forward')}
                className={`flex items-center gap-1.5 px-3 py-2 text-xs transition-all duration-200 ${direction === 'forward' ? 'text-slate-100 bg-white/8' : 'text-slate-500 hover:text-slate-300'}`}
              >
                <ArrowRight size={11} /> Origin → Future
              </button>
              <div className="w-px h-4 bg-white/8" />
              <button
                onClick={() => setDirection('backward')}
                className={`flex items-center gap-1.5 px-3 py-2 text-xs transition-all duration-200 ${direction === 'backward' ? 'text-slate-100 bg-white/8' : 'text-slate-500 hover:text-slate-300'}`}
              >
                <ArrowLeft size={11} /> Future → Origin
              </button>
            </div>

            {/* Edit mode toggle — only if admin authed */}
            {adminAuthed && (
              <button
                onClick={() => setEditMode((x) => !x)}
                className={`flex items-center gap-1.5 px-3 py-2 text-xs rounded-xl transition-all duration-200 ${
                  editMode
                    ? 'text-amber-300 border border-amber-400/30 bg-amber-400/10'
                    : 'text-slate-500 hover:text-slate-300 border border-white/8 bg-white/4'
                }`}
              >
                <Pencil size={11} />
                {editMode ? 'Editing' : 'Edit mode'}
              </button>
            )}

            {/* Add node button — visible in edit mode */}
            {editMode && (
              <button
                onClick={(e) => setEditor({ node: null, treeId: undefined, screenX: e.clientX - 144, screenY: e.clientY + 12 })}
                className="flex items-center gap-1.5 px-3 py-2 text-xs rounded-xl transition-all duration-200 text-slate-200 hover:text-white"
                style={{ background: 'linear-gradient(135deg, rgba(124,58,237,0.3), rgba(8,145,178,0.3))', border: '1px solid rgba(124,58,237,0.35)' }}
              >
                <Plus size={11} />
                Add node
              </button>
            )}
          </div>
        </div>

        {/* ── Edit mode hint ───────────────────────────────────────────────── */}
        <AnimatePresence>
          {editMode && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="flex-shrink-0 px-6 md:px-10 py-2 flex items-center gap-6 flex-wrap"
              style={{ background: 'rgba(251,191,36,0.05)', borderBottom: '1px solid rgba(251,191,36,0.1)' }}
            >
              <HintPill icon="click">Click empty area — add node at that date</HintPill>
              <HintPill icon="move">Drag a card up/down — manually arrange rows</HintPill>
              <HintPill icon="drag">Drag ◎ handle → drop on node to connect</HintPill>
              <HintPill icon="dblclick">Click ✎ on node to edit</HintPill>
              <HintPill icon="edge">Click × on edge to remove connection</HintPill>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Scrollable tree canvas ───────────────────────────────────────── */}
        <div
          ref={treeScrollRef}
          className="flex-1 overflow-x-auto overflow-y-auto"
          style={{ minHeight: 0, cursor: draw ? 'crosshair' : nodeDrag ? 'grabbing' : editMode ? 'cell' : 'default' }}
          onScroll={syncTimeline}
        >
            <div
              ref={canvasRef}
              className="relative"
              style={{
                width: layout.totalWidth,
                height: Math.max(layout.totalHeight, (nodeDrag?.currentY ?? 0) + NODE_MAX_HEIGHT + 72),
                minHeight: '100%',
              }}
              onMouseMove={onCanvasMouseMove}
              onMouseUp={onCanvasMouseUp}
              onMouseLeave={onCanvasMouseUp}
              onClick={onCanvasClick}
            >
              {/* Empty state */}
              {nodes.length === 0 && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 pointer-events-none">
                  {editMode ? (
                    <>
                      <span className="text-slate-500 text-sm">Click anywhere to place your first node</span>
                      <span className="text-slate-700 text-xs font-mono">or use + above</span>
                    </>
                  ) : (
                    <span className="text-slate-600 text-sm">No projects yet — enable Edit mode to get started</span>
                  )}
                </div>
              )}
              {/* SVG layer — edges + decorative lines */}
              <svg
                className="absolute inset-0 pointer-events-none overflow-visible"
                width={layout.totalWidth}
                height={layout.totalHeight}
              >
                <defs>
                  <filter id="edge-glow" x="-40%" y="-40%" width="180%" height="180%">
                    <feGaussianBlur stdDeviation="1.8" result="blur" />
                    <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
                  </filter>
                </defs>

                {/* Smart edges with fade-through effect */}
                {edges.map(({ from, to, fromNode, toNode }, i) => {
                  const s = displayPositions[from]
                  const tgt = displayPositions[to]
                  if (!s || !tgt) return null
                  const sx = s.x + NODE_WIDTH, sy = s.y + getNodeHeight(fromNode) / 2
                  const tx = tgt.x, ty = tgt.y + getNodeHeight(toNode) / 2
                  const fromColor = finalCompletedNodeIds.has(fromNode.id) ? FINAL_COMPLETED_COLOR : STATUS_COLORS[fromNode.status]
                  const toColor = finalCompletedNodeIds.has(toNode.id) ? FINAL_COMPLETED_COLOR : STATUS_COLORS[toNode.status]
                  return (
                    <SmartEdge
                      key={`${from}-${to}`}
                      fromId={from} toId={to}
                      sx={sx} sy={sy} tx={tx} ty={ty}
                      fromColor={fromColor}
                      toColor={toColor}
                      treeNodes={nodes}
                      positions={displayPositions}
                      animDelay={0.08 + i * 0.055}
                      dimmed={!!draw}
                    />
                  )
                })}

                {/* Remove edge buttons (edit mode) — placed at the actual Bézier midpoint */}
                {editMode && edges.map(({ from, to }) => {
                  const s = displayPositions[from]
                  const tgt = displayPositions[to]
                  if (!s || !tgt) return null
                  const fromNode = nodes.find((n) => n.id === from)
                  const toNode = nodes.find((n) => n.id === to)
                  const sx = s.x + NODE_WIDTH, sy = s.y + (fromNode ? getNodeHeight(fromNode) : NODE_HEIGHT) / 2
                  const tx = tgt.x, ty = tgt.y + (toNode ? getNodeHeight(toNode) : NODE_HEIGHT) / 2
                  const { c1x, c1y, c2x, c2y } = controlPoints(sx, sy, tx, ty)
                  // Bézier point at t=0.5: (P0 + 3P1 + 3P2 + P3) / 8
                  const mx = (sx + 3 * c1x + 3 * c2x + tx) / 8
                  const my = (sy + 3 * c1y + 3 * c2y + ty) / 8
                  return (
                    <g
                      key={`rm-${from}-${to}`}
                      className="pointer-events-auto cursor-pointer"
                      onClick={(e) => { e.stopPropagation(); removeEdge(from, to) }}
                    >
                      <circle cx={mx} cy={my} r={13} fill="transparent" />
                      <circle cx={mx} cy={my} r={9} fill="rgba(10,10,18,0.92)" stroke="rgba(239,68,68,0.55)" strokeWidth={1.2} />
                      <text x={mx} y={my + 4} textAnchor="middle" fontSize={11} fill="rgba(239,68,68,0.85)">×</text>
                    </g>
                  )
                })}

                {/* Live drawing line */}
                {draw && (
                  <>
                    <defs>
                      <marker id="arrowhead" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
                        <path d="M0,0 L6,3 L0,6 Z" fill="rgba(251,191,36,0.8)" />
                      </marker>
                    </defs>
                    <line
                      x1={draw.handleX} y1={draw.handleY}
                      x2={draw.curX} y2={draw.curY}
                      stroke="rgba(251,191,36,0.7)"
                      strokeWidth={1.5}
                      strokeDasharray="5,4"
                      markerEnd="url(#arrowhead)"
                      className="pointer-events-none"
                    />
                    {/* Animate the dash */}
                    <animateTransform
                      attributeName="transform"
                      type="translate"
                      values="0;-9"
                      dur="0.4s"
                      repeatCount="indefinite"
                    />
                  </>
                )}
              </svg>


              {/* Node cards */}
              {nodes.map((node, i) => {
                const pos = displayPositions[node.id]
                if (!pos) return null
                const isFinalCompleted = finalCompletedNodeIds.has(node.id)
                const color = isFinalCompleted ? FINAL_COMPLETED_COLOR : STATUS_COLORS[node.status]
                const isSelected = selectedNode?.id === node.id
                const isHoverTarget = hoverTarget === node.id
                const isDrawSource = draw?.fromId === node.id
                const isLeaf = leafNodeIds.has(node.id)
                const nodeHeight = getNodeHeight(node)

                return (
                  <motion.div
                    key={node.id}
                    data-node
                    className="absolute select-none"
                    style={{
                      left: pos.x,
                      top: pos.y,
                      width: NODE_WIDTH,
                      height: nodeHeight,
                      zIndex: nodeDrag?.id === node.id ? 30 : undefined,
                    }}
                    initial={{ opacity: 0, scale: 0.84 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.3, delay: 0.3 + i * 0.045, ease: 'backOut' }}
                    whileHover={!editMode ? { scale: 1.04, transition: { duration: 0.14 } } : undefined}
                    onClick={() => !editMode && handleNodeClick(node)}
                    onMouseDown={(e) => startNodeDrag(e, node)}
                    onMouseEnter={() => draw && draw.fromId !== node.id && setHoverTarget(node.id)}
                    onMouseLeave={() => draw && setHoverTarget(null)}
                  >
                    {/* Leaf node pulse glow */}
                    {isLeaf && (
                      <motion.div
                        className="absolute inset-0 rounded-xl pointer-events-none"
                        animate={{ opacity: [0.35, 0.85, 0.35] }}
                        transition={{ duration: 2.8, repeat: Infinity, ease: 'easeInOut' }}
                        style={{ boxShadow: `0 0 22px ${color}55, 0 0 7px ${color}35` }}
                      />
                    )}

                    <div
                      className="w-full h-full rounded-xl p-3 flex flex-col"
                      style={{
                        background: isHoverTarget
                          ? `${color}20`
                          : isSelected
                          ? `${color}12`
                          : 'rgba(255,255,255,0.028)',
                        border: `1px solid ${color}${isHoverTarget ? '60' : isSelected ? '45' : isLeaf ? '42' : '2a'}`,
                        boxShadow:
                          isHoverTarget
                            ? `0 0 22px ${color}55`
                            : isFinalCompleted
                            ? `0 0 22px ${color}48, 0 0 8px ${color}35`
                            : node.status === 'active'
                            ? `0 0 16px ${color}40, 0 0 5px ${color}28`
                            : 'none',
                        backdropFilter: 'blur(12px)',
                        opacity: isDrawSource ? 0.5 : 1,
                        cursor: editMode ? (nodeDrag?.id === node.id ? 'grabbing' : 'grab') : 'pointer',
                        transition: 'background 0.15s, border-color 0.15s, box-shadow 0.15s',
                      }}
                    >
                      <div className="flex items-center gap-1.5 mb-1">
                        <span
                          className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                          style={{
                            backgroundColor: color,
                            boxShadow: node.status === 'active' || isFinalCompleted ? `0 0 7px ${color}` : 'none',
                          }}
                        />
                        <span className="text-[9px] font-semibold tracking-wider uppercase flex-1" style={{ color }}>
                          {STATUS_LABELS[node.status]}
                        </span>

                        {/* Category tag (view) or cycle button (edit) */}
                        {node.category && !editMode && (
                          <span
                            className="text-[8px] font-semibold px-1.5 py-0.5 rounded-md"
                            style={{
                              color: CATEGORY_COLORS[node.category],
                              background: CATEGORY_COLORS[node.category] + '20',
                              border: `1px solid ${CATEGORY_COLORS[node.category]}30`,
                            }}
                          >
                            {CATEGORY_LABELS[node.category]}
                          </span>
                        )}
                        {editMode && (
                          <>
                            <button
                              data-node
                              className="text-[8px] font-semibold px-1.5 py-0.5 rounded-md border transition-all hover:opacity-80"
                              style={node.category ? {
                                color: CATEGORY_COLORS[node.category],
                                background: CATEGORY_COLORS[node.category] + '20',
                                borderColor: CATEGORY_COLORS[node.category] + '45',
                              } : {
                                color: 'rgba(148,163,184,0.45)',
                                background: 'rgba(255,255,255,0.04)',
                                borderColor: 'rgba(255,255,255,0.1)',
                              }}
                              onClick={(e) => {
                                e.stopPropagation()
                                const idx = CATEGORY_CYCLE.indexOf(node.category)
                                const next = CATEGORY_CYCLE[(idx + 1) % CATEGORY_CYCLE.length]
                                updateNode(node.id, { category: next })
                              }}
                              title="Cycle category (SW / HW / SW+HW)"
                            >
                              {node.category ? CATEGORY_LABELS[node.category] : '+'}
                            </button>
                            <button
                              data-node
                              className="p-0.5 rounded text-slate-600 hover:text-amber-400 transition-colors"
                              onClick={(e) => openEdit(e, node)}
                            >
                              <Pencil size={10} />
                            </button>
                          </>
                        )}
                      </div>

                      <p className="text-[12.5px] font-semibold text-slate-100 leading-tight line-clamp-3">
                        {node.title}
                      </p>

                      <div className="flex items-end justify-between mt-auto pt-1.5">
                        {node.dateStart ? (
                          <p className="text-[10px] text-slate-500 font-mono">
                            {fmtMonthYear(node.dateStart)}
                            {node.dateEnd ? ` – ${fmtMonthYear(node.dateEnd)}` : ' →'}
                          </p>
                        ) : <div />}
                        {editMode && (
                          <div className="flex gap-0.5" data-node>
                            <button
                              data-node
                              className="text-slate-600 hover:text-amber-300 transition-colors text-[11px] leading-none px-0.5"
                              onClick={(e) => {
                                e.stopPropagation()
                                updateNode(node.id, { rowHint: Math.max(0, rowIndexFromY(pos.y) - 1) })
                              }}
                              title="Move up"
                            >↑</button>
                            <button
                              data-node
                              className="text-slate-600 hover:text-amber-300 transition-colors text-[11px] leading-none px-0.5"
                              onClick={(e) => {
                                e.stopPropagation()
                                updateNode(node.id, { rowHint: rowIndexFromY(pos.y) + 1 })
                              }}
                              title="Move down"
                            >↓</button>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Connection handles (edit mode) — left = become child, right = become parent */}
                    {editMode && !isDrawSource && (
                      <>
                        <div
                          data-node
                          className="absolute flex items-center justify-center rounded-full cursor-crosshair transition-all hover:scale-125"
                          style={{
                            left: -10,
                            top: '50%',
                            transform: 'translateY(-50%)',
                            width: 16,
                            height: 16,
                            background: color + '1a',
                            border: `1.5px dashed ${color}60`,
                            boxShadow: `0 0 6px ${color}30`,
                          }}
                          onMouseDown={(e) => startDraw(e, node.id, 'left')}
                          title="Drag to set parent"
                        >
                          <div className="w-1.5 h-1.5 rounded-full" style={{ background: color + 'aa' }} />
                        </div>
                        <div
                          data-node
                          className="absolute flex items-center justify-center rounded-full cursor-crosshair transition-all hover:scale-125"
                          style={{
                            right: -10,
                            top: '50%',
                            transform: 'translateY(-50%)',
                            width: 16,
                            height: 16,
                            background: color + '28',
                            border: `1.5px solid ${color}80`,
                            boxShadow: `0 0 8px ${color}40`,
                          }}
                          onMouseDown={(e) => startDraw(e, node.id, 'right')}
                          title="Drag to set child"
                        >
                          <div className="w-2 h-2 rounded-full" style={{ background: color }} />
                        </div>
                      </>
                    )}
                  </motion.div>
                )
              })}
            </div>
        </div>

        {/* ── Timeline bar ─────────────────────────────────────────────────── */}
        <div
          ref={timelineScrollRef}
          className="flex-shrink-0 overflow-x-hidden"
          style={{
            height: 44,
            borderTop: '1px solid rgba(255,255,255,0.07)',
            background: 'rgba(5,5,8,0.94)',
            backdropFilter: 'blur(16px)',
          }}
        >
          <div className="relative" style={{ width: layout.totalWidth, height: 44 }}>
            {/* Context for future runs: this dot anchors the tree timeline to real time; keep it synced with the same timeScale math as node placement. */}
            {todayX !== null && (
              <div
                className="absolute top-0 flex flex-col items-center"
                style={{ left: todayX, transform: 'translateX(-50%)' }}
              >
                <motion.div
                  className="rounded-full"
                  style={{
                    width: 8,
                    height: 8,
                    marginTop: 5,
                    background: '#38bdf8',
                    boxShadow: '0 0 14px rgba(56,189,248,0.85), 0 0 28px rgba(168,85,247,0.35)',
                  }}
                  animate={{ opacity: [1, 0.15, 1], scale: [1, 0.85, 1] }}
                  transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
                />
                <div
                  style={{
                    width: 1,
                    height: 12,
                    marginTop: 2,
                    background: 'linear-gradient(to bottom, rgba(56,189,248,0.8), rgba(56,189,248,0))',
                  }}
                />
              </div>
            )}
            {layout.ticks.map((tick, i) => (
              <div
                key={i}
                className="absolute top-0 flex flex-col items-center"
                style={{ left: tick.x, transform: 'translateX(-50%)' }}
              >
                <div
                  style={{
                    width: 1,
                    height: tick.isMajor ? 11 : 6,
                    background: tick.isMajor ? 'rgba(255,255,255,0.24)' : 'rgba(255,255,255,0.1)',
                  }}
                />
                <span
                  className="font-mono mt-1 whitespace-nowrap"
                  style={{
                    fontSize: tick.isMajor ? '10px' : '9px',
                    color: tick.isMajor ? 'rgba(255,255,255,0.42)' : 'rgba(255,255,255,0.18)',
                    fontWeight: tick.isMajor ? 600 : 400,
                  }}
                >
                  {tick.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── View-mode node detail panel ──────────────────────────────────── */}
      {!editMode && (
        <NodeModal
          node={selectedNode}
          tree={selectedTree}
          onClose={() => { setSelectedNode(null); setSelectedTree(null) }}
          onNodeClick={handleNodeClick}
        />
      )}

      {/* ── Inline node editor ───────────────────────────────────────────── */}
      <AnimatePresence>
        {editor && (
          <InlineNodeEditor
            key="editor"
            node={editor.node}
            treeId={editor.treeId}
            initialDate={editor.initialDate}
            screenX={editor.screenX}
            screenY={editor.screenY}
            onClose={() => setEditor(null)}
          />
        )}
      </AnimatePresence>
    </>
  )
}

function HintPill({ icon, children }: { icon: string; children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-1.5 text-[10px] text-amber-400/60">
      <span className="opacity-70">{icon === 'click' ? '⊕' : icon === 'move' ? '↕' : icon === 'drag' ? '◉' : icon === 'dblclick' ? '✎' : '×'}</span>
      {children}
    </span>
  )
}
