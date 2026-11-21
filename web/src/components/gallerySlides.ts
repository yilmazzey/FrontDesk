import type { CircularGalleryItem, PresentationFeature } from './CircularGallery'

/**
 * Presentation slides for the full-bleed gallery. Every poster is an inline
 * SVG so the page has no network dependency and the deck stays portable.
 * Feature slides open a detail overlay; the data-map slide opens the live
 * Archify viewer.
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

type Motif =
  | 'dashboard'
  | 'clock'
  | 'loop'
  | 'ask'
  | 'timeline'
  | 'search'
  | 'saved'
  | 'meetings'
  | 'people'
  | 'privacy'
  | 'sources'
  | 'tray'
  | 'model'
  | 'performance'

type FeatureEntry = PresentationFeature & { id: string; motif: Motif }

type PresentationSlide = {
  id: string
  label: string
  tagline: string
  description: string
  bullets: string[]
  metric: string
  motif: Motif
  kind?: 'feature' | 'features' | 'performance' | 'diagram'
  features?: PresentationFeature[]
}

function xml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function wrapTitle(label: string): string[] {
  const words = label.split(' ')
  const lines: string[] = []
  let current = ''
  for (const word of words) {
    const next = `${current} ${word}`.trim()
    if (next.length > 15 && current) {
      lines.push(current)
      current = word
    } else {
      current = next
    }
  }
  if (current) lines.push(current)
  return lines.slice(0, 2)
}

function featureGlyph(motif: Motif, accent: string): string {
  const stroke = `stroke="${accent}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none"`
  switch (motif) {
    case 'dashboard':
      return `<g ${stroke}>
        <rect x="3" y="4" width="12" height="8" rx="2" />
        <rect x="19" y="4" width="10" height="5" rx="1.5" />
        <rect x="19" y="13" width="10" height="15" rx="1.5" />
        <rect x="3" y="16" width="12" height="12" rx="2" />
      </g>`
    case 'clock':
      return `<g ${stroke}>
        <circle cx="16" cy="16" r="12" />
        <path d="M16 8 L16 16 L22 19" />
        <path d="M16 1.5 L16 4" />
        <path d="M30.5 16 L28 16" />
      </g>`
    case 'loop':
      return `<g ${stroke}>
        <path d="M7 10 C2 16, 4 26, 12 28 C19 30, 27 24, 25 16" />
        <path d="M25 16 C23 8, 14 4, 8 9" />
        <path d="M22 6 L27 15 L17 15" />
        <path d="M10 26 L5 17 L15 17" />
      </g>`
    case 'ask':
      return `<g ${stroke}>
        <rect x="3" y="4" width="22" height="16" rx="4" />
        <path d="M9 20 L7 27 L15 20" />
        <path d="M9 10 L9 14 M15 9 L15 14 M21 10 L21 14" />
      </g>`
    case 'timeline':
      return `<g ${stroke}>
        <path d="M10 3 L10 29" />
        <circle cx="10" cy="7" r="2.5" />
        <circle cx="10" cy="16" r="2.5" />
        <circle cx="10" cy="25" r="2.5" />
        <path d="M16 7 L27 7 M16 16 L23 16 M16 25 L26 25" />
      </g>`
    case 'search':
      return `<g ${stroke}>
        <circle cx="14" cy="14" r="9" />
        <path d="M21 21 L29 29" />
        <path d="M10 14 L18 14" />
      </g>`
    case 'saved':
      return `<g ${stroke}>
        <path d="M7 3 L25 3 L25 29 L16 23 L7 29 Z" />
        <path d="M12 10 L20 10 M12 15 L18 15" />
      </g>`
    case 'meetings':
      return `<g ${stroke}>
        <path d="M3 16 L3 16 M7 11 L7 21 M11 6 L11 26 M15 10 L15 22 M19 4 L19 28 M23 9 L23 23 M27 13 L27 19" />
      </g>`
    case 'people':
      return `<g ${stroke}>
        <circle cx="16" cy="10" r="4.5" />
        <circle cx="7" cy="22" r="3.5" />
        <circle cx="25" cy="22" r="3.5" />
        <path d="M12 21 L7 22 M20 21 L25 22 M11 12 L7 19 M21 12 L25 19" />
      </g>`
    case 'privacy':
      return `<g ${stroke}>
        <path d="M16 3 L27 7 L27 16 C27 23, 22 28, 16 30 C10 28, 5 23, 5 16 L5 7 Z" />
        <circle cx="16" cy="16" r="3" />
        <path d="M10 16 L13 16 M19 16 L22 16" />
      </g>`
    case 'sources':
      return `<g ${stroke}>
        <rect x="5" y="4" width="18" height="22" rx="2" />
        <path d="M9 24 L27 24 L27 8" />
        <path d="M9 10 L19 10 M9 15 L19 15 M9 20 L16 20" />
      </g>`
    case 'tray':
      return `<g ${stroke}>
        <rect x="3" y="5" width="26" height="22" rx="3" />
        <path d="M3 12 L29 12" />
        <path d="M8 17 L24 17 M8 21 L20 21" />
        <circle cx="7" cy="9" r="1" fill="${accent}" stroke="none" />
      </g>`
    case 'model':
      return `<g ${stroke}>
        <rect x="7" y="7" width="18" height="18" rx="3" />
        <rect x="12" y="12" width="8" height="8" rx="1.5" />
        <path d="M11 3 L11 7 M16 3 L16 7 M21 3 L21 7 M11 25 L11 29 M16 25 L16 29 M21 25 L21 29 M3 11 L7 11 M3 16 L7 16 M3 21 L7 21 M25 11 L29 11 M25 16 L29 16 M25 21 L29 21" />
      </g>`
    case 'performance':
      return `<g ${stroke}>
        <path d="M4 28 L4 4" />
        <path d="M4 28 L30 28" />
        <rect x="8" y="19" width="4" height="9" rx="1" fill="${accent}" stroke="none" opacity="0.35" />
        <rect x="15" y="13" width="4" height="15" rx="1" fill="${accent}" stroke="none" opacity="0.55" />
        <rect x="22" y="7" width="4" height="21" rx="1" fill="${accent}" stroke="none" opacity="0.8" />
        <path d="M9 16 L16 10 L24 5" />
      </g>`
  }
}

function featureSlideImage(
  n: string,
  label: string,
  tagline: string,
  metric: string,
  motif: Motif,
  palette: Palette,
): string {
  const { base, shade, accent, ink } = palette
  const lines = wrapTitle(label)
  const title = lines
    .map(
      (line, index) =>
        `<text x="120" y="${286 + index * 78}" font-family="Georgia, 'Times New Roman', serif" font-size="76" fill="${ink}" opacity="0.92">${xml(line)}</text>`,
    )
    .join('')
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900" width="1600" height="900">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="${base}" />
        <stop offset="1" stop-color="${shade}" />
      </linearGradient>
      <radialGradient id="light" cx="0.82" cy="0.06" r="0.9">
        <stop offset="0" stop-color="#fff8e8" stop-opacity="0.9" />
        <stop offset="0.55" stop-color="#fff8e8" stop-opacity="0" />
      </radialGradient>
      <pattern id="grid" width="42" height="42" patternUnits="userSpaceOnUse">
        <circle cx="1.5" cy="1.5" r="1.5" fill="${ink}" opacity="0.07" />
      </pattern>
    </defs>
    <rect width="1600" height="900" fill="url(#bg)" />
    <rect width="1600" height="900" fill="url(#light)" />
    <rect width="1600" height="900" fill="url(#grid)" />

    <text x="120" y="170" font-family="ui-monospace, Menlo, monospace" font-size="24" letter-spacing="8" fill="${accent}">${n}</text>
    ${title}
    <text x="120" y="${lines.length > 1 ? 466 : 390}" font-family="ui-monospace, Menlo, monospace" font-size="18" letter-spacing="4" fill="${accent}">${xml(tagline.toUpperCase())}</text>

    <rect x="120" y="548" width="18" height="3" rx="1.5" fill="${accent}" />
    <text x="150" y="554" font-family="ui-monospace, Menlo, monospace" font-size="18" fill="${ink}" opacity="0.68">${xml(metric)}</text>

    <text x="120" y="812" font-family="ui-monospace, Menlo, monospace" font-size="13" letter-spacing="4" fill="${ink}" opacity="0.38">FRONTDESK · LOCAL-FIRST</text>

    <rect x="900" y="200" width="580" height="500" rx="32" fill="#fffaf0" opacity="0.5" stroke="${accent}" stroke-opacity="0.35" stroke-width="2" />
    <text x="940" y="246" font-family="ui-monospace, Menlo, monospace" font-size="14" letter-spacing="4" fill="${accent}">${xml(label.toUpperCase())}</text>
    <g transform="translate(1060 300) scale(11)">
      ${featureGlyph(motif, accent)}
    </g>
    <circle cx="1430" cy="280" r="72" fill="${accent}" opacity="0.08" />
    <circle cx="1430" cy="280" r="34" fill="${accent}" opacity="0.12" />
  </svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

/**
 * Poster for the interactive architecture map. The slide is a teaser; clicking
 * it opens the full Archify viewer in an overlay, so the gallery stays a
 * canvas of images while the map itself stays fully interactive.
 */
function diagramSlideImage(n: string, palette: Palette): string {
  const { base, shade, accent, ink } = palette
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900" width="1600" height="900">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="${base}" />
        <stop offset="1" stop-color="${shade}" />
      </linearGradient>
      <radialGradient id="light" cx="0.82" cy="0.06" r="0.9">
        <stop offset="0" stop-color="#fff8e8" stop-opacity="0.9" />
        <stop offset="0.55" stop-color="#fff8e8" stop-opacity="0" />
      </radialGradient>
      <pattern id="grid" width="42" height="42" patternUnits="userSpaceOnUse">
        <circle cx="1.5" cy="1.5" r="1.5" fill="${ink}" opacity="0.08" />
      </pattern>
    </defs>
    <rect width="1600" height="900" fill="url(#bg)" />
    <rect width="1600" height="900" fill="url(#light)" />
    <rect width="1600" height="900" fill="url(#grid)" />

    <text x="120" y="180" font-family="ui-monospace, Menlo, monospace" font-size="26" letter-spacing="8" fill="${accent}">${n}</text>
    <text x="120" y="300" font-family="Georgia, 'Times New Roman', serif" font-size="76" fill="${ink}" opacity="0.92">Where your</text>
    <text x="120" y="380" font-family="Georgia, 'Times New Roman', serif" font-size="76" fill="${ink}" opacity="0.92">data goes</text>
    <text x="120" y="430" font-family="ui-monospace, Menlo, monospace" font-size="19" letter-spacing="4" fill="${accent}">INTERACTIVE MAP · CLICK TO EXPLORE</text>

    <g font-family="ui-monospace, Menlo, monospace" font-size="16" fill="${ink}" opacity="0.62">
      <text x="120" y="530">Local files, OCR and embeddings stay put.</text>
      <text x="120" y="570">Whisper and GGUF models run on the machine.</text>
      <text x="120" y="610">Only Graph, Bing and model downloads cross.</text>
    </g>

    <rect x="740" y="160" width="740" height="580" rx="28" fill="#fffaf0" opacity="0.52" stroke="${accent}" stroke-opacity="0.45" stroke-width="2" />
    <text x="778" y="204" font-family="ui-monospace, Menlo, monospace" font-size="16" letter-spacing="4" fill="${accent}">YOUR MACHINE</text>

    <g font-family="ui-monospace, Menlo, monospace" font-size="15">
      <rect x="780" y="238" width="150" height="62" rx="12" fill="${base}" stroke="${accent}" stroke-opacity="0.5" />
      <text x="800" y="264" fill="${ink}">AskBar</text>
      <text x="800" y="284" fill="${ink}" opacity="0.55">question</text>

      <rect x="950" y="238" width="150" height="62" rx="12" fill="${base}" stroke="${accent}" stroke-opacity="0.5" />
      <text x="970" y="264" fill="${ink}">Answer</text>
      <text x="970" y="284" fill="${ink}" opacity="0.55">citations</text>

      <rect x="1120" y="238" width="170" height="62" rx="12" fill="${base}" stroke="${accent}" stroke-opacity="0.7" />
      <text x="1140" y="264" fill="${ink}">Local model</text>
      <text x="1140" y="284" fill="${ink}" opacity="0.55">loopback only</text>

      <rect x="780" y="372" width="150" height="62" rx="12" fill="${base}" stroke="${accent}" stroke-opacity="0.5" />
      <text x="800" y="398" fill="${ink}">Mic</text>
      <text x="800" y="418" fill="${ink}" opacity="0.55">16 kHz</text>

      <rect x="950" y="372" width="150" height="62" rx="12" fill="${base}" stroke="${accent}" stroke-opacity="0.5" />
      <text x="970" y="398" fill="${ink}">audio.wav</text>
      <text x="970" y="418" fill="${ink}" opacity="0.55">temporary</text>

      <rect x="1120" y="372" width="170" height="62" rx="12" fill="${base}" stroke="${accent}" stroke-opacity="0.5" />
      <text x="1140" y="398" fill="${ink}">Whisper</text>
      <text x="1140" y="418" fill="${ink}" opacity="0.55">local</text>

      <rect x="950" y="514" width="260" height="62" rx="12" fill="${base}" stroke="${accent}" stroke-opacity="0.5" />
      <text x="970" y="540" fill="${ink}">Meeting notes</text>
      <text x="970" y="560" fill="${ink}" opacity="0.55">meeting.json · notes.md</text>
    </g>

    <g stroke="${accent}" stroke-width="2" fill="none" opacity="0.7">
      <path d="M930 269 L950 269" />
      <path d="M1100 269 L1120 269" />
      <path d="M930 403 L950 403" />
      <path d="M1100 403 L1120 403" />
      <path d="M1205 434 L1205 514 L1210 514" />
    </g>

    <g font-family="ui-monospace, Menlo, monospace" font-size="15">
      <rect x="800" y="78" width="180" height="54" rx="12" fill="${base}" stroke="${accent}" stroke-opacity="0.55" />
      <text x="820" y="102" fill="${ink}">Microsoft 365</text>
      <text x="820" y="120" fill="${ink}" opacity="0.55">Graph</text>

      <rect x="1120" y="78" width="130" height="54" rx="12" fill="${base}" stroke="${accent}" stroke-opacity="0.55" />
      <text x="1140" y="102" fill="${ink}">Bing</text>
      <text x="1140" y="120" fill="${ink}" opacity="0.55">optional</text>
    </g>

    <g stroke="${accent}" stroke-dasharray="6 6" stroke-width="2" fill="none" opacity="0.6">
      <path d="M890 132 L890 160" />
      <path d="M1185 132 L1185 160" />
    </g>
  </svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

const features: FeatureEntry[] = [
  {
    id: 'dashboard',
    label: 'Manager dashboard',
    tagline: 'The day, assembled',
    description:
      'Next meeting prep, open commitments, people catch-up nudges and live deadline countdowns on one quiet surface.',
    bullets: [
      'Next meeting card with prep evidence from mail, notes and calendar.',
      'Open commitments and waiting-on items pulled from the people graph.',
      'Deadline counters and a short timeline — no feeds, no badges.',
    ],
    metric: 'One screen',
    motif: 'dashboard',
  },
  {
    id: 'deadlines',
    label: 'Deadlines',
    tagline: 'Time you can see',
    description:
      'Add a due date from the dashboard or straight from an answer. Day, hour and minute counters keep it visible.',
    bullets: [
      'Create a deadline from any answer or the dashboard.',
      'Countdown updates down to the minute.',
      'Stored locally; nothing is scheduled in the cloud.',
    ],
    metric: 'Minute-level countdown',
    motif: 'clock',
  },
  {
    id: 'open-loops',
    label: 'Open loops',
    tagline: 'Close the loop',
    description:
      'Every promise and every wait, in one list. Swipe to mark Done or Delete; hidden items can be restored.',
    bullets: [
      'Extracted from notes, mail and meetings.',
      'Swipe actions plus drawer buttons.',
      'Dismissed items remain restorable.',
    ],
    metric: 'No unowned promises',
    motif: 'loop',
  },
  {
    id: 'ask',
    label: 'Ask',
    tagline: 'Cited, or it abstains',
    description:
      'A local conversational assistant with hybrid retrieval, inline citations and an explicit abstain path.',
    bullets: [
      'BM25 + vector retrieval, fused and reranked.',
      'Every sentence checked against the retrieved excerpts.',
      'Personal questions refuse to guess; general questions answer normally.',
    ],
    metric: '0.3 ms retrieval',
    motif: 'ask',
  },
  {
    id: 'timeline',
    label: 'Timeline',
    tagline: 'A searchable memory',
    description:
      'A filterable history with sticky day headers, a Today jump and links to likely meetings.',
    bullets: [
      'Search and filter by source, person or day.',
      'Sticky day headers and a Today jump.',
      'Open the original from any row.',
    ],
    metric: 'Every day, indexed',
    motif: 'timeline',
  },
  {
    id: 'search',
    label: 'Search',
    tagline: 'Find the sentence',
    description:
      'Content search returns the matched excerpt, people and dates; every result row opens the original.',
    bullets: [
      'Whole-word content search across granted sources.',
      'Matched excerpt, people and dates in the result.',
      'Opens the original, not a copy.',
    ],
    metric: '0.3 ms retrieval',
    motif: 'search',
  },
  {
    id: 'saved',
    label: 'Saved',
    tagline: 'Answers you keep',
    description:
      'Rehydrate Markdown answers from your chosen folder, with category filters and Finder reveal.',
    bullets: [
      'Save any answer as Markdown you own.',
      'Category filters and a source list.',
      'Reveal in Finder; no proprietary store.',
    ],
    metric: 'Markdown, yours',
    motif: 'saved',
  },
  {
    id: 'meetings',
    label: 'Meetings',
    tagline: 'Local ears, local notes',
    description:
      'Record the microphone locally, transcribe with Whisper on this machine and write notes with the local model.',
    bullets: [
      '16 kHz mono WAV, captured locally.',
      'Whisper base runs on the machine.',
      'Audio deleted after success; transcript and notes stay.',
    ],
    metric: '57 MB Whisper',
    motif: 'meetings',
  },
  {
    id: 'people',
    label: 'People graph',
    tagline: 'The people around the work',
    description:
      'Cluster colleagues by department and title, with mail signatures as fallback, and link them by mail, meetings and mentions.',
    bullets: [
      'Microsoft 365 department and title clustering.',
      'Mail signatures when Graph metadata is thin.',
      'Links from mail, meetings and message mentions.',
    ],
    metric: 'Obsidian-style links',
    motif: 'people',
  },
  {
    id: 'privacy',
    label: 'Privacy shield',
    tagline: 'Blur when watched',
    description:
      'Blur the whole window when a remote-access tool is active, with an unblur action and a shortcut.',
    bullets: [
      'Detects remote-desktop and screen-sharing apps.',
      'Blurs the full window automatically.',
      'Unblur action plus ⌘⇧P.',
    ],
    metric: 'Local detection',
    motif: 'privacy',
  },
  {
    id: 'sources',
    label: 'Sources',
    tagline: 'Only what you grant',
    description:
      'Local folders, PDFs and scans, Outlook mail and Sent Items, Microsoft Calendar and OneNote.',
    bullets: [
      'Revocable grants per source family.',
      'OCR runs locally for scans.',
      'Bodies read at query time, not copied.',
    ],
    metric: '6 source types',
    motif: 'sources',
  },
  {
    id: 'tray',
    label: 'Menu-bar popover',
    tagline: 'The next three things',
    description:
      'Click the tray icon to see the next three calendar items; its Ask bar opens the main chat.',
    bullets: [
      'Next three calendar items at a glance.',
      'Ask bar opens the main app chat.',
      'No separate sync or account.',
    ],
    metric: 'One click',
    motif: 'tray',
  },
  {
    id: 'model',
    label: 'Local model',
    tagline: 'Plug in a GGUF',
    description:
      'Extractive mode works instantly; Phi-4 Mini can be downloaded in the app, or drop in any GGUF.',
    bullets: [
      'Extractive mode needs no model.',
      'Phi-4 Mini downloaded and verified locally.',
      'Drop a GGUF in, remove it to unplug.',
    ],
    metric: '2.3 GB GGUF',
    motif: 'model',
  },
]

const featuresSlide: PresentationSlide = {
  id: 'features',
  label: 'All features',
  tagline: 'One quiet surface',
  description:
    'Thirteen capabilities, one local-first workspace. Every feature below keeps its source text and results on the machine.',
  bullets: [],
  metric: '13 features · local-first',
  motif: 'dashboard',
  kind: 'features',
  features,
}

const dataMapSlide: PresentationSlide = {
  id: 'data-map',
  label: 'Where your data goes',
  tagline: 'Under the hood',
  description:
    'The full chat and meeting pipeline, with the device boundary called out. Click to open the interactive map.',
  bullets: [
    'Chat, retrieval, local model and verification.',
    'Meetings, Whisper and local notes.',
    'What leaves the machine and what never does.',
  ],
  metric: 'Device boundary',
  motif: 'performance',
  kind: 'diagram',
}

const performanceSlide: PresentationSlide = {
  id: 'performance',
  label: 'Performance & memory',
  tagline: 'Measured on this machine',
  description:
    'Retrieval, warm model latency and resident memory, with Phi-4 Mini loaded. Cold start adds model load time.',
  bullets: [
    'Retrieval 0.3 ms/query (release, 200 runs).',
    'Warm generate 127 ms + verify 81 ms.',
    'FrontDesk 0.30 GB + model runtime 3.74 GB RSS.',
  ],
  metric: '0.3 ms · 127 ms · 3.74 GB',
  motif: 'performance',
  kind: 'performance',
}

const slides: Array<PresentationSlide & { art?: 'diagram' }> = [
  featuresSlide,
  dataMapSlide,
  performanceSlide,
]

export const galleryItems: CircularGalleryItem[] = slides.map((slide, index) => {
  const number = String(index + 1).padStart(2, '0')
  const palette = palettes[index % palettes.length]
  const diagram = slide.id === 'data-map'
  return {
    image: diagram
      ? diagramSlideImage(number, palette)
      : featureSlideImage(
          number,
          slide.label,
          slide.tagline,
          slide.metric,
          slide.motif,
          palette,
        ),
    text: slide.label,
    description: slide.description,
    alt: slide.label,
    kind: diagram ? 'diagram' : slide.kind,
    tagline: slide.tagline,
    bullets: slide.bullets,
    metric: slide.metric,
    features: slide.features,
  }
})
