import { invoke } from '@tauri-apps/api/core'
import type {
  Answer,
  AnswerMode,
  AppInfo,
  AuditEntry,
  ChatTurn,
  Citation,
  DeviceCodePoll,
  DeviceCodePrompt,
  Excerpt,
  IndexStatus,
  ManagerSnapshot,
  MicrosoftDiagnostics,
  ModelRef,
  MicrosoftProfile,
  OpenLoop,
  PersonPulse,
  RuntimeKind,
  RuntimeProgress,
  RuntimeStatus,
  SavedClassification,
  SavedItem,
  SearchHit,
  SourceGrant,
  SourceRef,
} from '../types/source'

export const inTauri = () =>
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

import fixtureNotes from '../fixtures/notes.json'

const FIXTURE: { id: string; title: string; body: string }[] = fixtureNotes

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

function browserManagerSnapshot(): ManagerSnapshot {
  const next = new Date()
  next.setHours(10, 0, 0, 0)
  if (next.getTime() <= Date.now()) next.setDate(next.getDate() + 1)
  const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString()
  const timestamp = daysAgo(2)
  const managerNote = {
    sourceId: 'fixture:manager-one-on-one',
    title: '1:1 — Priya Shah — working notes',
    timestamp,
    excerpt: 'Priya owns the launch scope. I promised to send the revised scope by Friday.',
  }
  const openLoops: OpenLoop[] = [
    {
      id: 'demo:loop:1',
      direction: 'mine',
      text: 'Send Priya the revised launch scope by Friday.',
      person: 'Priya Shah',
      sourceId: 'fixture:manager-one-on-one',
      sourceTitle: '1:1 — Priya Shah — working notes',
      timestamp,
    },
    {
      id: 'demo:loop:2',
      direction: 'waiting',
      text: 'Waiting on Priya for the budget sign-off.',
      person: 'Priya Shah',
      sourceId: 'fixture:manager-one-on-one',
      sourceTitle: '1:1 — Priya Shah — working notes',
      timestamp,
    },
    {
      id: 'demo:loop:3',
      direction: 'mine',
      text: 'Ask Marcus for the updated vendor shortlist by Monday.',
      person: 'Marcus Lee',
      sourceId: 'fixture:manager-one-on-one',
      sourceTitle: '1:1 — Priya Shah — working notes',
      timestamp,
    },
    {
      id: 'demo:loop:4',
      direction: 'waiting',
      text: 'Waiting on Legal for the data-processing addendum.',
      person: null,
      sourceId: 'mail:legal',
      sourceTitle: 'Legal review — data-processing addendum',
      timestamp: daysAgo(5),
    },
    {
      id: 'demo:loop:5',
      direction: 'mine',
      text: 'Share the hiring plan with Elena before Thursday.',
      person: 'Elena Rossi',
      sourceId: 'fixture:hiring',
      sourceTitle: 'Hiring plan — first draft',
      timestamp: daysAgo(8),
    },
  ]
  const people: PersonPulse[] = [
    {
      name: 'Marcus Lee',
      lastMet: daysAgo(43),
      nextMet: next.toISOString(),
      meetingCount: 6,
      due: true,
      note: {
        sourceId: 'fixture:manager-one-on-one',
        title: '1:1 — Priya Shah — working notes',
        timestamp,
        excerpt: 'Follow up with Marcus on the vendor shortlist before the Tuesday review.',
      },
    },
    {
      name: 'Priya Shah',
      lastMet: daysAgo(12),
      nextMet: next.toISOString(),
      meetingCount: 9,
      due: false,
      note: managerNote,
    },
    {
      name: 'Elena Rossi',
      lastMet: daysAgo(8),
      nextMet: null,
      meetingCount: 4,
      due: false,
      note: {
        sourceId: 'fixture:hiring',
        title: 'Hiring plan — first draft',
        timestamp: daysAgo(8),
        excerpt: 'Elena asked for the hiring plan to include a second designer.',
      },
    },
    {
      name: 'Sam Okafor',
      lastMet: daysAgo(61),
      nextMet: null,
      meetingCount: 3,
      due: true,
      note: {
        sourceId: 'mail:budget',
        title: 'Q1 budget risk',
        timestamp: daysAgo(20),
        excerpt: 'Sam flagged the Q1 budget risk and wants a decision before the next board pack.',
      },
    },
  ]

  return {
    nextUp: {
      source: {
        id: 'demo:calendar:1',
        grantId: 'demo:calendar',
        kind: 'calendar',
        title: 'Launch review — Priya Shah & Marcus Lee',
        location: 'Microsoft Calendar',
        modified: next.toISOString(),
        hash: 'demo',
        people: ['Priya Shah', 'Marcus Lee'],
      },
      people: people.filter((person) => ['Priya Shah', 'Marcus Lee'].includes(person.name)),
      actions: openLoops
        .filter((loop) => loop.person === 'Priya Shah' || loop.person === 'Marcus Lee')
        .slice(0, 3),
    },
    people,
    openLoops,
    scannedSources: 4,
  }
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
  const clock = question.trim().toLowerCase().replace(/[?.!]+$/, '')
  if (
    [
      'what day is it',
      'what day is today',
      'what is the date',
      "what's the date",
      "today's date",
      'what time is it',
      "what's the time",
      'current date',
      'current time',
    ].includes(clock)
  ) {
    const now = new Date()
    return {
      status: 'answered',
      text: `It is ${now.toLocaleDateString(undefined, {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })} at ${now.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}.`,
      citations: [],
      clarification: null,
      model: 'local-clock',
      basis: 'clock',
    }
  }

  const noModel: Answer = {
    status: 'error',
    text:
      browserMode === 'chat'
        ? 'The assistant needs the desktop app and a local model. The browser preview cannot run one.'
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
    text: `From “${best.title}”: ${sentence} [1]`,
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

  beginMicrosoftSignIn: async (clientId: string): Promise<DeviceCodePrompt> => {
    if (inTauri()) return call<DeviceCodePrompt>('begin_sign_in', { clientId })
    throw new Error('Microsoft sign-in needs the desktop app.')
  },

  pollMicrosoftSignIn: async (): Promise<DeviceCodePoll> => {
    if (inTauri()) return call<DeviceCodePoll>('poll_sign_in')
    throw new Error('Microsoft sign-in needs the desktop app.')
  },

  cancelMicrosoftSignIn: async (): Promise<void> => {
    if (inTauri()) await call<void>('cancel_sign_in')
  },

  getMicrosoftProfile: async (): Promise<MicrosoftProfile | null> =>
    inTauri() ? call<MicrosoftProfile | null>('get_profile') : null,

  microsoftDiagnostics: async (): Promise<MicrosoftDiagnostics | null> =>
    inTauri() ? call<MicrosoftDiagnostics>('microsoft_diagnostics') : null,

  grantWebSearch: async (): Promise<SourceGrant[]> => {
    if (inTauri()) return call<SourceGrant[]>('grant_web_search')
    throw new Error('Web search access needs the desktop app.')
  },

  grantMicrosoftSources: async (): Promise<SourceGrant[]> => {
    if (inTauri()) return call<SourceGrant[]>('grant_microsoft_sources')
    throw new Error('Microsoft source access needs the desktop app.')
  },

  disconnectMicrosoft: async (): Promise<SourceGrant[]> => {
    if (inTauri()) return call<SourceGrant[]>('disconnect_microsoft')
    throw new Error('Microsoft source access needs the desktop app.')
  },

  revokeGrant: async (id: string): Promise<SourceGrant[]> => {
    if (inTauri()) return call<SourceGrant[]>('revoke_grant', { id })
    browserGrants = browserGrants.filter((grant) => grant.id !== id)
    return browserGrants
  },

  listSources: async (): Promise<SourceRef[]> =>
    inTauri() ? call<SourceRef[]>('list_sources') : browserSources(),

  searchSources: async (query: string): Promise<SearchHit[]> => {
    if (inTauri()) return call<SearchHit[]>('search_sources', { query })
    const terms = query.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)
    if (!terms.length) return []
    const sources = browserSources()
    const excerpts = await Promise.all(sources.map((source) => api.readSource(source.id)))
    return sources
      .map((source, index) => ({ source, text: excerpts[index].text }))
      .filter(({ source, text }) => {
        const words = `${source.title} ${source.location} ${source.kind} ${text}`
          .toLowerCase()
          .split(/[^a-z0-9]+/)
        return terms.every((term) => words.includes(term))
      })
      .map(({ source, text }) => {
        const lower = text.toLowerCase()
        const offset = terms
          .map((term) => lower.indexOf(term))
          .filter((index) => index >= 0)
          .sort((left, right) => left - right)[0] ?? 0
        const start = Math.max(0, offset - 120)
        const end = Math.min(text.length, offset + 300)
        return {
          source,
          excerpt: `${start > 0 ? '…' : ''}${text.slice(start, end).replace(/\s+/g, ' ').trim()}${
            end < text.length ? '…' : ''
          }`,
        }
      })
  },

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

  ask: async (question: string, history: ChatTurn[] = []): Promise<Answer> =>
    inTauri() ? call<Answer>('ask', { question, history }) : browserAsk(question),

  managerSnapshot: async (selfName?: string | null): Promise<ManagerSnapshot> =>
    inTauri()
      ? call<ManagerSnapshot>('manager_snapshot', { selfName: selfName ?? null })
      : browserManagerSnapshot(),

  listModels: async (): Promise<ModelRef[]> =>
    inTauri() ? call<ModelRef[]>('list_models') : [],

  selectModel: async (id: string | null): Promise<AppInfo> => {
    if (inTauri()) return call<AppInfo>('select_model', { id })
    return {
      dataDir: 'browser://data',
      modelsDir: 'browser://models',
      selectedModel: id,
      answerMode: browserMode,
      savedFolder: null,
      microsoftClientId: null,
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
      savedFolder: null,
      microsoftClientId: null,
    }
  },

  setMicrosoftClientId: async (clientId: string | null): Promise<AppInfo> => {
    if (inTauri()) return call<AppInfo>('set_microsoft_client_id', { clientId })
    return {
      dataDir: 'browser://data',
      modelsDir: 'browser://models',
      selectedModel: null,
      answerMode: browserMode,
      savedFolder: null,
      microsoftClientId: clientId,
    }
  },

  warmModel: async (id: string): Promise<string> => {
    if (inTauri()) return call<string>('warm_model', { id })
    throw new Error('Model loading needs the desktop app.')
  },

  indexStatus: async (): Promise<IndexStatus | null> =>
    inTauri() ? call<IndexStatus>('index_status') : null,

  buildIndex: async (): Promise<IndexStatus> => {
    if (inTauri()) return call<IndexStatus>('build_index')
    throw new Error('The semantic index needs the desktop app.')
  },

  clearIndex: async (): Promise<IndexStatus> => {
    if (inTauri()) return call<IndexStatus>('clear_index')
    throw new Error('The semantic index needs the desktop app.')
  },

  runtimeStatus: async (): Promise<RuntimeStatus | null> =>
    inTauri() ? call<RuntimeStatus>('runtime_status') : null,

  installRuntime: async (kind: RuntimeKind): Promise<RuntimeStatus> => {
    if (inTauri()) return call<RuntimeStatus>('install_runtime', { kind })
    throw new Error('Runtime installation needs the desktop app.')
  },

  onRuntimeProgress: async (
    handler: (progress: RuntimeProgress) => void,
  ): Promise<() => void> => {
    if (!inTauri()) return () => {}
    const { listen } = await import('@tauri-apps/api/event')
    return listen<RuntimeProgress>('runtime-progress', (event) => handler(event.payload))
  },

  downloadModel: async (): Promise<string> => {
    if (inTauri()) return call<string>('download_model')
    throw new Error('The model downloader needs the desktop app.')
  },

  cancelModelDownload: async (): Promise<void> => {
    if (inTauri()) await call<void>('cancel_model_download')
  },


  appInfo: async (): Promise<AppInfo> =>
    inTauri()
      ? call<AppInfo>('app_info')
      : {
          dataDir: 'browser://data',
          modelsDir: 'browser://models',
          selectedModel: null,
          answerMode: browserMode,
          savedFolder: null,
          microsoftClientId: null,
        },

  listAudit: async (limit = 50): Promise<AuditEntry[]> =>
    inTauri() ? call<AuditEntry[]>('list_audit', { limit }) : [],

  clearAudit: async (): Promise<void> => {
    if (inTauri()) await call<void>('clear_audit')
  },

  openOriginal: async (id: string): Promise<void> => {
    if (inTauri()) await call<void>('open_original', { id })
  },

  saveAnswer: async (args: {
    folder: string
    classification: SavedClassification
    title: string
    body: string
    sources: string[]
  }): Promise<string> => {
    if (inTauri()) return call<string>('save_answer', args)
    throw new Error('Saving an answer needs the desktop app.')
  },

  setSavedFolder: async (folder: string): Promise<string> => {
    if (inTauri()) return call<string>('set_saved_folder', { folder })
    throw new Error('The folder picker needs the desktop app.')
  },

  listSaved: async (): Promise<SavedItem[]> =>
    inTauri() ? call<SavedItem[]>('list_saved') : [],

  openSaved: async (path: string): Promise<void> => {
    if (inTauri()) await call<void>('open_saved', { path })
  },

  revealPath: async (path: string): Promise<void> => {
    if (inTauri()) await call<void>('reveal_path', { path })
  },

  openUrl: async (url: string): Promise<void> => {
    if (inTauri()) await call<void>('open_url', { url })
    else window.open(url, '_blank', 'noopener,noreferrer')
  },

  openExternal: async (url: string): Promise<void> => {
    if (inTauri()) await call<void>('open_external', { url })
    else window.open(url, '_blank', 'noopener,noreferrer')
  },
}
