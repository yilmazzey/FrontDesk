export type Note = {
  id: string
  title: string
  body: string
  tag: string
  updated: string
  source?: string
}

/** Placeholder content only — no persistence, no model. */
export const notes: Note[] = [
  {
    id: 'n1',
    title: 'OCR pipeline — first pass',
    body: 'Tesseract ran cleanly on the scanned protocol. Kept the raw images in ~/Documents/FrontDesk/scans and wrote the text beside them.',
    tag: 'Research',
    updated: 'Today',
    source: 'protocol-scan.pdf',
  },
  {
    id: 'n2',
    title: 'Questions for the study sync',
    body: 'Ask about the consent wording, the retention window, and whether the second site needs its own approval.',
    tag: 'Meetings',
    updated: 'Yesterday',
  },
  {
    id: 'n3',
    title: 'Reading: local-first software',
    body: 'The useful idea is ownership, not offline. The file on your disk is the source of truth; sync is an optional courtesy.',
    tag: 'Reading',
    updated: 'Tue',
    source: 'local-first.pdf',
  },
  {
    id: 'n4',
    title: 'Trip notes — Basel',
    body: 'Train from Zürich at 08:04. Bring the printed agenda and the spare badge. Hotel is a ten minute walk from the venue.',
    tag: 'Personal',
    updated: 'Mon',
  },
  {
    id: 'n5',
    title: 'Citations that hold up',
    body: 'Every answer should point at a paragraph, not a whole document. Show the quote inline and let the reader jump to it.',
    tag: 'Product',
    updated: 'Sun',
  },
]
