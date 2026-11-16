# Local models

Drop `.gguf` files here. FrontDesk scans this folder at runtime; adding or
removing a file is the whole "plug a model in or out" workflow.

```
models/
├── README.md
└── microsoft_Phi-4-mini-instruct-Q4_K_M.gguf   (2.3 GB, not committed)
```

## Current model

`microsoft_Phi-4-mini-instruct-Q4_K_M.gguf` is the first selected model.

## How it is used

- The desktop app lists every `.gguf` in this folder on the **Access** and
  **Settings** pages.
- Choose **Extractive** for an instant, citation-bound answer with no model.
- Choose a GGUF file to answer with the local model. The first question imports
  the file into the local Ollama runtime and can take a minute. Later questions
  reuse the imported model.
- The file stays here. Ollama keeps its own runtime copy in its blob store; the
  source of truth for the model is still this folder.

## Packaged app

In a packaged build the folder defaults to the app data directory shown on the
Access page. Set `FRONTDESK_MODELS_DIR` to point somewhere else.

## Git

Model files are ignored by `.gitignore`. Never commit a `.gguf`.
