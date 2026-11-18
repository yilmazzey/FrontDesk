# FrontDesk

A local-first second brain for managers, built for the **Pfizer & Newpage Solutions Hackathon Challenge**.

FrontDesk is a Tauri desktop app with a Rust core and a separate web landing page. It reads only the sources you grant, keeps originals where they live, and turns meetings, notes, mail, calendar events and OneNote pages into a manager-shaped daily view.

- **Manager dashboard** — next meeting prep, open commitments, people catch-up nudges and a short timeline.
- **Ask** — a conversational assistant with inline `[n]` citations, local files, optional web snippets and a local-clock path.
- **Timeline** — searchable, filterable history with sticky day headers and likely meeting links.
- **Search** — content search with matched excerpts, people and dates; every result row opens the original.
- **Saved** — rehydrates Markdown answers from your chosen folder, with category filters and Finder reveal.
- **Sources** — local folders, PDFs and scans, Outlook mail, Microsoft Calendar and OneNote.
- **Menu-bar popover** — click the tray icon to see the next three calendar items; its Ask bar opens the main app chat.
- **Local model** — Extractive mode works instantly; Phi-4 Mini can be downloaded inside the app.

Nothing is synced to a FrontDesk server. Source bodies stay in memory for the duration of a request; the app persists metadata, grants, settings and derived embeddings only. Saved answers are Markdown files you own.

### How Ask answers

Ask combines four sources of truth, in order:

1. **Local clock** — date/time questions are answered immediately, even in Extractive mode.
2. **Granted personal sources** — local files, scans, Outlook, Calendar and OneNote are retrieved first and cited inline.
3. **Optional web search** — enable it under **Settings → Sources & access → Web search**. Only your question is sent to Bing; note, mail, calendar and OneNote contents are never sent. Web snippets are cited with their URL.
4. **Local model general knowledge** — when the selected GGUF has no relevant excerpts, it answers as general knowledge with a clear label instead of refusing.

If a GGUF is present in the models folder, FrontDesk selects it automatically on first launch. Choose **Extractive** explicitly to stay file-only. **Strict citations** keeps the web off and refuses anything not grounded in your sources.

## Repository

| Workspace | Purpose |
| --- | --- |
| `web/` | Landing page, 3D desk, gallery and `/monitor` download view (`http://localhost:5173`). |
| `desktop/` | Tauri desktop app and local Rust core (`http://localhost:5174` in browser preview). |
| `desktop/src-tauri/` | Rust IPC surface, retrieval, connectors, index, runtime provisioning and tests. |

The optimized web model is `web/public/desk.glb` (1.8 MB). The 50 MB source GLB is intentionally not tracked; keep it outside git or in local storage for re-export.

## Requirements

- Node.js 20 or newer
- npm 10 or newer
- Rust stable, plus `cargo`, `rustfmt` and `clippy`
- macOS: Xcode Command Line Tools
- Linux: Tauri system packages (`libwebkit2gtk-4.1-dev`, `libappindicator3-dev`, `librsvg2-dev`, `patchelf`)

Run the environment checklist from the repo root:

```bash
npm run doctor
```

Doctor checks Node, Rust, the lockfile, the Microsoft client ID, the optional local GGUF and Linux Tauri dependencies. It prints warnings for optional items rather than failing the whole setup.

## Install and run

```bash
git clone https://github.com/yilmazzey/FrontDesk.git
cd FrontDesk
npm ci
npm run doctor
```

Do not install dependencies separately inside `web/` or `desktop/`; this is an npm workspace with one root `package-lock.json`.

Run the web landing page:

```bash
npm run dev
# http://localhost:5173
```

Run the real desktop app:

```bash
npm run dev:tauri
```

Browser-only UI preview (sample sources, no file access):

```bash
npm run dev:desktop
# http://localhost:5174
```

Only `dev:tauri` can grant real folders, read files, run OCR and answer from them.

## Menu-bar popover

The tray icon opens a compact popover with the next three upcoming calendar items. The **Ask FrontDesk…** bar opens the main app directly in chat, and clicking an event opens chat ready to prep for it. Closing the main window keeps FrontDesk available in the tray.

## Local model

The default **Extractive** adapter needs no model. It answers instantly from cited source sentences.

For generative answers, open **Settings → Models & answer style** and choose **Download Phi-4 Mini**. If a GGUF already exists in `models/`, it is selected automatically on first launch:

- ~2.3 GB, Q4_K_M
- SHA-256 verified after download
- cancel and resume supported
- imports through Ollama when available, with a managed llama.cpp fallback

You can also place a GGUF file in `models/` and select it in Settings. To force the extractive path during a demo, choose **Extractive** as the answer adapter.

## Microsoft Graph

Official builds include a public-client application ID in `desktop/.env.production`. This is not a secret. You can override it in **Settings → Microsoft account → Microsoft client ID**, or copy `desktop/.env.example` to `desktop/.env.local` and set `VITE_MICROSOFT_CLIENT_ID`.

The Entra app must allow public client / device-code flow and delegated `User.Read`, `Mail.Read`, `Calendars.Read`, `Notes.Read` and `offline_access`. Connect from Settings and follow the browser code prompt. Tokens stay in memory and must be renewed by reconnecting after an app restart.

For the full Entra walkthrough, see [MICROSOFT_DEMO_SETUP.md](MICROSOFT_DEMO_SETUP.md).

## OCR and PDFs

- Text PDFs are read in-process with pure Rust.
- Scanned PDFs are rasterized with PDFium and read with Tesseract in the app's runtime cache.
- Poppler is optional: it is only a text/render fallback.
- Tesseract can be installed from **Settings → Local runtime** on macOS and Windows; Linux uses the package manager.

## Build, test and lint

From the repo root:

```bash
npm run typecheck      # TypeScript projects
npm run lint           # typecheck + cargo clippy -D warnings
npm test               # cargo tests, including OCR and manager snapshots
npm run build          # web + desktop frontends
npm run build:web
npm run build:desktop
```

Packaged desktop build:

```bash
npm run package:desktop
```

Installers are written to `desktop/src-tauri/target/release/bundle/`.

## Versioning and releases

`package.json` is the single version source. Sync it into both workspace packages, Tauri config and Cargo metadata:

```bash
npm run version:sync
npm run version:check
```

Release builds are triggered by a `vX.Y.Z` tag. `.github/workflows/release.yml` verifies that the tag matches `package.json`, then builds separate Apple Silicon and Intel DMGs, a Windows NSIS installer, and Linux AppImage/deb bundles.

`.github/workflows/ci.yml` runs on pull requests and pushes to `main` / `yilmazzey`: version check, web build, desktop frontend build, `cargo fmt --check`, `cargo clippy -D warnings` and `cargo test`.

Unsigned preview installers may trigger macOS Gatekeeper or Windows SmartScreen. macOS: allow the app in **System Settings → Privacy & Security → Open Anyway**. Windows: **More info → Run anyway** until an Authenticode certificate is added.

## Privacy and permissions

- Grants are revocable and persisted as metadata only.
- Source text is read on demand and is never copied into app data.
- The semantic index stores metadata and derived embeddings, not note text.
- Audit records which source was read, never what it said.
- Microsoft requests are read-only and can be revoked independently.
- Conversation history lives in React memory and disappears on restart.

## Troubleshooting

- **Port already in use** — stop the other Vite process. The web app uses 5173 and the desktop preview uses 5174.
- **White or empty desktop window** — run `npm run dev:tauri` from the repo root; the Tauri frontend must be built with the desktop workspace.
- **Microsoft returns empty mail/calendar/OneNote** — check Settings diagnostics for reachable-empty vs permission errors, and confirm you signed in with the intended account.
- **No model** — use Extractive, download Phi-4 Mini in Settings, or place a `.gguf` in `models/`.
- **Scan OCR fails** — install Tesseract from Settings → Local runtime; PDFium handles rendering, Poppler is optional.
- **Clone is still large** — the raw 50 MB GLB was removed from the current tree, but it remains in older Git history. Shrinking clone size further requires a coordinated history rewrite and force-push.

## Team

- [Damla Sanlı](https://www.linkedin.com/in/damlasanli/)
- [Anika Srivastava](https://www.linkedin.com/in/anika-srivastava-00b032229/)
- [Zeynep Yılmaz](https://www.linkedin.com/in/yilmazzey/)
