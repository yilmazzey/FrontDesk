import type { CSSProperties, ReactElement } from 'react'

export type PresentationFeature = {
  label: string
  tagline: string
  description: string
  bullets: string[]
  metric: string
}

export type CircularGalleryItem = {
  image: string
  text?: string
  description?: string
  alt?: string
  /** Optional hook for slides that open a richer view, such as the data map. */
  kind?: string
  /** Presentation metadata used by the slide detail overlay. */
  tagline?: string
  bullets?: string[]
  metric?: string
  /** The single "all features" slide carries the feature list. */
  features?: PresentationFeature[]
}

export type CircularGalleryProps = {
  items?: CircularGalleryItem[]
  bend?: number
  itemSize?: number
  itemAspect?: number
  gap?: number
  borderRadius?: number
  wave?: number
  fadeEdges?: number
  shadow?: number
  textColor?: string
  font?: string
  fontUrl?: string
  showTitles?: boolean
  scrollSpeed?: number
  scrollEase?: number
  snap?: boolean
  autoScroll?: number
  grayscale?: boolean
  openOnClick?: boolean
  intro?: boolean
  onItemClick?: (item: CircularGalleryItem, index: number) => void
  onActiveChange?: (index: number) => void
  dpr?: number
  className?: string
  style?: CSSProperties
}

declare function CircularGallery(props: CircularGalleryProps): ReactElement

export default CircularGallery
