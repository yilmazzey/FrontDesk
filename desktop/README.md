# FrontDesk Desktop

Minimal desktop app for FrontDesk, built for the Pfizer & Newpage Solutions
Hackathon Challenge. The Vite + React + TypeScript UI can run in a browser; the
Tauri v2 shell provides the native backend used for Microsoft Graph sign-in.
See the [root README](../README.md) for the full team setup guide.

## Run

From the repo root:

```bash
npm install
npm run dev:desktop   # http://localhost:5174
```

Hash routing is used (`/#/notes`, `/#/settings`) so the same build works inside
the Tauri webview, where there is no server to rewrite paths.

## Microsoft Graph

The Microsoft connection uses the Tauri native backend for device-code sign-in.
It reads the signed-in profile, recent dashboard data, and—when searching—all
accessible mail except messages in Deleted Items, calendars and OneNote pages.
Search data and tokens stay in memory and are cleared when the app exits; sign
in and load data again after relaunch. Refresh the data after changing Microsoft
content. The first search may take a while for large accounts.

The Dashboard assistant retrieves relevant excerpts and sends only those
excerpts to the local Ollama model for a cited answer. The Search screen uses the
same Microsoft-only data and returns matching excerpts. Neither feature searches
local files or sends content to a cloud AI service.

1. Copy `.env.example` to `.env.local` in `desktop/`.
2. Set `VITE_MICROSOFT_CLIENT_ID` to the Application (client) ID from your Entra
   app registration. It is a public identifier, not a client secret.
3. Ensure the registration allows public client flows and has delegated
   `User.Read`, `Notes.Read`, `Mail.Read`, `Calendars.Read` and `offline_access`.
4. Install and start [Ollama](https://ollama.com/), then download the default
   model with `ollama pull qwen2.5:3b`. Optionally set `VITE_OLLAMA_MODEL` in
   `desktop/.env.local` to use another installed model.
5. From the repo root, run `npm run tauri -w desktop -- dev`, then connect in
   **Settings** and complete the device-code sign-in in your browser.

The browser-only Vite preview cannot authenticate or call Ollama; Microsoft
requests and local model calls are made by the Tauri backend. No client secret
is needed.

## Screens

- **Dashboard** — Microsoft data, cited local-model answers, permission summary
- **Notes** — local note list + placeholder editor
- **Search** — filters across Microsoft mail, calendar and OneNote
- **Settings** — connections, behaviour, storage, about

Local notes and OCR remain placeholders. Microsoft Graph search and local-model
answers are available only in the Tauri desktop app.

## Tauri

`src-tauri/` contains the native shell and Microsoft Graph commands. From the
repo root, run:

```bash
npm run tauri -w desktop -- dev
```

The dev server is fixed to port `5174` in `vite.config.ts`, matching `devUrl`
in the Tauri config. Native development on Windows requires Rust, the MSVC C++
build tools and WebView2.
