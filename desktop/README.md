# FrontDesk Desktop

Minimal desktop shell for FrontDesk, built for the Pfizer & Newpage Solutions
Hackathon Challenge. It is a plain Vite + React + TypeScript app today, wrapped
by a Tauri v2 placeholder so the real package can be layered on without
restructuring anything. See the [root README](../README.md) for the full team
setup guide.

## Run

From the repo root:

```bash
npm install
npm run dev:desktop   # http://localhost:5174
```

Hash routing is used (`/#/notes`, `/#/settings`) so the same build works inside
the Tauri webview, where there is no server to rewrite paths.

## Screens

- **Dashboard** — today, recent notes, permission summary, model status
- **Notes** — local note list + placeholder editor
- **Search** — filters and citation-flavoured results
- **Settings** — connections, behaviour, storage, about

All data is placeholder content in `src/data.ts`. There is no persistence, no
Microsoft Graph, no OCR and no local model yet.

## Tauri

`src-tauri/` holds a skeleton config (`tauri.conf.json`, `Cargo.toml`,
`src/main.rs`). It is intentionally not runnable yet — no icons or lockfile
have been generated. When ready:

```bash
npm add -D @tauri-apps/cli
npm run tauri init      # or edit the placeholder config in place
npm run tauri dev
```

The dev server is fixed to port `5174` in `vite.config.ts`, matching
`devUrl` in the Tauri config.
