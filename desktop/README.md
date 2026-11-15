# FrontDesk Desktop

Local-first desktop app for the Pfizer & Newpage Solutions Hackathon Challenge.
It is a Tauri v2 app (Rust core + Vite/React UI) that reads granted sources on
demand. **Ask** is one assistant: it answers generally, cites your files when it
uses them, and labels answers that come from general knowledge. A strict
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
- **Search** — a plain browser for the files and mail currently in scope, with
  kind filters and no answer box.
- **Settings** — model folder, adapter, storage, connections.

PDF text uses `pdftotext`; image OCR uses `tesseract`. Markdown and text need
neither.

## Models

Drop `.gguf` files into `../models/`. Select one on Access or Settings, then
press **Load / warm model**. FrontDesk starts llama.cpp's `llama-server` with the
GGUF directly (`brew install llama.cpp`); if it is not installed, it falls back
to Ollama. **Extractive** answers instantly with no model.

## Rust core

```
src-tauri/src/
  commands.rs       IPC surface
  permissions.rs    revocable grants (metadata only)
  sources/          fixture, local folder, PDF/OCR, Graph stubs
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

Microsoft Graph, OneNote, Outlook, Teams and calendar are intentionally not
connected yet. The connectors are stubs behind the same source dispatch, so the
grant/revoke and citation paths do not change when they land.
