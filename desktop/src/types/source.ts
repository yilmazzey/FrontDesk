export type SourceKind = 'file' | 'mail' | 'calendar' | 'onenote' | 'ocr' | 'web'

export type SourceRef = {
  id: string
  grantId: string
  kind: SourceKind
  title: string
  location: string
  modified: string
  hash: string
  /** Live calendar attendees only; metadata, never persisted. */
  people?: string[]
}

export type SearchHit = {
  source: SourceRef
  excerpt: string
}

export type SourceGrant = {
  id: string
  kind: 'file' | 'mail' | 'calendar' | 'onenote' | 'web'
  scope: string
  title: string
  grantedAt: string
}

export type Excerpt = {
  sourceId: string
  sourceType: SourceKind
  title: string
  location: string
  timestamp: string
  text: string
}

export type Citation = {
  id: string
  sourceId: string
  sourceType: SourceKind
  title: string
  location: string
  timestamp: string
  excerpt: string
  deepLink?: string | null
}

export type ChatTurn = {
  role: 'user' | 'assistant'
  content: string
}

export type Clarification = {
  question: string
  options: string[]
}

export type AnswerStatus =
  | 'answered'
  | 'insufficient'
  | 'needs_clarification'
  | 'needs_setup'
  | 'error'

export type AnswerBasis =
  | 'sources'
  | 'model'
  | 'mixed'
  | 'web'
  | 'files_web'
  | 'web_mixed'
  | 'clock'
  | 'none'

export type Answer = {
  status: AnswerStatus
  text: string
  citations: Citation[]
  clarification: Clarification | null
  model: string
  basis: AnswerBasis
}

export type ModelRef = {
  id: string
  name: string
  path: string
  sizeBytes: number
  kind: 'gguf'
  status: 'ready' | 'importing' | 'unavailable'
}

export type AnswerMode = 'chat' | 'grounded'

export type AppInfo = {
  dataDir: string
  modelsDir: string
  selectedModel: string | null
  answerMode: AnswerMode
  savedFolder: string | null
  microsoftClientId: string | null
}

export type AuditEntry = {
  at: string
  action: string
  sourceId?: string | null
  scope?: string | null
}

export type ToolStatus = {
  key: string
  label: string
  installed: boolean
  detail: string | null
}

export type RuntimeStatus = {
  llamaInstalled: boolean
  llamaVersion: string | null
  llamaPath: string | null
  llamaTag: string
  llamaAsset: string | null
  llamaSizeMb: number
  tools: ToolStatus[]
  platform: string
  canAutoInstallOcr: boolean
  ocrHint: string
}

export type RuntimeProgress = {
  kind: string
  phase: 'download' | 'extract' | 'install' | 'done' | string
  message: string
  downloaded: number
  total: number
}

export type RuntimeKind = 'llama' | 'ocr' | 'all'

export type IndexStatus = {
  sources: number
  indexedSources: number
  chunks: number
  model: string
}

export type SavedClassification = 'briefing' | 'roadmap' | 'todo' | 'decision' | 'reference'

export type ConnectorCheck = {
  ok: boolean
  detail: string
}

export type MicrosoftDiagnostics = {
  connected: boolean
  account: string | null
  mail: ConnectorCheck
  calendar: ConnectorCheck
  onenote: ConnectorCheck
}

export type SavedItem = {
  id: string
  path: string
  title: string
  classification: SavedClassification
  savedAt: string
  body: string
  sources: string[]
}

export type MicrosoftProfile = {
  displayName: string | null
  mail: string | null
  userPrincipalName: string | null
}

export type DeviceCodePrompt = {
  userCode: string
  verificationUri: string
  message: string
  intervalSeconds: number
}

export type DeviceCodePoll =
  | { status: 'pending'; intervalSeconds: number }
  | { status: 'connected' }

export type NoteSnippet = {
  sourceId: string
  title: string
  timestamp: string
  excerpt: string
}

export type PersonPulse = {
  name: string
  lastMet: string | null
  nextMet: string | null
  meetingCount: number
  due: boolean
  note: NoteSnippet | null
}

export type OpenLoop = {
  id: string
  direction: 'mine' | 'waiting'
  text: string
  person: string | null
  sourceId: string
  sourceTitle: string
  timestamp: string
}

export type NextUp = {
  source: SourceRef
  people: PersonPulse[]
  actions: OpenLoop[]
}

export type ManagerSnapshot = {
  nextUp: NextUp | null
  people: PersonPulse[]
  openLoops: OpenLoop[]
  scannedSources: number
}
