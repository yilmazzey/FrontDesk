import { useEffect, useState } from 'react'
import { site } from '../config'

const VERSION = __APP_VERSION__
const BASE = 'https://github.com/yilmazzey/FrontDesk/releases/latest/download'
const assets = {
  'mac-arm': { file: `FrontDesk_${VERSION}_aarch64.dmg`, label: 'macOS (Apple Silicon)' },
  'mac-intel': { file: `FrontDesk_${VERSION}_x64.dmg`, label: 'macOS (Intel)' },
  windows: { file: `FrontDesk_${VERSION}_x64-setup.exe`, label: 'Windows' },
  linux: { file: `FrontDesk_${VERSION}_amd64.AppImage`, label: 'Linux' },
} as const

type AssetKey = keyof typeof assets

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
  ['macOS · Apple Silicon', '.dmg · ~4 MB', 'mac-arm'],
  ['macOS · Intel', '.dmg · ~4 MB', 'mac-intel'],
  ['Windows 10/11 · 64-bit', '.exe · ~6 MB', 'windows'],
  ['Linux · 64-bit AppImage', '~15 MB · no install', 'linux'],
  ['Linux · Debian / Ubuntu', '.deb · ~6 MB', null],
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

  return (
    <main className="monitorPage">
      <div className="monitorDownload">
        <div className="monitorDownload__intro">
          <p className="monitorDownload__eyebrow">{site.hackathon} · Desktop</p>

          <h1 className="monitorDownload__title">
            Take the desk
            <br />
            <em>with you.</em>
          </h1>

          <p className="monitorDownload__lede">
            The desktop app is where notes, OCR, the local model and your Microsoft account live.
            The build is small because the window uses the system webview; your files never leave
            the machine. A language model is optional and downloaded separately.
          </p>

          <div className="monitorDownload__actions">
            <a className="btn btn--primary" href={`${BASE}/${primaryAsset.file}`}>
              Download for {primaryAsset.label} <span aria-hidden="true">↓</span>
            </a>
            <a className="btn btn--ghost" href={`${BASE}/${assets.linux.file}`}>
              Linux AppImage <span aria-hidden="true">↓</span>
            </a>
            <a
              className="btn btn--ghost"
              href="https://github.com/yilmazzey/FrontDesk/releases/latest"
            >
              All releases <span aria-hidden="true">→</span>
            </a>
            <span className="monitorDownload__pill">v{__APP_VERSION__} · unsigned preview</span>
          </div>

          <p className="monitorDownload__notice">
            The preview is signed ad-hoc, so macOS asks you to confirm the first launch (System
            Settings → Privacy &amp; Security → Open Anyway). Windows may show a SmartScreen prompt
            until a code-signing certificate is added.
          </p>
        </div>

        <div className="monitorDownload__releases">
          <div className="monitorDownload__sizes" aria-label="Downloads and sizes">
            {downloads.map(([label, meta, asset]) =>
              asset ? (
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
                  <b>{meta}</b>
                </div>
              ),
            )}
          </div>

          <p className="monitorDownload__notice">
            Installed, the app is about 14 MB. On first model use it downloads and unpacks{' '}
            <code>llama-server</code> into its own app-data folder — no Homebrew or PATH step. Text
            PDFs are read in-process; OCR for scans offers a one-click helper install. Add a GGUF
            model only if you want generative answers, otherwise FrontDesk answers extractively
            from your files.
          </p>
        </div>
      </div>
    </main>
  )
}
