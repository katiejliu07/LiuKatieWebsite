import { useState, useEffect, useRef } from 'react'
import {
  Palette, DAY_COOL, NIGHT_COOL, DAY_WARM, NIGHT_WARM,
  lerpPalette, cubicInOut, currentTimeOfDay,
} from '../utils/palette'

/** Trees route feels warm (desert horizon); all others are cool (open sky) */
function routeWarmness(pathname: string): number {
  return pathname.startsWith('/trees') ? 1 : 0
}

function buildPalette(warmness: number): Palette {
  const t = cubicInOut(currentTimeOfDay())
  const day = lerpPalette(DAY_COOL, DAY_WARM, warmness)
  const night = lerpPalette(NIGHT_COOL, NIGHT_WARM, warmness)
  return lerpPalette(day, night, t)
}

export function useAmbientPalette(pathname: string): Palette {
  const warmRef = useRef(routeWarmness(pathname))
  const targetRef = useRef(routeWarmness(pathname))

  const [palette, setPalette] = useState<Palette>(() => buildPalette(warmRef.current))

  // Track target warmness when route changes
  useEffect(() => {
    targetRef.current = routeWarmness(pathname)
  }, [pathname])

  useEffect(() => {
    let raf = 0
    const tick = () => {
      // Smooth cool ↔ warm crossfade (~0.028 per frame ≈ 1s at 60fps)
      const diff = targetRef.current - warmRef.current
      if (Math.abs(diff) > 0.0005) warmRef.current += diff * 0.028
      else warmRef.current = targetRef.current

      setPalette(buildPalette(warmRef.current))
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  return palette
}
