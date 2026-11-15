/**
 * One place for everything you'll want to rename or re-point.
 * The brand name and pricing numbers are placeholders — swap them freely.
 */
export const site = {
  name: 'FrontDesk',
  wordmark: 'FrontDesk',
  tagline: 'A calmer place to work.',
  hackathon: 'Pfizer & Newpage Solutions Hackathon Challenge',
  appHref: '/monitor',
  downloadHref: '/downloads/frontdesk-desktop.html',
  contactEmail: 'hello@frontdesk.studio',
  updated: 'November 2026',
} as const

/** Camera framing, in model units (the desk is roughly 2.1 × 1.4 m). */
export const framing = {
  /**
   * The desk is framed around the monitor rather than the middle of the room.
   * The camera sits close enough that the desk crops off the bottom and right
   * edges — a cropped object reads as large and intentional. Zoom (store) is
   * applied along this view ray on top of the authored pose.
   */
  desk: {
    position: [1.222, 1.648, 1.306] as [number, number, number],
    target: [0.396, 1.144, 0.116] as [number, number, number],
    fov: 35,
  },
  notebook: {
    position: [-0.28, 1.34, 0.92] as [number, number, number],
    target: [-0.47, 1.04, 0.02] as [number, number, number],
    fov: 30,
  },
  screen: {
    position: [0.68, 1.27, 1.12] as [number, number, number],
    target: [0.55, 1.17, 0.1] as [number, number, number],
    fov: 30,
  },
  /**
   * Where the camera has pushed to when the printed sheet fully covers the
   * frame. The scroll hand-off interpolates between `desk` and this pose, so
   * the transition is a real dolly rather than a scaled screenshot.
   */
  handoff: {
    position: [1.0, 1.66, 1.5] as [number, number, number],
    target: [-0.2, 0.74, 0.05] as [number, number, number],
    fov: 37,
  },
}

/**
 * The monitor's front panel, measured from the geometry in public/desk.glb.
 * The node is yawed ~25°, so the UI plane has to match its quaternion or it
 * will float off the glass. Re-measure if you swap the model.
 */
export const screenPlane = {
  position: [0.5465, 1.2048, -0.0285] as [number, number, number],
  quaternion: [-0.059, -0.2203, -0.0134, 0.9736] as [number, number, number, number],
  size: [0.544, 0.349] as [number, number],
  /** shrink to sit inside the bezel */
  inset: [0.932, 0.905] as [number, number],
  /** push out along the panel normal to avoid z-fighting */
  offset: 0.004,
}

/**
 * Mesh names inside public/desk.glb — every part that makes up one
 * interactive object. Swap the model and this is the only mapping you need
 * to touch.
 */
export const parts = {
  lamp: ['DeskLamp', 'DeskLamp_DeskLamp_0', 'DeskLamp_Alpha_0'],
  monitor: ['Monitor', 'Monitor_Monitor_0'],
  notebook: ['Book01', 'Book01_Book01_0', 'Book02', 'Book02_Book02_0'],
  desk: ['Desk', 'Desk_Desk_0'],
  cup: ['Cup', 'Cup_Cup_0'],
  mouse: ['Mouse', 'Mouse_Mouse_0'],
  stationery: [
    'StationeryCup',
    'StationeryCup_StationeryCup_0',
    'Scissors.001',
    'Pencel.001',
    'Pen01.001',
    'Pen02.001',
  ],
} as const

export const detailParts = {
  pens: ['Pencel.001', 'Pen01.001', 'Pen02.001', 'Scissors.001'],
  cup: 'Cup',
  cupMesh: 'Cup_Cup_0',
  mouse: 'Mouse_Mouse_0',
} as const
