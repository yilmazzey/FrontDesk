# What changed on `yilmazzey`

This branch turns the desktop folder from a **clickable mock-up** into a **working
local-first app**, and pushes the landing page's 3D desk and gallery further: the
desk is zoomable and framed on the monitor, and the gallery is now full-bleed
presentation slides.

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

### 4. Ask is one assistant
Ask is a single assistant, not a search box and not two competing screens:

- It prefers the files you allowed and cites them with a compact **Sources**
  list under the answer.
- When your files do not cover the question, it answers from general knowledge
  and labels that clearly instead of pretending it came from your notes.
- Answers stay short by default, with an excerpt tucked behind each source.
- **Search** is still there, but only as a plain file browser: it lists and
  filters what you granted and never answers.

A **Strict citations** setting (Access/Settings) keeps the older citation-or-refuse
behaviour for demos or grading. There is no mode switch on the Ask page.

So "what is the capital of France?" gets a short general answer, while "what does
my protocol say about retention?" shows the exact excerpt it used.

### 5. It can ask one clarifying question
If two allowed sources match equally, FrontDesk asks which one you meant instead
of picking one at random.

### 6. It can run a local model
The first model, `microsoft_Phi-4-mini-instruct-Q4_K_M.gguf`, sits in `models/`.
Choose it on Access or Settings and press **Load / warm model**. Models are plain
`.gguf` files: drop one in, remove one, no code change. FrontDesk now starts
llama.cpp's `llama-server` with the GGUF directly; if `llama-server` is not on
PATH it falls back to Ollama. **Extractive** mode needs no model at all and is
the fastest demo.

Web access is not wired yet: it needs a consent screen and a search backend
before answers can cite URLs. Everything still runs locally by default.

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
brew install llama.cpp tesseract poppler
# Optional fallback if you already use Ollama:
# brew install ollama && ollama serve
```

The full setup, routes, troubleshooting and non-negotiables are in
[`README.md`](README.md).
