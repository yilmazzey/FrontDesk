import { useEffect, useState } from 'react'
import HackathonMark from '../components/HackathonMark'

const VERSION = __APP_VERSION__
const BASE =
  import.meta.env.VITE_DOWNLOAD_BASE?.trim() ||
  'https://github.com/yilmazzey/FrontDesk/releases/latest/download'
const assets = {
  'mac-arm': { file: `FrontDesk_${VERSION}_aarch64.dmg`, label: 'macOS (Apple Silicon)' },
  'mac-intel': { file: `FrontDesk_${VERSION}_x64.dmg`, label: 'macOS (Intel)' },
  windows: { file: `FrontDesk_${VERSION}_x64-setup.exe`, label: 'Windows' },
  linux: { file: `FrontDesk_${VERSION}_amd64.AppImage`, label: 'Linux' },
} as const

type AssetKey = keyof typeof assets

// Only the Apple Silicon DMG is attached to the current preview release.
// Keep the other platform rows honest until their installers are published.
const available = new Set<AssetKey>(['mac-arm'])
const MODEL_PAGE =
  'https://huggingface.co/bartowski/microsoft_Phi-4-mini-instruct-GGUF'

function detectPlatform(): AssetKey {
  if (typeof navigator === 'undefined') return 'mac-arm'
  const platform = navigator.platform || navigator.userAgent || ''
  if (/win/i.test(platform)) return 'windows'
  if (/linux/i.test(platform)) return 'linux'
  // Safari reports "MacIntel" on Apple Silicon too, so default Macs to arm64
  // and only switch to Intel when Chromium exposes the real architecture.
  return 'mac-arm'
}

const downloads = [
  ['macOS · Apple Silicon', '.dmg', 'mac-arm'],
  ['macOS · Intel', '.dmg', 'mac-intel'],
  ['Windows 10/11 · 64-bit', '.exe', 'windows'],
  ['Linux · 64-bit AppImage', 'AppImage · no install', 'linux'],
  ['Linux · Debian / Ubuntu', '.deb · coming soon', null],
  ['llama-server (auto-installed)', '~16 MB · in-app', null],
  ['Local model (optional)', 'GGUF · 2.3 GB', null],
] as const

export default function MonitorPage() {
  const [primary, setPrimary] = useState<AssetKey>(detectPlatform)

  useEffect(() => {
    const data = (navigator as Navigator & {
      userAgentData?: { platform?: string; getHighEntropyValues?: (hints: string[]) => Promise<{ architecture?: string }> }
    }).userAgentData
    if (!/mac/i.test(data?.platform ?? navigator.platform ?? '') || !data?.getHighEntropyValues) return
    let active = true
    data
      .getHighEntropyValues(['architecture'])
      .then((values) => {
        if (active && values.architecture === 'x86') setPrimary('mac-intel')
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [])

  const primaryAsset = assets[primary]
  const primaryAvailable = available.has(primary)
  const releasesUrl = 'https://github.com/yilmazzey/FrontDesk/releases/latest'

  return (
    <main className="monitorPage">
      <div className="monitorDownload">
        <div className="monitorDownload__intro">
          <p className="monitorDownload__eyebrow"><HackathonMark compact suffix="Desktop" /></p>

          <h1 className="monitorDownload__title">
            Take the desk
            <br />
            <em className="monitorDownload__hand">with you.</em>
          </h1>

          <p className="monitorDownload__lede">
            The desktop app is where notes, OCR, the local model and your Microsoft account live.
            The build is small because the window uses the system webview; your files never leave
            the machine. A language model is optional and downloaded separately.
          </p>

          <div className="monitorDownload__actions">
            {primaryAvailable ? (
              <a className="btn btn--primary" href={`${BASE}/${primaryAsset.file}`}>
                Download for {primaryAsset.label} <span aria-hidden="true">↓</span>
              </a>
            ) : (
              <a className="btn btn--primary" href={releasesUrl}>
                See available downloads <span aria-hidden="true">→</span>
              </a>
            )}
            <a className="btn btn--ghost" href={releasesUrl}>
              All releases <span aria-hidden="true">→</span>
            </a>
            <span className="monitorDownload__pill">v{__APP_VERSION__} · unsigned preview</span>
          </div>

          {!primaryAvailable ? (
            <p className="monitorDownload__notice">
              This preview currently ships <strong>macOS Apple Silicon</strong> only. Intel macOS,
              Windows and Linux installers are not published yet; use All releases to see what is
              available.
            </p>
          ) : null}

          <p className="monitorDownload__notice">
            The preview is signed ad-hoc, so macOS asks you to confirm the first launch (System
            Settings → Privacy &amp; Security → Open Anyway). Windows may show a SmartScreen prompt
            until a code-signing certificate is added.
          </p>
        </div>

        <div className="monitorDownload__releases">
          <div className="monitorDownload__sizes" aria-label="Downloads and sizes">
            {downloads.map(([label, meta, asset]) =>
              asset && available.has(asset) ? (
                <a
                  className="monitorDownload__row"
                  href={`${BASE}/${assets[asset].file}`}
                  key={label}
                >
                  <span>{label}</span>
                  <b>{meta}</b>
                </a>
              ) : (
                <div className="monitorDownload__row" key={label}>
                  <span>{label}</span>
                  <b>{asset ? `${meta} · coming soon` : meta}</b>
                </div>
              ),
            )}
          </div>

          <p className="monitorDownload__notice">
            Installed, the app is about 55 MB. On first model use it downloads and unpacks{' '}
            <code>llama-server</code> into its own app-data folder — no Homebrew or PATH step. Text
            PDFs are read in-process; OCR for scans offers a one-click helper install. Add a GGUF
            model only if you want generative answers, otherwise FrontDesk answers extractively
            from your files. Meeting notes use an optional 57 MB Whisper model that is the same on
            macOS, Windows and Linux.
          </p>
        </div>

        <section className="monitorDownload__after" id="after-install" aria-labelledby="after-install-title">
          <p className="monitorDownload__eyebrow">After install</p>
          <h2 id="after-install-title">Open it, then add the model.</h2>
          <ol>
            <li>
              <strong>Open FrontDesk.</strong> If macOS blocks the unsigned preview, allow it in
              System Settings → Privacy &amp; Security → Open Anyway.
            </li>
            <li>
              <strong>Settings → Local model → Download Phi-4 Mini.</strong> It is about 2.3 GB,
              downloaded from Hugging Face, SHA-256 verified and run locally. Select Phi-4 Mini
              when it appears. FrontDesk also installs the llama.cpp runtime automatically; there
              is no Homebrew or PATH step.
            </li>
            <li>
              <strong>No model yet?</strong> Choose Extractive. It answers with quoted, cited
              excerpts from your files and needs no download.
            </li>
            <li>
              <strong>Settings → Sources &amp; access.</strong> Grant a local folder, connect
              Microsoft 365 read-only, and choose a folder for Saved answers.
            </li>
            <li>
              <strong>Meetings.</strong> The 57 MB Whisper model downloads on first use; audio is
              deleted after a successful transcription.
            </li>
          </ol>
          <p className="monitorDownload__notice">
            Prefer to manage the GGUF yourself? Download it from{' '}
            <a href={MODEL_PAGE} target="_blank" rel="noreferrer">
              Hugging Face
            </a>{' '}
            and put the file in the models folder shown in Settings → Local model.
          </p>
        </section>
      </div>
    </main>
  )
}
