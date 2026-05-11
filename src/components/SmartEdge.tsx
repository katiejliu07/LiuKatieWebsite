import { useId, useMemo } from 'react'
import { motion } from 'framer-motion'
import { ProjectNode, STATUS_COLORS } from '../types'
import { NodePosition, NODE_WIDTH, getNodeHeight } from '../utils/treeLayout'

interface SmartEdgeProps {
  fromId: string
  toId: string
  sx: number
  sy: number
  tx: number
  ty: number
  fromColor: string
  toColor: string
  /** Visible nodes used to detect unrelated cards the path passes near. */
  treeNodes: ProjectNode[]
  positions: Record<string, NodePosition>
  animDelay: number
  dimmed?: boolean // true while dragging a new connection
}

function cubicBezier(t: number, p0: number, p1: number, p2: number, p3: number): number {
  const mt = 1 - t
  return mt * mt * mt * p0 + 3 * mt * mt * t * p1 + 3 * mt * t * t * p2 + t * t * t * p3
}

/** Compute control points for the edge path, adding a vertical bow for same-row connections. */
export function controlPoints(sx: number, sy: number, tx: number, ty: number) {
  const mx = (sx + tx) / 2
  if (Math.abs(ty - sy) > 4) {
    // Normal case: standard S-curve
    return { c1x: mx, c1y: sy, c2x: mx, c2y: ty }
  }
  // Same (or nearly same) row: bow upward for forward edges, downward for reversed
  const bow = sx <= tx
    ? -Math.min(Math.abs(tx - sx) * 0.28, 52)
    :  Math.min(Math.abs(tx - sx) * 0.28, 52) + 38
  return { c1x: mx, c1y: sy + bow, c2x: mx, c2y: ty + bow }
}

/** Sample the edge path for proximity checks. */
function samplePath(
  sx: number, sy: number, tx: number, ty: number, steps = 42,
): Array<{ x: number; y: number }> {
  const { c1x, c1y, c2x, c2y } = controlPoints(sx, sy, tx, ty)
  return Array.from({ length: steps }, (_, i) => {
    const t = i / (steps - 1)
    return {
      x: cubicBezier(t, sx, c1x, c2x, tx),
      y: cubicBezier(t, sy, c1y, c2y, ty),
    }
  })
}

const CARD_FADE_PAD = 10
const MASK_R = 76        // keep edge fades subtle so branches do not vanish near unrelated cards

function svgSafeId(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, '_')
}

function distanceToRect(x: number, y: number, rect: { left: number; right: number; top: number; bottom: number }) {
  const dx = Math.max(rect.left - x, 0, x - rect.right)
  const dy = Math.max(rect.top - y, 0, y - rect.bottom)
  return Math.hypot(dx, dy)
}

export default function SmartEdge({
  fromId, toId, sx, sy, tx, ty,
  fromColor, toColor,
  treeNodes, positions,
  animDelay, dimmed = false,
}: SmartEdgeProps) {
  const instanceId = svgSafeId(useId())
  const edgeId = `${svgSafeId(fromId)}-${svgSafeId(toId)}-${instanceId}`
  const gradId = `seg-${edgeId}`
  const maskId = `mask-${edgeId}`

  const { c1x, c1y, c2x, c2y } = controlPoints(sx, sy, tx, ty)
  const d = `M ${sx} ${sy} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${tx} ${ty}`

  // Find unrelated cards the path passes through/near. Auto-layout no longer
  // moves nodes far away for this; the edge hides briefly behind the card instead.
  const fadeCenters = useMemo(() => {
    const samples = samplePath(sx, sy, tx, ty)
    return treeNodes
      .filter((n) => n.id !== fromId && n.id !== toId)
      .map((n) => {
        const p = positions[n.id]
        if (!p) return null
        const rect = {
          left: p.x - CARD_FADE_PAD,
          right: p.x + NODE_WIDTH + CARD_FADE_PAD,
          top: p.y - CARD_FADE_PAD,
          bottom: p.y + getNodeHeight(n) + CARD_FADE_PAD,
        }

        let best = { x: 0, y: 0, distance: Infinity }
        for (const sample of samples) {
          const distance = distanceToRect(sample.x, sample.y, rect)
          if (distance < best.distance) best = { ...sample, distance }
        }

        if (best.distance > CARD_FADE_PAD) return null
        const intensity = Math.max(0.28, 1 - best.distance / CARD_FADE_PAD)
        return { cx: best.x, cy: best.y, intensity }
      })
      .filter((x): x is { cx: number; cy: number; intensity: number } => x !== null)
  }, [fromId, toId, sx, sy, tx, ty, treeNodes, positions])

  const hasFade = fadeCenters.length > 0

  return (
    <>
      <defs>
        <linearGradient id={gradId} x1={sx} y1={sy} x2={tx} y2={ty} gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor={fromColor} stopOpacity={dimmed ? 0.15 : 0.72} />
          <stop offset="100%" stopColor={toColor} stopOpacity={dimmed ? 0.1 : 0.52} />
        </linearGradient>

        {hasFade && (
          <mask id={maskId} maskContentUnits="userSpaceOnUse">
            {/* Base: everything visible */}
            <rect x="-9999" y="-9999" width="99999" height="99999" fill="white" />

            {fadeCenters.map(({ cx, cy, intensity }, i) => {
              const rgId = `rfg-${edgeId}-${i}`
              return (
                <g key={i}>
                  <defs>
                    <radialGradient
                      id={rgId}
                      cx={cx} cy={cy} r={MASK_R}
                      gradientUnits="userSpaceOnUse"
                    >
                      {/* Dark centre fades the edge just enough to imply it passes behind the card. */}
                      <stop offset="0%"   stopColor="black" stopOpacity={0.62 * intensity} />
                      <stop offset="42%"  stopColor="black" stopOpacity={0.42 * intensity} />
                      <stop offset="72%"  stopColor="black" stopOpacity={0.12 * intensity} />
                      <stop offset="100%" stopColor="black" stopOpacity={0} />
                    </radialGradient>
                  </defs>
                  <circle cx={cx} cy={cy} r={MASK_R} fill={`url(#${rgId})`} />
                </g>
              )
            })}
          </mask>
        )}
      </defs>

      <motion.path
        d={d}
        stroke={`url(#${gradId})`}
        strokeWidth={1.6}
        fill="none"
        mask={hasFade ? `url(#${maskId})` : undefined}
        filter="url(#edge-glow)"
        initial={{ pathLength: 0, opacity: 0 }}
        animate={{ pathLength: 1, opacity: dimmed ? 0.3 : 1 }}
        transition={{ duration: 1.05, delay: animDelay, ease: 'easeInOut' }}
      />
    </>
  )
}
