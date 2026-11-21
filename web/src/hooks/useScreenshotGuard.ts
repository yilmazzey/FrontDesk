import { useCallback, useEffect, useRef, useState } from 'react'

const HOLD_MS = 7000

/**
 * Best-effort screenshot guard.
 *
 * Browsers are not told when the operating system takes a screenshot, so this
 * combines the signals a page can see:
 * - the macOS screenshot shortcuts (⌘⇧3 / 4 / 5), Print Screen and the Windows
 *   Snipping Tool shortcut;
 * - the page losing focus, which is what happens when the screenshot UI takes
 *   over;
 * - the tab becoming hidden.
 *
 * When any of those happen the notebook photos are blurred for a short window,
 * long enough to cover the capture. A manual toggle in the overlay is the
 * fallback when the OS swallows the shortcut before it reaches the browser.
 */
export function useScreenshotGuard(active: boolean) {
  const [guarded, setGuarded] = useState(false)
  const timer = useRef<number | null>(null)

  const hold = useCallback((duration = HOLD_MS) => {
    setGuarded(true)
    if (timer.current !== null) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      timer.current = null
      setGuarded(false)
    }, duration)
  }, [])

  const release = useCallback(() => {
    if (timer.current !== null) window.clearTimeout(timer.current)
    timer.current = null
    setGuarded(false)
  }, [])

  useEffect(() => {
    if (!active) return

    const onKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase()
      const macOSScreenshot =
        event.metaKey && event.shiftKey && ['3', '4', '5'].includes(event.key)
      const printScreen = event.key === 'PrintScreen'
      const windowsSnippet = event.ctrlKey && event.shiftKey && key === 's'
      if (macOSScreenshot || printScreen || windowsSnippet) hold()
    }
    const onBlur = () => hold()
    const onVisibility = () => {
      if (document.hidden) hold()
    }

    document.addEventListener('keydown', onKeyDown)
    window.addEventListener('blur', onBlur)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('blur', onBlur)
      document.removeEventListener('visibilitychange', onVisibility)
      if (timer.current !== null) window.clearTimeout(timer.current)
    }
  }, [active, hold])

  return { guarded, hold, release }
}
