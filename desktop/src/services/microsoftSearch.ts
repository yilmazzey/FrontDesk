import type {
  MicrosoftSource,
  MicrosoftSourceKind,
} from './microsoft'

export type MicrosoftSourceFilter = 'all' | MicrosoftSourceKind

export interface MicrosoftSearchHit {
  citation: string
  source: MicrosoftSource
  excerpt: string
  score: number
}

const stopWords = new Set([
  'about',
  'an',
  'are',
  'did',
  'find',
  'for',
  'from',
  'have',
  'i',
  'in',
  'is',
  'me',
  'microsoft',
  'my',
  'of',
  'on',
  'or',
  'please',
  'regarding',
  'search',
  'show',
  'tell',
  'the',
  'to',
  'what',
  'when',
  'where',
  'which',
  'who',
])

function sourceText(source: MicrosoftSource) {
  if (source.contentType.toLowerCase() !== 'html') {
    return source.content.replace(/\s+/g, ' ').trim()
  }

  const parsed = new DOMParser().parseFromString(source.content, 'text/html')
  parsed.querySelectorAll('script, style, svg').forEach((element) => element.remove())
  return parsed.body.innerText.replace(/\s+/g, ' ').trim()
}

function tokenize(text: string) {
  return text.toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []
}

function countOccurrences(tokens: string[], term: string) {
  return tokens.reduce((count, token) => count + Number(token === term), 0)
}

function getExcerpt(text: string, terms: string[]) {
  const sentences = text.match(/[^.!?\n]+[.!?]?/g) ?? [text]
  return (
    sentences
      .map((sentence) => {
        const tokens = tokenize(sentence)
        return {
          text: sentence.trim(),
          score: terms.reduce((total, term) => total + countOccurrences(tokens, term), 0),
        }
      })
      .sort((left, right) => right.score - left.score)[0]?.text || text
  ).slice(0, 320)
}

export function searchMicrosoftSources(
  query: string,
  sources: MicrosoftSource[],
  filter: MicrosoftSourceFilter = 'all',
): MicrosoftSearchHit[] {
  const words = query.toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []
  const focusedWords = words.filter((word) => word.length > 2 && !stopWords.has(word))
  const terms = focusedWords.length ? focusedWords : words
  if (!terms.length) return []

  const hits = sources.flatMap((source) => {
    if (filter !== 'all' && source.kind !== filter) return []
    const text = sourceText(source)
    const title = tokenize(source.title)
    const detail = tokenize(source.detail ?? '')
    const body = tokenize(text)
    let score = 0
    for (const term of terms) {
      score +=
        countOccurrences(title, term) * 4 +
        countOccurrences(detail, term) * 2 +
        countOccurrences(body, term)
    }
    if (!score) return []

    return [
      {
        citation: '',
        source,
        excerpt: getExcerpt(text || source.detail || source.title, terms),
        score,
      },
    ]
  })

  return hits
    .sort((left, right) => right.score - left.score)
    .slice(0, 20)
    .map((hit, index) => ({ ...hit, citation: `S${index + 1}` }))
}
