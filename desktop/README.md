# FrontDesk Desktop

Local-first desktop app for the Pfizer & Newpage Solutions Hackathon Challenge.
It is a Tauri v2 app (Rust core + Vite/React UI) that reads granted sources on
demand, answers with exact citations, and refuses when the evidence is missing.
See the [root README](../README.md) for the full team setup guide.

## Run

From the repo root:

```bash
npm install
npm run dev:tauri     # real desktop window
npm run dev:desktop   # browser preview only, no file access
```

## What works

- **Access** — grant a folder, revoke it, choose a GGUF model, inspect the
  metadata-only activity log.
- **Notes** — read a granted Markdown/text/PDF/scan from its original.
- **Ask** — extraction → answer → citation verifier. Uncited claims are
  dropped; missing evidence returns `insufficient`.
- **Search** — filter the sources currently in scope.
- **Settings** — model folder, adapter, storage, connections.

PDF text uses `pdftotext`; image OCR uses `tesseract`. Markdown and text need
neither.

## Models

Drop `.gguf` files into `../models/`. Select one on Access or Settings, then
press **Load / warm model**. The first load imports it into Ollama and can take
a minute. **Extractive** answers instantly with no model.

## Rust core

```
src-tauri/src/
  commands.rs       IPC surface
  permissions.rs    revocable grants (metadata only)
  sources/          fixture, local folder, PDF/OCR, Graph stubs
  retrieve/         in-memory chunker + BM25
  answer.rs         scope → retrieve → generate → verify
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
