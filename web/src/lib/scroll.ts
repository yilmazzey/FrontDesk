/**
 * A tiny non-reactive channel between the DOM scroll listener and the
 * three.js camera. Writing here never re-renders React, and the camera reads
 * it once per frame, so the dolly tracks the scrollbar exactly.
 */
export const scrollStage = {
  /** 0 at the top of the page, 1 once the printed sheet has arrived. */
  progress: 0,
}

export const clamp01 = (value: number) => (value < 0 ? 0 : value > 1 ? 1 : value)

/** easeInOutCubic — keeps the dolly gentle at both ends. */
export const easeInOut = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
