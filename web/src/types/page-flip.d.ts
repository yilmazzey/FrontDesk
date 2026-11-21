declare module 'page-flip' {
  export type FlipCorner = 'top' | 'bottom'

  export class PageFlip {
    constructor(element: HTMLElement, settings?: Record<string, unknown>)
    loadFromHTML(pages: NodeListOf<HTMLElement> | HTMLElement[]): void
    loadFromImages(images: string[]): void
    destroy(): void
    turnToPage(page: number): void
    turnToNextPage(): void
    turnToPrevPage(): void
    flipNext(corner?: FlipCorner): void
    flipPrev(corner?: FlipCorner): void
    getPageCount(): number
    getCurrentPageIndex(): number
    getOrientation(): 'portrait' | 'landscape'
    on(
      event: 'flip',
      callback: (event: { data: number; object: PageFlip }) => void,
    ): void
  }
}
