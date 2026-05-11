import { useEffect, useRef, useState } from 'react'
import { Palette, NIGHT_COOL } from '../utils/palette'

type BodyKind = 'particle' | 'mass' | 'planet'
type EffectKind = 'dust' | 'ring'
type CelestialStyle = 'gas' | 'ringed' | 'rocky' | 'proto' | 'icy' | 'asteroid' | 'cluster' | 'binary'

interface Body {
  id: number
  x: number
  y: number
  z: number
  vx: number
  vy: number
  mass: number
  radius: number
  visualRadius: number
  kind: BodyKind
  hue: number
  age: number
  trail: Array<{ x: number; y: number }>
  style: CelestialStyle
  spin: number
  tilt: number
  glow: number
  bandSeed: number
  ringed: boolean
  binary: boolean
  irregularity: number
  orbitBand: number
  orbitJitter: number
  bornFromCollision?: boolean
  fragment?: boolean
  maxLife?: number
}

interface Star {
  x: number
  y: number
  r: number
  alpha: number
  drift: number
}

interface FieldDust {
  id: number
  x: number
  y: number
  z: number
  vx: number
  vy: number
  hue: number
  radius: number
  alpha: number
  stream: number
  orbitBand: number
  orbitJitter: number
  trail: Array<{ x: number; y: number }>
}

interface OrbitMarker {
  id: number
  orbitBand: number
  orbitJitter: number
  phase: number
  angularSpeed: number
  z: number
  hue: number
  radius: number
  alpha: number
  trail: Array<{ x: number; y: number; z: number; side: number }>
}

interface Nebula {
  x: number
  y: number
  rx: number
  ry: number
  hue: number
  alpha: number
  driftX: number
  driftY: number
}

interface FogBlob {
  vx: number      // fraction of viewWidth (0–1 center, can exceed for off-screen blobs)
  vy: number      // fraction of viewHeight
  rxFrac: number  // ellipse x-radius as fraction of viewWidth
  ryFrac: number  // ellipse y-radius as fraction of viewHeight
  alpha: number
  angle: number
  driftX: number  // drift per simTime unit, in viewport fractions
  driftY: number
}

interface Effect {
  id: number
  kind: EffectKind
  x: number
  y: number
  z: number
  vx: number
  vy: number
  hue: number
  age: number
  life: number
  radius: number
  maxRadius: number
  // Effects render one-frame velocity streaks instead of persistent trails to avoid smoke/whirlpool buildup.
  orbitBand?: number
  orbitJitter?: number
}

interface CosmicEvent {
  id: number
  text: string
  createdAt: number
}

interface Probe {
  x: number
  y: number
  z: number
  targetZ: number
  vx: number
  vy: number
  angle: number
  trail: Array<{ x: number; y: number }>
  label: string
  labelAge: number
  nextLabelAt: number
  orbitJitter: number
  targetId?: number
}

type BackgroundAnchor = {
  x: number
  y: number
  z: number
  visualRadius: number
  gravityStrength: number
  orbitInfluenceRadius: number
  affectsPhysics: false
  kind: 'blackHole'
}

const MAX_BODIES = 176
const MIN_BODIES = 118
const MIN_FIELD_DUST = 55
const MAX_FIELD_DUST = 110
const MAX_EFFECTS = 260
const CELL_SIZE = 128
const GRAVITY_RADIUS = 190
const GRAVITY_RADIUS_2 = GRAVITY_RADIUS * GRAVITY_RADIUS
const SOFTENING = 420
const MAX_EVENTS = 8
const COLLISION_COOLDOWN_MS = 900
const MIN_BODY_MASS = 0.22
const E_MERGE_SPECIFIC = 0.013
const E_PARTIAL_SPECIFIC = 0.09
const DEPTH_COLLISION_THRESHOLD = 0.22
const FAR_DEPTH = 0.58
const BLACK_HOLE_DISK_ANGLE = -Math.PI / 5
const BLACK_HOLE_ORBIT_Y_SCALE = 0.42
const PROBE_GRAVITY_RADIUS = 440
const PROBE_GRAVITY_RADIUS_2 = PROBE_GRAVITY_RADIUS * PROBE_GRAVITY_RADIUS
const PROBE_SOFTENING = 5200
const PROBE_SAFE_PAD = 28
const PROBE_MIN_SPEED = 0.72
const PROBE_MAX_SPEED = 2.2
const PROBE_LABELS = [
  'SYSTEM: still alive',
  'orbiting the bug',
  'DO NOT MERGE',
  'collision immunity enabled',
  'tiny narrative object',
  'still calculating',
]

interface ImpactInfo {
  nx: number
  ny: number
  tx: number
  ty: number
  distance: number
  overlap: number
  relativeVelocity: number
  normalSpeed: number
  tangentSpeed: number
}

function rand(min: number, max: number) {
  return min + Math.random() * (max - min)
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function classify(mass: number): BodyKind {
  if (mass > 32) return 'planet'
  if (mass > 10) return 'mass'
  return 'particle'
}

function bodyRadius(mass: number) {
  if (mass > 32) return clamp(Math.sqrt(mass) * 2.2, 11, 30)
  if (mass > 10) return clamp(Math.sqrt(mass) * 1.7, 5.5, 13)
  return clamp(Math.sqrt(mass) * 1.12, 0.8, 3.2)
}

function chooseStyle(kind: BodyKind): CelestialStyle {
  if (kind === 'particle') {
    const roll = Math.random()
    if (roll < 0.5) return 'asteroid'
    if (roll < 0.78) return 'cluster'
    return 'icy'
  }
  if (kind === 'mass') return Math.random() < 0.62 ? 'proto' : 'rocky'

  const roll = Math.random()
  if (roll < 0.2) return 'gas'
  if (roll < 0.38) return 'ringed'
  if (roll < 0.56) return 'rocky'
  if (roll < 0.7) return 'icy'
  if (roll < 0.84) return 'binary'
  return 'proto'
}

function visualTraits(kind: BodyKind, style = chooseStyle(kind)) {
  return {
    style,
    spin: rand(-0.008, 0.008),
    tilt: rand(-0.9, 0.9),
    glow: kind === 'planet' ? rand(1.05, 1.75) : kind === 'mass' ? rand(0.9, 1.45) : rand(0.35, 0.8),
    bandSeed: rand(0, Math.PI * 2),
    ringed: style === 'ringed' || (kind === 'planet' && Math.random() < 0.2),
    binary: style === 'binary',
    irregularity: style === 'asteroid' || style === 'cluster' ? rand(0.18, 0.42) : rand(0.02, 0.12),
  }
}

function eventBodyName(body: Body) {
  if (body.kind === 'planet') return `Planet ${body.id.toString(36).toUpperCase()}`
  if (body.kind === 'mass') return `Proto-planet ${body.id.toString(36).toUpperCase()}`
  return `Comet ${body.id.toString(36).toUpperCase()}`
}

export default function AnimatedBackground({ palette }: { palette?: Palette }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const paletteRef = useRef<Palette>(palette ?? NIGHT_COOL)
  paletteRef.current = palette ?? NIGHT_COOL  // sync on every render

  const [events, setEvents] = useState<CosmicEvent[]>([])
  const [eventClock, setEventClock] = useState(0)

  useEffect(() => {
    const canvas = canvasRef.current
    const renderingContext = canvas?.getContext('2d', { alpha: false })
    if (!canvas || !renderingContext) return
    const el = canvas
    const ctx = renderingContext

    // ── closure state ──────────────────────────────────────────────────────────
    let raf = 0
    let nextId = 1
    let effectId = 1
    let eventId = 1
    let lastTime = performance.now()
    let lastEventAt = 0
    let lastInjectionAt = 0
    let lastDustTickAt = 0
    let lastImpulseAt = 0
    let simTime = 0
    let viewWidth = 0
    let viewHeight = 0
    let worldWidth = 0
    let worldHeight = 0
    let scrollX = window.scrollX
    let scrollY = window.scrollY
    let bgBrightness = 0  // updated each draw frame from palette
    let stars: Star[] = []
    let nebulae: Nebula[] = []
    let fogBlobs: FogBlob[] = []
    const bodies: Body[] = []
    const fieldDust: FieldDust[] = []
    const orbitMarkers: OrbitMarker[] = []
    const effects: Effect[] = []
    const grid = new Map<string, number[]>()
    const collisionCooldowns = new Map<string, number>()
    let probe: Probe | null = null
    let blackHoleAnchor: BackgroundAnchor = {
      x: 0,
      y: 0,
      z: 0.86,
      visualRadius: 260,
      gravityStrength: 0.045,
      orbitInfluenceRadius: 2600,
      affectsPhysics: false,
      kind: 'blackHole',
    }
    const mouse = { x: -9999, y: -9999, worldX: -9999, worldY: -9999, active: false, down: false }

    // ── palette helpers (inline to avoid module-level allocation in hot paths) ──
    function ph(hex: string, offset: number): number {
      return parseInt(hex.slice(offset, offset + 2), 16)
    }
    function rgba(hex: string, alpha: number): string {
      return `rgba(${ph(hex, 1)},${ph(hex, 3)},${ph(hex, 5)},${alpha})`
    }

    function hueFromHex(hex: string): number {
      const r = ph(hex, 1) / 255
      const g = ph(hex, 3) / 255
      const b = ph(hex, 5) / 255
      const max = Math.max(r, g, b)
      const min = Math.min(r, g, b)
      const delta = max - min
      if (delta < 0.0001) return 210
      let hue = 0
      if (max === r) hue = ((g - b) / delta) % 6
      else if (max === g) hue = (b - r) / delta + 2
      else hue = (r - g) / delta + 4
      return (hue * 60 + 360) % 360
    }

    function paletteObjectHue(kind: BodyKind, style: CelestialStyle, heavy: boolean, z: number) {
      const pal = paletteRef.current
      const accent = hueFromHex(pal.accent)
      const glow = hueFromHex(pal.glow)
      const highlight = hueFromHex(pal.highlight)
      const particle = hueFromHex(pal.particle)
      const anchors = [accent, glow, highlight, particle]
      const base = anchors[Math.floor(rand(0, anchors.length))]
      if (style === 'icy') return particle + rand(-12, 18)
      if (style === 'rocky') return accent + rand(-32, 24)
      if (style === 'gas' || style === 'ringed') return (Math.random() < 0.5 ? glow : highlight) + rand(-26, 30)
      if (style === 'proto') return (heavy ? glow : base) + rand(-18, 34)
      return base + rand(-24, 28) + z * 18 + (kind === 'particle' ? rand(-20, 20) : 0)
    }

    function paletteDustHue() {
      const pal = paletteRef.current
      const hues = [hueFromHex(pal.particle), hueFromHex(pal.highlight), hueFromHex(pal.glow), hueFromHex(pal.accent)]
      return hues[Math.floor(rand(0, hues.length))] + rand(-18, 18)
    }

    // ── world helpers ───────────────────────────────────────────────────────────
    function measureWorld() {
      const doc = document.documentElement
      viewWidth = Math.max(1, window.innerWidth)
      viewHeight = Math.max(1, window.innerHeight)
      worldWidth = Math.max(viewWidth, doc.scrollWidth, document.body.scrollWidth)
      worldHeight = Math.max(viewHeight, doc.scrollHeight, document.body.scrollHeight)
      scrollX = window.scrollX
      scrollY = window.scrollY
      mouse.worldX = mouse.x + scrollX
      mouse.worldY = mouse.y + scrollY
      updateBackgroundAnchor()
    }

    function visibleRect(pad = 0) {
      return {
        left: scrollX - pad,
        right: scrollX + viewWidth + pad,
        top: scrollY - pad,
        bottom: scrollY + viewHeight + pad,
      }
    }

    function isNearViewport(x: number, y: number, pad = 180) {
      const rect = visibleRect(pad)
      return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom
    }

    function wrapValue(value: number, size: number) {
      return ((value % size) + size) % size
    }

    function wrappedDelta(a: number, b: number, size: number) {
      let delta = b - a
      if (delta > size / 2) delta -= size
      if (delta < -size / 2) delta += size
      return delta
    }

    function updateBackgroundAnchor() {
      const z = 0.86
      const parallax = depthParallax(z)
      const radius = clamp(Math.min(viewWidth, viewHeight) * 1.68, 900, 1750)
      blackHoleAnchor = {
        // This anchor is cinematic only; never add it to bodies/grid/collisions or it will collapse the sim.
        x: wrapValue(scrollX * parallax + viewWidth * 0.92, Math.max(1, worldWidth)),
        y: wrapValue(scrollY * parallax + viewHeight * 0.12, Math.max(1, worldHeight)),
        z,
        visualRadius: radius,
        gravityStrength: 0.032,
        orbitInfluenceRadius: Math.max(1200, radius * 1.75),
        affectsPhysics: false,
        kind: 'blackHole',
      }
    }

    function depthScale(z: number) {
      return clamp(1 - z * 0.56, 0.38, 1)
    }

    function depthParallax(z: number) {
      return clamp(1 - z * 0.42, 0.54, 1)
    }

    function depthMotionScale(z: number) {
      return clamp(1 - z * 0.38, 0.58, 1)
    }

    function projectX(x: number, z: number) {
      return x - scrollX * depthParallax(z)
    }

    function projectY(y: number, z: number) {
      return y - scrollY * depthParallax(z)
    }

    function projectRadius(radius: number, z: number) {
      return Math.max(0.22, radius * depthScale(z))
    }

    function projectOpacity(alpha: number, z: number) {
      return alpha * clamp(1 - z * 0.48, 0.34, 1)
    }

    function isProjectedNearViewport(x: number, y: number, z: number, pad = 180) {
      const sx = projectX(x, z)
      const sy = projectY(y, z)
      return sx >= -pad && sx <= viewWidth + pad && sy >= -pad && sy <= viewHeight + pad
    }

    function anchorDepthFactor(z: number) {
      if (z <= 0.35) return 0.015
      if (z <= 0.55) return 0.08 + ((z - 0.35) / 0.2) * 0.22
      return 0.48 + ((z - 0.55) / 0.45) * 0.52
    }

    function orbitBandRadius(band: number, jitter = 0) {
      const anchor = blackHoleAnchor
      const bands = [0.38, 0.62, 0.95]
      const index = clamp(Math.round(band), 0, bands.length - 1)
      return anchor.visualRadius * (bands[index] + jitter * 0.045)
    }

    function orbitBandZRange(band: number) {
      if (band <= 0) return { min: 0.82, max: 0.95 }
      if (band === 1) return { min: 0.68, max: 0.84 }
      return { min: 0.55, max: 0.72 }
    }

    function orbitBandZ(band: number) {
      const range = orbitBandZRange(band)
      return rand(range.min, range.max)
    }

    function orbitLockFactor(z: number) {
      if (z > 0.75) return 0.055
      if (z > 0.55) return 0.035
      if (z > 0.35) return 0.012
      return 0.002
    }

    function targetOrbitSpeed(band: number, z: number, radius = 1) {
      const base = [0.98, 0.78, 0.56][clamp(Math.round(band), 0, 2)] ?? 0.68
      const sizeSlowdown = radius > 7 ? 0.72 : radius > 3 ? 0.86 : 1
      return base * sizeSlowdown * (0.78 + anchorDepthFactor(z) * 0.32)
    }

    function rotateToDiskFrame(x: number, y: number) {
      const c = Math.cos(-BLACK_HOLE_DISK_ANGLE)
      const s = Math.sin(-BLACK_HOLE_DISK_ANGLE)
      return { x: x * c - y * s, y: x * s + y * c }
    }

    function rotateFromDiskFrame(x: number, y: number) {
      const c = Math.cos(BLACK_HOLE_DISK_ANGLE)
      const s = Math.sin(BLACK_HOLE_DISK_ANGLE)
      return { x: x * c - y * s, y: x * s + y * c }
    }

    function orbitalCoordinates(x: number, y: number) {
      const anchor = blackHoleAnchor
      const dx = wrappedDelta(anchor.x, x, worldWidth)
      const dy = wrappedDelta(anchor.y, y, worldHeight)
      const local = rotateToDiskFrame(dx, dy)
      const scaledY = local.y / BLACK_HOLE_ORBIT_Y_SCALE
      const distance = Math.hypot(local.x, scaledY) || 1
      const phase = Math.atan2(scaledY, local.x)
      return { localX: local.x, localY: local.y, distance, phase }
    }

    function nearestOrbitBand(x: number, y: number, fallback = 1) {
      const { distance } = orbitalCoordinates(x, y)
      let bestBand = fallback
      let bestGap = Number.POSITIVE_INFINITY
      for (let band = 0; band < 3; band++) {
        const gap = Math.abs(distance - orbitBandRadius(band))
        if (gap < bestGap) {
          bestGap = gap
          bestBand = band
        }
      }
      return bestBand
    }

    function orbitalPoint(band: number, jitter = 0, phase = rand(0, Math.PI * 2)) {
      const radius = orbitBandRadius(band, jitter)
      const localX = Math.cos(phase) * radius
      const localY = Math.sin(phase) * radius * BLACK_HOLE_ORBIT_Y_SCALE
      const world = rotateFromDiskFrame(localX, localY)
      const tangent = rotateFromDiskFrame(-Math.sin(phase), Math.cos(phase) * BLACK_HOLE_ORBIT_Y_SCALE)
      const tangentLength = Math.hypot(tangent.x, tangent.y) || 1
      const normal = rotateFromDiskFrame(Math.cos(phase), Math.sin(phase) * BLACK_HOLE_ORBIT_Y_SCALE)
      const normalLength = Math.hypot(normal.x, normal.y) || 1
      return {
        x: wrapValue(blackHoleAnchor.x + world.x, worldWidth),
        y: wrapValue(blackHoleAnchor.y + world.y, worldHeight),
        tx: tangent.x / tangentLength,
        ty: tangent.y / tangentLength,
        nx: normal.x / normalLength,
        ny: normal.y / normalLength,
      }
    }

    function anchorOrbitFactor(obj: { x: number; y: number; z: number }) {
      const dist = orbitalCoordinates(obj.x, obj.y).distance
      const depth = anchorDepthFactor(obj.z)
      return depth * clamp(1 - dist / blackHoleAnchor.orbitInfluenceRadius, 0, 1)
    }

    function orbitSideFactor(x: number, y: number) {
      const { phase } = orbitalCoordinates(x, y)
      // Render-only depth cue: local disk y > 0 is the near/front half of the tilted orbit.
      return clamp((Math.sin(phase) + 1) * 0.5, 0, 1)
    }

    function isBackOrbitLayer(obj: { x: number; y: number; z: number }) {
      return obj.z > blackHoleAnchor.z || (anchorOrbitFactor(obj) > 0.035 && orbitSideFactor(obj.x, obj.y) < 0.5)
    }

    function blackHoleSafePoint(x: number, y: number, radius = 1) {
      const coords = orbitalCoordinates(x, y)
      const safeRadius = blackHoleAnchor.visualRadius * 0.58 + radius * 4
      if (coords.distance >= safeRadius) return { x, y }

      const phase = coords.distance > 1 ? coords.phase : rand(0, Math.PI * 2)
      const localX = Math.cos(phase) * safeRadius
      const localY = Math.sin(phase) * safeRadius * BLACK_HOLE_ORBIT_Y_SCALE
      const world = rotateFromDiskFrame(localX, localY)
      return {
        x: wrapValue(blackHoleAnchor.x + world.x, worldWidth),
        y: wrapValue(blackHoleAnchor.y + world.y, worldHeight),
      }
    }

    function capVelocity(vx: number, vy: number, limit: number) {
      const speed = Math.hypot(vx, vy)
      if (speed <= limit || speed <= 0.001) return { vx, vy }
      const scale = limit / speed
      return { vx: vx * scale, vy: vy * scale }
    }

    function pushEvent(text: string, now: number, x: number, y: number) {
      if (now - lastEventAt < 2100 || !isNearViewport(x, y, 240)) return
      lastEventAt = now
      const item = { id: eventId++, text, createdAt: now }
      setEvents((current) => [...current.slice(-(MAX_EVENTS - 1)), item])
    }

    function spawnPoint(edge = false, preferViewport = false) {
      if (preferViewport && Math.random() < 0.82) {
        const rect = visibleRect(140)
        return {
          x: wrapValue(rand(rect.left, rect.right), worldWidth),
          y: wrapValue(rand(rect.top, rect.bottom), worldHeight),
        }
      }

      if (!edge) return { x: rand(0, worldWidth), y: rand(0, worldHeight) }

      const rect = visibleRect(100)
      const side = Math.floor(Math.random() * 4)
      if (side === 0) return { x: wrapValue(rect.left, worldWidth), y: wrapValue(rand(rect.top, rect.bottom), worldHeight) }
      if (side === 1) return { x: wrapValue(rect.right, worldWidth), y: wrapValue(rand(rect.top, rect.bottom), worldHeight) }
      if (side === 2) return { x: wrapValue(rand(rect.left, rect.right), worldWidth), y: wrapValue(rect.top, worldHeight) }
      return { x: wrapValue(rand(rect.left, rect.right), worldWidth), y: wrapValue(rect.bottom, worldHeight) }
    }

    function makeBody(edge = false, heavy = false, preferViewport = false): Body {
      const angle = rand(0, Math.PI * 2)
      const tangent = Math.random() < 0.5 ? 1 : -1
      const mass = heavy ? rand(34, 82) : Math.random() < 0.07 ? rand(10, 24) : rand(0.35, 2.4)
      const kind = classify(mass)
      const speed = heavy ? rand(0.32, 0.82) : kind === 'mass' ? rand(0.22, 0.78) : rand(0.42, 1.28)
      const traits = visualTraits(kind)
      const orbitBand = kind === 'particle' ? (Math.random() < 0.48 ? 0 : 1) : kind === 'mass' ? 1 : 2
      const orbitJitter = rand(-1, 1)
      const wantsOrbit = preferViewport || edge || Math.random() < 0.88
      const z = wantsOrbit ? orbitBandZ(orbitBand) : heavy ? rand(0.16, 0.72) : kind === 'mass' ? rand(0.18, 0.84) : rand(0.04, 0.98)
      const useOrbitalSpawn = z > 0.55 && Math.random() < 0.9
      const orbital = useOrbitalSpawn ? orbitalPoint(orbitBand, orbitJitter) : null
      const point = orbital ?? spawnPoint(edge, preferViewport)
      const orbitSpeed = targetOrbitSpeed(orbitBand, z, bodyRadius(mass)) * rand(0.88, 1.08)

      return {
        id: nextId++,
        x: point.x,
        y: point.y,
        z,
        vx: orbital ? orbital.tx * orbitSpeed + orbital.nx * rand(-0.055, 0.055) : Math.cos(angle) * speed * tangent + rand(-0.16, 0.16),
        vy: orbital ? orbital.ty * orbitSpeed + orbital.ny * rand(-0.055, 0.055) : Math.sin(angle) * speed * tangent + rand(-0.16, 0.16),
        mass,
        radius: bodyRadius(mass),
        visualRadius: bodyRadius(mass),
        kind,
        hue: paletteObjectHue(kind, traits.style, heavy, z),
        age: rand(0, 900),
        trail: [],
        orbitBand,
        orbitJitter,
        ...traits,
      }
    }

    function makeFieldDust(preferViewport = false): FieldDust {
      const angle = rand(0, Math.PI * 2)
      const speed = rand(0.08, 0.48)
      const orbitRoll = Math.random()
      const orbitBand = orbitRoll < 0.58 ? 0 : orbitRoll < 0.86 ? 1 : 2
      const orbitJitter = rand(-1, 1)
      const wantsOrbit = Math.random() < (preferViewport ? 0.9 : 0.84)
      const z = wantsOrbit ? orbitBandZ(orbitBand) : rand(preferViewport ? 0.25 : 0.42, 1)
      const useOrbitalSpawn = z > 0.55 && Math.random() < 0.92
      const orbital = useOrbitalSpawn ? orbitalPoint(orbitBand, orbitJitter) : null
      const point = orbital ?? spawnPoint(false, preferViewport)
      const orbitSpeed = targetOrbitSpeed(orbitBand, z, 1) * rand(0.82, 1.12)
      return {
        id: effectId++,
        x: point.x,
        y: point.y,
        z,
        vx: orbital ? orbital.tx * orbitSpeed + orbital.nx * rand(-0.018, 0.018) : Math.cos(angle) * speed,
        vy: orbital ? orbital.ty * orbitSpeed + orbital.ny * rand(-0.018, 0.018) : Math.sin(angle) * speed,
        hue: paletteDustHue(),
        radius: rand(0.35, 1.15),
        alpha: rand(0.12, 0.5),
        stream: Math.random() < 0.24 ? rand(0.55, 1.35) : 0,
        orbitBand,
        orbitJitter,
        trail: [],
      }
    }

    function targetOrbitMarkerCount() {
      return clamp(Math.floor((viewWidth * viewHeight) / 13000), 72, 128)
    }

    function makeOrbitMarker(): OrbitMarker {
      const roll = Math.random()
      const orbitBand = roll < 0.68 ? 0 : roll < 0.92 ? 1 : 2
      const zRange = orbitBandZRange(orbitBand)
      const baseSpeed = [0.0058, 0.0038, 0.00245][orbitBand] ?? 0.0034
      return {
        id: effectId++,
        orbitBand,
        orbitJitter: rand(-0.86, 0.86),
        phase: rand(0, Math.PI * 2),
        angularSpeed: baseSpeed * rand(0.78, 1.2),
        z: rand(zRange.min, zRange.max),
        hue: paletteDustHue() + (orbitBand === 0 ? rand(-8, 14) : rand(-18, 18)),
        radius: orbitBand === 0 ? rand(0.46, 1.15) : rand(0.38, 0.92),
        alpha: orbitBand === 0 ? rand(0.26, 0.62) : rand(0.16, 0.42),
        trail: [],
      }
    }

    function seedOrbitMarkers() {
      orbitMarkers.length = 0
      for (let i = 0; i < targetOrbitMarkerCount(); i++) orbitMarkers.push(makeOrbitMarker())
    }

    function ensureOrbitMarkers() {
      const target = targetOrbitMarkerCount()
      while (orbitMarkers.length < target) orbitMarkers.push(makeOrbitMarker())
      if (orbitMarkers.length > target) orbitMarkers.splice(target)
    }

    function orbitMarkerState(marker: OrbitMarker) {
      const point = orbitalPoint(marker.orbitBand, marker.orbitJitter, marker.phase)
      const side = clamp((Math.sin(marker.phase) + 1) * 0.5, 0, 1)
      const z = clamp(marker.z + (0.5 - side) * 0.22, 0.5, 0.99)
      return { x: point.x, y: point.y, z, side }
    }

    function probeLabel(previous?: string) {
      const options = PROBE_LABELS.filter((label) => label !== previous)
      return options[Math.floor(Math.random() * options.length)] ?? PROBE_LABELS[0]
    }

    function makeProbe(now = performance.now()): Probe {
      const edgeInset = 18
      const rect = {
        left: scrollX + edgeInset,
        right: scrollX + Math.max(edgeInset, viewWidth - edgeInset),
        top: scrollY + edgeInset,
        bottom: scrollY + Math.max(edgeInset, viewHeight - edgeInset),
      }
      const side = Math.floor(Math.random() * 4)
      let x = rect.left
      let y = rect.top

      if (side === 0) {
        x = rect.left
        y = rand(rect.top, rect.bottom)
      } else if (side === 1) {
        x = rect.right
        y = rand(rect.top, rect.bottom)
      } else if (side === 2) {
        x = rand(rect.left, rect.right)
        y = rect.top
      } else {
        x = rand(rect.left, rect.right)
        y = rect.bottom
      }

      const aimX = scrollX + viewWidth * rand(0.34, 0.66)
      const aimY = scrollY + viewHeight * rand(0.28, 0.72)
      const angle = Math.atan2(wrappedDelta(y, aimY, worldHeight), wrappedDelta(x, aimX, worldWidth)) + rand(-0.34, 0.34)
      const speed = rand(1.05, 1.65)
      const orbitJitter = rand(-1, 1)

      return {
        x: wrapValue(x, worldWidth),
        y: wrapValue(y, worldHeight),
        z: rand(0.06, 0.42),
        targetZ: rand(0.08, 0.55),
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        angle,
        trail: [],
        label: probeLabel(),
        labelAge: 0,
        nextLabelAt: now + rand(4000, 8000),
        orbitJitter,
      }
    }

    function rebuildStars() {
      const count = clamp(Math.floor((worldWidth * worldHeight) / 8200), 130, 340)
      stars = Array.from({ length: count }, () => ({
        x: Math.random() * worldWidth,
        y: Math.random() * worldHeight,
        r: rand(0.35, 1.2),
        alpha: rand(0.08, 0.62),
        drift: rand(0.02, 0.13),
      }))
    }

    function rebuildNebulae() {
      const count = clamp(Math.floor((worldWidth * worldHeight) / 420000), 4, 9)
      nebulae = Array.from({ length: count }, () => ({
        x: Math.random() * worldWidth,
        y: Math.random() * worldHeight,
        rx: rand(220, 640),
        ry: rand(150, 440),
        hue: paletteDustHue() + rand(-28, 38),
        alpha: rand(0.012, 0.038),
        driftX: rand(-0.012, 0.012),
        driftY: rand(-0.008, 0.008),
      }))
    }

    function rebuildFogBlobs() {
      fogBlobs = Array.from({ length: 5 }, () => ({
        vx: rand(-0.25, 1.25),
        vy: rand(-0.45, 0.88),
        rxFrac: rand(0.55, 1.25),
        ryFrac: rand(0.32, 0.68),
        alpha: rand(0.13, 0.25),
        angle: rand(-0.5, 0.5),
        driftX: rand(-0.000035, 0.000035),
        driftY: rand(-0.000025, 0.000025),
      }))
    }

    function seedBodies() {
      bodies.length = 0
      const count = clamp(Math.floor((worldWidth * worldHeight) / 11000), 118, 168)
      for (let i = 0; i < count; i++) bodies.push(makeBody(false, i < 4, i < 46))
    }

    function seedFieldDust() {
      fieldDust.length = 0
      const count = targetFieldDustCount()
      for (let i = 0; i < count; i++) fieldDust.push(makeFieldDust(i < 180))
    }

    function targetFieldDustCount() {
      return clamp(Math.floor((worldWidth * worldHeight) / 1900), MIN_FIELD_DUST, MAX_FIELD_DUST)
    }

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      measureWorld()
      el.width = Math.floor(viewWidth * dpr)
      el.height = Math.floor(viewHeight * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      rebuildStars()
      rebuildNebulae()
      rebuildFogBlobs()
      if (bodies.length === 0) seedBodies()
      if (fieldDust.length === 0) seedFieldDust()
      if (orbitMarkers.length === 0) seedOrbitMarkers()
      else ensureOrbitMarkers()
      if (!probe) probe = makeProbe()
      else {
        probe.x = wrapValue(probe.x, worldWidth)
        probe.y = wrapValue(probe.y, worldHeight)
      }
    }

    function cellKey(x: number, y: number) {
      return `${Math.floor(x / CELL_SIZE)},${Math.floor(y / CELL_SIZE)}`
    }

    function rebuildGrid() {
      grid.clear()
      const cw = Math.ceil(worldWidth / CELL_SIZE) || 1
      const ch = Math.ceil(worldHeight / CELL_SIZE) || 1
      bodies.forEach((body, index) => {
        const cx = ((Math.floor(body.x / CELL_SIZE) % cw) + cw) % cw
        const cy = ((Math.floor(body.y / CELL_SIZE) % ch) + ch) % ch
        const key = `${cx},${cy}`
        const cell = grid.get(key)
        if (cell) cell.push(index)
        else grid.set(key, [index])
      })
    }

    function nearbyIndexes(body: Body): number[] {
      const cw = Math.ceil(worldWidth / CELL_SIZE) || 1
      const ch = Math.ceil(worldHeight / CELL_SIZE) || 1
      const cx = ((Math.floor(body.x / CELL_SIZE) % cw) + cw) % cw
      const cy = ((Math.floor(body.y / CELL_SIZE) % ch) + ch) % ch
      const indexes: number[] = []
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const wx = ((cx + dx) % cw + cw) % cw
          const wy = ((cy + dy) % ch + ch) % ch
          const cell = grid.get(`${wx},${wy}`)
          if (cell) indexes.push(...cell)
        }
      }
      return indexes
    }

    function addEffect(effect: Effect) {
      effects.push(effect)
      if (effects.length > MAX_EFFECTS) effects.splice(0, effects.length - MAX_EFFECTS)
    }

    function emitDustCloud(x: number, y: number, z: number, hue: number, count: number, impulse = 1) {
      for (let i = 0; i < count; i++) {
        const angle = rand(0, Math.PI * 2)
        const speed = rand(0.35, 1.65) * impulse
        const coolHue = Math.random() < 0.42 ? rand(196, 214) : Math.random() < 0.7 ? rand(42, 58) : hue + rand(-10, 10)
        const effectZ = clamp(z + rand(-0.03, 0.035), 0, 1)
        const orbitBand = nearestOrbitBand(x, y, effectZ > 0.72 ? 0 : 1)
        const orbitJitter = rand(-0.7, 0.7)
        const orbital = orbitalPoint(orbitBand, orbitJitter, orbitalCoordinates(x, y).phase + rand(-0.08, 0.08))
        const spawn = blackHoleSafePoint(
          wrapValue(x + Math.cos(angle) * rand(1.5, 4.5), worldWidth),
          wrapValue(y + Math.sin(angle) * rand(1.5, 4.5), worldHeight),
          1.2,
        )
        const capped = capVelocity(
          Math.cos(angle) * speed * 0.35 + orbital.tx * speed * 0.48,
          Math.sin(angle) * speed * 0.35 + orbital.ty * speed * 0.48,
          Math.max(0.9, impulse * 1.35),
        )
        addEffect({
          id: effectId++,
          kind: 'dust',
          x: spawn.x,
          y: spawn.y,
          z: effectZ,
          vx: capped.vx,
          vy: capped.vy,
          hue: coolHue,
          age: 0,
          life: rand(24, 70),
          radius: rand(0.45, 1.35),
          maxRadius: 0,
          orbitBand,
          orbitJitter,
        })
      }
    }

    function emitCollisionDebris(x: number, y: number, z: number, hue: number, count: number, nx: number, ny: number, impulse = 1) {
      const tx = -ny
      const ty = nx
      const baseCoords = orbitalCoordinates(x, y)
      for (let i = 0; i < count; i++) {
        const spread = rand(-0.58, 0.58)
        const len = Math.hypot(nx + tx * spread, ny + ty * spread) || 1
        const dirX = (nx + tx * spread) / len
        const dirY = (ny + ty * spread) / len
        const speed = rand(0.42, 1.55) * impulse
        const coolHue = Math.random() < 0.5 ? rand(198, 214) : Math.random() < 0.74 ? rand(42, 58) : hue + rand(-8, 8)
        const effectZ = clamp(z + rand(-0.025, 0.035), 0, 1)
        const orbitBand = nearestOrbitBand(x, y, effectZ > 0.72 ? 0 : 1)
        const orbitJitter = rand(-0.7, 0.7)
        const orbital = orbitalPoint(orbitBand, orbitJitter, baseCoords.phase + rand(-0.055, 0.055))
        const spawn = blackHoleSafePoint(
          wrapValue(x + dirX * rand(1.5, 4.2), worldWidth),
          wrapValue(y + dirY * rand(1.5, 4.2), worldHeight),
          1.2,
        )
        const capped = capVelocity(
          dirX * speed * 0.62 + tx * rand(-0.055, 0.055) + orbital.tx * speed * 0.18,
          dirY * speed * 0.62 + ty * rand(-0.055, 0.055) + orbital.ty * speed * 0.18,
          Math.max(0.85, impulse * 1.45),
        )

        addEffect({
          id: effectId++,
          kind: 'dust',
          x: spawn.x,
          y: spawn.y,
          z: effectZ,
          vx: capped.vx,
          vy: capped.vy,
          hue: coolHue,
          age: 0,
          life: rand(18, 45),
          radius: rand(0.4, 1.2),
          maxRadius: 0,
          orbitBand,
          orbitJitter,
        })
      }
    }

    function emitShockwave(x: number, y: number, z: number, hue: number, radius: number) {
      const spawn = blackHoleSafePoint(wrapValue(x, worldWidth), wrapValue(y, worldHeight), radius)
      addEffect({
        id: effectId++,
        kind: 'ring',
        x: spawn.x,
        y: spawn.y,
        z,
        vx: 0,
        vy: 0,
        hue,
        age: 0,
        life: 34,
        radius: Math.max(5, radius),
        maxRadius: radius * rand(2.8, 4.4),
      })
    }

    function pairKey(a: Body, b: Body) {
      return a.id < b.id ? `${a.id}:${b.id}` : `${b.id}:${a.id}`
    }

    function contactPoint(source: Body, nx: number, ny: number) {
      return {
        x: wrapValue(source.x + nx * (source.radius + 1.8), worldWidth),
        y: wrapValue(source.y + ny * (source.radius + 1.8), worldHeight),
      }
    }

    function emitBodyFragments(
      source: Body,
      x: number,
      y: number,
      nx: number,
      ny: number,
      count: number,
      massBudget: number,
      impulse: number,
    ) {
      let emittedMass = 0
      const tx = -ny
      const ty = nx
      const fragmentCount = Math.min(count, 2)
      for (let i = 0; i < fragmentCount && bodies.length < MAX_BODIES; i++) {
        const spread = rand(-0.55, 0.55)
        const len = Math.hypot(nx + tx * spread, ny + ty * spread) || 1
        const dirX = (nx + tx * spread) / len
        const dirY = (ny + ty * spread) / len
        const mass = Math.max(MIN_BODY_MASS, (massBudget / fragmentCount) * rand(0.62, 1.22))
        const radius = bodyRadius(mass)
        const speed = rand(0.55, 1.85) * impulse
        const z = clamp(source.z + rand(-0.035, 0.05), 0, 1)
        const orbitBand = nearestOrbitBand(x, y, 1)
        const orbitJitter = rand(-0.7, 0.7)
        const orbital = orbitalPoint(orbitBand, orbitJitter, orbitalCoordinates(x, y).phase + rand(-0.08, 0.08))
        const spawn = blackHoleSafePoint(
          wrapValue(x + dirX * (radius + 2.4), worldWidth),
          wrapValue(y + dirY * (radius + 2.4), worldHeight),
          radius,
        )
        const capped = capVelocity(
          source.vx * 0.34 + dirX * speed * 0.78 + tx * rand(-0.12, 0.12) + orbital.tx * speed * 0.16,
          source.vy * 0.34 + dirY * speed * 0.78 + ty * rand(-0.12, 0.12) + orbital.ty * speed * 0.16,
          Math.max(1.15, impulse * 1.75),
        )
        emittedMass += mass
        bodies.push({
          id: nextId++,
          x: spawn.x,
          y: spawn.y,
          z,
          vx: capped.vx,
          vy: capped.vy,
          mass,
          radius,
          visualRadius: radius * 0.55,
          kind: 'particle',
          hue: source.hue + rand(-18, 18),
          age: 0,
          trail: [],
          orbitBand,
          orbitJitter,
          bornFromCollision: true,
          fragment: true,
          maxLife: rand(260, 520),
          ...visualTraits('particle', Math.random() < 0.7 ? 'asteroid' : 'cluster'),
        })
      }
      return emittedMass
    }

    function emitFieldDust(x: number, y: number, hue: number, count: number, impulse = 1) {
      for (let i = 0; i < count && fieldDust.length < MAX_FIELD_DUST; i++) {
        const angle = rand(0, Math.PI * 2)
        const speed = rand(0.22, 1.35) * impulse
        const orbitRoll = Math.random()
        const z = rand(0.32, 0.96)
        const orbitBand = orbitRoll < 0.58 ? 0 : orbitRoll < 0.86 ? 1 : 2
        const orbitJitter = rand(-1, 1)
        const orbital = z > 0.45 && Math.random() < 0.82
          ? orbitalPoint(orbitBand, orbitJitter, orbitalCoordinates(x, y).phase + rand(-0.14, 0.14))
          : null
        const capped = capVelocity(
          orbital ? orbital.tx * speed * 0.62 + orbital.nx * rand(-0.035, 0.035) : Math.cos(angle) * speed,
          orbital ? orbital.ty * speed * 0.62 + orbital.ny * rand(-0.035, 0.035) : Math.sin(angle) * speed,
          Math.max(0.8, impulse * 1.15),
        )
        fieldDust.push({
          id: effectId++,
          x: wrapValue((orbital?.x ?? x) + rand(-9, 9), worldWidth),
          y: wrapValue((orbital?.y ?? y) + rand(-9, 9), worldHeight),
          z,
          vx: capped.vx,
          vy: capped.vy,
          hue: hue + rand(-26, 26),
          radius: rand(0.4, 1.4),
          alpha: rand(0.16, 0.62),
          stream: Math.random() < 0.35 ? rand(0.6, 1.55) : 0,
          orbitBand,
          orbitJitter,
          trail: [],
        })
      }
    }

    function resolvePenetration(a: Body, b: Body, impact: ImpactInfo) {
      if (impact.overlap <= 0) return
      const totalMass = a.mass + b.mass
      const correction = Math.min(impact.overlap + 0.9, Math.min(a.radius, b.radius) * 0.75)
      const aShare = b.mass / totalMass
      const bShare = a.mass / totalMass
      a.x = wrapValue(a.x - impact.nx * correction * aShare, worldWidth)
      a.y = wrapValue(a.y - impact.ny * correction * aShare, worldHeight)
      b.x = wrapValue(b.x + impact.nx * correction * bShare, worldWidth)
      b.y = wrapValue(b.y + impact.ny * correction * bShare, worldHeight)
    }

    function applyCollisionImpulse(a: Body, b: Body, impact: ImpactInfo, restitution: number) {
      const rvx = b.vx - a.vx
      const rvy = b.vy - a.vy
      const velAlongNormal = rvx * impact.nx + rvy * impact.ny
      if (velAlongNormal > 0) return
      const invA = 1 / a.mass
      const invB = 1 / b.mass
      const impulse = (-(1 + restitution) * velAlongNormal) / (invA + invB)
      const ix = impulse * impact.nx
      const iy = impulse * impact.ny
      a.vx -= ix * invA
      a.vy -= iy * invA
      b.vx += ix * invB
      b.vy += iy * invB
    }

    function updateBodyMass(body: Body, mass: number) {
      body.mass = Math.max(MIN_BODY_MASS, mass)
      body.radius = bodyRadius(body.mass)
      body.kind = classify(body.mass)
    }

    function impactFrom(a: Body, b: Body, dx: number, dy: number): ImpactInfo {
      const distance = Math.max(0.001, Math.hypot(dx, dy))
      const nx = dx / distance
      const ny = dy / distance
      const tx = -ny
      const ty = nx
      const rvx = b.vx - a.vx
      const rvy = b.vy - a.vy
      const normalVelocity = rvx * nx + rvy * ny
      const tangentVelocity = rvx * tx + rvy * ty
      return {
        nx,
        ny,
        tx,
        ty,
        distance,
        overlap: a.radius + b.radius - distance,
        relativeVelocity: Math.hypot(rvx, rvy),
        normalSpeed: Math.abs(Math.min(0, normalVelocity)),
        tangentSpeed: Math.abs(tangentVelocity),
      }
    }

    function mergeBodies(a: Body, b: Body, impact: ImpactInfo, now: number) {
      const oldKind = a.kind
      const towardB = contactPoint(a, impact.nx, impact.ny)
      const debrisMass = Math.min((a.mass + b.mass) * 0.035, 1.35)
      const combinedMass = a.mass + b.mass - debrisMass
      const oldVisualRadius = a.visualRadius
      const totalMassForMerge = a.mass + b.mass
      a.vx = (a.vx * a.mass + b.vx * b.mass) / totalMassForMerge
      a.vy = (a.vy * a.mass + b.vy * b.mass) / totalMassForMerge
      a.z = clamp((a.z * a.mass + b.z * b.mass) / totalMassForMerge, 0, 1)
      a.x = wrapValue(a.x + wrappedDelta(a.x, b.x, worldWidth) * (b.mass / totalMassForMerge), worldWidth)
      a.y = wrapValue(a.y + wrappedDelta(a.y, b.y, worldHeight) * (b.mass / totalMassForMerge), worldHeight)
      updateBodyMass(a, combinedMass)
      a.visualRadius = Math.min(oldVisualRadius, a.radius)
      const nextStyle = a.kind === 'planet' && oldKind !== 'planet' ? chooseStyle('planet') : a.style
      Object.assign(a, visualTraits(a.kind, nextStyle))
      a.visualRadius = Math.min(oldVisualRadius, a.radius)
      a.hue = (a.hue * 0.7 + b.hue * 0.3) % 360

      emitCollisionDebris(towardB.x, towardB.y, a.z, a.hue, a.kind === 'planet' ? 6 : 3, impact.nx, impact.ny, 0.55)

      if (a.mass > 58 && bodies.length < MAX_BODIES - 3) {
        const shedMass = a.mass * 0.035
        updateBodyMass(a, a.mass - shedMass)
        emitCollisionDebris(towardB.x, towardB.y, a.z, a.hue, 4, impact.nx, impact.ny, 0.6)
        if (shedMass > 1.4) emitBodyFragments(a, towardB.x, towardB.y, impact.nx, impact.ny, 1, shedMass * 0.45, 0.55)
      }

      if (a.kind === 'planet' && oldKind !== 'planet') {
        pushEvent(`${eventBodyName(a)} formed from captured debris`, now, a.x, a.y)
      } else if (b.kind !== 'particle' || a.kind !== 'particle') {
        pushEvent(`${eventBodyName(a)} absorbed ${eventBodyName(b)}`, now, a.x, a.y)
      } else if (Math.random() < 0.14) {
        pushEvent(`${eventBodyName(b)} captured into orbit`, now, a.x, a.y)
      }
    }

    function fragment(source: Body, impactor: Body, impact: ImpactInfo, now: number, severe: boolean) {
      const dx = wrappedDelta(source.x, impactor.x, worldWidth)
      const dy = wrappedDelta(source.y, impactor.y, worldHeight)
      const d = Math.max(0.001, Math.hypot(dx, dy))
      const nx = dx / d
      const ny = dy / d
      const contact = contactPoint(source, nx, ny)
      const escapeX = -nx
      const escapeY = -ny
      const lostFraction = severe ? rand(0.56, 0.78) : rand(0.22, 0.38)
      const lostMass = Math.max(MIN_BODY_MASS * 1.5, source.mass * lostFraction)
      const pieces = clamp(Math.floor(lostMass / (severe ? 0.8 : 1.1)), severe ? 5 : 3, severe ? 12 : 7)

      updateBodyMass(source, source.mass - lostMass)
      source.visualRadius = Math.min(source.visualRadius, source.radius)
      if (source.kind !== 'planet') Object.assign(source, visualTraits(source.kind, source.kind === 'mass' ? 'proto' : 'asteroid'))
      source.vx += nx * (severe ? 0.18 : 0.08) + impactor.vx * 0.05
      source.vy += ny * (severe ? 0.18 : 0.08) + impactor.vy * 0.05

      emitCollisionDebris(contact.x, contact.y, source.z, source.hue, severe ? 22 : 12, escapeX, escapeY, severe ? 1.18 : 0.78)
      if (severe && lostMass > 1.8) {
        emitBodyFragments(source, contact.x, contact.y, escapeX, escapeY, Math.min(2, pieces), lostMass * 0.28, 1.05)
      }
      if (severe) emitShockwave(contact.x, contact.y, source.z, source.hue, source.radius * 1.15)
      pushEvent(`${eventBodyName(source)} shed debris after ${severe ? 'a high-speed' : 'a glancing'} impact`, now, contact.x, contact.y)
    }

    function handleCollision(a: Body, b: Body, impact: ImpactInfo, now: number): Body | null {
      resolvePenetration(a, b, impact)

      const dx2 = wrappedDelta(a.x, b.x, worldWidth)
      const dy2 = wrappedDelta(a.y, b.y, worldHeight)
      const fi = impactFrom(a, b, dx2, dy2)

      const key = pairKey(a, b)
      const activeCooldown = collisionCooldowns.get(key) ?? 0
      if (now < activeCooldown) {
        if (fi.normalSpeed > 0.001) applyCollisionImpulse(a, b, fi, 0.05)
        return null
      }

      const m1 = a.mass, m2 = b.mass
      const reducedMass = (m1 * m2) / (m1 + m2)
      const impactEnergy = 0.5 * reducedMass * fi.normalSpeed * fi.normalSpeed
      const specificEnergy = impactEnergy / (m1 + m2)
      const grazing = fi.tangentSpeed > fi.normalSpeed * 1.4 && fi.overlap < Math.min(a.radius, b.radius) * 0.42

      const primary = a.mass >= b.mass ? a : b
      const secondary = primary === a ? b : a
      const primaryImpact = primary === a
        ? fi
        : { ...fi, nx: -fi.nx, ny: -fi.ny, tx: -fi.tx, ty: -fi.ty }
      const contact = contactPoint(primary, primaryImpact.nx, primaryImpact.ny)

      collisionCooldowns.set(key, now + COLLISION_COOLDOWN_MS)

      if (grazing) {
        applyCollisionImpulse(a, b, fi, 0.28)
        emitCollisionDebris(contact.x, contact.y, primary.z, primary.hue, 4, primaryImpact.tx, primaryImpact.ty, 0.35)
        return null
      }

      if (specificEnergy < E_MERGE_SPECIFIC) {
        mergeBodies(primary, secondary, primaryImpact, now)
        return secondary
      }

      if (specificEnergy < E_PARTIAL_SPECIFIC) {
        applyCollisionImpulse(a, b, fi, 0.28)
        const originalMass = secondary.mass
        fragment(secondary, primary, primaryImpact, now, false)
        const scrapeMass = Math.min(primary.mass * 0.025, originalMass * 0.1)
        if (scrapeMass > MIN_BODY_MASS) {
          updateBodyMass(primary, primary.mass - scrapeMass)
          emitCollisionDebris(contact.x, contact.y, primary.z, primary.hue, 5, primaryImpact.nx, primaryImpact.ny, 0.7)
        }
        return secondary.mass <= MIN_BODY_MASS * 1.35 ? secondary : null
      }

      applyCollisionImpulse(a, b, fi, 0.44)
      fragment(secondary, primary, primaryImpact, now, true)
      const craterMass = Math.min(primary.mass * 0.055, secondary.mass * 0.3)
      if (craterMass > MIN_BODY_MASS) {
        updateBodyMass(primary, primary.mass - craterMass)
        emitCollisionDebris(contact.x, contact.y, primary.z, primary.hue, 8, primaryImpact.nx, primaryImpact.ny, 0.95)
        if (craterMass > 1.6) emitBodyFragments(primary, contact.x, contact.y, primaryImpact.nx, primaryImpact.ny, 1, craterMass * 0.35, 0.9)
      }
      return secondary.mass <= MIN_BODY_MASS * 1.8 ? secondary : null
    }

    function maintainPopulation(now: number) {
      const particles = bodies.filter((body) => body.kind === 'particle').length
      const needed = Math.max(MIN_BODIES - bodies.length, 42 - particles, 0)
      if (needed > 0 || now - lastInjectionAt > rand(1700, 3200)) {
        lastInjectionAt = now
        const amount = needed > 0 ? Math.min(needed + 6, 18) : 4
        for (let i = 0; i < amount && bodies.length < MAX_BODIES; i++) {
          bodies.push(makeBody(true, false, true))
        }
      }

      while (fieldDust.length < targetFieldDustCount()) fieldDust.push(makeFieldDust(true))
    }

    function nudgeLargeBodies(now: number) {
      if (now - lastImpulseAt < rand(2600, 4300)) return
      lastImpulseAt = now

      for (const body of bodies) {
        if (body.kind === 'particle') continue
        const orbiting = anchorOrbitFactor(body) > 0.08
        const angle = rand(0, Math.PI * 2)
        const impulse = (body.kind === 'planet' ? rand(0.035, 0.09) : rand(0.05, 0.14)) * (orbiting ? 0.18 : 1)
        body.vx += Math.cos(angle) * impulse
        body.vy += Math.sin(angle) * impulse
      }
    }

    function applyMinimumDrift(body: Body) {
      const speed = Math.hypot(body.vx, body.vy)
      const minimum = body.kind === 'planet' ? 0.18 : body.kind === 'mass' ? 0.22 : 0.32
      if (speed >= minimum) return
      if (anchorOrbitFactor(body) > 0.08) {
        const coords = orbitalCoordinates(body.x, body.y)
        const tangent = rotateFromDiskFrame(-Math.sin(coords.phase), Math.cos(coords.phase) * BLACK_HOLE_ORBIT_Y_SCALE)
        const tangentLength = Math.hypot(tangent.x, tangent.y) || 1
        const desiredSpeed = Math.max(minimum, targetOrbitSpeed(body.orbitBand, body.z, body.radius))
        body.vx += ((tangent.x / tangentLength) * desiredSpeed - body.vx) * 0.18
        body.vy += ((tangent.y / tangentLength) * desiredSpeed - body.vy) * 0.18
        return
      }
      const angle = speed > 0.001 ? Math.atan2(body.vy, body.vx) + rand(-0.45, 0.45) : rand(0, Math.PI * 2)
      body.vx = Math.cos(angle) * minimum
      body.vy = Math.sin(angle) * minimum
    }

    function applyBackgroundAnchorOrbit(
      obj: { x: number; y: number; z: number; vx: number; vy: number; orbitBand?: number; orbitJitter?: number },
      radius: number,
      dt: number,
      strengthScale = 1,
    ) {
      const anchor = blackHoleAnchor
      const depthInfluence = anchorDepthFactor(obj.z)
      if (depthInfluence <= 0.02) return

      const coords = orbitalCoordinates(obj.x, obj.y)
      const d = coords.distance
      const influenceRadius = anchor.orbitInfluenceRadius * (0.84 + obj.z * 0.28)
      if (d > influenceRadius) return

      const tangent = rotateFromDiskFrame(-Math.sin(coords.phase), Math.cos(coords.phase) * BLACK_HOLE_ORBIT_Y_SCALE)
      const tangentLength = Math.hypot(tangent.x, tangent.y) || 1
      const tx = tangent.x / tangentLength
      const ty = tangent.y / tangentLength
      const band = clamp(Math.round(obj.orbitBand ?? 2), 0, 2)
      const preferredRadius = orbitBandRadius(band, obj.orbitJitter ?? 0)
      const desiredLocalX = Math.cos(coords.phase) * preferredRadius
      const desiredLocalY = Math.sin(coords.phase) * preferredRadius * BLACK_HOLE_ORBIT_Y_SCALE
      const radial = rotateFromDiskFrame(desiredLocalX - coords.localX, desiredLocalY - coords.localY)
      const radialLength = Math.hypot(radial.x, radial.y) || 1
      const rx = radial.x / radialLength
      const ry = radial.y / radialLength
      const bandWidth = anchor.visualRadius * ([0.34, 0.48, 0.72][band] ?? 0.5)
      const orbitBand = clamp(1 - Math.abs(d - preferredRadius) / bandWidth, 0, 1)
      const broadInfluence = clamp(1 - d / influenceRadius, 0, 1)
      const influence = (orbitBand * 0.82 + broadInfluence * 0.18) * depthInfluence * strengthScale
      if (influence <= 0.002) return

      const lock = orbitLockFactor(obj.z) * influence
      const desiredSpeed = targetOrbitSpeed(band, obj.z, radius)
      const desiredVx = tx * desiredSpeed
      const desiredVy = ty * desiredSpeed
      const radialAccel = Math.min(0.012, lock * 0.18) * clamp(radialLength / bandWidth, 0, 1)

      // This is a velocity-lock stream, not inverse-square gravity. Keeping orbiting
      // bodies biased toward tangent velocity is what makes the black hole read as a system center.
      obj.vx += (desiredVx - obj.vx) * lock * dt
      obj.vy += (desiredVy - obj.vy) * lock * dt
      obj.vx += rx * radialAccel * dt
      obj.vy += ry * radialAccel * dt

      const safeRadius = anchor.visualRadius * 0.58 + radius * 2.2
      if (d < safeRadius) {
        const escape = 1 - d / safeRadius
        const fromAnchor = rotateFromDiskFrame(coords.localX, coords.localY)
        const fromAnchorLength = Math.hypot(fromAnchor.x, fromAnchor.y) || 1
        obj.vx += (fromAnchor.x / fromAnchorLength) * escape * strengthScale * 0.06 * dt
        obj.vy += (fromAnchor.y / fromAnchorLength) * escape * strengthScale * 0.06 * dt
        obj.vx += tx * escape * strengthScale * 0.09 * dt
        obj.vy += ty * escape * strengthScale * 0.09 * dt
      }

      const localSpeed = Math.hypot(obj.vx, obj.vy)
      const localLimit = radius > 4 ? 2.65 : 1.55
      if (localSpeed > localLimit) {
        const scale = localLimit / localSpeed
        obj.vx *= scale
        obj.vy *= scale
      }
    }

    function updateOrbitMarkers(dt: number) {
      ensureOrbitMarkers()
      for (const marker of orbitMarkers) {
        marker.phase = (marker.phase + marker.angularSpeed * dt) % (Math.PI * 2)
        const state = orbitMarkerState(marker)
        marker.trail.push(state)
        // These are visual-only orbit guides. Keep trails short so they cue perspective without becoming ribbons.
        const maxTrail = clamp(Math.round(8 + marker.z * 6 + marker.angularSpeed * 900), 8, 18)
        if (marker.trail.length > maxTrail) marker.trail.splice(0, marker.trail.length - maxTrail)
      }
    }

    function updateFieldDust(dt: number) {
      const attractors = bodies.filter((body) => body.kind !== 'particle' && isProjectedNearViewport(body.x, body.y, body.z, 360))

      for (const dust of fieldDust) {
        const oldX = dust.x
        const oldY = dust.y
        for (const body of attractors) {
          const depthGap = Math.abs(dust.z - body.z)
          if (depthGap > 0.42) continue
          const dx = wrappedDelta(dust.x, body.x, worldWidth)
          const dy = wrappedDelta(dust.y, body.y, worldHeight)
          const d2 = dx * dx + dy * dy
          if (d2 < (body.radius + dust.radius + 2) ** 2) {
            const d = Math.sqrt(d2) || 1
            const nx = dx / d
            const ny = dy / d
            const outwardX = -nx
            const outwardY = -ny
            dust.x = wrapValue(body.x - nx * (body.radius + dust.radius + 2.4), worldWidth)
            dust.y = wrapValue(body.y - ny * (body.radius + dust.radius + 2.4), worldHeight)
            const bounce = Math.max(0.12, Math.hypot(dust.vx, dust.vy) * 0.35)
            dust.vx = outwardX * bounce + rand(-0.025, 0.025)
            dust.vy = outwardY * bounce + rand(-0.025, 0.025)
            dust.alpha *= 0.72
            if (dust.alpha < 0.05) {
              const replacement = makeFieldDust(true)
              dust.x = replacement.x
              dust.y = replacement.y
              dust.vx = replacement.vx
              dust.vy = replacement.vy
              dust.z = replacement.z
              dust.hue = replacement.hue
              dust.radius = replacement.radius
              dust.alpha = replacement.alpha
              dust.stream = replacement.stream
              dust.orbitBand = replacement.orbitBand
              dust.orbitJitter = replacement.orbitJitter
            }
            dust.trail.length = 0
            continue
          }
          if (d2 > 210 * 210 || d2 < 18) continue
          const d = Math.sqrt(d2)
          const pull = ((1 - d / 210) * (1 - depthGap * 1.2) * body.mass * 0.00016 * dt) / d
          dust.vx += dx * pull
          dust.vy += dy * pull
        }

        const orbitFactor = anchorOrbitFactor(dust)
        applyBackgroundAnchorOrbit(dust, dust.radius, dt, dust.stream ? 1.32 : 1.08)
        const driftScale = orbitFactor > 0.08 ? 0.16 : 1
        dust.vx += Math.sin((simTime + dust.id) * 0.012) * 0.0006 * dt * driftScale
        dust.vy += Math.cos((simTime + dust.id) * 0.01) * 0.0006 * dt * driftScale
        dust.vx *= 0.9992
        dust.vy *= 0.9992
        dust.vx = clamp(dust.vx, -1.35, 1.35)
        dust.vy = clamp(dust.vy, -1.35, 1.35)
        const motionScale = depthMotionScale(dust.z)
        dust.x += dust.vx * dt * motionScale
        dust.y += dust.vy * dt * motionScale

        let wrapped = false
        if (dust.x < 0 || dust.x >= worldWidth) {
          dust.x = wrapValue(dust.x, worldWidth)
          wrapped = true
        }
        if (dust.y < 0 || dust.y >= worldHeight) {
          dust.y = wrapValue(dust.y, worldHeight)
          wrapped = true
        }

        if (wrapped || Math.hypot(dust.x - oldX, dust.y - oldY) > 34) dust.trail.length = 0
        dust.trail.push({ x: dust.x, y: dust.y })
        const orbitTrail = anchorOrbitFactor(dust) > 0.08
        const speed = Math.hypot(dust.vx, dust.vy)
        const maxTrail = orbitTrail
          ? clamp(Math.round(8 + speed * 4 + dust.z * 5 + dust.stream * 3), 8, 18)
          : clamp(Math.round(4 + speed * 3), 4, 8)
        if (dust.trail.length > maxTrail) dust.trail.shift()
      }
    }

    function updateProbe(dt: number, now: number) {
      if (!probe) {
        probe = makeProbe(now)
        return
      }

      const craft = probe
      craft.z += (craft.targetZ - craft.z) * Math.min(0.08, 0.018 * dt)
      let ax = 0
      let ay = 0
      let nearest: Body | undefined
      let nearestD2 = Number.POSITIVE_INFINITY

      for (const body of bodies) {
        if (body.kind !== 'planet' && body.kind !== 'mass') continue
        const depthGap = Math.abs(craft.z - body.z)
        const depthCoupling = clamp(1 - depthGap * 1.45, 0.12, 1)

        const dx = wrappedDelta(craft.x, body.x, worldWidth)
        const dy = wrappedDelta(craft.y, body.y, worldHeight)
        const d2 = dx * dx + dy * dy
        if (d2 < nearestD2) {
          nearest = body
          nearestD2 = d2
        }
        if (d2 > PROBE_GRAVITY_RADIUS_2) continue

        const rawDistance = Math.sqrt(d2)
        const distance = rawDistance || 1
        const influence = 1 - d2 / PROBE_GRAVITY_RADIUS_2
        const pull = (body.mass * 0.0009 * influence * depthCoupling * dt) / Math.sqrt(d2 + PROBE_SOFTENING)
        ax += dx * pull
        ay += dy * pull

        const safeDistance = body.radius + PROBE_SAFE_PAD
        if (depthGap < 0.3 && distance < safeDistance) {
          const nx = rawDistance > 0.001 ? dx / distance : Math.cos(craft.angle + Math.PI)
          const ny = rawDistance > 0.001 ? dy / distance : Math.sin(craft.angle + Math.PI)
          const escape = 1 - distance / safeDistance
          ax -= nx * (0.075 + escape * 0.12) * dt
          ay -= ny * (0.075 + escape * 0.12) * dt

          const inwardVelocity = craft.vx * nx + craft.vy * ny
          if (inwardVelocity > 0) {
            craft.vx -= nx * inwardVelocity * 1.18
            craft.vy -= ny * inwardVelocity * 1.18
          }

          if (distance < body.radius + 8) {
            craft.x = wrapValue(body.x - nx * (safeDistance + 1.2), worldWidth)
            craft.y = wrapValue(body.y - ny * (safeDistance + 1.2), worldHeight)
            craft.trail.length = 0
          }
        }
      }

      const wander = simTime * 0.019 + craft.x * 0.0011 + craft.y * 0.0008
      ax += Math.cos(wander) * 0.0022 * dt
      ay += Math.sin(wander * 0.92) * 0.0022 * dt

      applyBackgroundAnchorOrbit(craft, 7, dt, 0.42)

      if (!isProjectedNearViewport(craft.x, craft.y, craft.z, 900)) {
        const centerX = scrollX + viewWidth * 0.5
        const centerY = scrollY + viewHeight * 0.5
        ax += wrappedDelta(craft.x, centerX, worldWidth) * 0.000012 * dt
        ay += wrappedDelta(craft.y, centerY, worldHeight) * 0.000012 * dt
      }

      craft.targetId = nearestD2 < PROBE_GRAVITY_RADIUS_2 ? nearest?.id : undefined
      craft.vx += ax
      craft.vy += ay

      let speed = Math.hypot(craft.vx, craft.vy)
      if (speed < PROBE_MIN_SPEED) {
        const angle = speed > 0.001 ? Math.atan2(craft.vy, craft.vx) : craft.angle
        const boost = (PROBE_MIN_SPEED - speed) * 0.12 * dt
        craft.vx += Math.cos(angle) * boost
        craft.vy += Math.sin(angle) * boost
        speed = Math.hypot(craft.vx, craft.vy)
      }
      if (speed > PROBE_MAX_SPEED) {
        const scale = PROBE_MAX_SPEED / speed
        craft.vx *= scale
        craft.vy *= scale
        speed = PROBE_MAX_SPEED
      }

      const oldX = craft.x
      const oldY = craft.y
      const motionScale = depthMotionScale(craft.z)
      craft.x += craft.vx * dt * motionScale
      craft.y += craft.vy * dt * motionScale
      craft.angle = Math.atan2(craft.vy, craft.vx)
      craft.labelAge += dt

      let wrapped = false
      if (craft.x < 0 || craft.x >= worldWidth) {
        craft.x = wrapValue(craft.x, worldWidth)
        wrapped = true
      }
      if (craft.y < 0 || craft.y >= worldHeight) {
        craft.y = wrapValue(craft.y, worldHeight)
        wrapped = true
      }

      if (wrapped || Math.hypot(craft.x - oldX, craft.y - oldY) > PROBE_MAX_SPEED * dt * 3.2) craft.trail.length = 0
      craft.trail.push({ x: craft.x, y: craft.y })
      if (craft.trail.length > 34) craft.trail.shift()

      if (now > craft.nextLabelAt) {
        craft.label = probeLabel(craft.label)
        craft.labelAge = 0
        craft.nextLabelAt = now + rand(4000, 8000)
        craft.targetZ = Math.random() < 0.22 ? rand(0.58, 0.88) : rand(0.06, 0.5)
      }
    }

    function updatePhysics(dt: number, now: number) {
      measureWorld()
      nudgeLargeBodies(now)
      rebuildGrid()
      const removed = new Set<number>()

      for (let i = 0; i < bodies.length; i++) {
        const a = bodies[i]
        if (removed.has(i)) continue

        for (const j of nearbyIndexes(a)) {
          if (j <= i || removed.has(j)) continue
          const b = bodies[j]
          const dx = wrappedDelta(a.x, b.x, worldWidth)
          const dy = wrappedDelta(a.y, b.y, worldHeight)
          const d2 = dx * dx + dy * dy
          if (d2 > GRAVITY_RADIUS_2) continue

          const depthGap = Math.abs(a.z - b.z)
          const orbitA = anchorOrbitFactor(a) > 0.08
          const orbitB = anchorOrbitFactor(b) > 0.08
          const depthCoupling = clamp(1 - depthGap * 1.6, 0.12, 1) * (orbitA || orbitB ? 0.4 : 1)
          const d = Math.sqrt(d2 + SOFTENING)
          const pull = ((1 - d2 / GRAVITY_RADIUS_2) * depthCoupling * 0.016 * dt) / d
          const ax = dx * pull
          const ay = dy * pull
          a.vx += ax * b.mass
          a.vy += ay * b.mass
          b.vx -= ax * a.mass
          b.vy -= ay * a.mass

          if (depthGap <= DEPTH_COLLISION_THRESHOLD && d2 < (a.radius + b.radius + 1.4) ** 2) {
            const impact = impactFrom(a, b, dx, dy)
            if (impact.overlap > 0) {
              const destroyed = handleCollision(a, b, impact, now)
              if (orbitA) applyBackgroundAnchorOrbit(a, a.radius, dt, 1.1)
              if (orbitB) applyBackgroundAnchorOrbit(b, b.radius, dt, 1.1)
              if (destroyed) removed.add(destroyed === a ? i : j)
              if (destroyed === a) break
            }
          }
        }
      }

      if (removed.size) {
        const kept = bodies.filter((_, index) => !removed.has(index))
        bodies.length = 0
        bodies.push(...kept)
      }

      for (const [key, expiresAt] of collisionCooldowns) {
        if (expiresAt < now - 500) collisionCooldowns.delete(key)
      }

      for (const body of bodies) {
        if (mouse.active) {
          const mx = wrappedDelta(mouse.worldX, body.x, worldWidth)
          const my = wrappedDelta(mouse.worldY, body.y, worldHeight)
          const md2 = mx * mx + my * my
          const radius = mouse.down ? 280 : 210
          if (md2 < radius * radius && md2 > 1) {
            const md = Math.sqrt(md2)
            const strength = mouse.down ? 0.052 : 0.018
            const nudge = ((1 - md / radius) * strength * (1 - body.z * 0.62) * dt) / Math.sqrt(body.mass)
            body.vx += (mx / md) * nudge
            body.vy += (my / md) * nudge
          }
        }

        if (body.kind !== 'particle' && now - lastDustTickAt > 900) {
          body.mass = Math.min(72, body.mass + 0.004 * dt)
          body.radius = bodyRadius(body.mass)
          body.kind = classify(body.mass)
        }

        const orbitFactor = anchorOrbitFactor(body)
        const orbiting = orbitFactor > 0.08
        const perturb = (body.kind === 'planet' ? 0.0025 : body.kind === 'mass' ? 0.0035 : 0.005) * (orbiting ? 0.12 : 1)
        body.vx += Math.sin((simTime + body.id * 17) * 0.011) * perturb * dt
        body.vy += Math.cos((simTime + body.id * 13) * 0.013) * perturb * dt
        if (!orbiting) {
          body.vx += 0.0022 * dt
          body.vy += 0.0011 * dt
        }
        applyBackgroundAnchorOrbit(body, body.radius, dt, body.kind === 'particle' ? 1.25 : body.kind === 'mass' ? 0.95 : 0.78)
        body.vx *= 0.9996
        body.vy *= 0.9996
        applyMinimumDrift(body)
        body.vx = clamp(body.vx, -3.35, 3.35)
        body.vy = clamp(body.vy, -3.35, 3.35)

        const oldX = body.x
        const oldY = body.y
        const motionScale = depthMotionScale(body.z)
        body.x += body.vx * dt * motionScale
        body.y += body.vy * dt * motionScale
        body.age += dt
        body.visualRadius += (body.radius - body.visualRadius) * Math.min(0.18, 0.055 * dt)

        let wrapped = false
        if (body.x < 0 || body.x >= worldWidth) {
          body.x = wrapValue(body.x, worldWidth)
          wrapped = true
        }
        if (body.y < 0 || body.y >= worldHeight) {
          body.y = wrapValue(body.y, worldHeight)
          wrapped = true
        }

        if (body.kind === 'particle') {
          if (wrapped || Math.hypot(body.x - oldX, body.y - oldY) > 48) body.trail.length = 0
          body.trail.push({ x: body.x, y: body.y })
          const orbitTrail = anchorOrbitFactor(body) > 0.08
          const maxTrail = body.fragment ? 3 : orbitTrail ? 14 : 9
          if (body.trail.length > maxTrail) body.trail.shift()
        } else if (body.trail.length) {
          body.trail.length = 0
        }
      }

      updateProbe(dt, now)

      for (let i = bodies.length - 1; i >= 0; i--) {
        const body = bodies[i]
        if (body.fragment && body.maxLife && body.age > body.maxLife && body.kind === 'particle') {
          emitCollisionDebris(body.x, body.y, body.z, body.hue, 2, body.vx || 1, body.vy || 0, 0.22)
          bodies.splice(i, 1)
        }
      }

      if (now - lastDustTickAt > 900) {
        lastDustTickAt = now
        const large = bodies.filter((body) => body.kind !== 'particle' && isProjectedNearViewport(body.x, body.y, body.z, 220))
        for (const body of large.slice(0, 4)) {
          if (Math.random() < 0.28) emitDustCloud(body.x, body.y, body.z, body.hue, 1, 0.28)
        }
      }

      for (let i = effects.length - 1; i >= 0; i--) {
        const effect = effects[i]
        effect.age += dt
        if (effect.kind === 'dust') applyBackgroundAnchorOrbit(effect, effect.radius, dt, 0.34)
        const capped = capVelocity(effect.vx, effect.vy, effect.kind === 'dust' ? 1.35 : 1.85)
        effect.vx = capped.vx
        effect.vy = capped.vy
        const motionScale = depthMotionScale(effect.z)
        effect.x = wrapValue(effect.x + effect.vx * dt * motionScale, worldWidth)
        effect.y = wrapValue(effect.y + effect.vy * dt * motionScale, worldHeight)
        if (effect.age >= effect.life) effects.splice(i, 1)
      }

      updateFieldDust(dt)
      updateOrbitMarkers(dt)
      maintainPopulation(now)
    }

    // ── ATMOSPHERIC BACKGROUND ─────────────────────────────────────────────────

    function drawBackground() {
      const pal = paletteRef.current

      // Parse once per frame (5 hex strings, minimal cost vs. allocation savings)
      const bgR = ph(pal.bg, 1), bgG = ph(pal.bg, 3), bgB = ph(pal.bg, 5)
      const fogR = ph(pal.fog, 1), fogG = ph(pal.fog, 3), fogB = ph(pal.fog, 5)
      const glowR = ph(pal.glow, 1), glowG = ph(pal.glow, 3), glowB = ph(pal.glow, 5)

      // ── Layer 1: vertical sky gradient (hazy fog at horizon top → deep bg) ──
      const sky = ctx.createLinearGradient(0, 0, 0, viewHeight)
      sky.addColorStop(0, `rgb(${fogR},${fogG},${fogB})`)
      sky.addColorStop(0.3, `rgb(${bgR},${bgG},${bgB})`)
      sky.addColorStop(0.72, `rgb(${bgR},${bgG},${bgB})`)
      sky.addColorStop(1, `rgb(${Math.max(0, bgR - 18)},${Math.max(0, bgG - 16)},${Math.max(0, bgB - 14)})`)
      ctx.fillStyle = sky
      ctx.fillRect(0, 0, viewWidth, viewHeight)

      // ── Layer 2: directional light bloom (above viewport for day, inside for night) ──
      const lightY = bgBrightness > 0.45 ? viewHeight * -0.18 : viewHeight * 0.1
      const lightR = Math.max(viewWidth, viewHeight) * (bgBrightness > 0.45 ? 0.88 : 0.62)
      const lightStr = bgBrightness > 0.45 ? 0.44 : 0.22
      const lightG = ctx.createRadialGradient(viewWidth * 0.52, lightY, 0, viewWidth * 0.5, lightY, lightR)
      lightG.addColorStop(0, `rgba(${glowR},${glowG},${glowB},${lightStr})`)
      lightG.addColorStop(0.38, `rgba(${glowR},${glowG},${glowB},${lightStr * 0.28})`)
      lightG.addColorStop(1, `rgba(${glowR},${glowG},${glowB},0)`)
      ctx.fillStyle = lightG
      ctx.fillRect(0, 0, viewWidth, viewHeight)

      // ── Layer 3: fog blobs (atmospheric scatter — large drifting ellipses) ──
      for (const blob of fogBlobs) {
        const bx = (blob.vx + simTime * blob.driftX) * viewWidth
        const by = (blob.vy + simTime * blob.driftY) * viewHeight
        const rx = blob.rxFrac * viewWidth
        const ry = blob.ryFrac * viewHeight
        if (bx + rx < 0 || bx - rx > viewWidth) continue
        if (by + ry < 0 || by - ry > viewHeight) continue

        // Day: more fog visible; night: subtler (dark fog on dark bg = invisible anyway)
        const fa = blob.alpha * (bgBrightness > 0.45 ? 0.32 : 0.16)
        const fg = ctx.createRadialGradient(bx, by, 0, bx, by, Math.max(rx, ry))
        fg.addColorStop(0, `rgba(${fogR},${fogG},${fogB},${fa})`)
        fg.addColorStop(0.55, `rgba(${fogR},${fogG},${fogB},${fa * 0.35})`)
        fg.addColorStop(1, `rgba(${fogR},${fogG},${fogB},0)`)
        ctx.fillStyle = fg
        ctx.beginPath()
        ctx.ellipse(bx, by, rx, ry, blob.angle, 0, Math.PI * 2)
        ctx.fill()
      }

      // ── Layer 4: nebulae (desaturated in day, normal at night) ──
      for (const nebula of nebulae) {
        const x = wrapValue(nebula.x + simTime * nebula.driftX - scrollX * 0.18, worldWidth)
        const y = wrapValue(nebula.y + simTime * nebula.driftY - scrollY * 0.12, worldHeight)
        const sx = x > viewWidth + nebula.rx ? x - worldWidth : x
        const sy = y > viewHeight + nebula.ry ? y - worldHeight : y
        if (sx < -nebula.rx || sx > viewWidth + nebula.rx || sy < -nebula.ry || sy > viewHeight + nebula.ry) continue
        const nebulaAlpha = nebula.alpha * (bgBrightness > 0.45 ? 0.45 : 1.0)
        const sat = bgBrightness > 0.45 ? 18 : 82
        const ng = ctx.createRadialGradient(sx, sy, 0, sx, sy, Math.max(nebula.rx, nebula.ry))
        ng.addColorStop(0, `hsla(${nebula.hue}, ${sat}%, 62%, ${nebulaAlpha})`)
        ng.addColorStop(0.48, `hsla(${nebula.hue + 28}, ${sat}%, 48%, ${nebulaAlpha * 0.42})`)
        ng.addColorStop(1, `hsla(${nebula.hue}, ${sat}%, 40%, 0)`)
        ctx.fillStyle = ng
        ctx.beginPath()
        ctx.ellipse(sx, sy, nebula.rx, nebula.ry, nebula.driftX * 16, 0, Math.PI * 2)
        ctx.fill()
      }

      // ── Layer 5: stars — fade with day brightness ──
      const starVis = Math.max(0, 1 - bgBrightness * 2.4)
      if (starVis > 0.01) {
        const hlR = ph(pal.highlight, 1), hlG = ph(pal.highlight, 3), hlB = ph(pal.highlight, 5)
        for (const star of stars) {
          if (!isNearViewport(star.x, star.y, 10)) continue
          const x = star.x - scrollX * 0.08 + Math.sin(simTime * star.drift * 0.04 + star.y) * 4
          const y = star.y - scrollY * 0.06 + Math.cos(simTime * star.drift * 0.04 + star.x) * 3
          const twinkle = star.alpha + Math.sin(simTime * star.drift + star.x) * 0.08
          ctx.beginPath()
          ctx.arc(x, y, star.r, 0, Math.PI * 2)
          ctx.fillStyle = `rgba(${hlR},${hlG},${hlB},${clamp(twinkle * starVis, 0.02, 0.72)})`
          ctx.fill()
        }
      }
    }

    function drawCursorGlow() {
      if (!mouse.active) return
      const pal = paletteRef.current
      const radius = mouse.down ? 260 : 185
      const g = ctx.createRadialGradient(mouse.x, mouse.y, 0, mouse.x, mouse.y, radius)
      g.addColorStop(0, rgba(pal.glow, mouse.down ? 0.14 : 0.08))
      g.addColorStop(0.48, rgba(pal.particle, 0.035))
      g.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = g
      ctx.fillRect(0, 0, viewWidth, viewHeight)
    }

    function drawBackgroundAnchor(pass: 'haze' | 'backDisk' | 'core' | 'frontDisk') {
      const anchor = blackHoleAnchor
      const x = projectX(anchor.x, anchor.z)
      const y = projectY(anchor.y, anchor.z)
      const radius = projectRadius(anchor.visualRadius, anchor.z)
      if (x < -radius * 2 || x > viewWidth + radius * 2 || y < -radius * 2 || y > viewHeight + radius * 2) return

      const pal = paletteRef.current
      const alpha = projectOpacity(bgBrightness > 0.45 ? 0.44 : 0.62, anchor.z)
      const shimmer = 0.82 + Math.sin(simTime * 0.035) * 0.08

      ctx.save()
      if (pass === 'haze') {
        const shadow = ctx.createRadialGradient(x, y, radius * 0.1, x, y, radius * 1.35)
        shadow.addColorStop(0, 'rgba(0,0,0,0.62)')
        shadow.addColorStop(0.44, 'rgba(0,0,0,0.28)')
        shadow.addColorStop(1, 'rgba(0,0,0,0)')
        ctx.fillStyle = shadow
        ctx.beginPath()
        ctx.arc(x, y, radius * 1.35, 0, Math.PI * 2)
        ctx.fill()

        ctx.globalCompositeOperation = 'screen'
        const haze = ctx.createRadialGradient(x, y, radius * 0.18, x, y, radius * 2.7)
        haze.addColorStop(0, rgba(pal.glow, alpha * 0.14))
        haze.addColorStop(0.22, rgba(pal.accent, alpha * 0.09))
        haze.addColorStop(0.6, rgba(pal.particle, alpha * 0.04))
        haze.addColorStop(1, 'rgba(0,0,0,0)')
        ctx.fillStyle = haze
        ctx.beginPath()
        ctx.arc(x, y, radius * 2.7, 0, Math.PI * 2)
        ctx.fill()
        ctx.restore()
        return
      }

      if (pass === 'core') {
        ctx.globalCompositeOperation = 'screen'
        const lens = ctx.createRadialGradient(x, y, radius * 0.2, x, y, radius * 0.86)
        lens.addColorStop(0, rgba(pal.highlight, alpha * 0.12))
        lens.addColorStop(0.58, rgba(pal.glow, alpha * 0.055))
        lens.addColorStop(1, 'rgba(0,0,0,0)')
        ctx.fillStyle = lens
        ctx.beginPath()
        ctx.arc(x, y, radius * 0.86, 0, Math.PI * 2)
        ctx.fill()

        ctx.translate(x, y)
        ctx.rotate(BLACK_HOLE_DISK_ANGLE)
        ctx.strokeStyle = rgba(pal.highlight, alpha * 0.16)
        ctx.lineWidth = Math.max(0.8, radius * 0.003)
        ctx.setLineDash([Math.max(8, radius * 0.034), Math.max(10, radius * 0.05)])
        for (let i = 0; i < 3; i++) {
          ctx.beginPath()
          ctx.ellipse(0, 0, radius * (0.58 + i * 0.14), radius * (0.16 + i * 0.032), 0, Math.PI * 1.05, Math.PI * 1.95)
          ctx.stroke()
        }
        ctx.setLineDash([])
        ctx.rotate(-BLACK_HOLE_DISK_ANGLE)
        ctx.translate(-x, -y)

        ctx.globalCompositeOperation = 'source-over'
        const core = ctx.createRadialGradient(x, y, radius * 0.08, x, y, radius * 0.32)
        core.addColorStop(0, 'rgba(0,0,0,0.99)')
        core.addColorStop(0.64, 'rgba(0,0,0,0.96)')
        core.addColorStop(1, rgba(pal.bg, 0.06))
        ctx.fillStyle = core
        ctx.beginPath()
        ctx.arc(x, y, radius * 0.32, 0, Math.PI * 2)
        ctx.fill()
        ctx.restore()
        return
      }

      ctx.translate(x, y)
      ctx.rotate(BLACK_HOLE_DISK_ANGLE)
      ctx.globalCompositeOperation = 'screen'
      const front = pass === 'frontDisk'
      const start = front ? 0 : Math.PI
      const end = front ? Math.PI : Math.PI * 2

      if (!front) {
        const ringGlow = ctx.createRadialGradient(0, 0, radius * 0.28, 0, 0, radius * 1.72)
        ringGlow.addColorStop(0, 'rgba(0,0,0,0)')
        ringGlow.addColorStop(0.44, rgba(pal.highlight, alpha * 0.16))
        ringGlow.addColorStop(0.62, rgba(pal.accent, alpha * 0.14))
        ringGlow.addColorStop(0.88, rgba(pal.glow, alpha * 0.045))
        ringGlow.addColorStop(1, 'rgba(0,0,0,0)')
        ctx.fillStyle = ringGlow
        ctx.beginPath()
        ctx.ellipse(0, 0, radius * 1.85, radius * 0.5, 0, 0, Math.PI * 2)
        ctx.fill()
      }

      for (let i = 0; i < 3; i++) {
        const guideRadius = projectRadius(orbitBandRadius(i, 0), anchor.z)
        const arcAlpha = alpha * [0.14, 0.1, 0.07][i] * shimmer * (front ? 1.65 : 0.58)
        ctx.beginPath()
        ctx.setLineDash([
          Math.max(5, radius * (0.018 + i * 0.004)),
          Math.max(8, radius * (0.036 + i * 0.006)),
        ])
        ctx.ellipse(0, 0, guideRadius, guideRadius * BLACK_HOLE_ORBIT_Y_SCALE, 0, start, end)
        ctx.strokeStyle = i === 0
          ? rgba(pal.highlight, arcAlpha)
          : i === 1
            ? rgba(pal.accent, arcAlpha)
            : rgba(pal.glow, arcAlpha)
        ctx.lineWidth = Math.max(0.55, radius * (front ? 0.0045 - i * 0.0006 : 0.0025))
        ctx.stroke()
      }
      ctx.setLineDash([])

      for (let i = 0; i < 7; i++) {
        const arcAlpha = alpha * (0.044 + i * 0.009) * (front ? 1.7 : 0.64) * (0.9 + Math.sin(simTime * 0.027 + i) * 0.08)
        const arcRadius = radius * (0.82 + i * 0.14)
        ctx.beginPath()
        const offset = i * 0.05
        ctx.ellipse(0, 0, arcRadius * 1.48, arcRadius * 0.42, 0, start + offset, end - offset)
        ctx.strokeStyle = i % 2
          ? `hsla(${hueFromHex(pal.highlight) + 24}, 86%, 72%, ${arcAlpha})`
          : `hsla(${hueFromHex(pal.accent) - 18}, 88%, 66%, ${arcAlpha})`
        ctx.lineWidth = Math.max(0.55, radius * (front ? 0.0036 + i * 0.00045 : 0.0018 + i * 0.00025))
        ctx.stroke()
      }

      ctx.strokeStyle = rgba(pal.highlight, alpha * (front ? 0.38 : 0.12))
      ctx.lineWidth = Math.max(1, radius * (front ? 0.014 : 0.006))
      ctx.beginPath()
      ctx.ellipse(0, 0, radius * 1.42, radius * 0.34, 0, start, end)
      ctx.stroke()

      for (let i = 0; i < 30; i++) {
        const band = i % 3
        const guideRadius = projectRadius(orbitBandRadius(band, Math.sin(i * 2.13) * 0.45), anchor.z)
        const angle = i * 2.399
        const side = Math.sin(angle) > 0
        if (side !== front) continue
        const px = Math.cos(angle) * guideRadius
        const py = Math.sin(angle) * guideRadius * BLACK_HOLE_ORBIT_Y_SCALE
        const speckAlpha = alpha * (band === 0 ? 0.24 : band === 1 ? 0.16 : 0.1) * (front ? 1.2 : 0.45) * (0.75 + Math.sin(simTime * 0.04 + i) * 0.12)
        ctx.beginPath()
        ctx.arc(px, py, Math.max(0.35, radius * 0.004 * (1.2 - band * 0.15)), 0, Math.PI * 2)
        ctx.fillStyle = band === 0 ? rgba(pal.highlight, speckAlpha) : rgba(band === 1 ? pal.accent : pal.glow, speckAlpha)
        ctx.fill()
      }

      ctx.restore()
    }

    function blackHoleOcclusionAt(screenX: number, screenY: number, z: number, objectRadius = 0, worldX?: number, worldY?: number) {
      const anchor = blackHoleAnchor
      const side = worldX === undefined || worldY === undefined ? (z > anchor.z ? 0 : 1) : orbitSideFactor(worldX, worldY)
      const behindDisk = z > anchor.z || side < 0.5
      if (!behindDisk) return 1

      const bx = projectX(anchor.x, anchor.z)
      const by = projectY(anchor.y, anchor.z)
      const local = rotateToDiskFrame(screenX - bx, screenY - by)
      const padding = objectRadius * 0.85
      const coreRadius = projectRadius(anchor.visualRadius * 0.22, anchor.z) + padding
      if (Math.hypot(local.x, local.y) < coreRadius) return z > anchor.z || side < 0.24 ? 0 : 0.32

      const diskRx = projectRadius(anchor.visualRadius * 0.72, anchor.z) + padding
      const diskRy = projectRadius(anchor.visualRadius * 0.18, anchor.z) + padding
      const disk = (local.x / diskRx) ** 2 + (local.y / diskRy) ** 2
      if (disk < 1) return z > anchor.z ? 0.18 : clamp(0.24 + side * 0.55, 0.24, 0.72)

      const hazeRx = projectRadius(anchor.visualRadius * 1.08, anchor.z) + padding
      const hazeRy = projectRadius(anchor.visualRadius * 0.34, anchor.z) + padding
      const haze = (local.x / hazeRx) ** 2 + (local.y / hazeRy) ** 2
      if (haze < 1) return z > anchor.z ? 0.55 : clamp(0.48 + side * 0.42, 0.48, 0.84)
      return 1
    }

    function bodyOcclusionAlpha(screenX: number, screenY: number, z: number, objectRadius = 0, excludeId?: number) {
      let alpha = 1
      for (const body of bodies) {
        if (body.id === excludeId) continue
        if (body.kind === 'particle' && body.visualRadius < 5) continue
        const depthGap = z - body.z
        if (depthGap <= 0.035) continue

        const radius = projectRadius(body.visualRadius, body.z)
        if (radius < 4) continue
        const bx = projectX(body.x, body.z)
        const by = projectY(body.y, body.z)
        if (bx < -radius || bx > viewWidth + radius || by < -radius || by > viewHeight + radius) continue

        const distance = Math.hypot(screenX - bx, screenY - by)
        const hardRadius = radius * 0.82 + objectRadius * 0.42
        if (distance < hardRadius) return 0

        const fadeRadius = radius * 1.18 + objectRadius * 0.65
        if (distance < fadeRadius) {
          const edge = clamp((distance - hardRadius) / Math.max(1, fadeRadius - hardRadius), 0, 1)
          alpha = Math.min(alpha, 0.18 + edge * 0.52)
        }
      }
      return alpha
    }

    function isBackOrbitMarker(marker: OrbitMarker) {
      const state = orbitMarkerState(marker)
      return state.z > blackHoleAnchor.z || state.side < 0.5
    }

    function drawOrbitMarker(marker: OrbitMarker) {
      const state = orbitMarkerState(marker)
      if (!isProjectedNearViewport(state.x, state.y, state.z, 160)) return

      const x = projectX(state.x, state.z)
      const y = projectY(state.y, state.z)
      const markerRadius = projectRadius(marker.radius * (0.76 + state.side * 0.58), state.z)
      const occlusion =
        blackHoleOcclusionAt(x, y, state.z, markerRadius, state.x, state.y) *
        bodyOcclusionAlpha(x, y, state.z, markerRadius)
      if (occlusion <= 0.02) return

      if (marker.trail.length > 1) {
        for (let i = 1; i < marker.trail.length; i++) {
          const a = marker.trail[i - 1]
          const b = marker.trail[i]
          if (!isProjectedNearViewport(a.x, a.y, a.z, 110) && !isProjectedNearViewport(b.x, b.y, b.z, 110)) continue
          const ax = projectX(a.x, a.z)
          const ay = projectY(a.y, a.z)
          const bx = projectX(b.x, b.z)
          const by = projectY(b.y, b.z)
          if (Math.hypot(bx - ax, by - ay) > 86) continue

          const ageFade = i / Math.max(1, marker.trail.length - 1)
          const trailRadius = projectRadius(marker.radius, b.z)
          const segmentOcclusion =
            blackHoleOcclusionAt(bx, by, b.z, trailRadius, b.x, b.y) *
            bodyOcclusionAlpha(bx, by, b.z, trailRadius)
          if (segmentOcclusion <= 0.02) continue

          const sideTint = b.side > 0.5 ? 0 : 20
          const alpha = projectOpacity(
            marker.alpha * (0.055 + ageFade * 0.18) * (0.26 + b.side * 1.16),
            b.z,
          ) * segmentOcclusion
          ctx.beginPath()
          ctx.moveTo(ax, ay)
          ctx.lineTo(bx, by)
          ctx.strokeStyle = `hsla(${marker.hue + sideTint}, ${bgBrightness > 0.45 ? 38 : 86}%, ${b.side > 0.5 ? 82 : 62}%, ${alpha})`
          ctx.lineWidth = Math.max(0.25, trailRadius * (0.45 + ageFade * 0.7) * (0.62 + b.side * 0.58))
          ctx.stroke()
        }
      }

      const alpha = projectOpacity(marker.alpha * (0.34 + state.side * 0.9), state.z) * occlusion
      if (state.side > 0.54) {
        const pal = paletteRef.current
        const glow = ctx.createRadialGradient(x, y, 0, x, y, markerRadius * 5.4)
        glow.addColorStop(0, rgba(pal.highlight, alpha * 0.22))
        glow.addColorStop(0.42, `hsla(${marker.hue}, 88%, 68%, ${alpha * 0.08})`)
        glow.addColorStop(1, 'rgba(0,0,0,0)')
        ctx.fillStyle = glow
        ctx.beginPath()
        ctx.arc(x, y, markerRadius * 5.4, 0, Math.PI * 2)
        ctx.fill()
      }

      ctx.beginPath()
      ctx.arc(x, y, markerRadius, 0, Math.PI * 2)
      ctx.fillStyle = `hsla(${marker.hue + (1 - state.side) * 18}, ${bgBrightness > 0.45 ? 42 : 92}%, ${state.side > 0.5 ? 84 : 64}%, ${alpha})`
      ctx.fill()
    }

    function drawEffect(effect: Effect) {
      if (!isProjectedNearViewport(effect.x, effect.y, effect.z, 80)) return
      const x = projectX(effect.x, effect.z)
      const y = projectY(effect.y, effect.z)
      const scale = depthScale(effect.z)
      const life = 1 - effect.age / effect.life
      const side = orbitSideFactor(effect.x, effect.y)
      const orbitGlow = anchorOrbitFactor(effect)
      const sideAlpha = orbitGlow > 0.035 ? 0.48 + side * 0.62 : 1
      const projectedRadius = projectRadius(effect.radius, effect.z)
      const occlusion =
        blackHoleOcclusionAt(x, y, effect.z, projectedRadius, effect.x, effect.y) *
        bodyOcclusionAlpha(x, y, effect.z, projectedRadius)
      if (occlusion <= 0.02) return

      if (effect.kind === 'ring') {
        const radius = projectRadius(effect.radius + (effect.maxRadius - effect.radius) * (effect.age / effect.life), effect.z)
        ctx.beginPath()
        ctx.arc(x, y, radius, 0, Math.PI * 2)
        ctx.strokeStyle = `hsla(${effect.hue}, 72%, 78%, ${projectOpacity(life * 0.11, effect.z) * occlusion * sideAlpha})`
        ctx.lineWidth = 0.75 * scale
        ctx.stroke()
        return
      }

      const speed = Math.hypot(effect.vx, effect.vy)
      if (speed > 0.08) {
        ctx.beginPath()
        ctx.moveTo(x - effect.vx * 2.2 * scale, y - effect.vy * 2.2 * scale)
        ctx.lineTo(x, y)
        ctx.strokeStyle = `hsla(${effect.hue + (1 - side) * 18}, 70%, ${side > 0.55 ? 80 : 68}%, ${projectOpacity(life * 0.22, effect.z) * occlusion * sideAlpha})`
        ctx.lineWidth = 0.55 * scale * (0.75 + side * 0.35)
        ctx.stroke()
      }
      ctx.beginPath()
      ctx.arc(x, y, projectRadius(effect.radius * (0.65 + life * 0.45), effect.z), 0, Math.PI * 2)
      ctx.fillStyle = `hsla(${effect.hue + (1 - side) * 18}, 78%, ${side > 0.55 ? 84 : 72}%, ${projectOpacity(life * 0.72, effect.z) * occlusion * sideAlpha})`
      ctx.fill()
    }

    function drawFieldDust(dust: FieldDust) {
      if (!isProjectedNearViewport(dust.x, dust.y, dust.z, 60)) return
      const x = projectX(dust.x, dust.z)
      const y = projectY(dust.y, dust.z)
      const scale = depthScale(dust.z)
      const orbitGlow = anchorOrbitFactor(dust)
      const side = orbitSideFactor(dust.x, dust.y)
      const sideAlpha = orbitGlow > 0.035 ? 0.42 + side * 0.72 : 1
      const dustRadius = projectRadius(dust.radius * (1 + orbitGlow * 0.22), dust.z)
      const occlusion =
        blackHoleOcclusionAt(x, y, dust.z, dustRadius, dust.x, dust.y) *
        bodyOcclusionAlpha(x, y, dust.z, dustRadius)
      if (occlusion <= 0.02) return
      const alpha = projectOpacity(dust.alpha * (0.55 + bgBrightness * 0.45) * (1 + orbitGlow * 0.7), dust.z) * occlusion * sideAlpha

      if (dust.trail.length > 1) {
        // Segment-by-segment trails keep depth readable without turning dust into smoky ribbons.
        for (let i = 1; i < dust.trail.length; i++) {
          const a = dust.trail[i - 1]
          const b = dust.trail[i]
          if (!isProjectedNearViewport(a.x, a.y, dust.z, 70) && !isProjectedNearViewport(b.x, b.y, dust.z, 70)) continue
          const ax = projectX(a.x, dust.z)
          const ay = projectY(a.y, dust.z)
          const bx = projectX(b.x, dust.z)
          const by = projectY(b.y, dust.z)
          if (Math.hypot(bx - ax, by - ay) > 70) continue

          const ageFade = i / Math.max(1, dust.trail.length - 1)
          const segmentSide = orbitSideFactor(b.x, b.y)
          const segmentAlpha = projectOpacity(
            dust.alpha * (0.11 + orbitGlow * 0.18) * ageFade * ageFade,
            dust.z,
          ) * occlusion * (orbitGlow > 0.035 ? 0.35 + segmentSide * 0.82 : 1)
          ctx.beginPath()
          ctx.moveTo(ax, ay)
          ctx.lineTo(bx, by)
          ctx.strokeStyle = `hsla(${dust.hue + (1 - segmentSide) * 22}, ${bgBrightness > 0.45 ? 34 : 74}%, ${segmentSide > 0.55 ? 80 : 66}%, ${segmentAlpha})`
          ctx.lineWidth = Math.max(0.28, scale * (0.25 + ageFade * 0.5) * (0.72 + segmentSide * 0.48))
          ctx.stroke()
        }
      }

      ctx.beginPath()
      ctx.arc(x, y, dustRadius, 0, Math.PI * 2)
      ctx.fillStyle = `hsla(${dust.hue + (1 - side) * 14}, ${bgBrightness > 0.45 ? 36 : 82}%, ${side > 0.55 ? 84 : bgBrightness > 0.45 ? 44 : 72}%, ${alpha})`
      ctx.fill()
    }

    function drawTrail(body: Body) {
      if (body.trail.length <= 1) return
      const centerOcclusion = blackHoleOcclusionAt(
        projectX(body.x, body.z),
        projectY(body.y, body.z),
        body.z,
        projectRadius(body.visualRadius, body.z),
        body.x,
        body.y,
      ) * bodyOcclusionAlpha(
        projectX(body.x, body.z),
        projectY(body.y, body.z),
        body.z,
        projectRadius(body.visualRadius, body.z),
        body.id,
      )
      if (centerOcclusion <= 0.02) return
      const orbitGlow = anchorOrbitFactor(body)
      for (let i = 1; i < body.trail.length; i++) {
        const a = body.trail[i - 1]
        const b = body.trail[i]
        if (!isProjectedNearViewport(a.x, a.y, body.z, 120) && !isProjectedNearViewport(b.x, b.y, body.z, 120)) continue
        const ax = projectX(a.x, body.z)
        const ay = projectY(a.y, body.z)
        const bx = projectX(b.x, body.z)
        const by = projectY(b.y, body.z)
        if (Math.hypot(bx - ax, by - ay) > 86) continue

        const ageFade = i / Math.max(1, body.trail.length - 1)
        const side = orbitSideFactor(b.x, b.y)
        const sideAlpha = orbitGlow > 0.035 ? 0.38 + side * 0.78 : 1
        ctx.beginPath()
        ctx.moveTo(ax, ay)
        ctx.lineTo(bx, by)
        ctx.strokeStyle = `hsla(${body.hue + (1 - side) * 18}, 92%, ${side > 0.55 ? 76 : 62}%, ${projectOpacity((body.kind === 'particle' ? 0.22 : 0.11) * ageFade * ageFade, body.z) * centerOcclusion * sideAlpha})`
        ctx.lineWidth = (body.kind === 'particle' ? 0.92 : 0.72) * depthScale(body.z) * (0.72 + ageFade * 0.46) * (0.76 + side * 0.42)
        ctx.stroke()
      }
    }

    function irregularPath(x: number, y: number, radius: number, body: Body) {
      const points = body.style === 'cluster' ? 9 : 12
      ctx.beginPath()
      for (let i = 0; i <= points; i++) {
        const a = (i / points) * Math.PI * 2
        const wobble = 1 + Math.sin(a * 3 + body.bandSeed) * body.irregularity + Math.cos(a * 5 + body.id) * body.irregularity * 0.45
        const px = x + Math.cos(a) * radius * wobble
        const py = y + Math.sin(a) * radius * wobble
        if (i === 0) ctx.moveTo(px, py)
        else ctx.lineTo(px, py)
      }
      ctx.closePath()
    }

    function drawRings(x: number, y: number, radius: number, body: Body, behind: boolean, alpha = 1) {
      if (!body.ringed) return
      ctx.save()
      ctx.translate(x, y)
      ctx.rotate(body.tilt + Math.atan2(body.vy, body.vx) * 0.25)
      if (!behind) {
        ctx.beginPath()
        ctx.arc(0, 0, radius * 1.03, 0, Math.PI)
        ctx.clip()
      }
      ctx.strokeStyle = `hsla(${body.hue + 26}, 88%, 78%, ${(behind ? 0.16 : 0.33) * alpha})`
      ctx.lineWidth = Math.max(1, radius * 0.08)
      ctx.beginPath()
      ctx.ellipse(0, 0, radius * 2.18, radius * 0.55, 0, 0, Math.PI * 2)
      ctx.stroke()
      ctx.strokeStyle = `hsla(${body.hue - 16}, 76%, 70%, ${(behind ? 0.08 : 0.2) * alpha})`
      ctx.lineWidth = 0.8
      ctx.beginPath()
      ctx.ellipse(0, 0, radius * 1.65, radius * 0.39, 0, 0, Math.PI * 2)
      ctx.stroke()
      ctx.restore()
    }

    function drawPlanetCore(x: number, y: number, radius: number, body: Body, alpha = 1) {
      const light = ctx.createLinearGradient(x - radius, y - radius, x + radius, y + radius)
      light.addColorStop(0, `hsla(${body.hue + 24}, 86%, 78%, ${alpha})`)
      light.addColorStop(0.48, `hsla(${body.hue}, 72%, ${body.style === 'rocky' ? 44 : 52}%, ${alpha})`)
      light.addColorStop(1, `hsla(${body.hue - 36}, 78%, 18%, ${alpha})`)

      ctx.save()
      ctx.beginPath()
      ctx.arc(x, y, radius, 0, Math.PI * 2)
      ctx.fillStyle = light
      ctx.fill()
      ctx.clip()

      if (body.style === 'gas') {
        for (let i = -3; i <= 3; i++) {
          const bandY = y + i * radius * 0.26 + Math.sin(simTime * 0.01 + body.bandSeed + i) * 1.4
          ctx.fillStyle = `hsla(${body.hue + i * 8}, 78%, ${i % 2 ? 68 : 42}%, ${0.13 * alpha})`
          ctx.fillRect(x - radius, bandY, radius * 2, Math.max(1.2, radius * 0.16))
        }
      }

      if (body.style === 'rocky' || body.style === 'icy') {
        for (let i = 0; i < 7; i++) {
          const a = body.bandSeed + i * 2.17
          const rx = 0.08 + Math.abs(Math.sin(body.id * 9.13 + i * 1.7)) * 0.54
          const ry = 0.08 + Math.abs(Math.cos(body.id * 7.31 + i * 1.2)) * 0.5
          const rr = 0.05 + Math.abs(Math.sin(body.id * 4.9 + i * 2.4)) * 0.08
          const px = x + Math.cos(a) * radius * rx
          const py = y + Math.sin(a * 1.3) * radius * ry
          ctx.beginPath()
          ctx.arc(px, py, Math.max(0.7, radius * rr), 0, Math.PI * 2)
          ctx.fillStyle = `hsla(${body.hue + (body.style === 'icy' ? 26 : -18)}, 55%, ${body.style === 'icy' ? 82 : 30}%, ${0.12 * alpha})`
          ctx.fill()
        }
      }

      if (body.style === 'proto') {
        const hot = ctx.createRadialGradient(x - radius * 0.25, y - radius * 0.2, 0, x, y, radius)
        hot.addColorStop(0, `hsla(${body.hue + 54}, 96%, 82%, ${0.34 * alpha})`)
        hot.addColorStop(1, `hsla(${body.hue}, 95%, 42%, 0)`)
        ctx.fillStyle = hot
        ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2)
      }

      ctx.restore()
    }

    function drawBody(body: Body) {
      if (!isProjectedNearViewport(body.x, body.y, body.z, 120)) return
      const x = projectX(body.x, body.z)
      const y = projectY(body.y, body.z)
      const radius = projectRadius(body.visualRadius, body.z)
      const side = orbitSideFactor(body.x, body.y)
      const orbitGlow = anchorOrbitFactor(body)
      const occlusion =
        blackHoleOcclusionAt(x, y, body.z, radius, body.x, body.y) *
        bodyOcclusionAlpha(x, y, body.z, radius, body.id)
      if (occlusion <= 0.02) return
      const zAlpha = clamp(projectOpacity(1, body.z) * occlusion * (orbitGlow > 0.035 ? 0.82 + side * 0.28 : 1), 0, 1)

      drawTrail(body)

      // Scale glow by depth-of-field feel: reduce in bright-bg day mode
      const depthFade = 1 - bgBrightness * 0.55
      const glowRadius = radius * (body.kind === 'planet' ? 5.8 : body.kind === 'mass' ? 4.2 : 2.2) * body.glow
      const baseGlowAlpha = body.kind === 'planet' ? 0.18 : body.kind === 'mass' ? 0.13 : 0.05
      const glowAlpha = projectOpacity(baseGlowAlpha * depthFade, body.z) * occlusion
      const g = ctx.createRadialGradient(x, y, 0, x, y, glowRadius)
      g.addColorStop(0, `hsla(${body.hue}, 94%, 74%, ${glowAlpha})`)
      g.addColorStop(0.35, `hsla(${body.hue + 28}, 82%, 54%, ${glowAlpha * 0.45})`)
      g.addColorStop(1, `hsla(${body.hue}, 90%, 45%, 0)`)
      ctx.fillStyle = g
      ctx.beginPath()
      ctx.arc(x, y, glowRadius, 0, Math.PI * 2)
      ctx.fill()

      if (body.style === 'binary' && body.kind === 'planet') {
        const offset = radius * 0.78
        const angle = body.bandSeed + simTime * 0.006
        drawPlanetCore(x - Math.cos(angle) * offset, y - Math.sin(angle) * offset * 0.55, radius * 0.74, body, 0.92 * zAlpha)
        drawPlanetCore(x + Math.cos(angle) * offset, y + Math.sin(angle) * offset * 0.55, radius * 0.58, body, 0.8 * zAlpha)
        ctx.strokeStyle = `hsla(${body.hue + 28}, 90%, 78%, ${0.15 * zAlpha})`
        ctx.beginPath()
        ctx.ellipse(x, y, radius * 2.1, radius * 0.8, angle, 0, Math.PI * 2)
        ctx.stroke()
        return
      }

      drawRings(x, y, radius, body, true, zAlpha)

      if (body.kind === 'particle') {
        irregularPath(x, y, radius, body)
        ctx.fillStyle = body.style === 'icy'
          ? `hsla(${body.hue}, 90%, 82%, ${0.58 * zAlpha})`
          : `hsla(${body.hue}, 70%, 62%, ${0.48 * zAlpha})`
        ctx.fill()
      } else if (body.style === 'cluster') {
        for (let i = 0; i < 5; i++) {
          const a = body.bandSeed + i * 1.7
          const clumpRadius = radius * (0.25 + Math.abs(Math.sin(body.id + i * 1.9)) * 0.23)
          irregularPath(x + Math.cos(a) * radius * 0.45, y + Math.sin(a) * radius * 0.32, clumpRadius, body)
          ctx.fillStyle = `hsla(${body.hue + i * 8}, 76%, 64%, ${0.46 * zAlpha})`
          ctx.fill()
        }
      } else {
        drawPlanetCore(x, y, radius, body, zAlpha)
      }

      if (body.style === 'icy' || body.style === 'proto') {
        ctx.strokeStyle = `hsla(${body.hue + 20}, 90%, 82%, ${(body.style === 'proto' ? 0.28 : 0.2) * zAlpha})`
        ctx.lineWidth = depthScale(body.z)
        ctx.beginPath()
        ctx.arc(x, y, radius * (body.style === 'proto' ? 1.55 : 1.32), 0, Math.PI * 2)
        ctx.stroke()
      }

      drawRings(x, y, radius, body, false, zAlpha)
    }

    function drawProbe() {
      if (!probe || !isProjectedNearViewport(probe.x, probe.y, probe.z, 260)) return

      const craft = probe
      const x = projectX(craft.x, craft.z)
      const y = projectY(craft.y, craft.z)
      const scale = depthScale(craft.z)
      const side = orbitSideFactor(craft.x, craft.y)
      const orbitGlow = anchorOrbitFactor(craft)
      const occlusion =
        blackHoleOcclusionAt(x, y, craft.z, 8 * scale, craft.x, craft.y) *
        bodyOcclusionAlpha(x, y, craft.z, 8 * scale)
      if (occlusion <= 0.02) return
      const zAlpha = clamp(projectOpacity(1, craft.z) * occlusion * (orbitGlow > 0.035 ? 0.82 + side * 0.24 : 1), 0, 1)
      const pal = paletteRef.current

      if (craft.trail.length > 1) {
        for (let i = 1; i < craft.trail.length; i++) {
          const a = craft.trail[i - 1]
          const b = craft.trail[i]
          if (!isProjectedNearViewport(a.x, a.y, craft.z, 90) && !isProjectedNearViewport(b.x, b.y, craft.z, 90)) continue

          const ax = projectX(a.x, craft.z)
          const ay = projectY(a.y, craft.z)
          const bx = projectX(b.x, craft.z)
          const by = projectY(b.y, craft.z)
          if (Math.hypot(bx - ax, by - ay) > 72) continue

          const fade = i / craft.trail.length
          const segmentSide = orbitSideFactor(b.x, b.y)
          ctx.beginPath()
          ctx.moveTo(ax, ay)
          ctx.lineTo(bx, by)
          ctx.strokeStyle = segmentSide > 0.5
            ? rgba(pal.highlight, fade * 0.2 * zAlpha)
            : `hsla(${hueFromHex(pal.particle) + 12}, 72%, 68%, ${fade * 0.11 * zAlpha})`
          ctx.lineWidth = 0.7 * scale * (0.75 + segmentSide * 0.42)
          ctx.stroke()
        }

        for (let i = 0; i < craft.trail.length; i += 3) {
          const point = craft.trail[i]
          if (!isProjectedNearViewport(point.x, point.y, craft.z, 80)) continue
          const fade = i / craft.trail.length
          ctx.beginPath()
          ctx.arc(projectX(point.x, craft.z), projectY(point.y, craft.z), (0.7 + fade * 0.35) * scale, 0, Math.PI * 2)
          ctx.fillStyle = rgba(pal.highlight, fade * 0.14 * zAlpha)
          ctx.fill()
        }
      }

      const glow = ctx.createRadialGradient(x, y, 0, x, y, 26 * scale)
      glow.addColorStop(0, rgba(pal.highlight, 0.18 * zAlpha))
      glow.addColorStop(0.42, rgba(pal.glow, 0.06 * zAlpha))
      glow.addColorStop(1, 'rgba(0, 0, 0, 0)')
      ctx.fillStyle = glow
      ctx.beginPath()
      ctx.arc(x, y, 26 * scale, 0, Math.PI * 2)
      ctx.fill()

      ctx.save()
      ctx.translate(x, y)
      ctx.rotate(craft.angle)
      ctx.scale(scale, scale)
      ctx.shadowColor = rgba(pal.highlight, 0.65 * zAlpha)
      ctx.shadowBlur = 8 * scale

      ctx.beginPath()
      ctx.moveTo(8.5, 0)
      ctx.lineTo(-5.8, -3.6)
      ctx.lineTo(-2.8, 0)
      ctx.lineTo(-5.8, 3.6)
      ctx.closePath()
      ctx.fillStyle = rgba(pal.highlight, 0.92 * zAlpha)
      ctx.fill()
      ctx.strokeStyle = rgba(pal.highlight, 0.86 * zAlpha)
      ctx.lineWidth = 0.8
      ctx.stroke()

      ctx.shadowBlur = 6
      ctx.beginPath()
      ctx.moveTo(-5.6, 0)
      ctx.lineTo(-12 - Math.sin(simTime * 0.6) * 1.2, 0)
      ctx.strokeStyle = rgba(pal.accent, 0.58 * zAlpha)
      ctx.lineWidth = 1.4
      ctx.stroke()

      ctx.beginPath()
      ctx.moveTo(-2.2, -2.2)
      ctx.lineTo(4.7, 0)
      ctx.lineTo(-2.2, 2.2)
      ctx.strokeStyle = rgba(pal.glow, 0.58 * zAlpha)
      ctx.lineWidth = 0.7
      ctx.stroke()
      ctx.restore()

      const fadeIn = clamp(craft.labelAge / 24, 0, 1)
      const flicker = 0.68 + Math.sin(simTime * 0.42 + craft.x * 0.03) * 0.16
      const labelAlpha = projectOpacity(clamp(fadeIn * flicker, 0, 0.82), craft.z)
      const jitterX = Math.sin(simTime * 0.85 + craft.y * 0.013) * 0.8
      const jitterY = Math.cos(simTime * 0.72 + craft.x * 0.017) * 0.55
      const labelX = x + (16 + jitterX) * scale
      const labelY = y - (23 - jitterY) * scale

      ctx.save()
      ctx.font = `${Math.max(7, 10 * scale)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`
      ctx.textBaseline = 'middle'
      ctx.shadowColor = rgba(pal.highlight, labelAlpha * 0.75)
      ctx.shadowBlur = 8 * scale
      ctx.strokeStyle = rgba(pal.highlight, labelAlpha * 0.38)
      ctx.lineWidth = 0.7 * scale
      ctx.beginPath()
      ctx.arc(x, y, 5.4 * scale, 0, Math.PI * 2)
      ctx.moveTo(x - 8 * scale, y)
      ctx.lineTo(x - 4.6 * scale, y)
      ctx.moveTo(x + 4.6 * scale, y)
      ctx.lineTo(x + 8 * scale, y)
      ctx.moveTo(x, y - 8 * scale)
      ctx.lineTo(x, y - 4.6 * scale)
      ctx.moveTo(x, y + 4.6 * scale)
      ctx.lineTo(x, y + 8 * scale)
      ctx.moveTo(x + 6 * scale, y - 5 * scale)
      ctx.lineTo(labelX - 8 * scale, labelY + 5 * scale)
      ctx.stroke()

      const labelText = `[ ${craft.label} ]`
      const width = ctx.measureText(labelText).width
      ctx.beginPath()
      ctx.moveTo(labelX - 4 * scale, labelY - 7 * scale)
      ctx.lineTo(labelX - 9 * scale, labelY - 7 * scale)
      ctx.lineTo(labelX - 9 * scale, labelY - 2 * scale)
      ctx.moveTo(labelX + width + 4 * scale, labelY + 7 * scale)
      ctx.lineTo(labelX + width + 9 * scale, labelY + 7 * scale)
      ctx.lineTo(labelX + width + 9 * scale, labelY + 2 * scale)
      ctx.stroke()

      ctx.fillStyle = rgba(pal.highlight, labelAlpha)
      ctx.fillText(labelText, labelX, labelY)
      ctx.restore()
    }

    function draw() {
      // Derive background brightness from current palette (0=dark/night, 1=bright/day)
      const bgHex = paletteRef.current.bg
      bgBrightness = (0.299 * ph(bgHex, 1) + 0.587 * ph(bgHex, 3) + 0.114 * ph(bgHex, 5)) / 255

      drawBackground()
      drawBackgroundAnchor('haze')
      const sortedDust = [...fieldDust].sort((a, b) => b.z - a.z)
      const sortedBodies = [...bodies].sort((a, b) => b.z - a.z || a.mass - b.mass)
      const sortedEffects = [...effects].sort((a, b) => b.z - a.z)
      const sortedMarkers = [...orbitMarkers].sort((a, b) => orbitMarkerState(b).z - orbitMarkerState(a).z)
      drawBackgroundAnchor('backDisk')
      sortedMarkers.filter(isBackOrbitMarker).forEach(drawOrbitMarker)
      sortedDust.filter(isBackOrbitLayer).forEach(drawFieldDust)
      sortedBodies.filter(isBackOrbitLayer).forEach(drawBody)
      sortedEffects.filter(isBackOrbitLayer).forEach(drawEffect)
      if (probe && isBackOrbitLayer(probe)) drawProbe()
      drawBackgroundAnchor('core')
      drawCursorGlow()
      sortedDust.filter((dust) => !isBackOrbitLayer(dust)).forEach(drawFieldDust)
      sortedBodies.filter((body) => !isBackOrbitLayer(body)).forEach(drawBody)
      sortedEffects.filter((effect) => !isBackOrbitLayer(effect)).forEach(drawEffect)
      sortedMarkers.filter((marker) => !isBackOrbitMarker(marker)).forEach(drawOrbitMarker)
      if (probe && !isBackOrbitLayer(probe)) drawProbe()
      drawBackgroundAnchor('frontDisk')
    }

    function frame(now: number) {
      const dt = clamp((now - lastTime) / 16.67, 0.35, 1.8)
      lastTime = now
      simTime += dt
      updatePhysics(dt, now)
      draw()
      raf = requestAnimationFrame(frame)
    }

    function onMouseMove(e: MouseEvent) {
      mouse.x = e.clientX
      mouse.y = e.clientY
      mouse.worldX = e.clientX + scrollX
      mouse.worldY = e.clientY + scrollY
      mouse.active = true
    }

    function onMouseLeave() {
      mouse.active = false
      mouse.x = -9999
      mouse.y = -9999
      mouse.worldX = -9999
      mouse.worldY = -9999
      mouse.down = false
    }

    function onMouseDown() { mouse.down = true }
    function onMouseUp() { mouse.down = false }
    function onScroll() { measureWorld() }

    resize()
    raf = requestAnimationFrame(frame)

    const ro = new ResizeObserver(resize)
    ro.observe(document.body)
    window.addEventListener('resize', resize)
    window.addEventListener('scroll', onScroll, { passive: true })
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseleave', onMouseLeave)
    document.addEventListener('mousedown', onMouseDown)
    document.addEventListener('mouseup', onMouseUp)

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      window.removeEventListener('resize', resize)
      window.removeEventListener('scroll', onScroll)
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseleave', onMouseLeave)
      document.removeEventListener('mousedown', onMouseDown)
      document.removeEventListener('mouseup', onMouseUp)
    }
  }, [])

  useEffect(() => {
    const interval = window.setInterval(() => setEventClock(performance.now()), 350)
    return () => window.clearInterval(interval)
  }, [])

  const pal = palette ?? NIGHT_COOL

  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" aria-hidden />
      <div className="absolute bottom-5 right-5 flex w-[min(22rem,calc(100vw-2.5rem))] flex-col items-end gap-1.5">
        {events.map((event, index) => {
          const age = eventClock - event.createdAt
          const fade = clamp(1 - age / 12500, 0, 1)
          return (
            <div
              key={`${event.id}-${event.createdAt}`}
              className="font-mono text-[10px] leading-snug"
              style={{
                color: pal.highlight,
                opacity: fade * (0.42 + index / Math.max(events.length, 1) * 0.58),
                transform: `translateY(${-1 * (events.length - 1 - index)}px)`,
                textShadow: `0 0 14px ${pal.glow}88`,
              }}
            >
              {event.text}
            </div>
          )
        })}
      </div>
    </div>
  )
}
