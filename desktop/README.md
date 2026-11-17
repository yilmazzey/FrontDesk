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

- **Access** — grant a folder, revoke it, choose answer style and GGUF model,
  inspect the metadata-only activity log.
- **Notes** — read a granted Markdown/text/PDF/scan from its original.
- **Ask** — one assistant. It prefers your retrieved files, cites them when it
  uses them, and otherwise answers from general knowledge with a clear label.
  Strict mode drops uncited claims and returns `insufficient` instead.
- **Search** — searches the contents of granted files, Outlook mail, calendar
  events and OneNote pages, with kind filters and no answer box.
- **Settings** — model folder, adapter, storage, connections.

PDF text is extracted in-process; image OCR uses `tesseract` and `poppler`.
Markdown and text need neither.

## Models

Drop `.gguf` files into `../models/`. Select one on Access or Settings, then
press **Load / warm model**. FrontDesk uses llama.cpp's `llama-server` first,
provisioning it automatically if needed; Ollama is the fallback. **Extractive**
answers instantly with no model.

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

## Tauri

`src-tauri/` is runnable now: CLI, `lib`/`main` split, `ping` command,
capability file, icons and `Cargo.lock` are in place. The frontend is
hash-routed (`/#/notes`) because the webview has no server-side rewrites.

## Microsoft Graph

Copy `desktop/.env.example` to `desktop/.env.local`, set `VITE_MICROSOFT_CLIENT_ID`
from a public-client Microsoft Entra app with device-code flow enabled, then
restart the app. The app requests delegated `User.Read`, `Mail.Read`,
`Calendars.Read`, `Notes.Read` and `offline_access` permissions. Connect from
**Settings**; mail, calendar and OneNote are read-only and can be individually
revoked from **Access**. Sign-in tokens remain in memory and require reconnecting
after an app restart.
