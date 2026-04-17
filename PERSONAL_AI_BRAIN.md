# Personal AI Brain (local-first)

Single-user **personal** knowledge + chat, **one device** per library: everything stays on disk under `DATA_DIR` (default `./data`) — **SQLite**, **FTS5**, and **uploads**. Only **one server process** may use a given `DATA_DIR` at a time (lock file; see `.env.example` / `BRAIN_SKIP_LOCK`). One shared secret in `.env` protects the HTTP API. **Multi-device sync and sharing** are out of scope for this baseline — see **`future_Development.md`**.

## Principles

- **Local first** — `data/brain.sqlite`, `data/uploads/`, no cloud DB.
- **TypeScript** — Node 20+, Express, `better-sqlite3`.
- **Auth** — `Authorization: Bearer <BRAIN_PASSWORD>` on all `/api/*` routes. `GET /health` is unauthenticated for quick checks.
- **LLM** — optional; configure an **OpenAI-compatible** endpoint in `.env` (Ollama, LM Studio, OpenAI, etc.). No in-app key management.

## Modules

| Path | Role |
|------|------|
| `src/modules/notes/` | CRUD notes, tags, FTS reindex |
| `src/modules/documents/` | Upload `.txt` / `.md` / `.pdf` / `.docx`, extract text, index |
| `src/modules/indexing/` | Chunking + SQLite FTS5 retrieval |
| `src/modules/chat/` | RAG-style context + chat completion |
| `src/modules/management/` | Counts / summary (`/api/management/summary`) |

## Build & run

```bash
cd personal-ai-brain
cp .env.example .env
# Edit .env — set BRAIN_PASSWORD and optionally LLM_* 

npm install
cd web && npm install && cd ..
npm run start:all
# (same as `npm run dev` — API + Vite UI together)
# or production:
npm run build && npm start
```

**Development:** `npm run dev` runs the API on **`http://127.0.0.1:3030`** and the **React (Vite)** UI on **`http://127.0.0.1:5173`**. Open **5173** in the browser; Vite proxies `/api` and `/health` to the API.

**Production:** `npm run build && npm start` serves the built UI from **`web/dist`** on **`PORT`** (default **3030**), same origin as `/api`.

### Web UI — how it lines up with NotebookLM and Mem.ai

This app is **inspired by** both products, but it is a **local MVP**: one machine, one password, one combined library. Below is what you actually get, what you must do once, and what is **not** the same as the commercial apps.

#### One-time setup (not “zero config,” but only once)

1. Copy **`.env.example` → `.env`** and set **`BRAIN_PASSWORD`** (this is your login password in the UI).
2. **`npm install`** at repo root and **`npm install`** in **`web/`** (or use your usual install flow).
3. For **chat** to answer questions (not just store notes/files), set **`LLM_*`** in `.env` to an **OpenAI-compatible** server (Ollama, LM Studio, OpenAI, etc.) and restart the API.
4. Run **`npm run start:all`**, open the UI (**5173** in dev, or **`/`** on **`PORT`** in prod), sign in with **`BRAIN_PASSWORD`**.

After that, **day to day** you only open the UI: upload, write notes, chat. No separate database admin step — SQLite and uploads live under **`DATA_DIR`**.

#### What you do in the app (daily workflow)

| Action | Where in the UI | What happens |
|--------|-----------------|--------------|
| **Upload files** | Left **Sources** panel — drag‑drop or click | **`.txt`**, **`.md`**, **`.pdf`**, **`.docx`** (not legacy **`.doc`**). Text is extracted (`pdf-parse`, `mammoth`), chunked, indexed (**FTS5**). **Image‑only / scanned PDFs** yield little or no text until you add OCR elsewhere. |
| **Capture notes** | **+ Note**, pick note in list, edit center pane | **Mem.ai‑like**: titled notes, **tags** (comma‑separated), **Markdown** + live preview, **auto‑save** after you pause typing. Notes are indexed like documents. |
| **Find things** | Top **filter** box | Filters the **note list** and **document list** by title/name/tags (not full‑text search UI yet). |
| **Chat over your library** | Right **Chat** panel | **NotebookLM‑like**: each message runs **retrieval** (FTS) over indexed notes + documents, then calls the LLM. Replies can show **citation chips**. Use **All sources** vs scoped mode (below). |
| **Chat scoped to one source** | Click a **document** in Sources, or **Scope chat to this note** in the editor | Retrieval runs only on that **document** or **note** until you click **All sources**. |
| **Sign out** | **Sign out** | Clears the token and chat scope from the browser session. |

#### Similar vs different (honest map)

| Idea | **NotebookLM** (Google) | **Mem.ai** | **This repo** |
|------|-------------------------|------------|----------------|
| **Sources + Q&A** | Upload many sources; chat grounded on them | More “memory stream” than source notebooks | **Yes** — uploads + notes feed **one** shared index; chat is RAG-style with **keyword/FTS** retrieval (not embeddings). |
| **Citations** | Clear source references | Varies | **Partial** — chips show **chunk/source ids** and type, not polished PDF page links. |
| **Note taking** | Not the main metaphor | **Core** — quick capture, tags | **Yes** — markdown notes, tags, stream list, auto-save. |
| **Hosting** | Cloud | Cloud | **Local** — your disk only; **you** run Node + (optional) local LLM. |
| **Login** | Google account | SaaS account | **Single password** from **`.env`** (`BRAIN_PASSWORD`), stored in **`sessionStorage`** for the session. |
| **File types** | PDF, Google Docs, etc. | Many integrations | **`.txt` / `.md` / `.pdf` / `.docx`** locally. No Google Drive, no legacy `.doc`. |
| **Per‑project isolation** | One “notebook” per project | Collections / spaces | **No** — one **global** library per **`DATA_DIR`** (optional future work). |
| **Multi‑user / sync** | Yes | Yes | **No** — single-user, local files. |
| **Retrieval** | Often embedding-based | Varies | **FTS / keyword** chunks only — **no vector embeddings** yet. |

So: you can **upload** common office/text formats, **write** notes, and **chat** with optional **single‑source** scope — still a **local** MVP vs cloud NotebookLM/Mem (no sync, no per‑project notebooks, no embedding RAG).

The UI is **React + TypeScript** under **`web/`** (Vite). The API remains usable headless (curl, scripts) with the same **`Authorization: Bearer …`** header.

## Environment

See `.env.example`. Required: **`BRAIN_PASSWORD`**. Optional: **`LLM_*`**, **`LLM_EMBEDDING_MODEL`** (semantic rerank), **`CHAT_CONTEXT_CHUNKS`**, **`FTS_CANDIDATE_CHUNKS`**, **`MAX_UPLOAD_MB`**, **`NOTE_TEMPLATE`**, **`API_RATE_*`**, **`PORT`**, **`DATA_DIR`**, **`BRAIN_SKIP_LOCK`**.

## API (all under `/api`, Bearer required)

- `GET /api/management/summary` — counts; **`llmConfigured`**, **`embeddingConfigured`**, **`dataDir`**.
- `GET /api/management/export/backup` — downloads **`brain.sqlite`** + **`uploads/`** as a ZIP.
- `GET|POST|PATCH|DELETE /api/workspaces` — notebooks; delete reassigns content to **`default`**.
- `GET|POST|PATCH|DELETE /api/notes` — query **`workspace_id`**, **`inbox=1`**; **`POST /notes/daily`**, **`POST /notes/quick`**; **`GET /notes/:id/versions`**, **`POST /notes/:id/restore_version`**.
- `GET|POST|DELETE /api/documents` — `POST` multipart **`file`** + **`workspace_id`**; types include `.pdf`, `.docx`, `.html`, `.rtf`. **`POST /documents/url`** JSON `{ url, workspace_id }`. **`POST /documents/zip`** multipart ZIP.
- `GET /api/search?q=&limit=&workspace_id=` — FTS hits; each hit includes **`excerpt_html`** (highlighted) and **`excerpt`**.
- `GET /api/chat-threads?workspace_id=` · `POST /` · `GET /:id/messages` · `PATCH /:id` · `DELETE /:id`.
- `GET /api/saved-searches?workspace_id=` · `POST /` · `DELETE /:id`.
- `POST /api/chat` — body includes **`message`**, optional **`workspace_id`**, **`thread_id`**, **`focus`**. Appends to thread when **`thread_id`** set.
- `POST /api/chat/stream` — same body as chat; **SSE** stream (`data: {"token"}` … `{"done":true,"sources"}`).

**Single-device feature parity** (vs common reference apps) is tracked in **`development.md`**. **Sync, multi-device, sharing, and release** planning live in **`future_Development.md`**.

## Roadmap (from original spec)

Later: OCR, cloud connectors, **`.doc` / Office** beyond current set, saved-search UI, true PWA offline, fuller a11y/i18n. Current stack: **workspaces**, URL/ZIP ingest, **HTML/RTF**, optional **embedding rerank**, **chat threads** + **streaming**, backup ZIP, rate limits — see **`development.md`**.

## Migration from old spec

The previous `llmnote_ai_brain_spec.md` described a larger NotebookLM-style product. This document replaces it for the **personal, local, env-password** variant.
