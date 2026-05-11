import { Routes, Route, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import Navigation from './components/Navigation'
import AnimatedBackground from './components/AnimatedBackground'
import Home from './pages/Home'
import Trees from './pages/Trees'
import Admin from './pages/Admin'
import { useAmbientPalette } from './hooks/useAmbientPalette'
import { hexToRgb, hexLuminance, lerpColor } from './utils/palette'

// TypeScript extension to allow CSS custom properties in style prop
interface PaletteVars extends React.CSSProperties {
  '--palette-bg'?: string
  '--palette-bg-rgb'?: string
  '--palette-fog'?: string
  '--palette-fog-rgb'?: string
  '--palette-glow'?: string
  '--palette-glow-rgb'?: string
  '--palette-edge'?: string
  '--palette-edge-rgb'?: string
  '--palette-highlight'?: string
  '--palette-highlight-rgb'?: string
  '--palette-accent'?: string
  '--palette-accent-rgb'?: string
  '--palette-text'?: string
  '--palette-text-rgb'?: string
  '--palette-text-muted'?: string
  '--palette-text-muted-rgb'?: string
}

const pageVariants = {
  initial: { opacity: 0, y: 12 },
  enter: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
}

export default function App() {
  const location = useLocation()
  const palette = useAmbientPalette(location.pathname)

  const [bgR, bgG, bgB] = hexToRgb(palette.bg)
  const [fogR, fogG, fogB] = hexToRgb(palette.fog)
  const [glowR, glowG, glowB] = hexToRgb(palette.glow)
  const [edgeR, edgeG, edgeB] = hexToRgb(palette.edge)
  const [hlR, hlG, hlB] = hexToRgb(palette.highlight)
  const [acR, acG, acB] = hexToRgb(palette.accent)

  // Dynamic text color — dark on bright (day) palette, light on dark (night) palette
  const bgLum = hexLuminance(palette.bg)
  const tText = Math.max(0, Math.min(1, (bgLum - 0.28) / 0.45))
  const textHex = lerpColor('#f1f5f9', '#1e293b', tText)
  const textMutedHex = lerpColor('#94a3b8', '#475569', tText)
  const [txR, txG, txB] = hexToRgb(textHex)
  const [tmR, tmG, tmB] = hexToRgb(textMutedHex)

  const cssVars: PaletteVars = {
    '--palette-bg': palette.bg,
    '--palette-bg-rgb': `${bgR},${bgG},${bgB}`,
    '--palette-fog': palette.fog,
    '--palette-fog-rgb': `${fogR},${fogG},${fogB}`,
    '--palette-glow': palette.glow,
    '--palette-glow-rgb': `${glowR},${glowG},${glowB}`,
    '--palette-edge': palette.edge,
    '--palette-edge-rgb': `${edgeR},${edgeG},${edgeB}`,
    '--palette-highlight': palette.highlight,
    '--palette-highlight-rgb': `${hlR},${hlG},${hlB}`,
    '--palette-accent': palette.accent,
    '--palette-accent-rgb': `${acR},${acG},${acB}`,
    '--palette-text': textHex,
    '--palette-text-rgb': `${txR},${txG},${txB}`,
    '--palette-text-muted': textMutedHex,
    '--palette-text-muted-rgb': `${tmR},${tmG},${tmB}`,
  }

  return (
    <div className="relative min-h-screen" style={cssVars}>
      {/* Canvas owns the full background — atmosphere first */}
      <AnimatedBackground palette={palette} />

      <Navigation />

      <main className="relative z-10 pt-16">
        <AnimatePresence mode="wait">
          <motion.div
            key={location.pathname}
            variants={pageVariants}
            initial="initial"
            animate="enter"
            exit="exit"
            transition={{ duration: 0.25, ease: 'easeOut' }}
          >
            <Routes location={location}>
              <Route path="/" element={<Home />} />
              <Route path="/trees" element={<Trees />} />
              <Route path="/admin" element={<Admin />} />
            </Routes>
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  )
}
