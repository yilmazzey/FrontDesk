import { invoke } from '@tauri-apps/api/core'
import type {
  Answer,
  AnswerMode,
  AppInfo,
  AuditEntry,
  Citation,
  Excerpt,
  ModelRef,
  SourceGrant,
  SourceRef,
} from '../types/source'

export const inTauri = () =>
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

const FIXTURE: { id: string; title: string; body: string }[] = [
  {
    id: 'welcome',
    title: 'Welcome to FrontDesk',
    body: 'FrontDesk is a local-first workspace. Nothing is copied. The assistant reads only the sources you currently allow, on the fly. Knowledge stays where it was saved, and the original file remains the source of truth. Honest by design: if an answer is not in the allowed notes, FrontDesk says so plainly and does not guess. Every claim must be tied to a source. You can revoke access at any time from the Access page.',
  },
  {
    id: 'protocol',
    title: 'Study protocol — working notes',
    body: 'The protocol review is scheduled for Friday at 09:30. The consent wording needs a second pass before the site sync. The retention window for scanned documents is seven years. The second site does not need its own approval, but the local ethics contact must be notified. Scanned patient pages are processed with OCR and the text is kept only for the duration of the answer.',
  },
  {
    id: 'citations',
    title: 'Citations that hold up',
    body: 'Every answer should point at a paragraph, not a whole document. Show the quote inline and let the reader jump to it. A citation stores the exact fetched excerpt, never a paraphrase. If the model adds a claim without a citation, the verifier drops the claim. When the evidence is thin, the correct response is to say that the allowed sources do not contain the answer.',
  },
]

const now = () => new Date().toISOString()

let browserGrants: SourceGrant[] = [
  {
    id: 'fixture:desk',
    kind: 'file',
    scope: 'fixture',
    title: 'FrontDesk sample notes',
    grantedAt: now(),
  },
]

let browserMode: AnswerMode = 'chat'

function browserSources(): SourceRef[] {
  if (!browserGrants.some((grant) => grant.id === 'fixture:desk')) return []
  return FIXTURE.map((note) => ({
    id: `fixture:${note.id}`,
    grantId: 'fixture:desk',
    kind: 'file' as const,
    title: note.title,
    location: `fixture://${note.id}`,
    modified: now(),
    hash: String(note.body.length),
  }))
}

function words(value: string): string[] {
  const stop = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'if', 'then', 'that', 'this', 'is', 'are', 'was',
    'were', 'to', 'of', 'in', 'on', 'for', 'with', 'as', 'by', 'at', 'from', 'it', 'its',
    'i', 'you', 'we', 'they', 'do', 'does', 'did', 'what', 'which', 'who', 'when', 'where',
    'why', 'how', 'about', 'can', 'could', 'should', 'would', 'will', 'have', 'has', 'had',
    'not', 'no', 'me', 'my', 'our', 'your', 'their', 'there', 'here', 'so', 'very', 'just',
  ])
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 1 && !stop.has(word))
}

function browserAsk(question: string): Answer {
  const noModel: Answer = {
    status: 'error',
    text:
      browserMode === 'chat'
        ? 'Chat mode needs the desktop app and a local model. The browser preview cannot run a model, so it can only quote the sample notes in Sources-only mode.'
        : 'Not in your allowed sources. No sources are currently granted.',
    citations: [],
    clarification: null,
    model: 'browser-preview',
    basis: 'none',
  }

  if (!browserGrants.some((grant) => grant.id === 'fixture:desk')) {
    return noModel
  }

  const query = words(question)
  if (!query.length) {
    return {
      status: 'insufficient',
      text: 'Ask a question about one of your allowed sources.',
      citations: [],
      clarification: null,
      model: 'browser-preview',
      basis: 'none',
    }
  }

  const scored = FIXTURE.map((note) => {
    const body = `${note.title} ${note.body}`.toLowerCase()
    const score = query.reduce((total, word) => total + (body.includes(word) ? 1 : 0), 0)
    return { note, score }
  }).sort((a, b) => b.score - a.score)

  if (!scored[0] || scored[0].score === 0) {
    if (browserMode === 'chat') return noModel
    return {
      status: 'insufficient',
      text: 'Not in your allowed sources. I only answer from what you have granted, and I did not find that there.',
      citations: [],
      clarification: null,
      model: 'browser-preview',
      basis: 'none',
    }
  }

  const best = scored[0].note
  const sentences = best.body.split(/(?<=[.!?])\s+/)
  const sentence =
    sentences
      .map((value) => ({
        value,
        score: words(value).filter((word) => query.includes(word)).length,
      }))
      .sort((a, b) => b.score - a.score)[0]?.value ?? best.body.slice(0, 300)

  const citation: Citation = {
    id: `c:${best.id}`,
    sourceId: `fixture:${best.id}`,
    sourceType: 'file',
    title: best.title,
    location: 'part 1',
    timestamp: now(),
    excerpt: sentence,
    deepLink: null,
  }

  return {
    status: 'answered',
    text: `From “${best.title}”: ${sentence}`,
    citations: [citation],
    clarification: null,
    model: 'browser-preview',
    basis: 'sources',
  }
}

async function call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  return invoke<T>(command, args)
}

export const api = {
  ping: async (): Promise<string> =>
    inTauri() ? call<string>('ping') : 'pong from the browser preview',

  listGrants: async (): Promise<SourceGrant[]> =>
    inTauri() ? call<SourceGrant[]>('list_grants') : browserGrants,

  grantFolder: async (path: string): Promise<SourceGrant> => {
    if (inTauri()) return call<SourceGrant>('grant_folder', { path })
    const grant: SourceGrant = {
      id: `file:${path}`,
      kind: 'file',
      scope: path,
      title: path.split('/').pop() || path,
      grantedAt: now(),
    }
    browserGrants = [...browserGrants.filter((item) => item.id !== grant.id), grant]
    return grant
  },

  grantFixture: async (): Promise<SourceGrant> => {
    if (inTauri()) return call<SourceGrant>('grant_fixture')
    const grant: SourceGrant = {
      id: 'fixture:desk',
      kind: 'file',
      scope: 'fixture',
      title: 'FrontDesk sample notes',
      grantedAt: now(),
    }
    browserGrants = [...browserGrants.filter((item) => item.id !== grant.id), grant]
    return grant
  },

  revokeGrant: async (id: string): Promise<SourceGrant[]> => {
    if (inTauri()) return call<SourceGrant[]>('revoke_grant', { id })
    browserGrants = browserGrants.filter((grant) => grant.id !== id)
    return browserGrants
  },

  listSources: async (): Promise<SourceRef[]> =>
    inTauri() ? call<SourceRef[]>('list_sources') : browserSources(),

  readSource: async (id: string): Promise<Excerpt> => {
    if (inTauri()) return call<Excerpt>('read_source', { id })
    const note = FIXTURE.find((item) => id === `fixture:${item.id}`)
    if (!note) throw new Error('That source is no longer in your allowed set.')
    return {
      sourceId: `fixture:${note.id}`,
      sourceType: 'file',
      title: note.title,
      location: `fixture://${note.id}`,
      timestamp: now(),
      text: note.body,
    }
  },

  ask: async (question: string): Promise<Answer> =>
    inTauri() ? call<Answer>('ask', { question }) : browserAsk(question),

  listModels: async (): Promise<ModelRef[]> =>
    inTauri() ? call<ModelRef[]>('list_models') : [],

  selectModel: async (id: string | null): Promise<AppInfo> => {
    if (inTauri()) return call<AppInfo>('select_model', { id })
    return {
      dataDir: 'browser://data',
      modelsDir: 'browser://models',
      selectedModel: id,
      answerMode: browserMode,
    }
  },

  selectMode: async (mode: AnswerMode): Promise<AppInfo> => {
    if (inTauri()) return call<AppInfo>('select_mode', { mode })
    browserMode = mode
    return {
      dataDir: 'browser://data',
      modelsDir: 'browser://models',
      selectedModel: null,
      answerMode: browserMode,
    }
  },

  warmModel: async (id: string): Promise<string> => {
    if (inTauri()) return call<string>('warm_model', { id })
    throw new Error('Model loading needs the desktop app.')
  },

  appInfo: async (): Promise<AppInfo> =>
    inTauri()
      ? call<AppInfo>('app_info')
      : {
          dataDir: 'browser://data',
          modelsDir: 'browser://models',
          selectedModel: null,
          answerMode: browserMode,
        },

  listAudit: async (limit = 50): Promise<AuditEntry[]> =>
    inTauri() ? call<AuditEntry[]>('list_audit', { limit }) : [],

  clearAudit: async (): Promise<void> => {
    if (inTauri()) await call<void>('clear_audit')
  },

  openOriginal: async (id: string): Promise<void> => {
    if (inTauri()) await call<void>('open_original', { id })
  },
}
