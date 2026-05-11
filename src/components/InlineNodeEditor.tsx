import { useState, useRef, useEffect, useLayoutEffect, useCallback, useMemo } from 'react'
import { motion } from 'framer-motion'
import { X, Check, Trash2, Search } from 'lucide-react'
import { ProjectNode, ProjectTree, NodeStatus, NodeCategory, STATUS_COLORS, STATUS_LABELS, CATEGORY_COLORS, CATEGORY_LABELS, CATEGORY_CYCLE } from '../types'
import { useStore } from '../store/useStore'
import { fmtMonthYear } from '../utils/treeLayout'
import { mediaFromNode, normalizeMediaItems, primaryMediaUrl } from '../utils/media'
import NodeMediaFields from './NodeMediaFields'

const MONTH_NAMES = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec']

/** Parse freeform "Sep 2024", "9/2024", "2024-09", "9 24" → "YYYY-MM" or null */
function parseMonthYear(raw: string): string | null {
  const s = raw.trim()
  if (!s) return ''
  if (/^\d{4}-\d{2}$/.test(s)) return s

  // "Mon YYYY" / "Month YYYY" / "Mon YY"
  const named = s.match(/^([a-zA-Z]+)\s+(\d{2,4})$/)
  if (named) {
    const mIdx = MONTH_NAMES.findIndex((m) => named[1].toLowerCase().startsWith(m))
    const yr = named[2].length === 2 ? '20' + named[2] : named[2]
    if (mIdx !== -1 && yr.length === 4) return `${yr}-${String(mIdx + 1).padStart(2, '0')}`
  }

  // "YYYY Mon"
  const yearFirst = s.match(/^(\d{4})\s+([a-zA-Z]+)$/)
  if (yearFirst) {
    const mIdx = MONTH_NAMES.findIndex((m) => yearFirst[2].toLowerCase().startsWith(m))
    if (mIdx !== -1) return `${yearFirst[1]}-${String(mIdx + 1).padStart(2, '0')}`
  }

  // "M/YYYY" "MM/YYYY" "M-YYYY" "M YYYY"
  const numSlash = s.match(/^(\d{1,2})[\/\-\s](\d{2,4})$/)
  if (numSlash) {
    const m = parseInt(numSlash[1])
    const yr = numSlash[2].length === 2 ? '20' + numSlash[2] : numSlash[2]
    if (m >= 1 && m <= 12 && yr.length === 4) return `${yr}-${String(m).padStart(2, '0')}`
  }

  // "YYYY/M" "YYYY-M"
  const yearNum = s.match(/^(\d{4})[\/\-](\d{1,2})$/)
  if (yearNum) {
    const m = parseInt(yearNum[2])
    if (m >= 1 && m <= 12) return `${yearNum[1]}-${String(m).padStart(2, '0')}`
  }

  return null
}

interface Props {
  node: ProjectNode | null
  /** treeId to add this node into. If omitted, store auto-assigns. */
  treeId?: string
  initialDate?: string
  screenX: number
  screenY: number
  onClose: () => void
}

const inp =
  'w-full px-3 py-1.5 text-xs text-slate-100 rounded-lg outline-none bg-[#0b1020]/95 border border-white/12 placeholder:text-slate-500 focus:border-white/25 focus:bg-[#111827] transition-all'
const sel = inp + ' cursor-pointer'

export default function InlineNodeEditor({ node, treeId, initialDate, screenX, screenY, onClose }: Props) {
  const { nodes, trees, addNode, updateNode, deleteNode } = useStore()

  const [title, setTitle] = useState(node?.title ?? '')
  const [status, setStatus] = useState<NodeStatus>(node?.status ?? 'planned')
  const [dateStart, setDateStart] = useState(node?.dateStart ? node.dateStart.slice(0, 7) : initialDate ?? '')
  const [dateEnd, setDateEnd] = useState(node?.dateEnd ? node.dateEnd.slice(0, 7) : '')
  const [desc, setDesc] = useState(node?.description ?? '')
  const [media, setMedia] = useState(() => mediaFromNode(node))
  const [parentIds, setParentIds] = useState<string[]>(node?.parentIds ?? [])
  const [category, setCategory] = useState<NodeCategory | undefined>(node?.category)
  const [search, setSearch] = useState('')
  const [showSearch, setShowSearch] = useState(false)

  const ref = useRef<HTMLDivElement>(null)

  const disallowedParentIds = useMemo(() => {
    if (!node) return new Set<string>()
    const childrenByParent = new Map<string, string[]>()
    for (const candidate of nodes) {
      for (const parentId of candidate.parentIds) {
        const children = childrenByParent.get(parentId)
        if (children) children.push(candidate.id)
        else childrenByParent.set(parentId, [candidate.id])
      }
    }

    const descendants = new Set<string>()
    const stack = [...(childrenByParent.get(node.id) ?? [])]
    while (stack.length > 0) {
      const id = stack.pop()!
      if (descendants.has(id)) continue
      descendants.add(id)
      stack.push(...(childrenByParent.get(id) ?? []))
    }
    return descendants
  }, [node, nodes])

  // Nodes available for parent selection — prefer same tree, but allow cross-tree
  const effectiveTreeId = treeId ?? node?.treeId
  const candidateNodes = effectiveTreeId
    ? nodes.filter((n) => n.treeId === effectiveTreeId && n.id !== node?.id && !disallowedParentIds.has(n.id))
    : nodes.filter((n) => n.id !== node?.id && !disallowedParentIds.has(n.id))

  const searchResults = search.trim()
    ? candidateNodes.filter((n) => n.title.toLowerCase().includes(search.toLowerCase())).slice(0, 6)
    : []
  const selectedParents = nodes.filter((n) => parentIds.includes(n.id))
  const dateOrderInvalid = Boolean(dateStart && dateEnd && dateEnd < dateStart)

  // Derive tree label for the header
  const treeLabel = (() => {
    if (node) return node.treeId ? (trees.find((t) => t.id === node.treeId)?.name ?? 'Edit node') : 'Edit node'
    return effectiveTreeId ? (trees.find((t) => t.id === effectiveTreeId)?.name ?? 'New node') : 'New node'
  })()

  const clampToViewport = useCallback(() => {
    if (!ref.current) return
    const rect = ref.current.getBoundingClientRect()
    const vw = window.innerWidth, vh = window.innerHeight
    const margin = 8
    const visibleHeight = Math.min(rect.height, vh - margin * 2)
    const left = Math.max(margin, Math.min(screenX, vw - rect.width - margin))
    const top = Math.max(margin, Math.min(screenY, vh - visibleHeight - margin))

    ref.current.style.left = `${left}px`
    ref.current.style.top = `${top}px`
  }, [screenX, screenY])

  // Clamp after any content expansion; bottom-opened editors must keep their footer reachable.
  useLayoutEffect(() => {
    clampToViewport()
  }, [clampToViewport, dateStart, media.length, selectedParents.length, showSearch, searchResults.length])

  useEffect(() => {
    window.addEventListener('resize', clampToViewport)
    return () => window.removeEventListener('resize', clampToViewport)
  }, [clampToViewport])

  function save() {
    if (!title.trim() || dateOrderInvalid) return
    // Keep imageUrl mirrored to the main media item so old saved data and preview code stay compatible.
    const savedMedia = normalizeMediaItems(media)
    const safeParentIds = parentIds.filter((id) => id !== node?.id && !disallowedParentIds.has(id))
    const data = {
      treeId: effectiveTreeId,
      title: title.trim(),
      status,
      dateStart: dateStart || undefined,
      dateEnd: dateEnd || undefined,
      description: desc.trim() || undefined,
      imageUrl: primaryMediaUrl(savedMedia),
      media: savedMedia.length ? savedMedia : undefined,
      parentIds: safeParentIds,
      category,
    }
    if (node) updateNode(node.id, data)
    else addNode(data as Omit<ProjectNode, 'id'>)
    onClose()
  }

  function remove() {
    if (node && confirm(`Delete "${node.title}"?`)) { deleteNode(node.id); onClose() }
  }

  function toggleParent(id: string) {
    // Prevent descendant-as-parent cycles; allow removing an already-selected bad parent from older data.
    if ((id === node?.id || disallowedParentIds.has(id)) && !parentIds.includes(id)) return
    setParentIds((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]))
  }

  return (
    <motion.div
      ref={ref}
      key="inline-editor"
      initial={{ opacity: 0, scale: 0.93, y: 6 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.93, y: 6 }}
      transition={{ duration: 0.18 }}
      className="fixed z-[60] flex max-h-[calc(100vh-1rem)] w-[22rem] max-w-[calc(100vw-1rem)] flex-col rounded-2xl shadow-2xl overflow-hidden"
      style={{
        left: screenX,
        top: screenY,
        background: 'rgba(8,8,16,0.98)',
        border: '1px solid rgba(255,255,255,0.1)',
        backdropFilter: 'blur(28px)',
        boxShadow: '0 24px 64px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.05)',
      }}
    >
      {/* Header */}
      <div
        className="flex flex-shrink-0 items-center justify-between px-4 py-3"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
      >
        <span className="text-[10px] font-semibold tracking-wider uppercase text-slate-500">
          {node ? `Edit · ${treeLabel}` : treeLabel}
        </span>
        <button onClick={onClose} className="text-slate-500 hover:text-slate-200 transition-colors">
          <X size={13} />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 space-y-2.5">
        {/* Title */}
        <input
          autoFocus
          className={inp}
          placeholder="Node title *"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && save()}
        />

        {/* Status + Date row */}
        <div className="grid grid-cols-2 gap-2">
          <select
            className={sel}
            value={status}
            onChange={(e) => setStatus(e.target.value as NodeStatus)}
          >
            {(Object.keys(STATUS_LABELS) as NodeStatus[]).map((s) => (
              <option key={s} value={s} className="bg-[#0e0e18]" style={{ color: STATUS_COLORS[s] }}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>
          <MonthInput
            className={inp}
            placeholder="Start (e.g. Sep 2024)"
            value={dateStart}
            onChange={setDateStart}
          />
        </div>

        {/* End date */}
        {dateStart && (
          <>
            <MonthInput
              className={inp}
              placeholder="End (e.g. Mar 2025)"
              value={dateEnd}
              onChange={setDateEnd}
            />
            {dateOrderInvalid && (
              <p className="text-[10px] leading-snug text-red-300">
                End date must be the same as or after the start date.
              </p>
            )}
          </>
        )}

        {/* Category */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-slate-600">Category</span>
          <button
            type="button"
            className="text-[9px] font-semibold px-2 py-1 rounded-md border transition-all hover:opacity-80"
            style={category ? {
              color: CATEGORY_COLORS[category],
              background: CATEGORY_COLORS[category] + '20',
              borderColor: CATEGORY_COLORS[category] + '45',
            } : {
              color: 'rgba(148,163,184,0.5)',
              background: 'rgba(255,255,255,0.04)',
              borderColor: 'rgba(255,255,255,0.1)',
            }}
            onClick={() => {
              const idx = CATEGORY_CYCLE.indexOf(category)
              setCategory(CATEGORY_CYCLE[(idx + 1) % CATEGORY_CYCLE.length])
            }}
          >
            {category ? CATEGORY_LABELS[category] : '+ category'}
          </button>
        </div>

        {/* Description */}
        <textarea
          className={inp + ' resize-none'}
          rows={2}
          placeholder="Description (optional)"
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
        />

        <NodeMediaFields
          media={media}
          onChange={setMedia}
          compact
          inputClassName={inp}
          selectClassName={sel}
        />

        {/* Parents */}
        <div>
          <button
            onClick={() => setShowSearch((x) => !x)}
            className="flex items-center gap-1.5 text-[10px] text-slate-500 hover:text-slate-300 transition-colors mb-1.5"
          >
            <Search size={10} />
            {showSearch ? 'Hide' : 'Connect parent nodes'}
          </button>

          {showSearch && (
            <div className="space-y-1.5">
              <input
                autoFocus
                className={inp}
                placeholder="Search nodes…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {searchResults.length > 0 && (
                <div
                  className="rounded-lg overflow-hidden"
                  style={{ border: '1px solid rgba(255,255,255,0.07)' }}
                >
                  {searchResults.map((n) => {
                    const checked = parentIds.includes(n.id)
                    const c = STATUS_COLORS[n.status]
                    return (
                      <button
                        key={n.id}
                        onClick={() => toggleParent(n.id)}
                        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-white/5 transition-colors text-left"
                      >
                        <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: c }} />
                        <span className="text-xs text-slate-300 flex-1 truncate">{n.title}</span>
                        {checked && <Check size={11} style={{ color: c }} />}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {selectedParents.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {selectedParents.map((n) => (
                <span
                  key={n.id}
                  className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full cursor-pointer hover:opacity-70"
                  style={{
                    color: STATUS_COLORS[n.status],
                    background: STATUS_COLORS[n.status] + '18',
                    border: `1px solid ${STATUS_COLORS[n.status]}28`,
                  }}
                  onClick={() => toggleParent(n.id)}
                >
                  {n.title.slice(0, 20)}{n.title.length > 20 ? '…' : ''}
                  <X size={8} />
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div
        className="flex flex-shrink-0 items-center justify-between px-4 py-3"
        style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}
      >
        {node ? (
          <button
            onClick={remove}
            className="flex items-center gap-1 text-[11px] text-slate-600 hover:text-red-400 transition-colors"
          >
            <Trash2 size={11} /> Delete
          </button>
        ) : <div />}

        <div className="flex items-center gap-2">
          <button onClick={onClose} className="text-xs text-slate-500 hover:text-slate-300 transition-colors">
            Cancel
          </button>
          <button
            onClick={save}
            disabled={!title.trim() || dateOrderInvalid}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-all disabled:opacity-30"
            style={{ background: 'linear-gradient(135deg,#7c3aed,#0891b2)', color: 'white' }}
          >
            <Check size={11} />
            {node ? 'Save' : 'Add'}
          </button>
        </div>
      </div>
    </motion.div>
  )
}

function MonthInput({ value, onChange, placeholder, className }: {
  value: string
  onChange: (v: string) => void
  placeholder: string
  className: string
}) {
  const [focused, setFocused] = useState(false)
  const [text, setText] = useState('')

  // Sync display text whenever an external value arrives (e.g. initial load)
  useEffect(() => {
    if (!focused) setText(value ? fmtMonthYear(value) : '')
  }, [value, focused])

  function handleFocus() {
    setFocused(true)
    setText(value ? fmtMonthYear(value) : '')
  }

  function handleBlur() {
    setFocused(false)
    if (!text.trim()) { onChange(''); setText(''); return }
    const parsed = parseMonthYear(text)
    if (parsed !== null) {
      onChange(parsed)
      setText(parsed ? fmtMonthYear(parsed) : '')
    } else {
      // Revert display to last valid value; don't corrupt store
      setText(value ? fmtMonthYear(value) : '')
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.currentTarget.blur()
    }
  }

  return (
    <input
      type="text"
      className={className}
      placeholder={placeholder}
      value={focused ? text : (value ? fmtMonthYear(value) : '')}
      onChange={(e) => setText(e.target.value)}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
    />
  )
}
