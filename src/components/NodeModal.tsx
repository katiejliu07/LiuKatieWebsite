import { motion, AnimatePresence } from 'framer-motion'
import { X, Calendar, ArrowRight, ArrowLeft } from 'lucide-react'
import { ProjectNode, ProjectTree, STATUS_COLORS, STATUS_LABELS, NodeStatus, NodeMedia } from '../types'
import { useStore } from '../store/useStore'
import { getEmbeddedVideoUrl, isVideoMedia, mediaFromNode } from '../utils/media'
import { FINAL_COMPLETED_COLOR, getFinalCompletedNodeIds } from '../utils/finalProject'

interface NodeModalProps {
  node: ProjectNode | null
  tree: ProjectTree | null
  onClose: () => void
  onNodeClick: (node: ProjectNode) => void
}

function StatusBadge({ status, colorOverride }: { status: NodeStatus; colorOverride?: string }) {
  const color = colorOverride ?? STATUS_COLORS[status]
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium"
      style={{ background: color + '18', color, border: `1px solid ${color}30` }}
    >
      <span
        className="w-1.5 h-1.5 rounded-full"
        style={{ backgroundColor: color, boxShadow: `0 0 6px ${color}` }}
      />
      {STATUS_LABELS[status]}
    </span>
  )
}

function formatDate(dateStr?: string) {
  if (!dateStr) return null
  try {
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
  } catch {
    return dateStr
  }
}

export default function NodeModal({ node, tree, onClose, onNodeClick }: NodeModalProps) {
  const nodes = useStore((s) => s.nodes)

  if (!node) return null

  const treeNodes = nodes.filter((n) => n.treeId === node.treeId)
  const nodeMap = new Map(treeNodes.map((n) => [n.id, n]))
  const finalCompletedNodeIds = getFinalCompletedNodeIds(nodes)
  const isFinalCompleted = finalCompletedNodeIds.has(node.id)

  const parents = node.parentIds
    .map((id) => nodeMap.get(id))
    .filter((n): n is ProjectNode => !!n)

  const children = treeNodes.filter((n) => n.parentIds.includes(node.id))
  const media = mediaFromNode(node)

  return (
    <AnimatePresence>
      {node && (
        <>
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Panel */}
          <motion.div
            key="panel"
            initial={{ opacity: 0, x: 40, scale: 0.97 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 40, scale: 0.97 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-md overflow-y-auto"
            style={{
              background: 'rgba(10,10,16,0.95)',
              borderLeft: '1px solid rgba(255,255,255,0.09)',
              backdropFilter: 'blur(24px)',
            }}
          >
            {/* Close */}
            <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4"
              style={{ background: 'rgba(10,10,16,0.9)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <span className="text-xs text-slate-500 font-mono">{tree?.name}</span>
              <button
                onClick={onClose}
                className="w-7 h-7 flex items-center justify-center rounded-md text-slate-400 hover:text-slate-100 hover:bg-white/8 transition-colors"
              >
                <X size={15} />
              </button>
            </div>

            <div className="px-6 py-6 space-y-6">
              {/* Header */}
              <div className="space-y-3">
                <StatusBadge status={node.status} colorOverride={isFinalCompleted ? FINAL_COMPLETED_COLOR : undefined} />
                <h2 className="text-xl font-bold text-slate-100 leading-snug">{node.title}</h2>

                {(node.dateStart || node.dateEnd) && (
                  <div className="flex items-center gap-2 text-sm text-slate-400">
                    <Calendar size={13} />
                    <span>
                      {formatDate(node.dateStart)}
                      {node.dateEnd ? ` – ${formatDate(node.dateEnd)}` : node.dateStart ? ' – present' : ''}
                    </span>
                  </div>
                )}
              </div>

              {/* Ordered media: first item is intentionally treated as the main visual. */}
              {media.length > 0 && <NodeMediaGallery media={media} title={node.title} />}

              {/* Description */}
              {node.description && (
                <div>
                  <p className="text-sm text-slate-300 leading-relaxed">{node.description}</p>
                </div>
              )}

              {/* Parents */}
              {parents.length > 0 && (
                <div>
                  <p className="text-xs uppercase tracking-widest text-slate-500 mb-2">Builds on</p>
                  <div className="space-y-2">
                    {parents.map((p) => (
                      <NodeChip key={p.id} node={p} direction="from" onClick={() => onNodeClick(p)} />
                    ))}
                  </div>
                </div>
              )}

              {/* Children */}
              {children.length > 0 && (
                <div>
                  <p className="text-xs uppercase tracking-widest text-slate-500 mb-2">Enables</p>
                  <div className="space-y-2">
                    {children.map((c) => (
                      <NodeChip key={c.id} node={c} direction="to" onClick={() => onNodeClick(c)} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

function NodeMediaGallery({ media, title }: { media: NodeMedia[]; title: string }) {
  const [main, ...supporting] = media
  if (!main) return null

  return (
    <div className="space-y-3">
      <div className="rounded-xl overflow-hidden border border-white/8 bg-black/30">
        <MediaFrame media={main} title={title} main />
      </div>

      {supporting.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          {supporting.map((item, index) => (
            <div
              key={item.id ?? `${item.url}-${index}`}
              className="rounded-lg overflow-hidden border border-white/8 bg-black/25 aspect-video"
            >
              <MediaFrame media={item} title={`${title} media ${index + 2}`} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function MediaFrame({ media, title, main = false }: { media: NodeMedia; title: string; main?: boolean }) {
  if (isVideoMedia(media)) {
    const embedUrl = getEmbeddedVideoUrl(media.url)
    if (embedUrl) {
      return (
        <iframe
          src={embedUrl}
          title={title}
          className="w-full aspect-video"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      )
    }

    return (
      <video
        src={media.url}
        className={main ? 'w-full object-cover max-h-[260px]' : 'w-full h-full object-cover'}
        controls={main}
        muted={!main}
        playsInline
        preload="metadata"
        onError={(e) => {
          e.currentTarget.style.display = 'none'
        }}
      />
    )
  }

  return (
    <img
      src={media.url}
      alt={media.caption || title}
      className={main ? 'w-full object-cover max-h-[260px]' : 'w-full h-full object-cover'}
      onError={(e) => {
        e.currentTarget.style.display = 'none'
      }}
    />
  )
}

function NodeChip({
  node,
  direction,
  onClick,
}: {
  node: ProjectNode
  direction: 'from' | 'to'
  onClick: () => void
}) {
  const color = STATUS_COLORS[node.status]
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all duration-150 hover:bg-white/5"
      style={{ border: `1px solid ${color}22` }}
    >
      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
      <span className="text-sm text-slate-300 flex-1 leading-tight">{node.title}</span>
      {direction === 'to' ? (
        <ArrowRight size={13} className="text-slate-500 flex-shrink-0" />
      ) : (
        <ArrowLeft size={13} className="text-slate-500 flex-shrink-0" />
      )}
    </button>
  )
}
