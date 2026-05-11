import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, Layers } from 'lucide-react'
import { ProjectTree, ProjectNode, STATUS_COLORS, STATUS_LABELS } from '../types'

interface TreeCardProps {
  tree: ProjectTree
  nodes: ProjectNode[]
  index: number
}

export default function TreeCard({ tree, nodes, index }: TreeCardProps) {
  const navigate = useNavigate()

  const activeNode = nodes.find((n) => n.status === 'active')
  const latestNode = activeNode ?? nodes.find((n) => n.status === 'planned') ?? nodes[nodes.length - 1]

  const counts = {
    completed: nodes.filter((n) => n.status === 'completed').length,
    active: nodes.filter((n) => n.status === 'active').length,
    planned: nodes.filter((n) => n.status === 'planned').length,
    future: nodes.filter((n) => n.status === 'future').length,
  }

  const accentColor = activeNode ? STATUS_COLORS.active : STATUS_COLORS.planned

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: index * 0.1, ease: 'easeOut' }}
      whileHover={{ y: -4, transition: { duration: 0.2 } }}
      onClick={() => navigate('/trees')}
      className="cursor-pointer group rounded-2xl overflow-hidden relative"
      style={{
        background: 'rgba(255,255,255,0.025)',
        border: `1px solid ${accentColor}22`,
        boxShadow: activeNode ? `0 0 40px ${accentColor}10, inset 0 0 40px ${accentColor}04` : 'none',
      }}
    >
      {/* Gradient accent top border */}
      <div
        className="absolute top-0 left-0 right-0 h-[1px]"
        style={{
          background: `linear-gradient(90deg, transparent, ${accentColor}60, transparent)`,
        }}
      />

      {/* Subtle glow bg */}
      <div
        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
        style={{
          background: `radial-gradient(ellipse 70% 50% at 50% 0%, ${accentColor}06 0%, transparent 70%)`,
        }}
      />

      <div className="relative p-6 space-y-5">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Layers size={14} className="text-slate-500" />
              <span className="text-xs text-slate-500">{nodes.length} nodes</span>
            </div>
            <h3 className="text-lg font-semibold text-slate-100 leading-snug">{tree.name}</h3>
          </div>
          <ArrowRight
            size={16}
            className="text-slate-500 group-hover:text-slate-300 group-hover:translate-x-1 transition-all duration-200 flex-shrink-0 mt-1"
          />
        </div>

        {/* Latest / active node */}
        {latestNode && (
          <div
            className="rounded-xl p-3.5"
            style={{
              background: `${STATUS_COLORS[latestNode.status]}0a`,
              border: `1px solid ${STATUS_COLORS[latestNode.status]}20`,
            }}
          >
            <div className="flex items-center gap-2 mb-1.5">
              <span
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{
                  backgroundColor: STATUS_COLORS[latestNode.status],
                  boxShadow:
                    latestNode.status === 'active'
                      ? `0 0 8px ${STATUS_COLORS[latestNode.status]}`
                      : 'none',
                }}
              />
              <span
                className="text-xs font-medium"
                style={{ color: STATUS_COLORS[latestNode.status] }}
              >
                {STATUS_LABELS[latestNode.status]}
              </span>
            </div>
            <p className="text-sm font-medium text-slate-200 leading-snug">{latestNode.title}</p>
          </div>
        )}

        {/* Progress bar */}
        <div className="space-y-2">
          <div className="flex gap-1 h-1.5 rounded-full overflow-hidden">
            {counts.completed > 0 && (
              <div
                className="h-full rounded-full"
                style={{
                  width: `${(counts.completed / nodes.length) * 100}%`,
                  backgroundColor: STATUS_COLORS.completed,
                }}
              />
            )}
            {counts.active > 0 && (
              <div
                className="h-full rounded-full"
                style={{
                  width: `${(counts.active / nodes.length) * 100}%`,
                  backgroundColor: STATUS_COLORS.active,
                }}
              />
            )}
            {counts.planned > 0 && (
              <div
                className="h-full rounded-full"
                style={{
                  width: `${(counts.planned / nodes.length) * 100}%`,
                  backgroundColor: STATUS_COLORS.planned,
                }}
              />
            )}
            {counts.future > 0 && (
              <div
                className="h-full rounded-full"
                style={{
                  width: `${(counts.future / nodes.length) * 100}%`,
                  backgroundColor: STATUS_COLORS.future,
                }}
              />
            )}
          </div>
          <div className="flex gap-3 flex-wrap">
            {Object.entries(counts).map(([status, count]) =>
              count > 0 ? (
                <span key={status} className="text-xs text-slate-500">
                  <span style={{ color: STATUS_COLORS[status as keyof typeof STATUS_COLORS] }}>
                    {count}
                  </span>{' '}
                  {STATUS_LABELS[status as keyof typeof STATUS_LABELS]}
                </span>
              ) : null,
            )}
          </div>
        </div>
      </div>
    </motion.div>
  )
}
