import {
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import { AnimatePresence, animate, motion, useReducedMotion } from 'framer-motion'
import { useUI, type NotebookSection } from '../store'
import { AboutSection, PricingSection, PrivacySection } from '../content/NotebookContent'

const SECTIONS: {
  id: NotebookSection
  index: string
  title: string
  page: number
  blurb: string
}[] = [
  { id: 'about', index: '01', title: 'About us', page: 3, blurb: 'Who is behind the desk' },
  { id: 'pricing', index: '02', title: 'Pricing', page: 7, blurb: 'Three plans, no surprises' },
  { id: 'privacy', index: '03', title: 'Privacy', page: 11, blurb: 'What we collect, and why' },
]

const SECTION_TITLES: Record<NotebookSection, string> = {
  about: 'About FrontDesk',
  pricing: 'Pricing',
  privacy: 'Privacy',
}

const PAGE_OF = Object.fromEntries(SECTIONS.map((s) => [s.id, s.page])) as Record<
  NotebookSection,
  number
>
const ORDER = SECTIONS.map((s) => s.id)

function SectionView({ section }: { section: NotebookSection }) {
  if (section === 'pricing') return <PricingSection />
  if (section === 'privacy') return <PrivacySection />
  return <AboutSection />
}

/* ------------------------------------------------------------------ */
/* Corner-fold geometry                                                */
/* ------------------------------------------------------------------ */

interface Pt {
  x: number
  y: number
}

/** A page being folded: which way, from where to where, and which corner. */
interface Turn {
  dir: 1 | -1
  from: NotebookSection
  to: NotebookSection
  /** The corner's resting point, in right-leaf pixels. */
  corner: Pt
}

const sub = (a: Pt, b: Pt): Pt => ({ x: a.x - b.x, y: a.y - b.y })
const dot = (a: Pt, b: Pt) => a.x * b.x + a.y * b.y
const length = (a: Pt) => Math.hypot(a.x, a.y)
const lerp = (a: Pt, b: Pt, t: number): Pt => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
})

/** The part of a polygon on one side of a line through `m` with normal `n`. */
function clipPolygon(poly: Pt[], m: Pt, n: Pt, keepNegative: boolean): Pt[] {
  const side = (p: Pt) => {
    const d = dot(sub(p, m), n)
    return keepNegative ? -d : d
  }
  const out: Pt[] = []
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]
    const b = poly[(i + 1) % poly.length]
    const da = side(a)
    const db = side(b)
    if (da >= 0) out.push(a)
    if (da >= 0 !== db >= 0) out.push(lerp(a, b, da / (da - db)))
  }
  return out
}

const polygon = (points: Pt[]) =>
  points.length
    ? `polygon(${points.map((p) => `${p.x.toFixed(2)}px ${p.y.toFixed(2)}px`).join(', ')})`
    : 'polygon(0 0)'

/**
 * Where the page and its mirrored back go for a corner at `at`. The fold is
 * the line halfway between the corner's rest and its current point.
 */
function foldStyles(turn: Turn, at: Pt, w: number, h: number) {
  const page = [
    { x: 0, y: 0 },
    { x: w, y: 0 },
    { x: w, y: h },
    { x: 0, y: h },
  ]
  const d = sub(at, turn.corner)
  const l = length(d)
  if (l < 0.5) return null

  const n = { x: d.x / l, y: d.y / l }
  const m = lerp(turn.corner, at, 0.5)
  const front = clipPolygon(page, m, n, false)
  const flap = clipPolygon(page, m, n, true)

  // Reflection across the fold: X -> A X + b.
  const a = 1 - 2 * n.x * n.x
  const b = -2 * n.x * n.y
  const c = 1 - 2 * n.y * n.y
  const k = 2 * dot(m, n)

  return {
    front: { clipPath: polygon(front) } satisfies CSSProperties,
    flap: {
      clipPath: polygon(flap),
      transform: `matrix(${a}, ${b}, ${b}, ${c}, ${k * n.x}, ${k * n.y})`,
    } satisfies CSSProperties,
    progress: Math.min(1, l / (2 * w)),
  }
}

/** Corner the pointer has to be within (px) for the page to lift on hover. */
const PEEK_ZONE = 70
/** How far a hovered corner lifts toward the pointer, at most (px). */
const PEEK_MAX = 38
/** Pointer travel that turns a press into a drag (px). */
const DRAG_SLOP = 4
const TURN = { duration: 0.64, ease: [0.32, 0.72, 0, 1] as const }
const SETTLE = { duration: 0.34, ease: [0.23, 1, 0.32, 1] as const }

export function NotebookOverlay() {
  const mode = useUI((s) => s.mode)
  const section = useUI((s) => s.section)
  const setSection = useUI((s) => s.setSection)
  const closeNotebook = useUI((s) => s.closeNotebook)
  const open = mode === 'notebook'
  const reduce = useReducedMotion()

  const [current, setCurrent] = useState<NotebookSection>(section)
  const currentRef = useRef(current)
  currentRef.current = current
  const [turn, setTurn] = useState<Turn | null>(null)
  // The sheet is painted straight to the DOM while the corner moves, so a
  // drag or flip does not re-render the whole notebook on every frame.
  const [revealed, setRevealed] = useState(false)
  const [, setSize] = useState({ w: 0, h: 0 })
  const turnRef = useRef<Turn | null>(null)
  const atRef = useRef<Pt>({ x: 0, y: 0 })
  const revealedRef = useRef(false)
  const sizeRef = useRef({ w: 0, h: 0 })
  const pressRef = useRef<{ start: Pt; dragging: boolean } | null>(null)
  const animRef = useRef<ReturnType<typeof animate> | null>(null)
  const playingRef = useRef(false)
  const opened = useRef(false)

  const panelRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const pageRef = useRef<HTMLDivElement>(null)
  const leafRef = useRef<HTMLElement>(null)
  const frontRef = useRef<HTMLDivElement>(null)
  const backRef = useRef<HTMLDivElement>(null)
  const goRef = useRef<(target: NotebookSection) => void>(() => {})

  const stop = useCallback(() => {
    animRef.current?.stop()
    animRef.current = null
    playingRef.current = false
  }, [])

  /** Write the fold for a corner at `at` straight onto the sheet. */
  const paint = useCallback((at: Pt) => {
    const active = turnRef.current
    const { w, h } = sizeRef.current
    const front = frontRef.current
    const back = backRef.current
    if (!active || !w || !front || !back) return

    const fold = foldStyles(active, at, w, h)
    if (!fold) {
      front.style.clipPath = 'none'
      back.style.clipPath = 'polygon(0 0)'
      back.style.transform = 'none'
      return
    }

    front.style.clipPath = fold.front.clipPath as string
    back.style.clipPath = fold.flap.clipPath as string
    back.style.transform = fold.flap.transform as string

    if (!revealedRef.current) {
      revealedRef.current = true
      setRevealed(true)
    }
  }, [])

  const endTurn = useCallback(() => {
    turnRef.current = null
    revealedRef.current = false
    setRevealed(false)
    setTurn(null)
  }, [])

  /**
   * Start (or keep) a turn and place its corner. State changes only when the
   * turn actually changes, so repeated pointer moves stay off React's path.
   */
  const ensureTurn = useCallback((next: Turn, at: Pt) => {
    atRef.current = at
    const active = turnRef.current
    if (
      active &&
      active.dir === next.dir &&
      active.from === next.from &&
      active.to === next.to &&
      active.corner.x === next.corner.x &&
      active.corner.y === next.corner.y
    ) {
      return
    }
    turnRef.current = next
    revealedRef.current = false
    setRevealed(false)
    setTurn(next)
  }, [])

  useEffect(() => {
    if (!open) {
      opened.current = false
      stop()
      pressRef.current = null
      turnRef.current = null
      revealedRef.current = false
      setRevealed(false)
      setTurn(null)
      return
    }
    if (!opened.current) {
      opened.current = true
      setCurrent(section)
    }
  }, [open, section, stop])

  useEffect(() => {
    if (!open) return

    const previous = document.activeElement as HTMLElement | null
    const timer = window.setTimeout(() => closeRef.current?.focus(), 240)

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeNotebook()
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        const tag = (event.target as HTMLElement | null)?.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
        event.preventDefault()
        const step = event.key === 'ArrowRight' ? 1 : -1
        const target = ORDER[ORDER.indexOf(currentRef.current) + step]
        if (target) goRef.current(target)
      }
      if (event.key !== 'Tab' || !panelRef.current) return

      const focusable = panelRef.current.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      )
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    document.body.classList.add('is-locked')

    return () => {
      window.clearTimeout(timer)
      document.removeEventListener('keydown', onKeyDown)
      document.body.classList.remove('is-locked')
      previous?.focus?.()
    }
  }, [open, closeNotebook])

  useEffect(() => {
    pageRef.current?.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' })
  }, [current, reduce])

  useLayoutEffect(() => {
    const leaf = leafRef.current
    if (!leaf || !open) return

    const measure = () => {
      const next = { w: leaf.clientWidth, h: leaf.clientHeight }
      sizeRef.current = next
      setSize((was) => (was.w === next.w && was.h === next.h ? was : next))
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(leaf)
    return () => observer.disconnect()
  }, [open])

  useEffect(() => () => stop(), [stop])

  // Paint the freshly mounted sheet at whatever corner the pointer is on.
  useLayoutEffect(() => {
    if (turn) paint(atRef.current)
  }, [turn, paint])

  const indexOf = (id: NotebookSection) => ORDER.indexOf(id)

  const commit = useCallback(
    (to: NotebookSection) => {
      turnRef.current = null
      revealedRef.current = false
      setRevealed(false)
      setTurn(null)
      setCurrent(to)
      setSection(to)
    },
    [setSection],
  )

  const run = useCallback(
    (fromTurn: Turn, fromAt: Pt, to: Pt, complete: boolean) => {
      stop()
      playingRef.current = true
      const { h } = sizeRef.current
      const lift = complete && fromTurn.dir === 1 ? h * 0.14 * (fromTurn.corner.y === 0 ? 1 : -1) : 0
      const config = complete ? TURN : SETTLE

      animRef.current = animate(0, 1, {
        ...config,
        onUpdate: (t) => {
          const p = lerp(fromAt, to, t)
          atRef.current = { x: p.x, y: p.y + Math.sin(Math.PI * t) * lift }
          paint(atRef.current)
        },
        onComplete: () => {
          animRef.current = null
          playingRef.current = false
          if (complete) {
            commit(fromTurn.to)
          } else {
            endTurn()
          }
        },
      })
    },
    [commit, endTurn, paint, stop],
  )

  const flipTo = useCallback(
    (target: NotebookSection) => {
      if (playingRef.current || turnRef.current || target === current) return
      const direction: 1 | -1 = indexOf(target) > indexOf(current) ? 1 : -1
      if (reduce || !sizeRef.current.w) {
        commit(target)
        return
      }

      const { w, h } = sizeRef.current
      const corner = { x: w, y: h }
      const startAt = direction === 1 ? { ...corner } : { x: 0, y: h }
      const endAt = direction === 1 ? { x: -w, y: h } : { ...corner }
      const next: Turn = { dir: direction, from: current, to: target, corner }
      turnRef.current = next
      atRef.current = startAt
      revealedRef.current = false
      setRevealed(false)
      setTurn(next)
      run(next, startAt, endAt, true)
    },
    [commit, current, reduce, run],
  )

  const go = useCallback(
    (direction: 1 | -1) => {
      const target = ORDER[indexOf(current) + direction]
      if (target) flipTo(target)
    },
    [current, flipTo],
  )

  useEffect(() => {
    goRef.current = flipTo
  }, [flipTo])

  const local = (event: ReactPointerEvent): Pt => {
    const rect = leafRef.current?.getBoundingClientRect()
    return rect
      ? { x: event.clientX - rect.left, y: event.clientY - rect.top }
      : { x: 0, y: 0 }
  }

  const cornerFor = (y: number): Pt => {
    const { w, h } = sizeRef.current
    return { x: w, y: y < h / 2 ? 0 : h }
  }

  const canTurn = (direction: 1 | -1) => {
    const index = indexOf(current) + direction
    return index >= 0 && index < ORDER.length
  }

  const onPointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0 || playingRef.current) return
    if (!canTurn(1) || pressRef.current) return
    const p = local(event)
    const corner = cornerFor(p.y)
    if (length(sub(p, corner)) > PEEK_ZONE) return

    // Hover peek already lifted the corner; pick the sheet up from there
    // instead of snapping it back to the edge.
    const active = turnRef.current
    const sameCorner =
      active?.dir === 1 && active.corner.x === corner.x && active.corner.y === corner.y
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      // Synthetic events and some stylus drivers have no capturable pointer.
    }
    pressRef.current = { start: p, dragging: false }
    ensureTurn(
      { dir: 1, from: current, to: ORDER[indexOf(current) + 1], corner },
      sameCorner ? atRef.current : corner,
    )
  }

  const onPointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    const p = local(event)
    const press = pressRef.current
    const active = turnRef.current
    const { w, h } = sizeRef.current

    if (press && active) {
      if (!press.dragging && length(sub(p, press.start)) < DRAG_SLOP) return
      press.dragging = true
      atRef.current = {
        x: Math.max(-w, Math.min(w, p.x)),
        y: Math.max(0, Math.min(h, p.y)),
      }
      paint(atRef.current)
      return
    }
    if (press || playingRef.current || reduce || !w) return
    if (event.pointerType !== 'mouse') return

    // A corner near the pointer lifts a little, inviting the turn.
    if (!canTurn(1)) return
    const corner = cornerFor(p.y)
    const toward = sub(p, corner)
    const dist = length(toward)
    if (dist >= PEEK_ZONE) {
      if (active) run(active, atRef.current, active.corner, false)
      return
    }

    stop()
    const lift = Math.min(PEEK_MAX, Math.max(1, dist) * 0.6 + 14)
    const unit = dist < 1 ? { x: -1, y: 0 } : { x: toward.x / dist, y: toward.y / dist }
    const at = { x: corner.x + unit.x * lift, y: corner.y + unit.y * lift }
    ensureTurn({ dir: 1, from: current, to: ORDER[indexOf(current) + 1], corner }, at)
    paint(at)
  }

  const onPointerUp = () => {
    const press = pressRef.current
    const active = turnRef.current
    pressRef.current = null
    if (!press || !active) return

    const { w } = sizeRef.current
    const at = atRef.current
    const crossed = active.dir === 1 ? at.x < 0 : at.x > 0
    const complete = press.dragging ? crossed : true
    const restingCorner =
      active.dir === 1
        ? { x: -w, y: active.corner.y }
        : { x: w, y: active.corner.y }
    run(active, at, complete ? restingCorner : active.corner, complete)
  }

  const onPointerLeave = () => {
    const active = turnRef.current
    if (!pressRef.current && active && !playingRef.current) {
      run(active, atRef.current, active.corner, false)
    }
  }

  const step = (direction: 1 | -1) => {
    if (playingRef.current || turnRef.current) return
    go(direction)
  }

  /* ----- what the book shows ----- */

  const underSection = turn ? (turn.dir === 1 ? turn.to : turn.from) : current
  // Only reveal the next page once the sheet is actually folded, so pressing
  // a corner without dragging does not flash the following page.
  const displayed = turn && revealed ? underSection : current
  const frontSection = turn ? (turn.dir === 1 ? turn.from : turn.to) : current
  const atStart = indexOf(current) === 0
  const atEnd = indexOf(current) === ORDER.length - 1

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          ref={panelRef}
          className="flipbook"
          role="dialog"
          aria-modal="true"
          aria-label={`The notebook — ${SECTION_TITLES[displayed]}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: reduce ? 0 : 0.22 } }}
          transition={{ duration: reduce ? 0 : 0.3 }}
        >
          <div
            className="flipbook__scrim"
            onClick={closeNotebook}
            role="presentation"
            aria-hidden="true"
          />

          <button ref={closeRef} type="button" className="flipbook__close" onClick={closeNotebook}>
            <span>Close</span>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>

          <motion.div
            className="flipbook__cover"
            initial={
              reduce ? { opacity: 0 } : { opacity: 0, y: 34, scale: 0.972, rotateX: -8 }
            }
            animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1, rotateX: 0 }}
            exit={
              reduce
                ? { opacity: 0, transition: { duration: 0 } }
                : {
                    opacity: 0,
                    y: 22,
                    scale: 0.984,
                    rotateX: -5,
                    transition: { duration: 0.22, ease: [0.4, 0, 1, 1] },
                  }
            }
            transition={{ type: 'spring', stiffness: 150, damping: 21, mass: 0.85 }}
          >
            {/* ---------------- left leaf: contents ---------------- */}
            <section className="flipbook__page flipbook__page--left">
              <header className="flipbook__masthead">
                <span>FrontDesk / field notes</span>
                <span>No. 01</span>
              </header>

              <h2 className="flipbook__title">
                The <em>notebook</em>
              </h2>
              <p className="flipbook__intro">
                Three pages, no fine print. Lift a corner and turn the leaf.
              </p>

              <nav className="toc" aria-label="Notebook sections">
                {SECTIONS.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`toc__row${displayed === item.id ? ' is-on' : ''}`}
                    aria-current={displayed === item.id ? 'page' : undefined}
                    onClick={() => {
                      if (item.id !== current) flipTo(item.id)
                    }}
                  >
                    <span className="toc__index">{item.index}</span>
                    <span className="toc__text">
                      <span className="toc__title">{item.title}</span>
                      <span className="toc__blurb">{item.blurb}</span>
                    </span>
                    <span className="toc__leader" aria-hidden="true" />
                    <span className="toc__page">{item.page}</span>
                  </button>
                ))}
              </nav>

              <figure className="flipbook__quote">
                <blockquote>“The best interface is the one you forget you're using.”</blockquote>
                <figcaption>desk note no. 4</figcaption>
              </figure>

              <footer className="flipbook__leftFoot">
                <button type="button" className="flipbook__back" onClick={closeNotebook}>
                  <span aria-hidden="true">←</span> Back to the desk
                </button>
                <span className="flipbook__esc">Esc</span>
              </footer>
            </section>

            <div className="flipbook__gutter" aria-hidden="true" />

            {/* ---------------- right leaf: the page ---------------- */}
            <section
              ref={leafRef}
              className="flipbook__page flipbook__page--right"
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              onPointerLeave={onPointerLeave}
            >
              <div className="flipbook__paper" ref={pageRef}>
                <nav className="flipbook__tabs" aria-label="Notebook sections">
                  {SECTIONS.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className={displayed === item.id ? 'is-on' : ''}
                      aria-current={displayed === item.id ? 'page' : undefined}
                      onClick={() => {
                        if (item.id !== current) flipTo(item.id)
                      }}
                    >
                      {item.title}
                    </button>
                  ))}
                </nav>

                <header className="flipbook__folio">
                  <span>{SECTION_TITLES[displayed]}</span>
                  <span>{PAGE_OF[displayed]}</span>
                </header>

                <SectionView section={displayed} />

                <footer className="flipbook__foot">
                  <button
                    type="button"
                    className="flipbook__turnBtn"
                    onClick={() => step(-1)}
                    disabled={atStart || Boolean(turn)}
                  >
                    <span aria-hidden="true">←</span> Previous
                  </button>
                  <span className="flipbook__pageNo">p. {PAGE_OF[displayed]}</span>
                  <button
                    type="button"
                    className="flipbook__turnBtn"
                    onClick={() => step(1)}
                    disabled={atEnd || Boolean(turn)}
                  >
                    Next <span aria-hidden="true">→</span>
                  </button>
                </footer>
              </div>

              {turn && (
                <div className="flipTurn" aria-hidden="true">
                  <div className="flipTurn__shadow">
                    <div className="flipTurn__back" ref={backRef}>
                      <div className="flipTurn__verso">
                        <span className="flipTurn__versoTiny">verso · FrontDesk</span>
                        <p>Keep the desk quiet.</p>
                        <span className="flipTurn__stamp">NO. 01</span>
                      </div>
                    </div>
                  </div>

                  <div className="flipTurn__front" ref={frontRef}>
                    <div className="flipTurn__page">
                      <header className="flipbook__folio">
                        <span>{SECTION_TITLES[frontSection]}</span>
                        <span>{PAGE_OF[frontSection]}</span>
                      </header>
                      <SectionView section={frontSection} />
                    </div>
                  </div>
                </div>
              )}
            </section>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
