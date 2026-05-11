import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Lock, Plus, Pencil, Trash2, ChevronDown, AlertTriangle, X, Check } from 'lucide-react'
import { useStore } from '../store/useStore'
import { ProjectNode, NodeStatus, NodeCategory, STATUS_COLORS, STATUS_LABELS, CATEGORY_COLORS, CATEGORY_LABELS } from '../types'
import NodeMediaFields from '../components/NodeMediaFields'
import { mediaFromNode, normalizeMediaItems, primaryMediaUrl } from '../utils/media'

// ── Demo-only password. This is NOT production security. ─────────────────────
const DEMO_PASSWORD = 'admin123'

// ── Shared form field components ─────────────────────────────────────────────
function Field({
  label,
  children,
  hint,
}: {
  label: string
  children: React.ReactNode
  hint?: string
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-slate-400">{label}</span>
      {children}
      {hint && <span className="text-[10px] text-slate-600">{hint}</span>}
    </label>
  )
}

const inputCls =
  'w-full px-3 py-2 text-sm text-slate-100 rounded-lg outline-none transition-all bg-[#0b1020]/95 border border-white/12 placeholder:text-slate-500 focus:border-white/25 focus:bg-[#111827]'

const selectCls =
  'w-full px-3 py-2 text-sm text-slate-100 rounded-lg outline-none bg-[#0b1020]/95 border border-white/12 focus:border-white/25 focus:bg-[#111827] cursor-pointer'

type NodeFormData = Omit<ProjectNode, 'id' | 'treeId'> & { treeId?: string }

// ── Node form ─────────────────────────────────────────────────────────────────
function NodeForm({
  initial,
  onSave,
  onCancel,
}: {
  initial?: ProjectNode
  onSave: (data: NodeFormData) => void
  onCancel: () => void
}) {
  const { nodes } = useStore()

  const [title, setTitle] = useState(initial?.title ?? '')
  const [desc, setDesc] = useState(initial?.description ?? '')
  const [media, setMedia] = useState(() => mediaFromNode(initial))
  const [dateStart, setDateStart] = useState(initial?.dateStart ? initial.dateStart.slice(0, 7) : '')
  const [dateEnd, setDateEnd] = useState(initial?.dateEnd ? initial.dateEnd.slice(0, 7) : '')
  const [status, setStatus] = useState<NodeStatus>(initial?.status ?? 'planned')
  const [category, setCategory] = useState<NodeCategory | undefined>(initial?.category)
  const [parentIds, setParentIds] = useState<string[]>(initial?.parentIds ?? [])

  const candidateNodes = nodes.filter((n) => n.id !== initial?.id)

  function toggleParent(id: string) {
    setParentIds((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id],
    )
  }

  return (
    <div className="space-y-4 py-2">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Status *">
          <select
            className={selectCls}
            value={status}
            onChange={(e) => setStatus(e.target.value as NodeStatus)}
          >
            {(Object.keys(STATUS_LABELS) as NodeStatus[]).map((s) => (
              <option key={s} value={s} className="bg-[#0e0e16]">
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Category">
          <select
            className={selectCls}
            value={category ?? ''}
            onChange={(e) => setCategory((e.target.value as NodeCategory) || undefined)}
          >
            <option value="" className="bg-[#0e0e16]">— none —</option>
            {(['software', 'hardware', 'mixed'] as NodeCategory[]).map((c) => (
              <option key={c} value={c} className="bg-[#0e0e16]" style={{ color: CATEGORY_COLORS[c] }}>
                {CATEGORY_LABELS[c]}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Field label="Title *">
        <input
          className={inputCls}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Magnetic Bearing Demo"
        />
      </Field>

      <Field label="Description">
        <textarea
          className={inputCls + ' resize-none'}
          rows={3}
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          placeholder="What does this project involve and what does it teach?"
        />
      </Field>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Start month" hint="Leave blank if unknown">
          <input
            type="month"
            className={inputCls}
            value={dateStart}
            onChange={(e) => setDateStart(e.target.value)}
          />
        </Field>
        <Field label="End month" hint="Leave blank if ongoing">
          <input
            type="month"
            className={inputCls}
            value={dateEnd}
            onChange={(e) => setDateEnd(e.target.value)}
          />
        </Field>
      </div>

      <NodeMediaFields
        media={media}
        onChange={setMedia}
        inputClassName={inputCls}
        selectClassName={selectCls}
      />

      {candidateNodes.length > 0 && (
        <Field label="Parent nodes" hint="Select which nodes this project builds on">
          <div
            className="rounded-lg p-3 space-y-1.5 max-h-36 overflow-y-auto"
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}
          >
            {candidateNodes.map((n) => {
              const checked = parentIds.includes(n.id)
              return (
                <label
                  key={n.id}
                  className="flex items-center gap-2.5 cursor-pointer group"
                >
                  <div
                    onClick={() => toggleParent(n.id)}
                    className="w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-all"
                    style={{
                      borderColor: checked ? STATUS_COLORS[n.status] : 'rgba(255,255,255,0.15)',
                      background: checked ? STATUS_COLORS[n.status] + '30' : 'transparent',
                    }}
                  >
                    {checked && <Check size={10} style={{ color: STATUS_COLORS[n.status] }} />}
                  </div>
                  <span
                    className="text-xs text-slate-400 group-hover:text-slate-200 transition-colors"
                    onClick={() => toggleParent(n.id)}
                  >
                    {n.title}
                  </span>
                  <span
                    className="ml-auto text-[9px] px-1.5 py-0.5 rounded-full"
                    style={{
                      color: STATUS_COLORS[n.status],
                      background: STATUS_COLORS[n.status] + '18',
                    }}
                  >
                    {STATUS_LABELS[n.status]}
                  </span>
                </label>
              )
            })}
          </div>
        </Field>
      )}

      <div className="flex justify-end gap-3 pt-1">
        <button
          onClick={onCancel}
          className="px-4 py-2 text-sm text-slate-400 hover:text-slate-200 transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={() => {
            if (!title.trim()) return
            // Mirror the ordered media list into imageUrl for old localStorage nodes and legacy callers.
            const savedMedia = normalizeMediaItems(media)
            onSave({
              treeId: initial?.treeId,
              title: title.trim(),
              description: desc.trim() || undefined,
              imageUrl: primaryMediaUrl(savedMedia),
              media: savedMedia.length ? savedMedia : undefined,
              dateStart: dateStart || undefined,
              dateEnd: dateEnd || undefined,
              status,
              category,
              parentIds,
            })
          }}
          className="px-4 py-2 text-sm font-medium rounded-lg bg-white/10 hover:bg-white/16 text-slate-100 transition-colors disabled:opacity-40"
          disabled={!title.trim()}
        >
          {initial ? 'Save changes' : 'Add node'}
        </button>
      </div>
    </div>
  )
}

// ── Collapsible section ───────────────────────────────────────────────────────
function Section({
  title,
  count,
  children,
  action,
}: {
  title: string
  count: number
  children: React.ReactNode
  action?: React.ReactNode
}) {
  const [open, setOpen] = useState(true)
  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{
        background: 'rgba(255,255,255,0.018)',
        border: '1px solid rgba(255,255,255,0.07)',
      }}
    >
      <div className="flex items-center justify-between px-6 py-4">
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-3 group"
        >
          <h2 className="text-sm font-semibold text-slate-200">{title}</h2>
          <span className="text-xs text-slate-600 px-2 py-0.5 rounded-full bg-white/5">
            {count}
          </span>
          <motion.span
            animate={{ rotate: open ? 180 : 0 }}
            transition={{ duration: 0.2 }}
            className="text-slate-600"
          >
            <ChevronDown size={14} />
          </motion.span>
        </button>
        {action}
      </div>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ── Modal wrapper ─────────────────────────────────────────────────────────────
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <AnimatePresence>
      <motion.div
        key="modal-bg"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
        onClick={onClose}
      >
        <motion.div
          key="modal-box"
          initial={{ opacity: 0, scale: 0.95, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 16 }}
          transition={{ duration: 0.2 }}
          className="w-full max-w-lg rounded-2xl overflow-hidden"
          style={{
            background: 'rgba(10,10,18,0.97)',
            border: '1px solid rgba(255,255,255,0.1)',
            backdropFilter: 'blur(24px)',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div
            className="flex items-center justify-between px-6 py-4"
            style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
          >
            <h3 className="text-sm font-semibold text-slate-100">{title}</h3>
            <button onClick={onClose} className="text-slate-500 hover:text-slate-200 transition-colors">
              <X size={16} />
            </button>
          </div>
          <div className="px-6 pb-6 max-h-[75vh] overflow-y-auto">{children}</div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}

// ── Main admin page ───────────────────────────────────────────────────────────
type AdminModal =
  | { type: 'addNode' }
  | { type: 'editNode'; node: ProjectNode }
  | null

export default function Admin() {
  const { nodes, addNode, updateNode, deleteNode, resetToSeed,
          adminAuthed, setAdminAuthed } = useStore()
  const [pw, setPw] = useState('')
  const [pwError, setPwError] = useState(false)
  const [modal, setModal] = useState<AdminModal>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

  function tryLogin() {
    if (pw === DEMO_PASSWORD) {
      setAdminAuthed(true)
      setPwError(false)
    } else {
      setPwError(true)
    }
  }

  // ── Login gate ──────────────────────────────────────────────────────────────
  if (!adminAuthed) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="w-full max-w-sm"
        >
          <div className="flex flex-col items-center mb-8">
            <div
              className="w-12 h-12 rounded-2xl flex items-center justify-center mb-4"
              style={{
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.1)',
              }}
            >
              <Lock size={20} className="text-slate-400" />
            </div>
            <h1 className="text-xl font-bold text-slate-100">Admin</h1>
            <p className="text-xs text-slate-500 mt-1 text-center">
              Local demo only — not production secure
            </p>
          </div>

          <div
            className="rounded-2xl p-6 space-y-4"
            style={{
              background: 'rgba(255,255,255,0.025)',
              border: '1px solid rgba(255,255,255,0.08)',
            }}
          >
            <div
              className="flex items-start gap-2 p-3 rounded-lg text-xs text-amber-400"
              style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.18)' }}
            >
              <AlertTriangle size={13} className="mt-0.5 flex-shrink-0" />
              <span>
                Password is stored in plain text for local use only. Default:{' '}
                <code className="font-mono">admin123</code>
              </span>
            </div>

            <div className="space-y-3">
              <input
                type="password"
                className={inputCls + (pwError ? ' border-red-500/50' : '')}
                placeholder="Password"
                value={pw}
                onChange={(e) => {
                  setPw(e.target.value)
                  setPwError(false)
                }}
                onKeyDown={(e) => e.key === 'Enter' && tryLogin()}
                autoFocus
              />
              {pwError && <p className="text-xs text-red-400">Incorrect password</p>}
              <button
                onClick={tryLogin}
                className="w-full py-2.5 text-sm font-medium rounded-xl text-white transition-all"
                style={{
                  background: 'linear-gradient(135deg, #7c3aed, #0891b2)',
                  boxShadow: '0 0 20px rgba(124,58,237,0.3)',
                }}
              >
                Enter
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    )
  }

  // ── Authenticated admin ─────────────────────────────────────────────────────
  return (
    <div className="px-6 md:px-10 lg:px-16 py-10 max-w-4xl mx-auto">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="flex items-center justify-between mb-8"
      >
        <div>
          <p className="text-xs tracking-[0.2em] uppercase text-slate-500 font-mono mb-1">
            Local demo mode
          </p>
          <h1 className="text-2xl font-bold text-slate-100">Admin Panel</h1>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              if (confirm('Reset all data to the original seed data?')) resetToSeed()
            }}
            className="text-xs text-slate-500 hover:text-slate-300 transition-colors px-3 py-1.5 rounded-lg hover:bg-white/5"
          >
            Reset to seed
          </button>
          <button
            onClick={() => setAdminAuthed(false)}
            className="text-xs text-slate-500 hover:text-slate-300 transition-colors flex items-center gap-1.5 px-3 py-1.5 rounded-lg hover:bg-white/5"
          >
            <Lock size={11} />
            Log out
          </button>
        </div>
      </motion.div>

      <div className="space-y-5">
        {/* Nodes section */}
        <Section
          title="Nodes"
          count={nodes.length}
          action={
            <button
              onClick={() => setModal({ type: 'addNode' })}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg text-slate-300 hover:text-slate-100 bg-white/6 hover:bg-white/10 transition-all border border-white/8"
            >
              <Plus size={12} />
              New node
            </button>
          }
        >
          {nodes.length === 0 ? (
            <p className="px-6 py-6 text-sm text-slate-600">No nodes yet.</p>
          ) : (
            <div className="divide-y divide-white/4">
              {nodes.map((node) => (
                <div
                  key={node.id}
                  className="flex items-center justify-between px-6 py-3.5 hover:bg-white/3 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ backgroundColor: STATUS_COLORS[node.status] }}
                    />
                    <div className="min-w-0">
                      <p className="text-sm text-slate-200 truncate">{node.title}</p>
                      <p className="text-xs text-slate-600">
                        <span style={{ color: STATUS_COLORS[node.status] }}>
                          {STATUS_LABELS[node.status]}
                        </span>
                        {node.parentIds.length > 0 && (
                          <span className="text-slate-700"> · {node.parentIds.length} parent{node.parentIds.length > 1 ? 's' : ''}</span>
                        )}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0 ml-4">
                    <button
                      onClick={() => setModal({ type: 'editNode', node })}
                      className="p-2 rounded-lg text-slate-500 hover:text-slate-200 hover:bg-white/8 transition-all"
                    >
                      <Pencil size={13} />
                    </button>
                    <button
                      onClick={() => setDeleteConfirm(node.id)}
                      className="p-2 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/8 transition-all"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Section>
      </div>

      {/* Modals */}
      {modal?.type === 'addNode' && (
        <Modal title="Add node" onClose={() => setModal(null)}>
          <NodeForm
            onSave={(data) => {
              addNode(data as Omit<ProjectNode, 'id'>)
              setModal(null)
            }}
            onCancel={() => setModal(null)}
          />
        </Modal>
      )}

      {modal?.type === 'editNode' && (
        <Modal title="Edit node" onClose={() => setModal(null)}>
          <NodeForm
            initial={modal.node}
            onSave={(data) => {
              updateNode(modal.node.id, data)
              setModal(null)
            }}
            onCancel={() => setModal(null)}
          />
        </Modal>
      )}

      {/* Delete confirmation */}
      {deleteConfirm && (
        <Modal title="Delete node?" onClose={() => setDeleteConfirm(null)}>
          <div className="space-y-4 py-2">
            <p className="text-sm text-slate-400">
              This node will be removed from all parent/child references.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="px-4 py-2 text-sm text-slate-400 hover:text-slate-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  deleteNode(deleteConfirm)
                  setDeleteConfirm(null)
                }}
                className="px-4 py-2 text-sm font-medium rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/20 transition-all"
              >
                Delete
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
