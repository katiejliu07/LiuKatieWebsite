export type Palette = {
  bg: string
  fog: string
  glow: string
  accent: string
  highlight: string
  particle: string
  edge: string
}

export const DAY_COOL: Palette = {
  bg: '#C6E2F8',
  fog: '#E2F6FE',
  glow: '#D0EBFD',
  accent: '#8C9CA8',
  highlight: '#E5EBED',
  particle: '#A1C6D6',
  edge: '#283743',
}

export const NIGHT_COOL: Palette = {
  bg: '#070B0E',
  fog: '#0E1419',
  glow: '#202931',
  accent: '#5D6870',
  highlight: '#D1E5ED',
  particle: '#69808F',
  edge: '#E5EBED',
}

export const DAY_WARM: Palette = {
  bg: '#F2DAC3',
  fog: '#E2AE8A',
  glow: '#D29165',
  accent: '#B85C4D',
  highlight: '#F2DAC3',
  particle: '#C77B55',
  edge: '#A0463B',
}

export const NIGHT_WARM: Palette = {
  bg: '#0B0605',
  fog: '#2A1A14',
  glow: '#5A2E22',
  accent: '#A85A33',
  highlight: '#E2AE8A',
  particle: '#C77B55',
  edge: '#F2DAC3',
}

export function hexToRgb(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ]
}

function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map((v) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0')).join('')
}

function clamp(v: number, lo: number, hi: number) {
  return v < lo ? lo : v > hi ? hi : v
}

export function lerpColor(a: string, b: string, t: number): string {
  const [ar, ag, ab] = hexToRgb(a)
  const [br, bg, bb] = hexToRgb(b)
  return rgbToHex(ar + (br - ar) * t, ag + (bg - ag) * t, ab + (bb - ab) * t)
}

export function lerpPalette(a: Palette, b: Palette, t: number): Palette {
  return {
    bg: lerpColor(a.bg, b.bg, t),
    fog: lerpColor(a.fog, b.fog, t),
    glow: lerpColor(a.glow, b.glow, t),
    accent: lerpColor(a.accent, b.accent, t),
    highlight: lerpColor(a.highlight, b.highlight, t),
    particle: lerpColor(a.particle, b.particle, t),
    edge: lerpColor(a.edge, b.edge, t),
  }
}

export function cubicInOut(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}

export function paletteToRgba(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex)
  return `rgba(${r},${g},${b},${alpha})`
}

/** time-of-day ∈ [0,1]: 0 = noon (day), 1 = midnight (night) */
export function currentTimeOfDay(): number {
  const now = new Date()
  const hours = now.getHours() + now.getMinutes() / 60
  return (1 + Math.cos((hours / 24) * 2 * Math.PI)) / 2
}

/** luminance ∈ [0,1] from a hex color, 0=dark, 1=bright */
export function hexLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex)
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255
}
