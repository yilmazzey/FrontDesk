import { useEffect, useRef } from 'react'
import { useUI } from '../store'

/**
 * Trackpad pinch dollies the 3D camera. On Chromium/Firefox a pinch arrives as
 * a wheel event with `ctrlKey` set; Safari sends gesture events. There is no
 * on-screen control — the desk is a model, so the gesture zooms the lens.
 */
export function DeskZoom() {
  const setZoom = useUI((s) => s.setZoom)
  const zoomRef = useRef(useUI.getState().zoom)
  const gestureStart = useRef(0)

  useEffect(() => useUI.subscribe((s) => (zoomRef.current = s.zoom)), [])

  useEffect(() => {
    const canZoom = () =>
      useUI.getState().mode === 'desk' && window.scrollY < window.innerHeight * 0.55

    const onWheel = (event: WheelEvent) => {
      if (!(event.ctrlKey || event.metaKey) || !canZoom()) return
      event.preventDefault()
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? window.innerHeight : 1
      // Pinch out gives a negative deltaY and should move the camera closer.
      setZoom(zoomRef.current - event.deltaY * unit * 0.006)
    }

    const onGestureStart = (event: Event) => {
      if (!canZoom()) return
      event.preventDefault()
      gestureStart.current = zoomRef.current
    }

    const onGestureChange = (event: Event) => {
      if (!canZoom()) return
      event.preventDefault()
      const scale = (event as Event & { scale?: number }).scale ?? 1
      setZoom(gestureStart.current * scale)
    }

    window.addEventListener('wheel', onWheel, { passive: false })
    document.addEventListener('gesturestart', onGestureStart, { passive: false })
    document.addEventListener('gesturechange', onGestureChange, { passive: false })

    return () => {
      window.removeEventListener('wheel', onWheel)
      document.removeEventListener('gesturestart', onGestureStart)
      document.removeEventListener('gesturechange', onGestureChange)
    }
  }, [setZoom])

  return null
}
