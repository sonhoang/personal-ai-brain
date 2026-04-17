# Development backlog (single-device)

This file is the **feature parity checklist** for the current product: **one physical device**, **one `DATA_DIR`**, **one API process** at a time (enforced by a lock under `DATA_DIR`; see `BRAIN_SKIP_LOCK` in `.env.example`).  

**Reference products** (for scope only): **NotebookLM** — sources + grounded chat / research workflows; **Mem.ai** — personal capture, stream of notes, tags, lightweight recall.  

**Multi-device sync, accounts, sharing, and hosted “teams” releases** are **not** tracked here — see **`future_Development.md`**.

Legend: `[x]` = meaningfully implemented today · `[ ]` = gap to close for closer parity · `[~]` = partial / minimal.

---

## Product scope (frozen for this doc)

- [x] Local-first: SQLite + file uploads on disk, no required cloud.
- [x] Single shared login secret (`BRAIN_PASSWORD`), session in browser.
- [x] Single-device data lock (no concurrent servers on same `DATA_DIR`).
- [x] Core backlog below is tracked section-by-section; not every commercial feature is replicated.

---

## A. Sources & library (NotebookLM-style “notebook”)

| Capability | Status |
|------------|--------|
| Add sources by file upload | [x] `.txt`, `.md`, `.pdf`, `.docx`, `.html`, `.htm`, `.rtf` |
| Text extraction + chunk + FTS index | [x] |
| Many sources in one library | [x] per `DATA_DIR` |
| Separate notebooks / projects per topic | [x] **Workspaces** (`/api/workspaces`, `workspace_id` on notes/docs/threads/search/chat) |
| Cloud file pickers (Drive, Dropbox, …) | [ ] |
| URL / link ingestion | [x] `POST /api/documents/url` |
| YouTube / audio transcripts | [ ] |
| Bulk import (folder, ZIP) | [x] `POST /api/documents/zip` |
| Source list + filter by name | [x] |
| Per-source instructions / “study guide” modes | [~] suggested prompt chips in UI (not per-file) |
| Generated artifacts (flashcards, audio overview, …) | [ ] |

---

## B. Grounded chat & retrieval

| Capability | Status |
|------------|--------|
| Chat with LLM + retrieved context | [x] OpenAI-compatible API |
| Keyword / FTS retrieval | [x] Porter + `bm25` |
| Semantic (embedding) retrieval | [~] optional **`LLM_EMBEDDING_MODEL`**: query + chunk vectors, **rerank** FTS candidates |
| Hybrid rank + rerank | [x] FTS prefetch (`FTS_CANDIDATE_CHUNKS`) then embedding rerank when configured |
| Scoped chat to one document or note | [x] `focus` + UI |
| Citation UI (which chunks used) | [x] chips with **label** + chunk § |
| Page-level or PDF anchor citations | [ ] |
| Streaming tokens in UI | [x] `POST /api/chat/stream` (SSE-style) + checkbox in UI |
| Multi-turn **stored** threads | [x] `/api/chat-threads`, messages persisted; history in LLM context |
| Suggested prompts / guided flows | [x] preset chips (summarize, compare, etc.) |
| Compare or synthesize “across sources” UX | [~] via prompts + model; no separate “compare mode” screen |

---

## C. Search & discovery

| Capability | Status |
|------------|--------|
| Full-text search over indexed content | [x] `/api/search` + “Content matches” |
| Title/tag filter in sidebar | [x] |
| Highlight query terms in snippets | [x] `<mark>` in `excerpt_html` |
| Advanced filters (date, type, tag-only) | [~] workspace-scoped search only |
| “Search only in this notebook” | [x] `workspace_id` on `/api/search` |
| Saved searches / smart collections | [~] **`/api/saved-searches`** CRUD; no dedicated UI yet |

---

## D. Notes & memory stream (Mem-style)

| Capability | Status |
|------------|--------|
| Fast capture: create note | [x] |
| Markdown body + live preview | [x] |
| Tags on notes | [x] |
| Stream / list of notes with dates | [x] |
| Auto-save | [x] debounced |
| Bidirectional links / `[[wiki]]` / graph | [~] **`[[Title]]`** resolves to open note by title (no graph view) |
| Templates, daily note, inbox | [x] **`NOTE_TEMPLATE`**, **Daily**, **Inbox** quick capture, `inbox` column |
| Rich embeds / images inside note body | [ ] |
| Version history & restore | [x] `note_versions`, History in editor |
| AI-suggested titles or tags | [ ] |

---

## E. Documents & media quality

| Capability | Status |
|------------|--------|
| `.docx` via Mammoth | [x] |
| `.pdf` text extraction | [x] layout-simple |
| Legacy `.doc` | [ ] |
| `.pptx`, `.xlsx`, ePub | [ ] |
| `.html` / `.htm` (text extract) | [x] cheerio |
| `.rtf` (basic strip) | [x] heuristic |
| OCR for scans / images | [ ] |
| Layout-aware PDF (columns, tables) | [ ] |
| Larger than ~25 MB / resumable upload | [~] **`MAX_UPLOAD_MB`** (default 40); no resumable protocol |

---

## F. UX, trust, operations (single-device)

| Capability | Status |
|------------|--------|
| Three-pane desktop UI | [x] |
| Mobile / touch polish | [~] larger tap targets under 1100px |
| Offline / PWA | [~] **web manifest** + theme color; **no** service worker / offline cache |
| Accessibility audit | [ ] |
| i18n | [ ] |
| TLS / reverse-proxy docs | [~] operator-managed |
| Upload malware scanning | [ ] |
| API rate limits | [x] `express-rate-limit` (`API_RATE_*`) |
| Structured logging / metrics | [x] one JSON line per response (`method`, `path`, `status`, `ms`) |
| Backup & export wizard (zip `DATA_DIR`) | [x] `GET /api/management/export/backup` + **Backup** in UI |

---

## G. Engineering quality

| Capability | Status |
|------------|--------|
| API integration tests | [~] smoke: `GET /health` (`vitest` + `supertest`) |
| UI tests | [ ] |
| CI (lint, test, build) | [x] GitHub Actions: `npm ci`, `npm ci --prefix web`, `npm test`, `npm run build` |
| `npm audit` / upgrade policy | [ ] |

---

## Recently shipped (changelog-style)

- [x] Workspaces · URL import · ZIP batch · HTML/RTF · configurable upload size · embedding rerank · chat threads + history · stream endpoint · search highlights · wiki links · daily/inbox · note versions · rate limit · request logging · backup ZIP · manifest · smoke tests · CI

---

## How to maintain this file

1. When you **ship** a row, flip `[ ]` → `[x]` or update **Recently shipped**.
2. When a capability requires **sync / accounts / sharing**, **move** it to **`future_Development.md`**.
3. Keep rows **specific** so they map to tickets or PRs.
