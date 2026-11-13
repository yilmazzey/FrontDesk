import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import useEmblaCarousel from 'embla-carousel-react'
import { site } from '../config'

type Card = {
  n: string
  title: string
  body: string
  tag: string
  art: 'shield' | 'note' | 'mail' | 'spark' | 'download'
  href?: string
}

const cards: Card[] = [
  {
    n: '01',
    title: 'Your desk stays yours.',
    body: 'Notes, files and the search index live on your machine. No account is needed to open the notebook, and nothing leaves the desk unless you ask it to.',
    tag: 'Privacy · local-first',
    art: 'shield',
  },
  {
    n: '02',
    title: 'Every page, searchable.',
    body: 'Drop in a scan, a photo or a PDF. OCR runs locally, so the words come back as notes you can actually find — not another folder of images.',
    tag: 'Notes + OCR',
    art: 'note',
  },
  {
    n: '03',
    title: 'Your inbox, on the desk.',
    body: 'Outlook becomes another object on the desk. See the day, pull a message into a note, and grant each account its own permission — switch it off whenever you like.',
    tag: 'Microsoft mail + calendar',
    art: 'mail',
  },
  {
    n: '04',
    title: 'Answers with receipts.',
    body: 'The assistant cites the note, email or page it used. If it cannot find the source, it says so instead of inventing one. Honest by construction.',
    tag: 'AI with citations',
    art: 'spark',
  },
  {
    n: '05',
    title: 'Take the desk with you.',
    body: 'The desktop app is where notes, OCR and the local model actually run. Download it, sign in, and the monitor on this page becomes the front door.',
    tag: 'Desktop app',
    art: 'download',
    href: site.appHref,
  },
]

const Art = ({ kind }: { kind: Card['art'] }) => {
  if (kind === 'shield') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 3.2 19 6v5.4c0 4.3-2.9 7.4-7 9.4-4.1-2-7-5.1-7-9.4V6l7-2.8Z" />
        <path d="m8.6 11.9 2.3 2.3 4.5-4.5" />
      </svg>
    )
  }
  if (kind === 'note') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5 3.8h9.5L19 8.2v12H5v-16Z" />
        <path d="M14.2 3.9v4.5H19M8.2 12.4h7.4M8.2 16h5.2" />
      </svg>
    )
  }
  if (kind === 'mail') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="3" y="5.4" width="18" height="13.2" rx="1.6" />
        <path d="m3.6 6.4 8.4 6 8.4-6" />
      </svg>
    )
  }
  if (kind === 'spark') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 3.2v4M12 16.8v4M3.2 12h4M16.8 12h4M5.9 5.9l2.8 2.8M15.3 15.3l2.8 2.8M18.1 5.9l-2.8 2.8M8.7 15.3l-2.8 2.8" />
        <circle cx="12" cy="12" r="2.4" />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3.6v10.2M7.8 9.8 12 14l4.2-4.2" />
      <path d="M4.4 16.4v2.2a1.6 1.6 0 0 0 1.6 1.6h12a1.6 1.6 0 0 0 1.6-1.6v-2.2" />
    </svg>
  )
}

export function Gallery() {
  // Centre the active slide so the previous and next cards peek in from both
  // sides. `containScroll: false` keeps the first and last slides centred too,
  // instead of snapping them flush to the page edge.
  const [emblaRef, emblaApi] = useEmblaCarousel({
    align: 'center',
    containScroll: false,
    dragFree: false,
    loop: false,
  })
  const [index, setIndex] = useState(0)
  const [snaps, setSnaps] = useState(0)
  const [prevDisabled, setPrevDisabled] = useState(true)
  const [nextDisabled, setNextDisabled] = useState(false)

  const sync = useCallback(() => {
    if (!emblaApi) return
    setIndex(emblaApi.selectedScrollSnap())
    setSnaps(emblaApi.scrollSnapList().length)
    setPrevDisabled(!emblaApi.canScrollPrev())
    setNextDisabled(!emblaApi.canScrollNext())
  }, [emblaApi])

  useEffect(() => {
    if (!emblaApi) return
    sync()
    emblaApi.on('select', sync).on('reInit', sync)
    return () => {
      emblaApi.off('select', sync).off('reInit', sync)
    }
  }, [emblaApi, sync])

  return (
    <section className="journal__gallery" aria-label="What the desk opens onto">
      <div className="journal__galleryHead">
        <h3 className="journal__sectionLabel">
          <span>Field notes</span>
          <span>Built for the Pfizer &amp; Newpage Solutions Hackathon Challenge</span>
        </h3>

        <div className="gallery__controls">
          <span className="gallery__count" aria-hidden="true">
            {String(index + 1).padStart(2, '0')} / {String(cards.length).padStart(2, '0')}
          </span>
          <button
            type="button"
            className="gallery__arrow"
            onClick={() => emblaApi?.scrollPrev()}
            disabled={prevDisabled}
            aria-label="Previous card"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M19 12H6M11 5.5 4.5 12 11 18.5" />
            </svg>
          </button>
          <button
            type="button"
            className="gallery__arrow"
            onClick={() => emblaApi?.scrollNext()}
            disabled={nextDisabled}
            aria-label="Next card"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M5 12h13M13 5.5 19.5 12 13 18.5" />
            </svg>
          </button>
        </div>
      </div>

      <div className="gallery__viewport" ref={emblaRef}>
        <div className="gallery__container">
          {cards.map((card) => (
            <article
              key={card.n}
              className="feature"
              aria-roledescription="slide"
              aria-label={`${card.n} — ${card.tag}`}
            >
              <div className="feature__top">
                <span className="feature__n">{card.n}</span>
                <span className="feature__icon">
                  <Art kind={card.art} />
                </span>
              </div>

              <h4 className="feature__title">{card.title}</h4>
              <p className="feature__body">{card.body}</p>

              {card.href ? (
                <Link className="feature__cta" to={card.href}>
                  {card.tag}
                  <span aria-hidden="true">→</span>
                </Link>
              ) : (
                <span className="feature__tag">{card.tag}</span>
              )}
            </article>
          ))}
        </div>
      </div>

      <div className="gallery__dots" aria-hidden="true">
        {Array.from({ length: snaps }).map((_, i) => (
          <button
            key={i}
            type="button"
            tabIndex={-1}
            className={i === index ? 'is-on' : ''}
            onClick={() => emblaApi?.scrollTo(i)}
          />
        ))}
      </div>
    </section>
  )
}
