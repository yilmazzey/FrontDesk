import type { CircularGalleryItem } from './CircularGallery'

/**
 * Placeholder slides for the full-bleed gallery. Each image is an inline SVG
 * so the page has no network dependency and swapping in real screenshots is
 * just a matter of changing `image` (a URL or an imported asset).
 *
 * 16:9 keeps the slides in presentation proportions; the gallery crops to fill
 * the card, so any image with the same ratio lands cleanly.
 */

type Palette = { base: string; shade: string; accent: string; ink: string }

const palettes: Palette[] = [
  { base: '#f6ecd9', shade: '#e4d1ac', accent: '#b27324', ink: '#2a2016' },
  { base: '#efe4d0', shade: '#dcc5a0', accent: '#8a571c', ink: '#241d16' },
  { base: '#f3e8d7', shade: '#dfcaa9', accent: '#a4601a', ink: '#2c2117' },
  { base: '#f7f1e4', shade: '#e6d7bd', accent: '#7c4a12', ink: '#241d16' },
  { base: '#f1e6d3', shade: '#dcc8a5', accent: '#9a5f1b', ink: '#2a2016' },
  { base: '#f5ecdf', shade: '#e2d1b5', accent: '#83521a', ink: '#241d16' },
]

function slideImage(n: string, label: string, palette: Palette): string {
  const { base, shade, accent, ink } = palette
  const art = `
    <circle cx="1180" cy="240" r="210" fill="${accent}" opacity="0.12" />
    <circle cx="1180" cy="240" r="120" fill="${accent}" opacity="0.16" />
    <rect x="980" y="430" width="420" height="270" rx="18" fill="${ink}" opacity="0.08" />
    <rect x="1010" y="460" width="360" height="180" rx="8" fill="${accent}" opacity="0.22" />
    <path d="M120 700 L520 700 L520 760 L120 760 Z" fill="${ink}" opacity="0.06" />
    <path d="M120 640 L360 640 L360 700 L120 700 Z" fill="${accent}" opacity="0.12" />
  `
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900" width="1600" height="900">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="${base}" />
        <stop offset="1" stop-color="${shade}" />
      </linearGradient>
      <radialGradient id="light" cx="0.84" cy="0.05" r="0.9">
        <stop offset="0" stop-color="#fff8e8" stop-opacity="0.9" />
        <stop offset="0.55" stop-color="#fff8e8" stop-opacity="0" />
      </radialGradient>
    </defs>
    <rect width="1600" height="900" fill="url(#bg)" />
    <rect width="1600" height="900" fill="url(#light)" />
    ${art}
    <text x="120" y="180" font-family="ui-monospace, Menlo, monospace" font-size="26" letter-spacing="8" fill="${accent}">${n}</text>
    <text x="120" y="300" font-family="Georgia, 'Times New Roman', serif" font-size="92" fill="${ink}" opacity="0.9">${label}</text>
    <text x="120" y="360" font-family="ui-monospace, Menlo, monospace" font-size="22" letter-spacing="5" fill="${ink}" opacity="0.45">PRESENTATION PLACEHOLDER · 16:9</text>
  </svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

const slides: Array<Omit<CircularGalleryItem, 'image'> & { label: string }> = [
  {
    label: 'Your desk stays yours',
    text: 'Your desk stays yours',
    description:
      'Notes, files and the search index live on your machine. Nothing leaves the desk unless you ask it to.',
  },
  {
    label: 'Every page, searchable',
    text: 'Every page, searchable',
    description:
      'Drop in a scan, a photo or a PDF. OCR runs locally, so the words come back as notes you can actually find.',
  },
  {
    label: 'Your inbox, on the desk',
    text: 'Your inbox, on the desk',
    description:
      'Outlook becomes another object on the desk. Pull a message into a note without copying it anywhere new.',
  },
  {
    label: 'Cited, or it refuses',
    text: 'Cited, or it refuses',
    description:
      'Every claim points back to the page it came from. When the answer is not in your files, the assistant says so.',
  },
  {
    label: 'Model on your terms',
    text: 'Model on your terms',
    description:
      'Drop a GGUF file into the models folder to plug a model in. Remove it to unplug it. No account required.',
  },
  {
    label: 'A calmer place to work',
    text: 'A calmer place to work',
    description:
      'One quiet surface for notes, mail and questions — designed to stay out of the way while you think.',
  },
]

export const galleryItems: CircularGalleryItem[] = slides.map((slide, index) => ({
  image: slideImage(String(index + 1).padStart(2, '0'), slide.label, palettes[index % palettes.length]),
  text: slide.text,
  description: slide.description,
  alt: slide.label,
}))
