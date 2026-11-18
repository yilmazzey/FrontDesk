# FrontDesk Desktop

Local-first desktop app for the Pfizer & Newpage Solutions Hackathon Challenge.
It is a Tauri v2 app (Rust core + Vite/React UI) that reads granted sources on
demand. **Ask** is one assistant: it answers generally, cites local and connected
Microsoft sources when it uses them, and labels answers that come from general knowledge. A strict
citation-or-refuse setting is still available.
See the [root README](../README.md) for the full team setup guide.

## Run

From the repo root:

```bash
npm install
npm run dev:tauri     # real desktop window
npm run dev:desktop   # browser preview only, no file access
```

## What works

- **Dashboard** — manager-first: a simple ask bar, **Next up** with attendee
  notes and open actions, **Open loops** for commitments you owe and things you
  are waiting on, people chips with catch-up nudges, and a five-row timeline
  preview. Open loops are derived from recent notes in memory; note text is
  never persisted.
- **Ask** — the dashboard ask bar. It prefers your retrieved files, cites them
  when it uses them, and otherwise answers from general knowledge with a clear
  label. Strict mode drops uncited claims and returns `insufficient` instead.
- **Timeline** — files, mail, calendar events and OneNote pages in one
  chronological view.
- **Search** — searches the contents of granted files, Outlook mail, calendar
  events and OneNote pages, with kind filters and no answer box.
- **Saved** — saved answers with their source titles.
- **Settings** — merged access and configuration: folder grants, Microsoft
  connection and per-connector diagnostics, runtime helpers, answer style, GGUF
  model, semantic index, storage, activity log and about.

PDF text is extracted in-process. Scanned PDFs are rasterised with PDFium and
read with `tesseract`; Poppler is only an optional fallback. Markdown and text
need neither.

## Models

Drop `.gguf` files into `../models/`. Select one in Settings, then
press **Load / warm model**. FrontDesk imports it into Ollama first; if Ollama
is unavailable, it uses the managed llama.cpp fallback. **Extractive** answers
instantly with no model.

## Rust core

```
src-tauri/src/
  commands.rs       IPC surface
  permissions.rs    revocable grants (metadata only)
  sources/          fixture, local folder, PDF/OCR, Microsoft Graph
  retrieve/         in-memory chunker + BM25
  answer.rs         scope → retrieve → generate → verify (chat + grounded)
  model.rs          GGUF registry + local runtime adapter
  audit.rs          metadata-only JSONL log
```

`cargo test --test eval` runs the 25-question honest-answer eval.

## Tray

The app adds a small menu-bar icon on macOS and a system-tray icon on Windows
and Linux. **Ask FrontDesk** opens the dashboard and focuses the ask bar;
**Open FrontDesk** shows the dashboard; **Quit FrontDesk** exits. Closing the window hides it to the tray
instead of quitting. Linux tray click events are not exposed by AppIndicator,
so the menu is the entry point there.

## Tauri

`src-tauri/` is runnable now: CLI, `lib`/`main` split, `ping` command,
capability file, icons and `Cargo.lock` are in place. The frontend is
hash-routed (`/#/timeline`) because the webview has no server-side rewrites.

## Microsoft Graph

Copy `desktop/.env.example` to `desktop/.env.local`, set `VITE_MICROSOFT_CLIENT_ID`
from a public-client Microsoft Entra app with device-code flow enabled, then
restart the app. The app requests delegated `User.Read`, `Mail.Read`,
`Calendars.Read`, `Notes.Read` and `offline_access` permissions. Connect from
**Settings**; mail, calendar and OneNote are read-only and can be individually
revoked there too. Settings reports whether each connector is reachable, empty
or returning an error. Sign-in tokens remain in memory and require reconnecting
after an app restart.
