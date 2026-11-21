import { useEffect, useRef } from 'react'
import { createRoot } from 'react-dom/client'
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

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    const mount = document.createElement('div')
    mount.className = 'notebookBook__mount'
    host.appendChild(mount)

    const root = createRoot(mount)
    root.render(<BookPages />)

    let flip: PageFlip | null = null
    const timer = window.setTimeout(() => {
      const pages = mount.querySelectorAll<HTMLElement>('.notebookBook__page')
      if (!pages.length) return
      flip = new PageFlip(mount, {
        width: 440,
        height: 690,
        size: 'stretch',
        minWidth: 320,
        maxWidth: 480,
        minHeight: 520,
        maxHeight: 760,
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
    }, 0)

    const onKey = (event: KeyboardEvent) => {
      if (!flip) return
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
      window.clearTimeout(timer)
      window.removeEventListener('keydown', onKey)
      flipRef.current = null
      root.unmount()
      flip?.destroy()
      mount.remove()
    }
  }, [])

  useEffect(() => {
    flipRef.current?.turnToPage(pageForSection(section))
  }, [section])

  return <div className="notebookBook" ref={hostRef} />
}
