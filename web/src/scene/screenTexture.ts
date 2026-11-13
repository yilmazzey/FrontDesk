import * as THREE from 'three'

/**
 * A warm little workspace painted into a canvas and used as the monitor's
 * screen. It deliberately shares its type, palette and ruled lines with the
 * printed sheet further down the page, so the close-up feels like the same
 * product rather than a generic dashboard.
 */
export function createScreenTexture(): THREE.CanvasTexture {
  const width = 1024
  const height = 640
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height

  const ctx = canvas.getContext('2d')!
  const cream = '#efe2cd'
  const muted = '#9c8b74'
  const faint = 'rgba(239,226,205,0.11)'
  const amber = '#e6a35f'
  const sage = '#9dbb95'
  const panel = '#1b1610'
  const bg = '#120f0b'

  ctx.fillStyle = bg
  ctx.fillRect(0, 0, width, height)

  // warm pool of light from the left
  const glow = ctx.createRadialGradient(120, 40, 10, 120, 40, 520)
  glow.addColorStop(0, 'rgba(230,163,95,0.15)')
  glow.addColorStop(1, 'rgba(230,163,95,0)')
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, width, height)

  // ---- top bar -------------------------------------------------------
  ctx.fillStyle = 'rgba(10,8,6,0.72)'
  ctx.fillRect(0, 0, width, 52)
  ctx.strokeStyle = 'rgba(239,226,205,0.09)'
  ctx.beginPath()
  ctx.moveTo(0, 52.5)
  ctx.lineTo(width, 52.5)
  ctx.stroke()

  ctx.fillStyle = amber
  ctx.beginPath()
  ctx.arc(30, 26, 4.5, 0, Math.PI * 2)
  ctx.fill()

  ctx.fillStyle = cream
  ctx.font = 'italic 19px Georgia, "Times New Roman", serif'
  ctx.fillText('FrontDesk.', 44, 33)

  ctx.font = '10px ui-monospace, Menlo, monospace'
  ctx.fillStyle = muted
  ctx.fillText('W O R K S P A C E', 154, 30)

  const nav = ['Desk', 'Work', 'Notes', 'Focus']
  nav.forEach((label, i) => {
    ctx.fillStyle = i === 0 ? cream : muted
    ctx.font = `${i === 0 ? '600' : '400'} 11px -apple-system, system-ui, sans-serif`
    ctx.fillText(label, 650 + i * 66, 30)
  })

  // ---- left rail -----------------------------------------------------
  ctx.fillStyle = 'rgba(8,6,4,0.55)'
  ctx.fillRect(0, 52, 186, height - 52)
  ctx.strokeStyle = 'rgba(239,226,205,0.07)'
  ctx.beginPath()
  ctx.moveTo(186.5, 52)
  ctx.lineTo(186.5, height)
  ctx.stroke()

  ctx.font = '9px ui-monospace, Menlo, monospace'
  ctx.fillStyle = muted
  ctx.fillText('T O D A Y', 24, 88)

  const today = [
    ['Deep work', '2h 10m'],
    ['Reviews', '40m'],
    ['Notes', '12'],
  ]
  today.forEach(([label, value], i) => {
    const y = 118 + i * 34
    ctx.fillStyle = i === 0 ? cream : 'rgba(239,226,205,0.62)'
    ctx.font = '11.5px -apple-system, system-ui, sans-serif'
    ctx.fillText(label, 24, y)
    ctx.fillStyle = muted
    ctx.font = '10px ui-monospace, Menlo, monospace'
    ctx.textAlign = 'right'
    ctx.fillText(value, 162, y)
    ctx.textAlign = 'left'
    ctx.strokeStyle = 'rgba(239,226,205,0.05)'
    ctx.beginPath()
    ctx.moveTo(24, y + 13)
    ctx.lineTo(162, y + 13)
    ctx.stroke()
  })

  ctx.strokeStyle = 'rgba(239,226,205,0.07)'
  ctx.beginPath()
  ctx.moveTo(24, 246)
  ctx.lineTo(162, 246)
  ctx.stroke()

  ctx.fillStyle = muted
  ctx.font = '9px ui-monospace, Menlo, monospace'
  ctx.fillText('P R O J E C T S', 24, 276)

  const projects = ['Landing page', 'Pricing', 'Notebook', 'Archive']
  projects.forEach((label, i) => {
    const y = 302 + i * 28
    ctx.fillStyle = i === 0 ? amber : 'rgba(239,226,205,0.5)'
    ctx.beginPath()
    ctx.arc(27, y - 4, 2.2, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = i === 0 ? cream : 'rgba(239,226,205,0.62)'
    ctx.font = '11px -apple-system, system-ui, sans-serif'
    ctx.fillText(label, 40, y)
  })

  // ---- main heading --------------------------------------------------
  ctx.fillStyle = muted
  ctx.font = '9px ui-monospace, Menlo, monospace'
  ctx.fillText('T H U R S D A Y ,   1 2   N O V E M B E R', 220, 92)

  ctx.fillStyle = cream
  ctx.font = '400 35px Georgia, "Times New Roman", serif'
  ctx.fillText('Good evening, Zeynep.', 220, 134)

  ctx.fillStyle = 'rgba(239,226,205,0.55)'
  ctx.font = '11.5px -apple-system, system-ui, sans-serif'
  ctx.fillText('Three things open. Nothing on fire.', 220, 156)

  // ---- focus timer card ---------------------------------------------
  ctx.fillStyle = panel
  round(ctx, 220, 186, 356, 168, 10)
  ctx.fill()
  ctx.strokeStyle = 'rgba(239,226,205,0.08)'
  round(ctx, 220, 186, 356, 168, 10)
  ctx.stroke()

  ctx.fillStyle = muted
  ctx.font = '9px ui-monospace, Menlo, monospace'
  ctx.fillText('F O C U S   B L O C K', 244, 216)

  ctx.fillStyle = cream
  ctx.font = '400 56px Georgia, "Times New Roman", serif'
  ctx.fillText('41:00', 244, 278)

  ctx.fillStyle = muted
  ctx.font = '10.5px -apple-system, system-ui, sans-serif'
  ctx.fillText('Tighten the hero copy', 244, 302)

  // progress rule
  ctx.fillStyle = 'rgba(239,226,205,0.12)'
  ctx.fillRect(244, 322, 306, 2)
  ctx.fillStyle = amber
  ctx.fillRect(244, 322, 196, 2)

  // a wax-seal-ish play mark
  ctx.fillStyle = 'rgba(230,163,95,0.16)'
  ctx.beginPath()
  ctx.arc(530, 322, 18, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = amber
  ctx.beginPath()
  ctx.moveTo(525, 315)
  ctx.lineTo(538, 322)
  ctx.lineTo(525, 329)
  ctx.closePath()
  ctx.fill()

  // ---- chart card ----------------------------------------------------
  ctx.fillStyle = panel
  round(ctx, 596, 186, 404, 168, 10)
  ctx.fill()
  ctx.strokeStyle = 'rgba(239,226,205,0.08)'
  round(ctx, 596, 186, 404, 168, 10)
  ctx.stroke()

  ctx.fillStyle = cream
  ctx.font = '12px -apple-system, system-ui, sans-serif'
  ctx.fillText('This week', 620, 214)
  ctx.fillStyle = muted
  ctx.font = '9px ui-monospace, Menlo, monospace'
  ctx.textAlign = 'right'
  ctx.fillText('6.4 H', 976, 214)
  ctx.textAlign = 'left'

  const pts = [0.26, 0.34, 0.3, 0.42, 0.38, 0.55, 0.62]
  const x0 = 622
  const y0 = 318
  const w = 352
  const h = 84
  const point = (i: number) => ({ x: x0 + (w / (pts.length - 1)) * i, y: y0 - h * pts[i] })

  ctx.strokeStyle = 'rgba(239,226,205,0.06)'
  for (let i = 0; i <= 2; i++) {
    const y = y0 - (h / 2) * i
    ctx.beginPath()
    ctx.moveTo(x0, y)
    ctx.lineTo(x0 + w, y)
    ctx.stroke()
  }

  ctx.beginPath()
  ctx.moveTo(point(0).x, point(0).y)
  for (let i = 1; i < pts.length; i++) ctx.lineTo(point(i).x, point(i).y)
  ctx.strokeStyle = amber
  ctx.lineWidth = 2
  ctx.lineJoin = 'round'
  ctx.stroke()
  ctx.lineWidth = 1

  const last = point(pts.length - 1)
  ctx.fillStyle = bg
  ctx.beginPath()
  ctx.arc(last.x, last.y, 5, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = amber
  ctx.beginPath()
  ctx.arc(last.x, last.y, 2.6, 0, Math.PI * 2)
  ctx.fill()

  ;['M', 'T', 'W', 'T', 'F', 'S', 'S'].forEach((day, i) => {
    ctx.fillStyle = 'rgba(239,226,205,0.33)'
    ctx.font = '8px ui-monospace, Menlo, monospace'
    ctx.fillText(day, x0 + (w / 6) * i - 2, 334)
  })

  // ---- task list -----------------------------------------------------
  ctx.fillStyle = panel
  round(ctx, 220, 376, 780, 214, 10)
  ctx.fill()
  ctx.strokeStyle = 'rgba(239,226,205,0.08)'
  round(ctx, 220, 376, 780, 214, 10)
  ctx.stroke()

  ctx.fillStyle = cream
  ctx.font = '12px -apple-system, system-ui, sans-serif'
  ctx.fillText('Up next', 244, 404)

  ctx.fillStyle = muted
  ctx.font = '9px ui-monospace, Menlo, monospace'
  ctx.textAlign = 'right'
  ctx.fillText('3  O P E N', 976, 404)
  ctx.textAlign = 'left'

  const tasks = [
    ['Tighten the hero copy', 'Landing page', 'due Fri', true],
    ['Ship the pricing page', 'Pricing', 'today', false],
    ['Reply to Mira', 'Notebook', 'today', false],
  ]
  tasks.forEach(([task, project, due, done], i) => {
    const y = 434 + i * 50
    ctx.strokeStyle = done ? sage : 'rgba(239,226,205,0.24)'
    ctx.lineWidth = 1.2
    round(ctx, 244, y - 11, 16, 16, 4)
    ctx.stroke()
    if (done) {
      ctx.strokeStyle = sage
      ctx.beginPath()
      ctx.moveTo(248, y - 3)
      ctx.lineTo(252, y + 2)
      ctx.lineTo(257, y - 7)
      ctx.stroke()
    }
    ctx.lineWidth = 1

    ctx.fillStyle = done ? 'rgba(239,226,205,0.38)' : cream
    ctx.font = '12px -apple-system, system-ui, sans-serif'
    ctx.fillText(String(task), 276, y + 1)

    ctx.fillStyle = muted
    ctx.font = '9px ui-monospace, Menlo, monospace'
    ctx.fillText(String(project).toUpperCase(), 650, y + 1)

    ctx.fillStyle = String(due) === 'today' ? amber : muted
    ctx.textAlign = 'right'
    ctx.fillText(String(due), 976, y + 1)
    ctx.textAlign = 'left'

    if (i < tasks.length - 1) {
      ctx.strokeStyle = 'rgba(239,226,205,0.06)'
      ctx.beginPath()
      ctx.moveTo(244, y + 24)
      ctx.lineTo(976, y + 24)
      ctx.stroke()
    }
  })

  // ---- footer note ---------------------------------------------------
  ctx.fillStyle = 'rgba(239,226,205,0.32)'
  ctx.font = 'italic 12px Georgia, "Times New Roman", serif'
  ctx.fillText('“The desk is a place, not a feed.”', 220, 620)

  ctx.fillStyle = faint
  ctx.font = '9px ui-monospace, Menlo, monospace'
  ctx.textAlign = 'right'
  ctx.fillText('LOCAL  ·  14:32', 976, 620)
  ctx.textAlign = 'left'

  // very light scanline so the glass reads as glass
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
