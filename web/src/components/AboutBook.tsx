import { useEffect, useRef } from 'react'
import { createRoot } from 'react-dom/client'
import { PageFlip } from 'page-flip'
import { AboutPerson } from '../content/NotebookContent'
import './AboutBook.css'

function BookPages() {
  return (
    <>
      <div className="aboutBook__page aboutBook__page--cover" data-density="hard">
        <p className="aboutBook__eyebrow">FrontDesk</p>
        <h2>About us</h2>
        <p>Two people, one desk. The team behind the local-first manager workspace.</p>
        <span className="aboutBook__hint">Turn the page →</span>
      </div>

      <div className="aboutBook__page" data-density="soft">
        <AboutPerson person="anika" />
      </div>

      <div className="aboutBook__page" data-density="soft">
        <AboutPerson person="zeynep" />
      </div>

      <div className="aboutBook__page aboutBook__page--back" data-density="hard">
        <p className="aboutBook__eyebrow">FrontDesk</p>
        <h2>Built in Bristol.</h2>
        <p>
          A local-first second brain for managers, built for the Pfizer &amp; Newpage
          Solutions Hackathon Challenge.
        </p>
        <div className="aboutBook__contact">
          <a href="mailto:sn26265@bristol.ac.uk">sn26265@bristol.ac.uk</a>
          <a href="mailto:anika.s.2026@bristol.ac.uk">anika.s.2026@bristol.ac.uk</a>
        </div>
      </div>
    </>
  )
}

export default function AboutBook() {
  const hostRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    // StPageFlip owns this element and removes it on destroy. Keep it outside
    // React's tree so StrictMode's mount/unmount pass does not leave a blank
    // book behind.
    const mount = document.createElement('div')
    mount.className = 'aboutBook__mount'
    host.appendChild(mount)

    const root = createRoot(mount)
    root.render(<BookPages />)

    let flip: PageFlip | null = null
    const timer = window.setTimeout(() => {
      const pages = mount.querySelectorAll<HTMLElement>('.aboutBook__page')
      if (!pages.length) return
      flip = new PageFlip(mount, {
        width: 440,
        height: 640,
        size: 'stretch',
        minWidth: 320,
        maxWidth: 480,
        minHeight: 480,
        maxHeight: 740,
        showCover: true,
        usePortrait: true,
        startPage: 1,
        drawShadow: true,
        maxShadowOpacity: 0.35,
        flippingTime: 850,
        mobileScrollSupport: false,
        showPageCorners: true,
        clickEventForward: true,
      })
      flip.loadFromHTML(pages)
    }, 0)

    return () => {
      window.clearTimeout(timer)
      root.unmount()
      flip?.destroy()
      mount.remove()
    }
  }, [])

  return <div className="aboutBook" ref={hostRef} />
}
