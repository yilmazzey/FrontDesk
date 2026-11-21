import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import './LineSidebar.css'

type Falloff = 'linear' | 'smooth' | 'sharp'

const FALLOFF_CURVES: Record<Falloff, (progress: number) => number> = {
  linear: (progress) => progress,
  smooth: (progress) => progress * progress * (3 - 2 * progress),
  sharp: (progress) => progress * progress * progress,
}

type Props = {
  items: string[]
  accentColor?: string
  textColor?: string
  markerColor?: string
  showIndex?: boolean
  showMarker?: boolean
  proximityRadius?: number
  maxShift?: number
  falloff?: Falloff
  markerLength?: number
  markerGap?: number
  tickScale?: number
  scaleTick?: boolean
  itemGap?: number
  fontSize?: number
  smoothing?: number
  activeIndex?: number | null
  onItemClick?: (index: number, label: string) => void
  className?: string
}

export default function LineSidebar({
  items,
  accentColor = '#ffb45c',
  textColor = 'rgba(251,244,233,0.58)',
  markerColor = 'rgba(251,244,233,0.2)',
  showIndex = true,
  showMarker = true,
  proximityRadius = 90,
  maxShift = 16,
  falloff = 'smooth',
  markerLength = 26,
  markerGap = 4,
  tickScale = 0.55,
  scaleTick = true,
  itemGap = 16,
  fontSize = 0.82,
  smoothing = 120,
  activeIndex = null,
  onItemClick,
  className = '',
}: Props) {
  const listRef = useRef<HTMLUListElement>(null)
  const itemRefs = useRef<Array<HTMLLIElement | null>>([])
  const targetsRef = useRef<number[]>([])
  const currentRef = useRef<number[]>([])
  const rafRef = useRef<number | null>(null)
  const lastRef = useRef(0)
  const activeRef = useRef<number | null>(activeIndex)
  const smoothingRef = useRef(smoothing)
  const [internalActive, setInternalActive] = useState<number | null>(activeIndex)

  activeRef.current = internalActive
  smoothingRef.current = smoothing

  useEffect(() => {
    setInternalActive(activeIndex)
  }, [activeIndex])

  const runFrame = useCallback((now: number) => {
    const dt = Math.min((now - lastRef.current) / 1000, 0.05)
    lastRef.current = now
    const tau = Math.max(smoothingRef.current, 1) / 1000
    const k = 1 - Math.exp(-dt / tau)

    let moving = false
    const elements = itemRefs.current
    for (let index = 0; index < elements.length; index += 1) {
      const element = elements[index]
      if (!element) continue
      const target = Math.max(
        targetsRef.current[index] || 0,
        activeRef.current === index ? 1 : 0,
      )
      const current = currentRef.current[index] || 0
      const next = current + (target - current) * k
      const settled = Math.abs(target - next) < 0.0015
      const value = settled ? target : next
      currentRef.current[index] = value
      element.style.setProperty('--effect', value.toFixed(4))
      if (!settled) moving = true
    }

    rafRef.current = moving ? requestAnimationFrame(runFrame) : null
  }, [])

  const startLoop = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    lastRef.current = performance.now()
    rafRef.current = requestAnimationFrame(runFrame)
  }, [runFrame])

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLUListElement>) => {
      const list = listRef.current
      if (!list) return
      const rect = list.getBoundingClientRect()
      const pointerY = event.clientY - rect.top
      const ease = FALLOFF_CURVES[falloff] ?? FALLOFF_CURVES.linear
      const elements = itemRefs.current
      for (let index = 0; index < elements.length; index += 1) {
        const element = elements[index]
        if (!element) continue
        const center = element.offsetTop + element.offsetHeight / 2
        const distance = Math.abs(pointerY - center)
        targetsRef.current[index] = ease(
          Math.max(0, 1 - distance / proximityRadius),
        )
      }
      startLoop()
    },
    [falloff, proximityRadius, startLoop],
  )

  const handlePointerLeave = useCallback(() => {
    targetsRef.current = targetsRef.current.map(() => 0)
    startLoop()
  }, [startLoop])

  const handleClick = useCallback(
    (index: number, label: string) => {
      setInternalActive(index)
      onItemClick?.(index, label)
    },
    [onItemClick],
  )

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLLIElement>, index: number, label: string) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        handleClick(index, label)
      }
    },
    [handleClick],
  )

  useEffect(() => {
    startLoop()
  }, [internalActive, startLoop])

  useEffect(
    () => () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    },
    [],
  )

  const style = {
    '--accent-color': accentColor,
    '--text-color': textColor,
    '--marker-color': markerColor,
    '--marker-length': `${markerLength}px`,
    '--marker-gap': `${markerGap}px`,
    '--tick-scale': tickScale,
    '--max-shift': `${maxShift}px`,
    '--item-gap': `${itemGap}px`,
    '--font-size': `${fontSize}rem`,
    '--smoothing': `${smoothing}ms`,
  } as CSSProperties

  return (
    <nav
      className={`line-sidebar${showMarker ? ' line-sidebar--markers' : ''}${
        scaleTick ? ' line-sidebar--scale-tick' : ''
      }${className ? ` ${className}` : ''}`}
      style={style}
    >
      <ul
        ref={listRef}
        className="line-sidebar__list"
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
      >
        {items.map((label, index) => (
          <li
            key={`${label}-${index}`}
            ref={(element) => {
              itemRefs.current[index] = element
            }}
            className="line-sidebar__item"
            role="button"
            tabIndex={0}
            aria-current={internalActive === index ? 'page' : undefined}
            onClick={() => handleClick(index, label)}
            onKeyDown={(event) => handleKeyDown(event, index, label)}
          >
            {showMarker ? (
              <span className="line-sidebar__marker" aria-hidden="true" />
            ) : null}
            <span className="line-sidebar__label">
              {showIndex ? (
                <span className="line-sidebar__index">
                  {String(index + 1).padStart(2, '0')}
                </span>
              ) : null}
              <span className="line-sidebar__text">{label}</span>
            </span>
          </li>
        ))}
      </ul>
    </nav>
  )
}
