import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, useScroll, useTransform } from 'framer-motion'
import { DeskScene } from '../scene/DeskScene'
import { Hero, Hud, ScrollCue, TopBar } from '../components/Chrome'
import { DeskZoom } from '../components/DeskZoom'
import { Journal } from '../components/Journal'
import { NotebookOverlay } from '../components/NotebookOverlay'
import { LoaderOverlay } from '../components/LoaderOverlay'
import { ErrorBoundary } from '../components/ErrorBoundary'
import { useUI } from '../store'
import { clamp01, scrollStage } from '../lib/scroll'

const initialHeight = typeof window === 'undefined' ? 900 : window.innerHeight

/**
 * The first viewport is the desk. After that the printed sheet arrives.
 *
 * The hand-off is a real camera move: `scrollStage.progress` feeds the
 * CameraRig, which dollies from the wide desk pose into `framing.handoff`
 * while the journal sheet scrolls up over it. Nothing is scaled by CSS, so
 * there is no resampling of the render and no lag behind the scrollbar.
 */
export default function Home() {
  const navigate = useNavigate()
  const resetMode = useUI((s) => s.resetMode)
  const [viewport, setViewport] = useState(initialHeight)
  const [deskGone, setDeskGone] = useState(false)

  const { scrollY } = useScroll()

  const sceneOpacity = useTransform(
    scrollY,
    [0, viewport * 0.82, viewport * 0.99],
    [1, 1, 0],
  )
  const overlayOpacity = useTransform(scrollY, [0, viewport * 0.34], [1, 0])
  const overlayY = useTransform(scrollY, [0, viewport * 0.42], [0, -28])

  useEffect(() => {
    const onResize = () => setViewport(window.innerHeight)
    onResize()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => {
    resetMode()
    window.scrollTo(0, 0)
  }, [resetMode])

  // Feed the 3D camera directly from the scroll position. A passive native
  // listener (instead of a React state update) keeps the dolly glued to the
  // scrollbar and costs no re-renders.
  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY
      scrollStage.progress = clamp01(y / viewport)
      const gone = y > viewport * 0.7
      setDeskGone((was) => (was === gone ? was : gone))
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [viewport])

  const onOpenApp = useCallback(() => {
    navigate('/monitor')
  }, [navigate])

  return (
    <main className="page">
      <motion.div
        className="sceneLayer"
        style={{
          opacity: sceneOpacity,
          pointerEvents: deskGone ? 'none' : 'auto',
        }}
      >
        <ErrorBoundary
          fallback={
            <div className="scene-fallback">
              <p className="scene-fallback__title">The desk is taking a moment.</p>
              <p>
                The 3D scene couldn't load. Everything is still here — scroll on, or use the links
                to read the notebook or open the app.
              </p>
            </div>
          }
        >
          <DeskScene onOpenApp={onOpenApp} />
        </ErrorBoundary>
        <div className="stage__scrim" aria-hidden="true" />
      </motion.div>

      <motion.div
        className="overlayLayer"
        style={{
          opacity: overlayOpacity,
          y: overlayY,
          visibility: deskGone ? 'hidden' : 'visible',
        }}
      >
        <TopBar />
        <Hero />
        <ScrollCue />
        <Hud />
        <DeskZoom />
      </motion.div>

      <div className="journalScroll">
        <div
          className="journalScroll__spacer"
          style={{ height: viewport }}
          aria-hidden="true"
        />
        <Journal />
      </div>

      <NotebookOverlay />
      <LoaderOverlay />
    </main>
  )
}
