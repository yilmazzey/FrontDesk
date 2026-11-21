# FrontDesk

A local-first second brain for managers, built for the **Pfizer & Newpage Solutions Hackathon Challenge**.

FrontDesk is a Tauri desktop app with a Rust core and a separate web landing page. It reads only the sources you grant, keeps originals where they live, and turns meetings, notes, mail, calendar events and OneNote pages into a manager-shaped daily view.

- **Manager dashboard** — next meeting prep, open commitments, people catch-up nudges and a short timeline.
- **Ask** — a conversational assistant with inline `[n]` citations, local files, optional web snippets and a local-clock path.
- **Timeline** — searchable, filterable history with sticky day headers, a **Today** jump and likely meeting links.
- **Search** — content search with matched excerpts, people and dates; every result row opens the original.
- **Saved** — rehydrates Markdown answers from your chosen folder, with category filters and Finder reveal.
- **People graph** — cluster colleagues by Microsoft 365 department and job title, with mail signatures as fallback; link them by mail, meetings and names mentioned in messages, Obsidian-style.
- **Privacy shield** — blur the whole window when a remote-access tool such as AnyDesk or macOS Screen Sharing is active, with an unblur action and `⌘⇧P` shortcut.
- **Sources** — local folders, PDFs and scans, Outlook mail and Sent Items, Microsoft Calendar and OneNote.
- **Menu-bar popover** — click the tray icon to see the next three calendar items; its Ask bar opens the main app chat.
- **Local model** — Extractive mode works instantly; Phi-4 Mini can be downloaded inside the app.

Nothing is synced to a FrontDesk server. Source metadata, grants, settings and derived embeddings are held while the app is open; the **Resync** button in the title bar re-reads every source, grant and the manager snapshot. Saved answers are Markdown files you own. Source bodies are read at request time and not written to disk.

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

## People graph

Open **People** in the sidebar. FrontDesk reads senders, recipients, calendar attendees and `/me/people` department metadata, then draws a force-directed graph:

- clusters are departments; your team sits in the centre;
- edge colour is the relationship type — mail, meetings, a name mentioned in a message, or a granted OneNote/local note;
- node size is interaction weight, so the people you deal with most stand out;
- click a person for role, department, counts and strongest links, or ask FrontDesk about them;
- **“Where this comes from”** lists the directory record, mail signature or note behind each role, with an **Open** link to the original;
- **Edit** or **Add person** writes a local override (role, department, email and a private note) to `people-overrides.json` in the app data folder; **Reset local edits** removes it;
- **Export** saves the graph plus overrides as JSON; **Import** restores that snapshot later.

The graph is built from Graph metadata and the notes you granted. Overrides and exported snapshots are local files; nothing is written back to Microsoft 365.

Roles and departments come from message signatures and your Microsoft profile. If `People.Read` is later added to the app registration, `/me/people` enriches them automatically; it is not requested by default because the read-only demo registration does not include it.

## Privacy shield

FrontDesk watches for remote-access tools (AnyDesk, TeamViewer, RustDesk, Supremo, Parsec, macOS Screen Sharing, Zoom screen sharing, Microsoft Remote Desktop, Apple Remote Desktop, Horizon, Citrix) and blurs the entire window while one is running. **Unblur this session** restores the app; the blur returns the next time sharing starts. Use the **Privacy** button in the title bar or `⌘⇧P` to blur immediately, and **Settings → Privacy shield** to turn auto-blur off or preview it.

Teams, Zoom and Slack are deliberately not watched because they run all day. The shield is a visual guard only; it does not change storage or network behaviour.

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

The Entra app must allow public client / device-code flow and delegated `User.Read`, `Mail.Read`, `Calendars.Read`, `Notes.Read` and `offline_access`. `Files.Read` and `Mail.Read.Shared` are not requested yet: there is no OneDrive or shared-mailbox connector, and `Mail.Read.Shared` is work/school-only. Use **Settings → Directory (tenant)** if the app is single-tenant; `common` is for multi-tenant apps. Connect from Settings with the device code. Tokens stay in memory by default; enable **Stay signed in** to store only the read-only refresh token in the macOS Keychain so you do not sign in on every launch.

For the full Entra walkthrough, see [MICROSOFT_DEMO_SETUP.md](MICROSOFT_DEMO_SETUP.md).

## OCR and PDFs

- Text PDFs are read in-process with pure Rust.
- Scanned PDFs are rasterized with PDFium and read with Tesseract in the app's runtime cache.
- Poppler is optional: it is only a text/render fallback.
- **Install all helpers** in Settings provisions llama.cpp and, where the platform allows it, Tesseract in one click. FrontDesk also checks `/opt/homebrew/bin` and `/usr/local/bin`, so Homebrew tools are found even when the app is launched from Finder. Poppler remains optional because PDFium renders PDFs.

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
- The refresh token is kept in memory by default. **Stay signed in** optionally stores it in the macOS Keychain; source text is never written there.
- Sources and the people graph are cached in memory while the app is open; **Resync** re-reads them.
- Conversation history lives in React memory and disappears on restart.

## Troubleshooting

- **Port already in use** — stop the other Vite process. The web app uses 5173 and the desktop preview uses 5174.
- **White or empty desktop window** — run `npm run dev:tauri` from the repo root; the Tauri frontend must be built with the desktop workspace.
- **Microsoft returns empty mail/calendar/OneNote** — check Settings diagnostics for reachable-empty vs permission errors, and confirm you signed in with the intended account.
- **Device code expired while the app was open** — Settings keeps the prompt and shows **Get a new code**; no restart needed. **Reconnect** starts a fresh sign-in without disconnecting first.
- **No model** — use Extractive, download Phi-4 Mini in Settings, or place a `.gguf` in `models/`.
- **Scan OCR fails** — use **Install all helpers** in Settings → Local runtime; FrontDesk finds Homebrew tools under `/opt/homebrew/bin` even when launched from Finder. PDFium handles rendering, Poppler is optional.
- **Clone is still large** — the raw 50 MB GLB was removed from the current tree, but it remains in older Git history. Shrinking clone size further requires a coordinated history rewrite and force-push.

## Team

- [Damla Sanlı](https://www.linkedin.com/in/damlasanli/)
- [Anika Srivastava](https://www.linkedin.com/in/anika-srivastava-00b032229/)
- [Zeynep Yılmaz](https://www.linkedin.com/in/yilmazzey/)
