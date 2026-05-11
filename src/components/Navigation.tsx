import { NavLink } from 'react-router-dom'
import { motion } from 'framer-motion'
import { GitBranch, Lock } from 'lucide-react'

export default function Navigation() {
  return (
    <motion.nav
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.4 }}
      className="fixed top-0 left-0 right-0 z-50 h-16 flex items-center px-6 md:px-10"
      style={{
        background: 'rgba(var(--palette-bg-rgb, 5,5,8), 0.84)',
        borderBottom: '1px solid rgba(var(--palette-edge-rgb, 255,255,255), 0.1)',
        backdropFilter: 'blur(20px)',
      }}
    >
      {/* Logo */}
      <NavLink to="/" className="flex items-center gap-2.5 mr-10 group">
        <div
          className="w-7 h-7 rounded-md flex items-center justify-center"
          style={{
            background: 'linear-gradient(135deg, #a855f7 0%, #06b6d4 100%)',
            boxShadow: '0 0 16px rgba(168,85,247,0.4)',
          }}
        >
          <GitBranch size={15} className="text-white" />
        </div>
        <span className="font-semibold text-sm tracking-tight text-slate-100">Katie Liu</span>
      </NavLink>

      {/* Links */}
      <div className="flex items-center gap-6">
        <NavLink
          to="/"
          end
          className={({ isActive }) =>
            isActive
              ? 'text-sm text-slate-100 font-medium relative'
              : 'text-sm text-slate-400 hover:text-slate-200 transition-colors duration-150'
          }
        >
          {({ isActive }) => (
            <>
              Home
              {isActive && (
                <motion.div
                  layoutId="nav-indicator"
                  className="absolute -bottom-[22px] left-0 right-0 h-[2px] rounded-full"
                  style={{ background: 'linear-gradient(90deg, #a855f7, #06b6d4)' }}
                />
              )}
            </>
          )}
        </NavLink>

        <NavLink
          to="/trees"
          className={({ isActive }) =>
            isActive
              ? 'text-sm text-slate-100 font-medium relative'
              : 'text-sm text-slate-400 hover:text-slate-200 transition-colors duration-150'
          }
        >
          {({ isActive }) => (
            <>
              Project Trees
              {isActive && (
                <motion.div
                  layoutId="nav-indicator"
                  className="absolute -bottom-[22px] left-0 right-0 h-[2px] rounded-full"
                  style={{ background: 'linear-gradient(90deg, #a855f7, #06b6d4)' }}
                />
              )}
            </>
          )}
        </NavLink>
      </div>

      {/* Admin link — right side */}
      <NavLink
        to="/admin"
        className={({ isActive }) =>
          `ml-auto flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md transition-all duration-150 ${
            isActive
              ? 'text-slate-200 bg-white/10 border border-white/10'
              : 'text-slate-500 hover:text-slate-300 hover:bg-white/5 border border-transparent'
          }`
        }
      >
        <Lock size={11} />
        Admin
      </NavLink>
    </motion.nav>
  )
}
