import { invoke, isTauri } from '@tauri-apps/api/core'

export interface MicrosoftProfile {
  displayName: string | null
  mail: string | null
  userPrincipalName: string | null
}

export interface DeviceCodePrompt {
  userCode: string
  verificationUri: string
  message: string
  intervalSeconds: number
}

export type DeviceCodePoll =
  | { status: 'pending'; intervalSeconds: number }
  | { status: 'connected' }

export interface MicrosoftEvent {
  id: string
  subject: string | null
  start: {
    dateTime: string | null
    timeZone: string | null
  } | null
}

export interface MicrosoftMessage {
  id: string
  subject: string | null
  from: {
    emailAddress: {
      name: string | null
      address: string | null
    } | null
  } | null
}

export interface OneNotePage {
  id: string
  title: string | null
}

export type MicrosoftSourceKind = 'email' | 'calendar' | 'onenote'

export interface MicrosoftSource {
  id: string
  kind: MicrosoftSourceKind
  title: string
  detail: string | null
  date: string | null
  content: string
  contentType: string
}

export interface AnswerSource {
  citation: string
  kind: MicrosoftSourceKind
  title: string
  date: string | null
  excerpt: string
}

export interface MicrosoftDashboardData {
  profile: MicrosoftProfile
  events: MicrosoftEvent[]
  messages: MicrosoftMessage[]
  pages: OneNotePage[]
}

let microsoftSourcesCache: MicrosoftSource[] | null = null
let microsoftSourcesRequest: Promise<MicrosoftSource[] | null> | null = null

export const isDesktopApp = () => isTauri()

export function beginMicrosoftSignIn(clientId: string) {
  return invoke<DeviceCodePrompt>('begin_sign_in', { clientId })
}

export function pollMicrosoftSignIn() {
  return invoke<DeviceCodePoll>('poll_sign_in')
}

export function cancelMicrosoftSignIn() {
  return invoke<void>('cancel_sign_in')
}

export function disconnectMicrosoft() {
  return invoke<void>('disconnect').then(() => {
    clearMicrosoftSourceCache()
  })
}

export function getMicrosoftProfile() {
  return invoke<MicrosoftProfile | null>('get_profile')
}

export function getMicrosoftDashboardData(startDatetime: string, endDatetime: string) {
  return invoke<MicrosoftDashboardData | null>('get_dashboard_data', {
    startDatetime,
    endDatetime,
  })
}

export async function loadMicrosoftSources(refresh = false) {
  if (refresh) clearMicrosoftSourceCache()
  if (microsoftSourcesCache) return microsoftSourcesCache
  if (!microsoftSourcesRequest) {
    microsoftSourcesRequest = invoke<MicrosoftSource[] | null>('load_microsoft_sources')
  }

  const request = microsoftSourcesRequest
  try {
    const sources = await request
    if (sources) microsoftSourcesCache = sources
    return sources
  } finally {
    if (microsoftSourcesRequest === request) microsoftSourcesRequest = null
  }
}

export function clearMicrosoftSourceCache() {
  microsoftSourcesCache = null
  microsoftSourcesRequest = null
}

export function answerWithLocalModel(
  question: string,
  sources: AnswerSource[],
  model: string,
) {
  return invoke<string>('answer_with_local_model', { question, sources, model })
}

export function checkLocalModel(model: string) {
  return invoke<boolean>('check_local_model', { model })
}
