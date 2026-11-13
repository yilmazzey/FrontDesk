import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
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

type Turn = { from: NotebookSection; to: NotebookSection; direction: 1 | -1 }

export function NotebookOverlay() {
  const mode = useUI((s) => s.mode)
  const section = useUI((s) => s.section)
  const setSection = useUI((s) => s.setSection)
  const closeNotebook = useUI((s) => s.closeNotebook)
  const open = mode === 'notebook'
  const reduce = useReducedMotion()

  const [current, setCurrent] = useState<NotebookSection>(section)
  const [turn, setTurn] = useState<Turn | null>(null)
  const opened = useRef(false)

  const panelRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const pageRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) {
      opened.current = false
      setTurn(null)
      return
    }
    if (!opened.current) {
      opened.current = true
      setCurrent(section)
    }
  }, [open, section])

  useEffect(() => {
    if (!open) return

    const previous = document.activeElement as HTMLElement | null
    const timer = window.setTimeout(() => closeRef.current?.focus(), 240)

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeNotebook()
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

  const go = (target: NotebookSection) => {
    if (turn || target === current) return
    if (reduce) {
      setCurrent(target)
      setSection(target)
      return
    }
    setTurn({
      from: current,
      to: target,
      direction: ORDER.indexOf(target) > ORDER.indexOf(current) ? 1 : -1,
    })
  }

  const commit = () => {
    if (!turn) return
    setCurrent(turn.to)
    setSection(turn.to)
    setTurn(null)
  }

  // For a forward turn the old leaf lifts away, revealing the new one. For a
  // backward turn the new leaf comes in from the left and lands on the old.
  const visible = turn
    ? turn.direction === 1
      ? turn.to
      : turn.from
    : current

  const step = (direction: 1 | -1) => {
    const index = ORDER.indexOf(current) + direction
    if (index < 0 || index >= ORDER.length) return
    go(ORDER[index])
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          ref={panelRef}
          className="flipbook"
          role="dialog"
          aria-modal="true"
          aria-label={`The notebook — ${SECTION_TITLES[current]}`}
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
                Three pages, no fine print. Turn a leaf and it opens on the right.
              </p>

              <nav className="toc" aria-label="Notebook sections">
                {SECTIONS.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`toc__row${current === item.id ? ' is-on' : ''}`}
                    aria-current={current === item.id ? 'page' : undefined}
                    onClick={() => go(item.id)}
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
            <section className="flipbook__page flipbook__page--right">
              <div className="flipbook__paper" ref={pageRef}>
                <nav className="flipbook__tabs" aria-label="Notebook sections">
                  {SECTIONS.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className={current === item.id ? 'is-on' : ''}
                      aria-current={current === item.id ? 'page' : undefined}
                      onClick={() => go(item.id)}
                    >
                      {item.title}
                    </button>
                  ))}
                </nav>

                <header className="flipbook__folio">
                  <span>{SECTION_TITLES[visible]}</span>
                  <span>{PAGE_OF[visible]}</span>
                </header>

                <SectionView section={visible} />

                <footer className="flipbook__foot">
                  <button
                    type="button"
                    className="flipbook__turnBtn"
                    onClick={() => step(-1)}
                    disabled={ORDER.indexOf(current) === 0 || Boolean(turn)}
                  >
                    <span aria-hidden="true">←</span> Previous
                  </button>
                  <span className="flipbook__pageNo">p. {PAGE_OF[visible]}</span>
                  <button
                    type="button"
                    className="flipbook__turnBtn"
                    onClick={() => step(1)}
                    disabled={ORDER.indexOf(current) === ORDER.length - 1 || Boolean(turn)}
                  >
                    Next <span aria-hidden="true">→</span>
                  </button>
                </footer>
              </div>

              {turn && (
                <div
                  className={`turn turn--${turn.direction === 1 ? 'forward' : 'back'}`}
                  aria-hidden="true"
                >
                  <motion.div
                    className="turn__sheet"
                    initial={{ rotateY: turn.direction === 1 ? 0 : -180 }}
                    animate={{ rotateY: turn.direction === 1 ? -180 : 0 }}
                    transition={{ duration: 0.92, ease: [0.22, 0.61, 0.24, 1] }}
                    onAnimationComplete={commit}
                  >
                    <div className="turn__face turn__face--front">
                      <div className="turn__page">
                        <header className="flipbook__folio">
                          <span>{SECTION_TITLES[turn.direction === 1 ? turn.from : turn.to]}</span>
                          <span>{PAGE_OF[turn.direction === 1 ? turn.from : turn.to]}</span>
                        </header>
                        <SectionView section={turn.direction === 1 ? turn.from : turn.to} />
                        <footer className="flipbook__foot">
                          <span />
                          <span className="flipbook__pageNo">
                            p. {PAGE_OF[turn.direction === 1 ? turn.from : turn.to]}
                          </span>
                          <span />
                        </footer>
                      </div>
                    </div>

                    <div className="turn__face turn__face--back">
                      <div className="turn__verso">
                        <span className="turn__versoTiny">verso · FrontDesk</span>
                        <p>Keep the desk quiet.</p>
                        <span className="turn__stamp">NO. 01</span>
                      </div>
                    </div>

                    <div className="turn__shade" />
                  </motion.div>
                </div>
              )}
            </section>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
