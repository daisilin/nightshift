import { Routes, Route, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { LandingPage } from './pages/LandingPage'
import { DispatchPage } from './pages/DispatchPage'
import { ReportPage } from './pages/ReportPage'
import { page } from './lib/animations'

export default function App() {
  const location = useLocation()
  return (
    <AnimatePresence mode="wait">
      <motion.div key={location.pathname} variants={page} initial="initial" animate="animate" exit="exit">
        <Routes location={location}>
          <Route path="/" element={<LandingPage />} />
          <Route path="/dispatch" element={<DispatchPage />} />
          <Route path="/report" element={<ReportPage />} />
        </Routes>
      </motion.div>
    </AnimatePresence>
  )
}
