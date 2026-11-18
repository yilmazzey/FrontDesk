import type { SourceRef } from '../types/source'

export type TimelineFilter = 'all' | 'meetings' | 'notes' | 'scans' | 'mail' | 'onenote'

export function sourceDate(source: SourceRef): Date | null {
  const date = new Date(source.modified)
  return Number.isNaN(date.getTime()) ? null : date
}

export function category(source: SourceRef): Exclude<TimelineFilter, 'all'> {
  if (source.kind === 'calendar') return 'meetings'
  if (source.kind === 'mail') return 'mail'
  if (source.kind === 'onenote') return 'onenote'
  if (source.kind === 'ocr' || source.location.toLowerCase().endsWith('.pdf')) return 'scans'
  return 'notes'
}

const CATEGORY_LABELS: Record<Exclude<TimelineFilter, 'all'>, string> = {
  meetings: 'Meeting',
  notes: 'Note',
  scans: 'Scan',
  mail: 'Mail',
  onenote: 'OneNote',
}

export function categoryLabel(source: SourceRef): string {
  return CATEGORY_LABELS[category(source)]
}

export function dayKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
}

export function dayLabel(date: Date, now = new Date()): string {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
  const diff = Math.round((target - start) / 86_400_000)
  if (diff === 0) return 'Today'
  if (diff === -1) return 'Yesterday'
  return date.toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
}

export function timeLabel(date: Date): string {
  return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

function words(value: string): Set<string> {
  return new Set(
    value
      .toLocaleLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter((word) => word.length > 2),
  )
}

export type MeetingLink = {
  meeting: SourceRef
  reason: string
}

/**
 * A deliberately conservative, in-memory link. It only claims a meeting when
 * a calendar event is within the day and the titles share a real word. Nothing
 * about the link is persisted.
 */
export function linkMeeting(source: SourceRef, meetings: SourceRef[]): MeetingLink | null {
  if (source.kind === 'calendar') return null
  const date = sourceDate(source)
  if (!date) return null
  const sourceWords = words(source.title)

  let best: { meeting: SourceRef; score: number; offset: number } | null = null

  for (const meeting of meetings) {
    const start = sourceDate(meeting)
    if (!start) continue
    const offset = (date.getTime() - start.getTime()) / 3_600_000
    if (offset < -2 || offset > 24) continue

    const overlap = [...words(meeting.title)].filter((word) => sourceWords.has(word)).length
    const score = overlap * 2
    if (score > 0 && (!best || score > best.score)) {
      best = { meeting, score, offset }
    }
  }

  if (!best) return null
  const minutes = Math.max(1, Math.round(Math.abs(best.offset) * 60))
  const distance = minutes < 60 ? `${minutes} min` : `${Math.round(minutes / 60)} h`
  const reason =
    best.offset >= 0
      ? `Created ${distance} after the meeting`
      : `Created ${distance} before the meeting`
  return { meeting: best.meeting, reason }
}
