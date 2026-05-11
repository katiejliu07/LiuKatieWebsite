import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { ArrowRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useStore } from '../store/useStore'
import ActiveTreeSnippet, {
  ACTIVE_PREVIEW_CARD_H,
  ACTIVE_PREVIEW_CARD_W,
  getActivePreviewModel,
} from '../components/ActiveTreeSnippet'
import { STATUS_COLORS } from '../types'

export default function Home() {
  const trees = useStore((s) => s.trees)
  const nodes = useStore((s) => s.nodes)

  const activePreview = useMemo(() => getActivePreviewModel(nodes, trees), [nodes, trees])

  const domains = ['Physics', 'Electronics', 'Structures', 'Aerospace', 'Software']

  return (
    <div className="relative overflow-hidden" style={{ minHeight: 'calc(100vh - 64px)' }}>
      {/* ── Ghost projection of the same active mini-tree ───────────────── */}
      {activePreview && (
        <div
          className="fixed top-[4.1rem] z-0 pointer-events-none overflow-visible"
          style={{
            left: 'max(-18rem, calc(50vw - 28rem))',
            opacity: 0.15,
            filter: 'blur(0.35px)',
          }}
          aria-hidden
        >
          {/* Context for future runs: this is the only "shadow" tree; keep it as a large top-of-page copy of the active mini-tree, not an aura around the foreground preview. */}
          <div
            style={{
              width: activePreview.layout.width,
              height: activePreview.layout.height,
              transform: 'scale(1.46)',
              transformOrigin: 'top left',
            }}
          >
            <svg className="absolute inset-0 overflow-visible" width={activePreview.layout.width} height={activePreview.layout.height}>
              {activePreview.layout.edges.map(({ from, to }) => {
                const src = activePreview.layout.positions[from]
                const tgt = activePreview.layout.positions[to]
                const fromNode = activePreview.selection.nodes.find((node) => node.id === from)
                if (!src || !tgt || !fromNode) return null
                const sx = src.x + ACTIVE_PREVIEW_CARD_W
                const sy = src.y + ACTIVE_PREVIEW_CARD_H / 2
                const tx = tgt.x
                const ty = tgt.y + ACTIVE_PREVIEW_CARD_H / 2
                const mx = (sx + tx) / 2
                return (
                  <path
                    key={`${from}-${to}`}
                    d={`M ${sx} ${sy} C ${mx} ${sy}, ${mx} ${ty}, ${tx} ${ty}`}
                    stroke={STATUS_COLORS[fromNode.status]}
                    strokeWidth={1.15}
                    fill="none"
                    opacity={0.5}
                  />
                )
              })}
            </svg>

            {activePreview.selection.nodes.map((node) => {
              const pos = activePreview.layout.positions[node.id]
              if (!pos) return null
              const isFocus = node.id === activePreview.selection.focusNodeId
              const color = isFocus ? STATUS_COLORS.active : STATUS_COLORS[node.status]
              return (
                <div
                  key={node.id}
                  className="absolute rounded-xl"
                  style={{
                    left: pos.x,
                    top: pos.y,
                    width: ACTIVE_PREVIEW_CARD_W,
                    height: ACTIVE_PREVIEW_CARD_H,
                    background: `linear-gradient(135deg, rgba(15,23,42,0.72), ${color}16)`,
                    border: `1px solid ${color}${isFocus ? '38' : '24'}`,
                  }}
                />
              )
            })}
          </div>
        </div>
      )}

      {/* ── Main hero ────────────────────────────────────────────────────── */}
      <div className="relative z-10 px-8 md:px-12 lg:px-20 flex items-center min-h-[calc(100vh-64px)]">

        {/* Left column */}
        <div className="flex flex-col flex-shrink-0 w-[320px] md:w-[400px]">

          {/* Eyebrow */}
          <motion.div
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.55, delay: 0.05 }}
            className="flex items-center gap-3 mb-6"
          >
            <div className="h-px w-6 bg-gradient-to-r from-transparent to-slate-600" />
            <span className="text-[10px] tracking-[0.22em] uppercase text-slate-500 font-mono">
              Engineering · Science · Design
            </span>
          </motion.div>

          {/* Name */}
          <motion.h1
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.65, delay: 0.12 }}
            className="font-black tracking-tight leading-[0.88] mb-6"
            style={{ fontSize: 'clamp(4rem, 8vw, 7rem)' }}
          >
            <span className="text-slate-100 block">Katie</span>
            <span
              className="block"
              style={{
                background: 'linear-gradient(110deg, #a855f7 0%, #06b6d4 55%, #a855f7 100%)',
                backgroundSize: '200% auto',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
                animation: 'gradient-shift 6s linear infinite',
              }}
            >
              Liu
            </span>
          </motion.h1>

          {/* Bio */}
          <motion.p
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.22 }}
            className="text-sm text-slate-400 leading-relaxed mb-6 max-w-xs"
            style={{ fontWeight: 400, letterSpacing: '0.01em' }}
          >
            Building things at the intersection of physics, electronics, and software. Documenting the evolution.
          </motion.p>

          {/* Domain chips */}
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="flex flex-wrap gap-1.5 mb-8"
          >
            {domains.map((d, i) => (
              <motion.span
                key={d}
                initial={{ opacity: 0, scale: 0.88 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.35, delay: 0.32 + i * 0.06 }}
                className="text-[10px] tracking-wider uppercase px-2.5 py-1 rounded-full font-medium"
                style={{
                  color: 'rgba(148,163,184,0.7)',
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  letterSpacing: '0.08em',
                }}
              >
                {d}
              </motion.span>
            ))}
          </motion.div>

          {/* Stats */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.38 }}
            className="flex items-center gap-7 flex-wrap mb-8"
          >
            <Stat value={nodes.filter((n) => n.status === 'completed').length} label="Done" color="#06b6d4" />
            <div className="w-px h-7 bg-white/8" />
            <Stat value={nodes.filter((n) => n.status === 'active').length} label="Active" color="#a855f7" />
            <div className="w-px h-7 bg-white/8" />
            <Stat
              value={nodes.filter((n) => n.status === 'planned' || n.status === 'future').length}
              label="Ahead"
              color="#f59e0b"
            />
            <div className="w-px h-7 bg-white/8" />
            <Stat value={trees.filter((t) => nodes.filter((n) => n.treeId === t.id).length >= 2).length} label="Trees" color="#64748b" />
          </motion.div>

          {/* CTA */}
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.5 }}
          >
            <Link
              to="/trees"
              className="inline-flex items-center gap-2 text-xs font-medium px-4 py-2 rounded-xl transition-all hover:brightness-110 active:scale-95"
              style={{
                background: 'linear-gradient(135deg, rgba(124,58,237,0.18), rgba(8,145,178,0.18))',
                border: '1px solid rgba(124,58,237,0.3)',
                color: 'rgba(168,139,250,0.9)',
              }}
            >
              View project trees
              <ArrowRight size={12} />
            </Link>
          </motion.div>
        </div>

        {/* Right column — active tree snippet */}
        <motion.div
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 1, delay: 0.45, ease: 'easeOut' }}
          className="hidden md:flex flex-1 items-center pl-8 lg:pl-16 overflow-hidden"
          style={{
            maskImage: 'linear-gradient(to right, rgba(0,0,0,1) 0%, rgba(0,0,0,1) 88%, rgba(0,0,0,0) 100%)',
            WebkitMaskImage: 'linear-gradient(to right, rgba(0,0,0,1) 0%, rgba(0,0,0,1) 88%, rgba(0,0,0,0) 100%)',
          }}
        >
          <ActiveTreeSnippet nodes={nodes} trees={trees} />
        </motion.div>
      </div>
    </div>
  )
}

function Stat({ value, label, color }: { value: number; label: string; color: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-3xl font-black" style={{ color }}>{value}</span>
      <span className="text-xs text-slate-500 mt-0.5">{label}</span>
    </div>
  )
}
