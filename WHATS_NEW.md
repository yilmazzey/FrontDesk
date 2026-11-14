# What changed on `yilmazzey`

This branch turns the desktop folder from a **clickable mock-up** into a **working
local-first app**. The web landing page is unchanged.

Before this branch, the desktop app had screens with fake data. The Rust side did
nothing, there was no real file access, no answers, no model and no tests.

## In simple English

### 1. The desktop app is now a real app
It opens as a Tauri window with a small Rust program behind it. The screens talk
to that program instead of using hardcoded sample data. `FrontDesk` now has a real
"local core" — a process on your machine, not a server.

### 2. You can grant and revoke folders
The **Access** page lets you pick a folder on your computer. FrontDesk remembers
only the folder path — not the files, not the text. Press **Revoke** and that
folder disappears from the very next question. A sample-notes button lets you
restore the built-in demo after revoking it.

### 3. Notes are read from the original, on demand
The **Notes** page reads a Markdown, text, PDF or image file only when you open
it. Nothing is copied into a database. If you edit the file, the next read shows
the new version.

### 4. Ask is a chat, not just a search box
Ask has two modes:

- **Chat** (default) — talks like a normal assistant. It can answer general
  questions and give advice from the model's own knowledge. When it uses your
  files, it cites them, and the answer is labeled **Mixed** or **From your
  sources**. When it does not use your files, it is labeled **General
  knowledge · not from your files**.
- **Sources only** — the strict mode. Every claim must come from an allowed
  source, the exact quote is shown, and missing evidence is refused with **no**
  citation.

So "what is the capital of France?" now gets a real answer in Chat mode, while
"what does my protocol say about retention?" still shows the exact excerpt.

### 5. It can ask one clarifying question
If two allowed sources match equally, FrontDesk asks which one you meant instead
of picking one at random.

### 6. It can run a local model
The first model, `microsoft_Phi-4-mini-instruct-Q4_K_M.gguf`, sits in `models/`.
Choose it on Access or Settings and press **Load / warm model**. Models are plain
`.gguf` files: drop one in, remove one, no code change. **Extractive** mode needs
no model at all and is the fastest demo.

### 7. OCR, PDFs and more file types work
Images are read with `tesseract`. PDFs with no text layer are turned into page
images with `pdftoppm`, OCR'd, and the temporary images are deleted immediately.
The answer cites the page. Nothing OCR'd is saved. Markdown, text, LaTeX, reST
and HTML files are read too, so a paper folder with `main.tex`, `main.pdf` and
`notes.md` all work.

Summary questions ("summarize the article", "what is this about?") now read the
most relevant source instead of refusing because the question has no matching
keywords.

### 8. There is a private activity log
Access shows a log of **that** a source was read, never **what** it said. It is a
local file with no note or mail content in it.

### 9. There are real tests
- A 25-question test: 17 answerable, 5 unanswerable, 3 ambiguous, run in Sources-only mode.
- Answerable questions must have a real citation; unanswerable ones must have none.
- Chat-mode unit tests: general knowledge is kept and labeled, real citations are grounded, mixed answers are labeled, and fake citations are stripped.
- Two OCR tests, one for an image and one for a scanned PDF.
- A test that finds the GGUF model in `models/`.

### 10. The setup docs were rewritten
Root `README.md` and `desktop/README.md` now explain how to install Rust, run the
real desktop window, add a model, and what is still a placeholder.

## What is still not done

- Microsoft Graph is **not connected**. Outlook, OneNote, Teams and calendar are
  empty stubs behind the same grant/revoke path.
- Signed installers and notarisation are not done.
- OCR citations point at a **page**, not a precise rectangle on the page.
- There is no sync, no cloud, no account, and no persistent note store — by design.

## Quick start for teammates

```bash
git clone https://github.com/yilmazzey/FrontDesk.git
cd FrontDesk
git checkout yilmazzey

npm install

# Terminal 1: landing page
npm run dev                 # http://localhost:5173

# Terminal 2: real desktop app (needs Rust)
npm run dev:tauri
```

Optional, for models and OCR:

```bash
brew install ollama tesseract poppler
ollama serve
```

The full setup, routes, troubleshooting and non-negotiables are in
[`README.md`](README.md).
