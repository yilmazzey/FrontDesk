import type { CSSProperties, ReactElement } from 'react'

export type CircularGalleryItem = {
  image: string
  text?: string
  description?: string
  alt?: string
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
