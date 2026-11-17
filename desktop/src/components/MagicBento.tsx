import { useEffect, useRef, useState, type CSSProperties, type PointerEvent, type ReactNode } from 'react'

export type MagicBentoItem = {
  id?: string
  content: ReactNode
  colSpan?: number
  rowSpan?: number
  onClick?: () => void
  href?: string
}

type Props = {
  items: MagicBentoItem[]
  columns?: number
  rowHeight?: number
  gap?: number
  radius?: number
  enableBorderGlow?: boolean
  enableSpotlight?: boolean
  clickEffect?: boolean
  className?: string
  style?: CSSProperties
}

/**
 * A lightweight MagicBento-compatible grid for the existing React + CSS stack.
 * It keeps the card grid, cursor spotlight, border glow and intro motion without
 * pulling in the full React Bits runtime or icon pack.
 */
export default function MagicBento({
  items,
  columns = 4,
  rowHeight = 220,
  gap = 14,
  radius = 18,
  enableBorderGlow = true,
  enableSpotlight = true,
  clickEffect = true,
  className = '',
  style,
}: Props) {
  const rootRef = useRef<HTMLDivElement | null>(null)
  const [responsiveColumns, setResponsiveColumns] = useState(Math.max(1, Math.round(columns)))

  useEffect(() => {
    const node = rootRef.current
    if (!node) return
    const measure = () => {
      const width = node.clientWidth
      setResponsiveColumns(width < 560 ? 1 : width < 860 ? 2 : Math.max(1, Math.round(columns)))
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    return () => observer.disconnect()
  }, [columns])

  const span = responsiveColumns

  return (
    <div
      ref={rootRef}
      className={`magicBento ${className}`.trim()}
      style={{
        gridTemplateColumns: `repeat(${span}, minmax(0, 1fr))`,
        gridAutoRows: `minmax(${rowHeight}px, auto)`,
        gap: `${Math.max(0, gap)}px`,
        ...style,
      }}
    >
      {items.map((item, index) => {
        const clickable = Boolean(item.onClick || item.href)
        const content = (
          <>
            {enableSpotlight ? <span className="magicBento__spotlight" aria-hidden="true" /> : null}
            {enableBorderGlow ? <span className="magicBento__border" aria-hidden="true" /> : null}
            {clickEffect ? <span className="magicBento__wave" aria-hidden="true" /> : null}
            <div className="magicBento__content">{item.content}</div>
          </>
        )

        const common = {
          key: item.id ?? index,
          className: 'magicBento__card',
          'data-clickable': clickable ? '' : undefined,
          style: {
            gridColumn: `span ${Math.min(span, Math.max(1, Math.round(item.colSpan ?? 1)))}`,
            gridRow: `span ${Math.max(1, Math.round(item.rowSpan ?? 1))}`,
            borderRadius: `${radius}px`,
            '--mb-delay': `${index * 70}ms`,
          } as CSSProperties,
          onPointerMove: (event: PointerEvent<HTMLElement>) => {
            const rect = event.currentTarget.getBoundingClientRect()
            event.currentTarget.style.setProperty('--mb-x', `${event.clientX - rect.left}px`)
            event.currentTarget.style.setProperty('--mb-y', `${event.clientY - rect.top}px`)
            event.currentTarget.style.setProperty('--mb-hot', '1')
          },
          onPointerLeave: (event: PointerEvent<HTMLElement>) => {
            event.currentTarget.style.setProperty('--mb-hot', '0')
          },
        }

        if (item.href) {
          return (
            <a {...common} href={item.href} target="_blank" rel="noreferrer">
              {content}
            </a>
          )
        }

        if (clickable) {
          return (
            <button type="button" {...common} onClick={item.onClick}>
              {content}
            </button>
          )
        }

        return <div {...common}>{content}</div>
      })}
    </div>
  )
}
