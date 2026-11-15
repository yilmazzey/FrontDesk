import { useState } from 'react'
import CircularGallery from './CircularGallery'
import { galleryItems } from './gallerySlides'

/**
 * Full-bleed presentation slides. The gallery is the page: the journal bar
 * and footer stay put, and the slides take the whole viewport between them.
 * Slide content is placeholder until the real screenshots are supplied —
 * swap the `image` field in `gallerySlides.ts`.
 */
export function Gallery() {
  const [index, setIndex] = useState(0)

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
        />
      </div>

      <p className="journal__galleryHint">
        Drag, use ← →, or Shift + scroll. Click a slide to open it.
      </p>
    </section>
  )
}
