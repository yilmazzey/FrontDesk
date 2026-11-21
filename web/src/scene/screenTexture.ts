import * as THREE from 'three'

/**
 * The monitor in the landing-page desk shows the real FrontDesk manager
 * dashboard, painted into a canvas as a filled mockup. The data is the Kestrel
 * demo story so the screen matches the product rather than a generic
 * workspace.
 */
export function createScreenTexture(): THREE.CanvasTexture {
  const width = 1280
  const height = 800
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height

  const ctx = canvas.getContext('2d')!
  const bg = '#120f0b'
  const sidebar = '#0c0a09'
  const panel = '#17140f'
  const panel2 = '#1c1812'
  const cream = '#fbf4e9'
  const dim = 'rgba(251,244,233,0.78)'
  const faint = 'rgba(251,244,233,0.52)'
  const line = 'rgba(244,236,225,0.13)'
  const amber = '#ffb45c'
  const sage = '#9dbb95'
  const teal = '#6fb3a8'

  const serif = 'Georgia, "Times New Roman", serif'
  const sans = '-apple-system, system-ui, sans-serif'
  const mono = 'ui-monospace, Menlo, monospace'

  const label = (text: string, x: number, y: number, color = faint, size = 8) => {
    ctx.fillStyle = color
    ctx.font = `${size}px ${mono}`
    try {
      ;(ctx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing =
        '1.4px'
    } catch {
      /* older canvas */
    }
    ctx.fillText(text, x, y)
    try {
      ;(ctx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing =
        '0px'
    } catch {
      /* older canvas */
    }
  }

  const text = (
    value: string,
    x: number,
    y: number,
    font: string,
    color = cream,
    align: CanvasTextAlign = 'left',
  ) => {
    ctx.fillStyle = color
    ctx.font = font
    ctx.textAlign = align
    ctx.fillText(value, x, y)
    ctx.textAlign = 'left'
  }

  const dot = (x: number, y: number, color: string, r = 3) => {
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
  }

  const card = (x: number, y: number, w: number, h: number, r = 12) => {
    ctx.fillStyle = panel
    round(ctx, x, y, w, h, r)
    ctx.fill()
    ctx.strokeStyle = line
    round(ctx, x, y, w, h, r)
    ctx.stroke()
  }

  ctx.fillStyle = bg
  ctx.fillRect(0, 0, width, height)

  const glow = ctx.createRadialGradient(220, 40, 10, 220, 40, 720)
  glow.addColorStop(0, 'rgba(255,180,92,0.10)')
  glow.addColorStop(1, 'rgba(255,180,92,0)')
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, width, height)

  // ---- sidebar -------------------------------------------------------
  ctx.fillStyle = sidebar
  ctx.fillRect(0, 0, 232, height)
  ctx.strokeStyle = line
  ctx.beginPath()
  ctx.moveTo(232.5, 0)
  ctx.lineTo(232.5, height)
  ctx.stroke()

  dot(26, 30, amber, 3.5)
  text('FrontDesk.', 38, 36, `italic 19px ${serif}`)
  label('DESKTOP', 154, 33, faint, 6.5)

  const nav = [
    ['Dashboard', true],
    ['Timeline', false],
    ['Open loops', false],
    ['People', false],
    ['Saved', false],
    ['Search', false],
    ['Settings', false],
  ]
  nav.forEach(([name, active], index) => {
    const y = 88 + index * 32
    if (active) {
      ctx.fillStyle = 'rgba(255,180,92,0.10)'
      round(ctx, 12, y - 19, 208, 26, 6)
      ctx.fill()
      ctx.fillStyle = amber
      ctx.fillRect(12, y - 19, 2, 26)
    }
    text(
      String(name),
      28,
      y,
      `${active ? '600' : '400'} 11.5px ${sans}`,
      active ? cream : dim,
    )
  })

  ctx.strokeStyle = line
  ctx.beginPath()
  ctx.moveTo(24, 332)
  ctx.lineTo(208, 332)
  ctx.stroke()

  label('LOCAL MODEL', 26, 360, faint, 7)
  text('Phi-4 Mini', 26, 384, `12px ${sans}`, cream)
  label('LOCAL CORE · ONLINE', 26, 404, faint, 6.5)
  label('1 GRANT ACTIVE', 26, 424, faint, 6.5)
  label('FRONTDESK 0.1.0', 26, 780, 'rgba(251,244,233,0.28)', 6.5)

  // ---- titlebar ------------------------------------------------------
  ctx.fillStyle = 'rgba(10,8,6,0.55)'
  ctx.fillRect(233, 0, width - 233, 46)
  ctx.strokeStyle = line
  ctx.beginPath()
  ctx.moveTo(233, 46.5)
  ctx.lineTo(width, 46.5)
  ctx.stroke()
  label('DASHBOARD', 756, 28, faint, 8)
  ctx.textAlign = 'right'
  dot(1180, 26, '#8fb177', 2.5)
  label('LOCAL · NOT SYNCED', 1244, 28, faint, 7)
  ctx.textAlign = 'left'

  // ---- date + ask bar ------------------------------------------------
  label('THURSDAY, 19 NOVEMBER', 268, 84, faint, 8.5)

  ctx.fillStyle = panel2
  round(ctx, 268, 102, 976, 48, 24)
  ctx.fill()
  ctx.strokeStyle = line
  round(ctx, 268, 102, 976, 48, 24)
  ctx.stroke()

  ctx.strokeStyle = faint
  ctx.lineWidth = 1.3
  ctx.beginPath()
  ctx.arc(294, 124, 5.5, 0, Math.PI * 2)
  ctx.moveTo(298, 129)
  ctx.lineTo(303, 134)
  ctx.stroke()
  ctx.lineWidth = 1

  text('Ask FrontDesk… anything about your week', 314, 130, `12.5px ${sans}`, dim)
  ctx.fillStyle = 'rgba(251,244,233,0.08)'
  round(ctx, 1168, 114, 58, 24, 6)
  ctx.fill()
  label('⌘ J', 1186, 130, faint, 7.5)

  // ---- next up -------------------------------------------------------
  card(268, 168, 470, 208)
  label('NEXT UP', 288, 194, amber, 7.5)
  ctx.textAlign = 'right'
  label('MON 23 NOV · 10:00', 718, 194, faint, 7.5)
  ctx.textAlign = 'left'

  text('Kestrel Launch Readiness', 288, 224, `400 21px ${serif}`)
  text('Steering', 288, 248, `400 21px ${serif}`)
  text('Microsoft Teams · 1 hour', 288, 270, `10px ${sans}`, faint)

  const people = [
    ['HW', 'Hannah'],
    ['AO', 'Anika'],
    ['ZN', 'Zeynep'],
    ['DH', 'Damla'],
  ]
  let chipX = 288
  people.forEach(([initials, name]) => {
    const w = 28 + String(name).length * 6.4 + 18
    ctx.fillStyle = 'rgba(251,244,233,0.06)'
    round(ctx, chipX, 288, w, 26, 13)
    ctx.fill()
    ctx.strokeStyle = line
    round(ctx, chipX, 288, w, 26, 13)
    ctx.stroke()
    dot(chipX + 13, 301, amber, 8)
    text(String(initials), chipX + 13, 304, `600 7px ${mono}`, bg, 'center')
    text(String(name), chipX + 26, 305, `9px ${sans}`, dim)
    chipX += w + 8
  })

  ctx.fillStyle = cream
  round(ctx, 288, 330, 154, 30, 15)
  ctx.fill()
  label('PREP ME FOR THIS', 302, 349, '#241d16', 7)
  ctx.textAlign = 'right'
  text('In 2 days', 718, 350, `9px ${sans}`, faint, 'right')
  ctx.textAlign = 'left'

  // ---- open loops ----------------------------------------------------
  card(754, 168, 490, 208)
  label('OPEN LOOPS', 774, 194, amber, 7.5)
  ctx.textAlign = 'right'
  label('4 FOUND  →', 1224, 194, faint, 7.5)
  ctx.textAlign = 'left'

  const loopGroup = (
    y: number,
    title: string,
    color: string,
    rows: Array<[string, string]>,
  ) => {
    dot(778, y - 3, color, 2.5)
    label(title, 790, y, color, 7)
    rows.forEach(([row, date], index) => {
      const rowY = y + 22 + index * 22
      text(row, 790, rowY, `10.5px ${sans}`, cream)
      ctx.textAlign = 'right'
      text(date, 1224, rowY, `8px ${mono}`, faint, 'right')
      ctx.textAlign = 'left'
    })
  }

  loopGroup(222, 'I OWE 2', amber, [
    ['Bring the claim 4 rationale', '26 Oct'],
    ['Send Anika the variant trade-off', '19 Nov'],
  ])
  loopGroup(292, 'WAITING ON 2', sage, [
    ['Medical sign-off on wording', '3 Nov'],
    ["Hannah's OK on the £18.4k PO", '12 Nov'],
  ])

  // ---- people --------------------------------------------------------
  card(268, 390, 976, 136)
  label('PEOPLE', 288, 414, faint, 7.5)
  ctx.textAlign = 'right'
  label('2 DUE FOR A CATCH-UP', 1224, 414, faint, 7.5)
  ctx.textAlign = 'left'

  const peopleCards = [
    ['HW', 'Hannah Whitcombe', 'Met 3 days ago', false],
    ['AO', 'Anika Okafor', 'Due for a catch-up', true],
    ['ZN', 'Dr Zeynep Nair', 'Due for a catch-up', true],
    ['DH', 'Damla Hartley', 'Met 5 days ago', false],
    ['TW', 'Tomasz Wrona', 'Met 2 weeks ago', false],
  ]
  peopleCards.forEach(([initials, name, status, due], index) => {
    const x = 288 + index * 191
    ctx.fillStyle = panel2
    round(ctx, x, 426, 181, 80, 10)
    ctx.fill()
    ctx.strokeStyle = line
    round(ctx, x, 426, 181, 80, 10)
    ctx.stroke()
    dot(x + 24, 454, due ? amber : teal, 14)
    text(String(initials), x + 24, 457, `600 10px ${mono}`, bg, 'center')
    text(String(name), x + 46, 450, `10.5px ${sans}`, cream)
    text(String(status), x + 46, 468, `8.5px ${sans}`, due ? amber : faint)
    if (due) {
      ctx.fillStyle = 'rgba(255,180,92,0.12)'
      round(ctx, x + 140, 438, 28, 14, 7)
      ctx.fill()
      label('DUE', x + 146, 448, amber, 6)
    }
  })

  // ---- timeline ------------------------------------------------------
  card(268, 542, 976, 210)
  label('TIMELINE', 288, 566, faint, 7.5)
  ctx.textAlign = 'right'
  label('THIS WEEK', 1224, 566, faint, 7.5)
  ctx.textAlign = 'left'

  ctx.strokeStyle = 'rgba(244,236,225,0.10)'
  ctx.beginPath()
  ctx.moveTo(300, 590)
  ctx.lineTo(300, 730)
  ctx.stroke()

  const events = [
    ['12 NOV', 'Launch comms date — moving to 9 Feb', 'Damla Hartley · Mail', amber],
    ['17 NOV', 'Claim 4 pub — quick update', 'Zeynep Nair · Mail', amber],
    ['19 NOV', 'Northlight v3 timings', 'Lena Fischer · Mail', amber],
    ['19 NOV', 'Kestrel core team weekly', 'Calendar · Meeting', teal],
  ]
  events.forEach(([date, title, meta, color], index) => {
    const y = 598 + index * 36
    dot(300, y - 4, String(color), 3)
    text(String(date), 288, y, `7px ${mono}`, faint, 'right')
    text(String(title), 320, y, `10.5px ${sans}`, cream)
    text(String(meta), 320, y + 14, `8px ${sans}`, faint)
  })

  // ---- footer --------------------------------------------------------
  text('Kestrel demo · local-first', 268, 782, `italic 11px ${serif}`, 'rgba(251,244,233,0.34)')
  ctx.textAlign = 'right'
  label('LOCAL · 14:32', 1244, 782, 'rgba(251,244,233,0.30)', 7)
  ctx.textAlign = 'left'

  // glass
  ctx.fillStyle = 'rgba(0,0,0,0.07)'
  for (let y = 0; y < height; y += 3) ctx.fillRect(0, y, width, 1)

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 8
  texture.needsUpdate = true
  return texture
}

function round(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}
