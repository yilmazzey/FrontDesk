const WEEKDAYS = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
]

function nextWeekday(index: number, hour = 9): Date {
  const date = new Date()
  const current = date.getDay()
  let ahead = (index - current + 7) % 7
  if (ahead === 0) ahead = 7
  date.setDate(date.getDate() + ahead)
  date.setHours(hour, 0, 0, 0)
  return date
}

export function defaultDueAt(): string {
  return nextWeekday(1).toISOString()
}

/**
 * Find a short action sentence in an answer, so the deadline form starts with
 * something useful rather than the whole answer.
 */
export function suggestDeadlineTitle(text: string): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  if (!clean) return ''
  const sentences = clean.split(/(?<=[.!?])\s+/)
  const score = (sentence: string) => {
    let value = 0
    if (/\b(by|before|due|deadline)\b/i.test(sentence)) value += 4
    if (/\b(follow up|send|submit|prepare|finish|complete|schedule|deliver)\b/i.test(sentence)) value += 3
    if (/\b(sign off|review|waiting for|waiting on)\b/i.test(sentence)) value += 2
    if (sentence.length > 24) value += 1
    return value
  }
  const candidate = [...sentences].sort((left, right) => score(right) - score(left))[0] ?? clean
  return candidate
    .replace(/^From\s+[“\"][^”\"]+[”\"]:\s*/i, '')
    .replace(/^From\s+[^:]{1,80}:\s*/i, '')
    .replace(/\[\d+\]/g, '')
    .replace(/^(you should|you're currently|you are currently|you need to|please|i need to|we need to)\s+/i, '')
    .replace(/^[-*•]\s*/, '')
    .trim()
    .slice(0, 140)
}

/**
 * A gentle date suggestion from phrases such as "by Monday" or "tomorrow".
 * The user can always change it in the dialog.
 */
export function suggestDeadlineDueAt(text: string): string {
  const lower = text.toLowerCase()
  if (/\btomorrow\b/.test(lower)) {
    const date = new Date()
    date.setDate(date.getDate() + 1)
    date.setHours(9, 0, 0, 0)
    return date.toISOString()
  }
  if (/\btoday\b/.test(lower)) {
    const date = new Date()
    date.setHours(17, 0, 0, 0)
    return date.toISOString()
  }
  const weekday = WEEKDAYS.findIndex((day) => new RegExp(`\\b${day}\\b`).test(lower))
  if (weekday >= 0) return nextWeekday(weekday).toISOString()
  if (/\bnext week\b/.test(lower)) {
    const date = new Date()
    date.setDate(date.getDate() + 7)
    date.setHours(9, 0, 0, 0)
    return date.toISOString()
  }
  return defaultDueAt()
}
