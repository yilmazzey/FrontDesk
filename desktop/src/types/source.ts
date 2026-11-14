export type SourceKind = 'file' | 'mail' | 'onenote' | 'ocr'

export type SourceRef = {
  id: string
  grantId: string
  kind: SourceKind
  title: string
  location: string
  modified: string
  hash: string
}

export type SourceGrant = {
  id: string
  kind: 'file' | 'mail' | 'onenote'
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

export type Clarification = {
  question: string
  options: string[]
}

export type AnswerStatus = 'answered' | 'insufficient' | 'needs_clarification'

export type Answer = {
  status: AnswerStatus
  text: string
  citations: Citation[]
  clarification: Clarification | null
  model: string
}

export type ModelRef = {
  id: string
  name: string
  path: string
  sizeBytes: number
  kind: 'gguf'
  status: 'ready' | 'importing' | 'unavailable'
}

export type AppInfo = {
  dataDir: string
  modelsDir: string
  selectedModel: string | null
}

export type AuditEntry = {
  at: string
  action: string
  sourceId?: string | null
  scope?: string | null
}
