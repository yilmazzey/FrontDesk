import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { PageFlip } from 'page-flip'
import { AboutPerson, PrivacySection } from '../content/NotebookContent'
import type { NotebookSection } from '../store'
import './NotebookBook.css'

function BookPages() {
  return (
    <>
      <div className="notebookBook__page notebookBook__page--cover" data-density="hard">
        <p className="notebookBook__eyebrow">FrontDesk notebook</p>
        <h2>About the team</h2>
        <p className="notebookBook__lede">
          One desk, two people, and a local-first workspace for managers.
        </p>
        <ul className="notebookBook__toc">
          <li><span>Anika Srivastava</span><b>01</b></li>
          <li><span>Zeynep Yılmaz</span><b>02</b></li>
          <li><span>Privacy</span><b>03</b></li>
        </ul>
        <span className="notebookBook__hint">Turn the page →</span>
      </div>

      <div className="notebookBook__page" data-density="soft">
        <AboutPerson person="anika" />
      </div>

      <div className="notebookBook__page" data-density="soft">
        <AboutPerson person="zeynep" />
      </div>

      <div className="notebookBook__page" data-density="soft">
        <PrivacySection />
      </div>

      <div className="notebookBook__page notebookBook__page--back" data-density="hard">
        <p className="notebookBook__eyebrow">FrontDesk</p>
        <h2>Built in Bristol.</h2>
        <p>
          A local-first second brain for managers, built for the Pfizer &amp; Newpage
          Solutions Hackathon Challenge.
        </p>
        <div className="notebookBook__contact">
          <a href="mailto:sn26265@bristol.ac.uk">sn26265@bristol.ac.uk</a>
          <a href="mailto:anika.s.2026@bristol.ac.uk">anika.s.2026@bristol.ac.uk</a>
        </div>
      </div>
    </>
  )
}

function pageForSection(section: NotebookSection) {
  if (section === 'privacy') return 3
  return 1
}

export default function NotebookBook({ section }: { section: NotebookSection }) {
  const hostRef = useRef<HTMLDivElement>(null)
  const flipRef = useRef<PageFlip | null>(null)
  const [ready, setReady] = useState(false)

  useLayoutEffect(() => {
    const host = hostRef.current
    if (!host) return

    const mount = document.createElement('div')
    mount.className = 'notebookBook__mount'
    // Static markup initialises synchronously, which is reliable in Safari.
    mount.innerHTML = renderToStaticMarkup(<BookPages />)
    host.appendChild(mount)

    const pages = mount.querySelectorAll<HTMLElement>('.notebookBook__page')
    const flip = new PageFlip(mount, {
      width: 420,
      height: 600,
      size: 'stretch',
      minWidth: 300,
      maxWidth: 440,
      minHeight: 420,
      maxHeight: 620,
      showCover: true,
      usePortrait: true,
      startPage: pageForSection(section),
      drawShadow: true,
      maxShadowOpacity: 0.35,
      flippingTime: 850,
      mobileScrollSupport: false,
      showPageCorners: true,
      clickEventForward: true,
    })
    flip.loadFromHTML(pages)
    flipRef.current = flip
    setReady(true)

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'ArrowRight') {
        event.preventDefault()
        flip.flipNext()
      }
      if (event.key === 'ArrowLeft') {
        event.preventDefault()
        flip.flipPrev()
      }
    }
    window.addEventListener('keydown', onKey)

    return () => {
      window.removeEventListener('keydown', onKey)
      setReady(false)
      flipRef.current = null
      flip.destroy()
      mount.remove()
    }
  }, [])

  useEffect(() => {
    if (ready) flipRef.current?.turnToPage(pageForSection(section))
  }, [section, ready])

  const turn = (direction: 'prev' | 'next') => {
    const flip = flipRef.current
    if (!flip) return
    const before = flip.getCurrentPageIndex()
    if (direction === 'next') flip.flipNext()
    else flip.flipPrev()
    // Some WebViews ignore the corner animation when the call comes from a
    // button rather than a pointer gesture. Fall back to a direct spread turn.
    window.setTimeout(() => {
      if (flip.getCurrentPageIndex() === before) {
        const step = flip.getOrientation() === 'portrait' ? 1 : 2
        const page =
          direction === 'next'
            ? Math.min(before + step, flip.getPageCount() - 1)
            : Math.max(before - step, 0)
        flip.turnToPage(page)
      }
    }, 950)
  }

  return (
    <div className="notebookBook">
      <div className="notebookBook__host" ref={hostRef} />
      <button
        type="button"
        className="notebookBook__nav notebookBook__nav--prev"
        disabled={!ready}
        onClick={(event) => {
          event.stopPropagation()
          turn('prev')
        }}
        aria-label="Previous page"
      >
        ←
      </button>
      <button
        type="button"
        className="notebookBook__nav notebookBook__nav--next"
        disabled={!ready}
        onClick={(event) => {
          event.stopPropagation()
          turn('next')
        }}
        aria-label="Next page"
      >
        →
      </button>
    </div>
  )
}
