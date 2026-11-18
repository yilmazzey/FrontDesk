# FrontDesk

A calm, local-first workspace built around a 3D desk. FrontDesk is our entry for the
**Pfizer & Newpage Solutions Hackathon Challenge**.

The repo is a two-workspace monorepo:

| Workspace | What it is | Dev URL |
| --- | --- | --- |
| `web/` | Public landing page: zoomable 3D desk, full-bleed slide gallery, notebook, and `/monitor` download view. | `http://localhost:5173` |
| `desktop/` | Tauri app with a local Rust core: Access grants, Timeline, Ask/Chat, Search, Saved, Settings and audit. | `http://localhost:5174` |

The 3D experience is real. The desktop app is now a working local-first MVP: it reads granted
folders on demand, answers with exact citations, and can run a GGUF model from `models/`. Ask is
one assistant: it cites your files when it uses them, labels answers that come from general
knowledge, and keeps replies short. A strict **Strict citations** setting is still available for
citation-or-refuse answers. Microsoft Graph can also provide read-only Outlook mail, calendar and
OneNote sources through the same permission and citation pipeline.

> **New to this branch?** Read [`WHATS_NEW.md`](WHATS_NEW.md) for a plain-English summary of what
> changed on `yilmazzey` compared with the earlier desktop skeleton, plus a one-screen quick start.

## Team

- [Damla Sanlı](https://www.linkedin.com/in/damlasanli/)
- [Anika Srivastava](https://www.linkedin.com/in/anika-srivastava-00b032229/)
- [Zeynep Yılmaz](https://www.linkedin.com/in/yilmazzey/)

---

## Set up on your computer (for the team)

### 1. Prerequisites

- **Node.js 20 or newer** — check with `node -v`
- **npm 10 or newer** — check with `npm -v`
- **Git**
- **Rust (stable) + Xcode Command Line Tools** — needed for the real desktop window
- **Ollama** — preferred local runtime for GGUF models.
- **llama.cpp** — automatically downloaded as a fallback if Ollama is unavailable (pinned
  `b12359` release under app-data `runtimes/llama/`). A `llama-server` on PATH or
  `FRONTDESK_LLAMA_SERVER` can be used as that fallback.

Optional extraction tools:

- PDFs are read **in-process** (pure Rust), so `pdftotext` is no longer required.
- `tesseract` + `poppler` for OCR of images and scanned pages; the macOS build offers a one-click
  Homebrew install in **Access → Local runtime**.

Local-only use needs no API keys. Microsoft Graph is optional and requires the
client ID described below; its mail, calendar and OneNote requests use Microsoft Graph.

macOS setup:

```bash
xcode-select --install
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
source "$HOME/.cargo/env"
# llama-server is installed as a fallback; OCR helpers are optional: brew install tesseract poppler
```

### 2. Clone the repo

```bash
git clone https://github.com/yilmazzey/FrontDesk.git
cd FrontDesk
git switch -c <your-feature-branch>
```

The current desktop app and web experience are on `main`. Create a feature branch before editing
so your changes stay isolated.

### 3. Install once from the repo root

```bash
npm install
```

This installs both workspaces. Do not run `npm install` separately inside `web/` or `desktop/`.

### 4. Run the landing page

```bash
npm run dev
# http://localhost:5173
```

### 5. Run the desktop app (second terminal)

Two modes, same UI:

```bash
# Real desktop window with the Rust core and local file access
npm run dev:tauri

# Browser preview only (sample sources, no file access)
npm run dev:desktop
# http://localhost:5174
```

The browser preview is useful for styling, but **only `dev:tauri` can grant a real folder,
read files, run OCR and answer from them.**

### 6. Add a local model (optional)

Drop a `.gguf` file into `models/` at the repo root. The current model is:

```
models/microsoft_Phi-4-mini-instruct-Q4_K_M.gguf
```

Then open **Access → Local model**, choose the model, and press **Load / warm model**. FrontDesk
imports the GGUF into Ollama first. If Ollama is unavailable, it downloads the pinned llama.cpp
build into the app-data `runtimes/llama/` folder and loads the GGUF directly.

**Access → Local runtime** shows the same status and can install on demand, with download progress.
Choose **Extractive** to demo the citation
pipeline instantly with no model at all.

### 7. Connect Microsoft (optional)

Register a Microsoft Entra application as a public client and enable device-code flow. Add the
delegated Microsoft Graph permissions `User.Read`, `Mail.Read`, `Calendars.Read`, `Notes.Read` and
`offline_access`. See [MICROSOFT_DEMO_SETUP.md](MICROSOFT_DEMO_SETUP.md) for the step-by-step
account and app-registration checklist. Copy `desktop/.env.example` to `desktop/.env.local` and set
`VITE_MICROSOFT_CLIENT_ID` to the application ID. Restart the desktop app, then use
**Settings → Microsoft account → Connect** and follow the device-code prompt. The app grants
read-only access to Outlook mail, calendar events and OneNote; each source can be revoked from
**Access**. Sign-in tokens stay in memory, so reconnect after restarting the app.

### 8. Build and test before you push

```bash
npm run build                  # type-check + build both workspaces
npm run build:web
npm run build:desktop
cd desktop/src-tauri && cargo test   # evals, OCR and model registry
```

### Troubleshooting

- **Port already in use** — stop the other process, or change `server.port` in
  `web/vite.config.ts` or `desktop/vite.config.ts`.
- **Dependencies look stale** — from the repo root:
  `rm -rf node_modules package-lock.json && npm install`
  (commit the regenerated lockfile only if dependencies actually changed).
- **The desk does not appear** — make sure WebGL is enabled and `web/public/desk.glb` exists.
  The loader waits on the model; give it a moment on the first load.
- **Windows** — use PowerShell or Git Bash; the npm scripts are cross-platform.
- **Weird cached UI** — hard-refresh (`Cmd/Ctrl + Shift + R`) after pulling.
- **`Port 5174 is already in use`** — the browser preview and `dev:tauri` share the port. Stop
  the other Vite process first (`lsof -ti:5174 | xargs kill`).
- **Model import fails** — open **Access → Local runtime** and press **Install** for
  `llama-server`, or start `ollama serve` if you use the fallback. Then press **Load / warm
  model** again. The GGUF must be a complete file in `models/`.
- **Scanned PDF or image OCR returns an error** — install the OCR helpers from
  **Access → Local runtime** (Homebrew on macOS) or run the command shown there. Text PDFs,
  Markdown and plain text need no external tool.

---

## Routes

Web:

- **`/`** — the desk hero. The lamp toggles the scene light; the monitor dollies the camera and
  opens `/monitor`; the notebook opens About us / Pricing / Privacy. Scrolling hands off to the
  full-page gallery.
- **`/monitor`** — the desktop download view: platform-aware download, release sizes and
  install notes only.

Desktop:

- **`/#/`** — Dashboard: manager view with the ask bar, next meeting prep, open loops, people and a five-row timeline preview.
- **`/#/timeline`** — searchable, filterable time view across files, mail, calendar and OneNote; sticky day headers and likely-meeting links.
- **`/#/search`** — searches source contents and shows matched excerpts, people, dates and category labels (no answers).
- **`/#/saved`** — saved answers rehydrated from Markdown files in your chosen folder, with category filters, Open file and Reveal in Finder.
- **`/#/settings`** — sources and access, Microsoft/runtime connections, models, semantic index, storage, activity and about.

## Project structure

### Web

| Path | Purpose |
| --- | --- |
| `web/src/config.ts` | **Start here.** Brand, links, camera framing, part mapping, screen plane. |
| `web/src/scene/DeskScene.tsx` | Canvas, lighting, model, click targets. |
| `web/src/scene/useDesk.ts` | Loads `/desk.glb`, enables shadows, removes the chair. |
| `web/src/scene/LampLight.tsx` | Lamp spotlight + bulb glow. |
| `web/src/scene/ScreenSurface.tsx` | Monitor UI plane and hover state. |
| `web/src/scene/CameraRig.tsx` | Damped camera moves, scroll dolly, portrait framing. |
| `web/src/components/NotebookOverlay.tsx` | Open-book dialog, focus trap, sections. |
| `web/src/content/NotebookContent.tsx` | About us (team), Pricing, Privacy copy. |
| `web/src/components/Gallery.tsx` | Full-bleed presentation gallery with placeholder slides. |
| `web/src/components/CircularGallery.tsx` | Vendored React Bits WebGL carousel (typed via `.d.ts`). |
| `web/src/components/ZoomControl.tsx` | Desk zoom buttons, ⌘/Ctrl + wheel and +/− keys. |
| `web/src/components/Journal.tsx` | Sticky journal bar, gallery, footer. |
| `web/src/pages/MonitorPage.tsx` | `/monitor`: the desktop download view with platform-aware CTA and release sizes. |
| `web/src/lib/scroll.ts` | Non-reactive scroll value read by the camera rig. |
| `web/src/styles.css` | Landing, journal, gallery, monitor and theme CSS. |
| `web/public/desk.glb` | Optimized model (1.8 MB). |
| `web/public/downloads/` | Legacy download URL. It redirects to `/monitor`. |
| `web/assets/computer_desk.glb` | Original 50 MB source, kept for re-export. |

### Desktop

| Path | Purpose |
| --- | --- |
| `desktop/src/shell/AppShell.tsx` | Sidebar, titlebar, core status, theme switch, ⌘K → Search. |
| `desktop/src/pages/Dashboard.tsx` | Manager dashboard: next-up prep, open loops, people and timeline preview. |
| `desktop/src/components/AskBar.tsx` | Inline ask input, data-driven suggestions, answer, citations and save action. |
| `desktop/src/components/NextUpCard.tsx` | Next meeting, attendee notes and open prep actions. |
| `desktop/src/components/OpenLoopsCard.tsx` | Commitments you owe and things you are waiting on. |
| `desktop/src/components/PeoplePanel.tsx` | People chips with last meeting and catch-up nudges. |
| `desktop/src-tauri/src/manager.rs` | Derives the manager snapshot in memory; never persists note text. |
| `desktop/src/pages/Timeline.tsx` | Unified chronological view across every granted source. |
| `desktop/src/pages/Search.tsx` | Search contents of granted files and Microsoft sources. |
| `desktop/src/pages/Saved.tsx` | Saved answers with their source titles. |
| `desktop/src/pages/Settings.tsx` | Merged access and configuration, Microsoft diagnostics, models, index, storage, activity, about. |
| `desktop/src/lib/ipc.ts` | Typed `invoke` wrappers + browser-preview fallback. |
| `desktop/src/state/access.tsx` | Shared grants, sources, models and app info. |
| `desktop/src/types/source.ts` | Source/Grant/Excerpt/Citation/Answer contracts. |
| `desktop/src-tauri/src/commands.rs` | The IPC surface. |
| `desktop/src-tauri/src/permissions.rs` | Revocable grants, persisted as metadata only. |
| `desktop/src-tauri/src/sources/` | Fixture, local folder, PDF/OCR and Microsoft Graph connectors. |
| `desktop/src-tauri/src/retrieve/` | In-memory chunker and BM25. |
| `desktop/src-tauri/src/answer.rs` | Scope → retrieve → generate → verify pipeline, chat and grounded modes. |
| `desktop/src-tauri/src/model.rs` | GGUF registry + Ollama-first runtime with llama.cpp fallback. |
| `desktop/src-tauri/src/runtime.rs` | Self-provisioning for llama-server and OCR helpers. |
| `desktop/src-tauri/src/audit.rs` | Metadata-only read log. |
| `desktop/src-tauri/tests/eval.rs` | 25-question honest-answer eval. |
| `models/` | Drop-in GGUF models (gitignored). |

## Editing the scene

All tunables live in `web/src/config.ts`.

**Camera** — `framing.desk` / `framing.notebook` / `framing.screen`. Positions are in metres; the
desk is ~2.1 m wide. The resting desk pose is framed on the monitor and crops the desk off the
bottom and right. Portrait screens automatically pull back and raise the target. The `zoom` value
in the store pushes the camera along the view ray (0.78×–2.1×) without touching layout.

**Interactive objects** — `parts` maps an object id to mesh/node names inside `desk.glb`. Click
targets are generated from the real bounding boxes. The lamp and notebook use `HitBox` in
`DeskScene`; the monitor is the screen plane itself, and the cup, pens and mouse have their own
targets in `LivingDesk`.

**Screen plane** — `screenPlane` is measured from the geometry. The monitor node is yawed ~25°, so
the UI plane has to match its quaternion, or it will float off the glass.

**Gallery** — `Gallery.tsx` renders the React Bits `CircularGallery` WebGL carousel with 16:9
presentation slides. Slide content is placeholder data in `gallerySlides.ts`; replace each `image`
with a real screenshot or asset. Vertical wheel gestures scroll the page, while drag, arrow keys,
horizontal wheel and Shift + wheel move the gallery.

**Theme** — the toggle writes `data-theme` on `<html>` and persists to `localStorage`. The journal
is always printed on warm paper; the scene and app chrome follow the theme.

## What is real vs. still a placeholder

Real now:

- Tauri v2 desktop window with a Rust core and typed IPC.
- Revocable folder and Microsoft source grants persisted as metadata only.
- Live reads of Markdown/text, PDF text layers, and local OCR for images and PDFs with no text layer; nothing mirrored.
- In-memory BM25 retrieval and a citation verifier that drops uncited claims.
- One assistant: answers generally, cites your files when it uses them, and labels general-knowledge answers. A strict citation-or-refuse setting remains.
- Extractive answers with no model, plus a GGUF adapter that prefers Ollama and falls back to llama.cpp.
- Honest refusal and a one-question clarification loop in strict mode, covered by a 25-case eval.
- Metadata-only audit log with export/clear.

Still placeholder:

- Microsoft Teams integration.
- Code-signing certificates and notarisation — the release pipeline is wired, but it needs an Apple
  Developer ID; `/monitor` sign-in buttons.
- Persistent history or version diffs — FrontDesk reads the live original instead.

## Non-negotiables in the code

- **Nothing is copied** — `sources/` returns metadata, `answer.rs` reads originals per query,
  and excerpts live in memory. `grants.json` and `audit.jsonl` contain no content.
- **Original is the source of truth** — every citation carries the source id, location and
  timestamp; **Open original** launches the file or Microsoft web item.
- **Honest by design** — in **strict citations**, `answer.rs` requires a valid citation per
  sentence and a minimum term coverage; otherwise it returns `insufficient` with no citations.
  In **assistant** mode, uncited sentences are allowed but the answer is labeled **General
  knowledge**, and fake citations are stripped.
- **No fake citations** — the verifier drops any bracket that does not match a retrieved excerpt,
  in both modes.
- **User control** — `permissions.rs` is the only gate; revoking a grant removes it from the next
  query immediately.
- **Microsoft-friendly** — `sources/m365.rs` is where `$search` + on-demand body fetches will land,
  behind the same grant/revoke path.

## Contributing

```bash
git pull
git checkout -b your-name/short-change
# edit
npm run build
git add .
git commit -m "Describe the change"
git push -u origin your-name/short-change
```

Open a pull request against `main`. Keep `node_modules/`, `dist/` and Tauri `target/` out of
commits — they are ignored already.

## Deployment

- **Web** — any static host needs an SPA fallback rewrite to `index.html` so `/monitor` resolves
  (Netlify `_redirects`, Vercel rewrites, nginx `try_files`). `vite preview` already does this.
- **Desktop** — build `desktop/`, then layer Tauri on top. The frontend stays hash-routed
  (`/#/timeline`) because the webview has no server-side rewrites.

## Packaging & distribution

FrontDesk is a Tauri v2 app, so the bundled installers are thin: the system webview supplies the
browser, and Rust + the static frontend are the only payload.

```bash
npm run package:desktop          # release bundles for the current OS
npm run package:desktop:debug    # faster, unoptimised bundle
```

Output lands in `desktop/src-tauri/target/release/bundle/`:

| Platform | Artifact | Measured / expected |
| --- | --- | --- |
| macOS Apple Silicon | `FrontDesk_0.1.0_aarch64.dmg` | **4.0 MB** (`.app` 13 MB) |
| macOS Intel | `FrontDesk_0.1.0_x64.dmg` | ~4 MB |
| Windows 10/11 | `FrontDesk_0.1.0_x64-setup.exe` (NSIS) | ~6 MB |
| Linux | `FrontDesk_0.1.0_amd64.AppImage`, `.deb` | ~15 MB / ~6 MB |
| Local model (optional) | `microsoft_Phi-4-mini-instruct-Q4_K_M.gguf` | 2.3 GB |

The measured macOS build is 12 MB of binary (Rust, plugins, embedded frontend) which compresses to a
4 MB DMG. Packaging does not require code changes: `tauri.conf.json` already declares the bundle
metadata, categories, icons and per-platform installer settings.

### Release pipeline

`.github/workflows/release.yml` builds macOS (arm64 + x64), Windows and Linux on a `v*` tag and
attaches the installers to a **draft** GitHub release. Publish the draft to make the website links
work (`/releases/latest/download/<asset>`).

```bash
git tag v0.1.0
git push origin v0.1.0
```

Signing secrets (all optional; without them the bundles are unsigned):

- `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`, `APPLE_SIGNING_IDENTITY`, `APPLE_ID`,
  `APPLE_PASSWORD`, `APPLE_TEAM_ID` — Developer ID signing + notarisation.
- Windows code signing is not wired up yet; add `certificateThumbprint`/`signCommand` under
  `bundle.windows` and the matching secrets when a certificate exists.

### What the installer does *not* include

- **A language model.** The 2.3 GB GGUF stays out of the download on purpose. Settings points at
  the app-data `models/` folder; Ollama is still a fallback, and the extractive answerer needs
  neither. A first-run model downloader is the natural next step.
- **`llama-server`, `pdftotext`, `tesseract`.** These stay out of the installer but the app
  provisions them on demand:
  - `llama-server` is downloaded from the pinned llama.cpp release (`b12359`) into
    `<app-data>/runtimes/llama/b12359/`, with progress events and automatic PATH-free resolution.
  - Text PDFs use the in-process Rust extractor; `pdftotext` is only a fallback.
  - Tesseract/Poppler install through Homebrew on macOS, winget (Tesseract) on Windows, and a
    copy-pasteable package-manager command on Linux where elevation is required.
  - `FRONTDESK_LLAMA_SERVER` still overrides everything, which is useful for a custom build.

`web/src/pages/MonitorPage.tsx` detects the visitor's OS/architecture, links the latest release,
and lists sizes. Update the version pill and sizes there with each app release. The old
`/downloads/frontdesk-desktop.html` path redirects to `/monitor`.

## Model credit

The desk model was optimized with:

```bash
cd web
npm run models:optimize
# 50.2 MB → 1.8 MB, textures → 1024px WebP, hierarchy preserved
```
