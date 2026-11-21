# Web presentation script — 3 minutes

Start on the web page, then hand off to the desktop app. Most of the time goes to **how RAG and the local model produce citations**, the **local boundary**, and the **RAM/performance** slide.

Open the web page at `http://localhost:5173/` (or your tunnel).

---

## 0:00–0:15 — The desk

Say:

> FrontDesk is a local-first second brain for managers, built for the Pfizer & Newpage hackathon. It starts as a desk, not another dashboard.

Point at the Pfizer × Newpage mark and the live desk. **Scroll down one screen** to open the journal.

---

## 0:15–0:40 — Field notes: all features

Use `←` / `→` (or drag, or Shift + scroll) to slide **01 · All features**. Click the slide.

Say:

> Thirteen capabilities on one quiet surface: dashboard, Ask, open loops, deadlines, timeline, search, saved, meetings, people, privacy, sources, tray and the local model.

Close with **Esc**.

---

## 0:40–1:55 — Where your data goes — 75s

Go to slide **02 · Where your data goes**. Click the slide to open the interactive map.

Say:

> This is the whole pipeline. Two things to see: how RAG and the local model turn a question into a cited answer, and where the data actually travels.

### 0:40–1:12 — RAG, the local model and citations

Point along **AskBar → Tauri `ask` → Hybrid retrieval + rerank → Local model runtime → Citations / Audit log**.

Say:

> The question starts in AskBar and goes to the local Tauri core — not to a cloud. Retrieval is hybrid: BM25 plus local vector candidates, fused and reranked. It selects at most five excerpts and 5,000 characters.

> Those excerpts are the only context sent to the local model. The model writes the answer with `[n]` citations. A second local pass checks every sentence against the excerpts; unsupported sentences are dropped, and if nothing supports the answer it abstains instead of guessing.

> The audit log records which chunks and sources were read, never the chunk text. That is why the citation is the product: you can trace the sentence back to the exact excerpt.

### 1:12–1:55 — Where the data travels

Point at the dashed **device boundary**.

Say:

> Everything inside this dashed box stays on this Mac: local files and OCR, grants and settings, the audit log, the embedding index, the GGUF files and the local model runtime.

> With your data, only two things leave: a read-only Microsoft Graph `GET` with the token for mail, calendar and OneNote, and the question text to Bing only if web search is on.

> Never: note text, mail bodies, calendar content or prompts to a hosted model. There is no FrontDesk server. The model runs here; the sources stay where they were saved.

Close with the **×**, not Esc, if the map has focus. If the map has a **Presentation Stage** control, use it for the full-bleed view; otherwise the overlay is enough.

---

## 1:55–3:10 — Performance & memory (RAM) — 75s

Go to slide **03 · Performance & memory**. Click the slide.

Say:

> These are warm numbers measured on this machine, with Phi-4 Mini loaded.

Point at the **Latency** bars:

> Retrieval is 0.3 milliseconds. Warm generation is 127 milliseconds, then 81 milliseconds to verify the answer against the excerpts.

Point at the **Memory** bars:

> FrontDesk itself is 0.30 GB. The Ollama parent is 0.10 GB. The local model runner is 3.74 GB with Phi-4 Mini loaded — about 4.1 GB resident in total.

Point at **Disk footprint**:

> The model is 2.3 GB on disk, Whisper is 57 MB, the embedding model is 87 MB, and the web bundle is 1.4 MB.

Then the trade-off:

> This is the trade: roughly 4 GB of RAM and 2.3 GB of disk instead of sending manager notes to a hosted API. The cold start adds model load time; the warm path is what the demo uses. Context is capped at five excerpts, 5,000 characters and 8,192 tokens.

Close with **Esc**.

---

## 3:10–3:20 — Hand off

Leave the browser and switch to the already-open **FrontDesk** app.

Say:

> That is the web view. The same local core runs the desktop app — let’s use it.

Do **not** click **Open the app** for the handoff; that opens the download page, not the desktop app.

---

## If asked about privacy or the team

The journal bar has **About** and **Privacy**. Open them only if asked; they are not part of the three-minute flow.
