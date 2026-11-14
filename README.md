# FrontDesk

A calm, local-first workspace built around a 3D desk. FrontDesk is our entry for the
**Pfizer & Newpage Solutions Hackathon Challenge**.

The repo is a two-workspace monorepo:

| Workspace | What it is | Dev URL |
| --- | --- | --- |
| `web/` | Public landing page: 3D desk, full-page Embla gallery, notebook, and `/monitor` onboarding. | `http://localhost:5173` |
| `desktop/` | Tauri app with a local Rust core: Access grants, Notes, Ask/Chat, Search, Settings and audit. | `http://localhost:5174` |

The 3D experience is real. The desktop app is now a working local-first MVP: it reads granted
folders on demand, answers with exact citations, refuses when the evidence is missing, and can
run a GGUF model from `models/`. Microsoft Graph is behind the same source interface but not
connected yet.

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
- **Ollama** — optional, only for GGUF model answers

Optional extraction tools:

- `pdftotext` (Poppler) for the text layer of PDFs
- `tesseract` for OCR of images and scanned pages

No `.env` files or API keys are needed. Everything runs locally.

macOS setup:

```bash
xcode-select --install
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
source "$HOME/.cargo/env"
brew install ollama tesseract poppler   # optional, for models and extraction
```

### 2. Clone the repo

```bash
git clone https://github.com/yilmazzey/FrontDesk.git
cd FrontDesk
```

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

Then open **Access → Local model**, choose the model, and press **Load / warm model**. The
first load imports it into Ollama and can take a minute. Choose **Extractive** to demo the
citation pipeline instantly with no model at all.

### 7. Build and test before you push

```bash
npm run build                  # type-check + build both workspaces
npm run build:web
npm run build:desktop
cd desktop/src-tauri && cargo test --test eval   # 25-question honest-answer eval
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
- **Model import fails** — start `ollama serve`, check `ollama list`, then press
  **Load / warm model** again. The GGUF must be a complete file in `models/`.
- **PDF or OCR returns an error** — install `pdftotext` and `tesseract` (`brew install poppler
  tesseract`). Markdown and text files need neither.

---

## Routes

Web:

- **`/`** — the desk hero. The lamp toggles the scene light; the monitor dollies the camera and
  opens `/monitor`; the notebook opens About us / Pricing / Privacy. Scrolling hands off to the
  full-page gallery.
- **`/monitor`** — sign-in, permissions, configuration and a **Download / Open Desktop App**
  button.
- **`/downloads/frontdesk-desktop.html`** — styled placeholder package page. No binary yet.

Desktop:

- **`/#/`** — Dashboard: live source count, grants, quick ask.
- **`/#/notes`** — read a granted note from its original on demand.
- **`/#/chat`** — ask a question, get an answer plus exact citations.
- **`/#/search`** — filter the sources currently in scope.
- **`/#/access`** — grant/revoke folders, choose the model adapter, inspect metadata-only activity.
- **`/#/settings`** — connections, model folder, storage, behaviour.

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
| `web/src/components/Gallery.tsx` | Full-page Embla gallery. |
| `web/src/components/Journal.tsx` | Sticky journal bar, gallery, footer. |
| `web/src/pages/MonitorPage.tsx` | `/monitor` onboarding placeholder. |
| `web/src/lib/scroll.ts` | Non-reactive scroll value read by the camera rig. |
| `web/src/styles.css` | Landing, journal, gallery, monitor and theme CSS. |
| `web/public/desk.glb` | Optimized model (1.8 MB). |
| `web/public/downloads/` | Placeholder desktop package page. |
| `web/assets/computer_desk.glb` | Original 50 MB source, kept for re-export. |

### Desktop

| Path | Purpose |
| --- | --- |
| `desktop/src/shell/AppShell.tsx` | Sidebar, titlebar, core status, theme switch, ⌘K → Search. |
| `desktop/src/pages/Dashboard.tsx` | Live sources, grants, quick ask, model status. |
| `desktop/src/pages/Notes.tsx` | Read a granted note from its original on demand. |
| `desktop/src/pages/Chat.tsx` | Ask pipeline: answer, citations, clarification, refusal. |
| `desktop/src/pages/Search.tsx` | Filter the sources currently in scope. |
| `desktop/src/pages/Access.tsx` | Grant/revoke folders, model picker, metadata-only audit. |
| `desktop/src/pages/Settings.tsx` | Connections, models, behaviour, storage, about. |
| `desktop/src/lib/ipc.ts` | Typed `invoke` wrappers + browser-preview fallback. |
| `desktop/src/state/access.tsx` | Shared grants, sources, models and app info. |
| `desktop/src/types/source.ts` | Source/Grant/Excerpt/Citation/Answer contracts. |
| `desktop/src-tauri/src/commands.rs` | The IPC surface. |
| `desktop/src-tauri/src/permissions.rs` | Revocable grants, persisted as metadata only. |
| `desktop/src-tauri/src/sources/` | Fixture, local folder, PDF/OCR and Graph stubs. |
| `desktop/src-tauri/src/retrieve/` | In-memory chunker and BM25. |
| `desktop/src-tauri/src/answer.rs` | Scope → retrieve → generate → verify pipeline. |
| `desktop/src-tauri/src/model.rs` | GGUF registry + local runtime adapter. |
| `desktop/src-tauri/src/audit.rs` | Metadata-only read log. |
| `desktop/src-tauri/tests/eval.rs` | 25-question honest-answer eval. |
| `models/` | Drop-in GGUF models (gitignored). |

## Editing the scene

All tunables live in `web/src/config.ts`.

**Camera** — `framing.desk` / `framing.notebook` / `framing.screen`. Positions are in metres; the
desk is ~2.1 m wide. Portrait screens automatically pull back and raise the target.

**Interactive objects** — `parts` maps an object id to mesh/node names inside `desk.glb`. Click
targets are generated from the real bounding boxes. The lamp and notebook use `HitBox` in
`DeskScene`; the monitor is the screen plane itself, and the cup, pens and mouse have their own
targets in `LivingDesk`.

**Screen plane** — `screenPlane` is measured from the geometry. The monitor node is yawed ~25°, so
the UI plane has to match its quaternion, or it will float off the glass.

**Gallery** — `Gallery.tsx` uses Embla with `align: 'center'` and `containScroll: false`, so the
active card is large and the previous/next cards peek in from the sides. Slide size and page-height
layout live in the gallery block in `styles.css`.

**Theme** — the toggle writes `data-theme` on `<html>` and persists to `localStorage`. The journal
is always printed on warm paper; the scene and app chrome follow the theme.

## What is real vs. still a placeholder

Real now:

- Tauri v2 desktop window with a Rust core and typed IPC.
- Revocable folder grants persisted as metadata only.
- Live reads of Markdown/text, PDF text layers, and local OCR for images and PDFs with no text layer; nothing mirrored.
- In-memory BM25 retrieval and a citation verifier that drops uncited claims.
- Extractive answers with no model, plus a GGUF model adapter (Phi-4-mini is first).
- Honest refusal and a one-question clarification loop, covered by a 25-case eval.
- Metadata-only audit log with export/clear.

Still placeholder:

- Microsoft Graph auth and the Outlook/OneNote connectors (stubs behind the same dispatch).
- Teams and calendar.
- Signed installer / notarisation; `/monitor` sign-in buttons.
- Persistent history or version diffs — FrontDesk reads the live original instead.

## Non-negotiables in the code

- **Nothing is copied** — `sources/` returns metadata, `answer.rs` reads originals per query,
  and excerpts live in memory. `grants.json` and `audit.jsonl` contain no content.
- **Original is the source of truth** — every citation carries the source id, location and
  timestamp; **Open original** launches the real file.
- **Honest by design** — `answer.rs` requires a valid citation per sentence and a minimum term
  coverage; otherwise it returns `insufficient` with no citations.
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
  (`/#/notes`) because the webview has no server-side rewrites.

## Model credit

The desk model was optimized with:

```bash
cd web
npm run models:optimize
# 50.2 MB → 1.8 MB, textures → 1024px WebP, hierarchy preserved
```
