# FrontDesk

A calm, local-first workspace built around a 3D desk. FrontDesk is our entry for the
**Pfizer & Newpage Solutions Hackathon Challenge**.

The repo is a two-workspace monorepo:

| Workspace | What it is | Dev URL |
| --- | --- | --- |
| `web/` | Public landing page: 3D desk, full-page Embla gallery, notebook, and `/monitor` onboarding. | `http://localhost:5173` |
| `desktop/` | Tauri desktop app with a Vite + React shell and read-only Microsoft Graph integration. | `http://localhost:5174` in browser |

The 3D experience is real. Desktop notes and OCR are still placeholders.
Microsoft Graph device-code sign-in and read access run through the native Tauri backend. The
dashboard assistant and Search screen use Microsoft mail, calendar and OneNote data; answers are
generated locally with Ollama.

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
- **Rust, MSVC C++ build tools and WebView2** — only needed for the native Tauri app

The browser-only Vite shell does not need credentials. Microsoft Graph requires
the app's client ID in `desktop/.env.local` and the Tauri desktop runtime. Local
answers also require Ollama and the `qwen2.5:3b` model by default.

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

### 5. Run the desktop shell (second terminal)

```bash
npm run dev:desktop
# http://localhost:5174
```

To run the native Tauri app with Microsoft Graph, copy `desktop/.env.example` to
`desktop/.env.local`, set `VITE_MICROSOFT_CLIENT_ID`, install Ollama and run
`ollama pull qwen2.5:3b`, then run:

```bash
npm run tauri -w desktop -- dev
```

### 6. Build before you push

```bash
npm run build          # type-check + build both workspaces
npm run build:web
npm run build:desktop
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

---

## Routes

- **`/`** — the desk hero. The lamp toggles the scene light; the monitor dollies the camera and
  opens `/monitor`; the notebook opens About us / Pricing / Privacy. Scrolling hands off to the
  full-page gallery.
- **`/monitor`** — sign-in, permissions, configuration and a **Download / Open Desktop App**
  button.
- **`/downloads/frontdesk-desktop.html`** — styled placeholder package page. No binary yet.

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
| `desktop/src/shell/AppShell.tsx` | Sidebar, titlebar, theme switch, ⌘K → Search. |
| `desktop/src/pages/Dashboard.tsx` | Microsoft data and locally generated cited answers. |
| `desktop/src/pages/Notes.tsx` | Note list + placeholder editor. |
| `desktop/src/pages/Search.tsx` | Search across connected Microsoft email, calendars and OneNote. |
| `desktop/src/pages/Settings.tsx` | Connections, behaviour, storage, about. |
| `desktop/src/data.ts` | All placeholder content. |
| `desktop/src-tauri/` | Tauri v2 shell and native Microsoft Graph device-code commands. |

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

## What is still a placeholder

- `/monitor` sign-in and permission buttons are disabled.
- The download page links to a stub, not a signed installer.
- Desktop notes, OCR and some settings values are local sample content.
- Microsoft Graph data is cached in memory until the app exits. Local-model answers require Ollama
  and only use retrieved Microsoft excerpts; no local files or cloud AI service are used.

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
