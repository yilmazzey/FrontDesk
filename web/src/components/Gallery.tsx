import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import CircularGallery from './CircularGallery'
import type { CircularGalleryItem } from './CircularGallery'
import FeatureOverlay from './FeatureOverlay'
import { galleryItems } from './gallerySlides'
import { useUI } from '../store'

const diagramUrl = `${import.meta.env.BASE_URL}diagrams/frontdesk-data-flow.html`

/**
 * Full-bleed presentation deck. The gallery is the page: the journal bar and
 * footer stay put, and the slides take the whole viewport between them.
 * The first slide gathers every feature; the data-map slide opens the live
 * Archify viewer and the final slide reports measured performance and memory.
 */
export function Gallery() {
  const [index, setIndex] = useState(0)
  const [mapOpen, setMapOpen] = useState(false)
  const [feature, setFeature] = useState<CircularGalleryItem | null>(null)
  const theme = useUI((state) => state.theme)
  const diagramEmbedUrl = `${diagramUrl}?embed=1&theme=${theme}`
  const overlayOpen = mapOpen || feature !== null

  useEffect(() => {
    if (!overlayOpen) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setMapOpen(false)
      setFeature(null)
    }
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', onKey)
    }
  }, [overlayOpen])

  return (
    <section className="journal__gallery journal__gallery--slides" aria-label="What the desk opens onto">
      <div className="journal__galleryHead">
        <h3 className="journal__sectionLabel">
          <span>Field notes</span>
          <span>Built for the Pfizer &amp; Newpage Solutions Hackathon Challenge</span>
        </h3>

        <div className="gallery__controls">
          <span className="gallery__count" aria-hidden="true">
            {String(index + 1).padStart(2, '0')} / {String(galleryItems.length).padStart(2, '0')}
          </span>
        </div>
      </div>

      <div className="journal__galleryStage">
        <CircularGallery
          items={galleryItems}
          bend={2.4}
          itemSize={1.55}
          itemAspect={16 / 9}
          gap={0.11}
          borderRadius={0.035}
          wave={0.7}
          fadeEdges={0.1}
          shadow={0.22}
          textColor="#241d16"
          font='600 30px "Iowan Old Style", Palatino, Georgia, serif'
          scrollSpeed={2.4}
          scrollEase={0.06}
          onActiveChange={setIndex}
          onItemClick={(item: CircularGalleryItem) => {
            if (item.kind === 'diagram') setMapOpen(true)
            else if (
              item.kind === 'features' ||
              item.kind === 'feature' ||
              item.kind === 'performance'
            ) {
              setFeature(item)
            }
          }}
        />
      </div>

      <p className="journal__galleryHint">
        Drag, use ← →, or Shift + scroll. The first slide gathers every feature; the data-map slide
        opens the live diagram.
      </p>

      {galleryItems[index]?.kind === 'diagram' ? (
        <button type="button" className="journal__galleryMapCta" onClick={() => setMapOpen(true)}>
          Open the interactive map
          <span aria-hidden="true">↗</span>
        </button>
      ) : null}

      {mapOpen
        ? createPortal(
            <div
              className="diagramOverlay"
              role="dialog"
              aria-modal="true"
              aria-label="Where your data goes"
              onMouseDown={(event) => {
                if (event.target === event.currentTarget) setMapOpen(false)
              }}
            >
              <section className="diagramOverlay__panel">
                <header className="diagramOverlay__head">
                  <div>
                    <p className="diagramOverlay__kicker">Interactive map</p>
                    <h3>Where your data goes</h3>
                  </div>
                  <div className="diagramOverlay__actions">
                    <a href={diagramUrl} target="_blank" rel="noreferrer">
                      Open in a new tab
                    </a>
                    <button
                      type="button"
                      className="diagramOverlay__close"
                      onClick={() => setMapOpen(false)}
                      aria-label="Close the data map"
                    >
                      ×
                    </button>
                  </div>
                </header>
                <iframe
                  className="diagramOverlay__frame"
                  src={diagramEmbedUrl}
                  title="FrontDesk chat, local model and device-boundary map"
                  loading="eager"
                />
              </section>
            </div>,
            document.body,
          )
        : null}

      {feature
        ? createPortal(
            <div
              className="diagramOverlay"
              role="dialog"
              aria-modal="true"
              aria-label={feature.text ?? 'Feature'}
              onMouseDown={(event) => {
                if (event.target === event.currentTarget) setFeature(null)
              }}
            >
              <FeatureOverlay item={feature} onClose={() => setFeature(null)} />
            </div>,
            document.body,
          )
        : null}
    </section>
  )
}
