# Development backlog — core features (single-device)

**Scope:** One physical device, one `DATA_DIR`, one API process (lock file; `BRAIN_SKIP_LOCK` in `.env.example`). Everything needed for a **NotebookLM × Mem-style hybrid** on that machine belongs **here** until it ships.

**Reference products** (scope only): **NotebookLM** — document-grounded chat / research; **Mem.ai** — capture, tags, recall, light organization.

**Out of this file:** **multi-device**, **continuous sync**, and **non-core UI polish** — see **`future_development.md`** only for those.

Legend: `[x]` done · `[ ]` not done · `[~]` partial / minimal.

---

## Product foundations

- [x] Local-first SQLite + files under `DATA_DIR`
- [x] Bearer auth (`BRAIN_PASSWORD`)
- [x] Single-writer lock on `DATA_DIR`
- [x] Workspaces (“notebooks”) with `workspace_id` on notes, documents, threads, search, chat

---

## A. Sources & library (grounded research)

| Capability | Status |
|------------|--------|
| Upload: `.txt` `.md` `.pdf` `.docx` `.html` `.htm` `.rtf` | [x] |
| URL fetch → document | [x] |
| ZIP batch import | [x] |
| Text extract → chunk → FTS index | [x] |
| **Folder / directory watch** auto-import (`BRAIN_WATCH_DIRS`, new files only) | [x] |
| **Cloud pickers** (Drive, Dropbox, OneDrive, …) | [ ] |
| **YouTube / podcast / audio** → transcript → index | [ ] |
| **Email / “send to brain”** ingest | [ ] |
| Per-source **instructions** / pinned system hints for chat | [x] |
| **Generated artifacts**: flashcards, quiz, outline, slide bullets from library | [x] |
| **Export** library (Markdown bundle, JSON, not only raw ZIP) | [x] |
| **Import restore** from backup ZIP (round-trip: backup → **Restore** in UI + `POST /management/import/backup`) | [x] |

---

## B. Retrieval & grounded chat

| Capability | Status |
|------------|--------|
| FTS + BM25 chunk retrieval | [x] |
| Optional **embedding rerank** of FTS candidates (`LLM_EMBEDDING_MODEL`) | [x] |
| **Dense-only** or hybrid search without FTS gate (index all chunks by vector) | [ ] |
| Scoped chat (`focus` document/note) | [x] |
| Chat + **thread history** in model context | [x] |
| **Non-streaming** and **streaming** completion | [x] |
| Citation chips (label + §) | [x] |
| **PDF page / location** in citations | [x] (re-index PDFs after upgrade; metadata per chunk) |
| **Reranker** model (cross-encoder) after vector/FTS | [ ] |
| **Query rewrite** / HyDE / step-back for hard questions | [ ] |
| Dedicated **“compare these sources”** or **research report** flow (structured UI) | [ ] |
| **Tool use** (e.g. search again, read full note) in chat loop | [ ] |

---

## C. Search & discovery

| Capability | Status |
|------------|--------|
| Full-text search API + UI “Content matches” | [x] |
| Snippet **highlight** (`excerpt_html`) | [x] |
| Workspace-scoped search | [x] |
| Title/tag sidebar filter | [x] |
| **Saved searches**: API | [x] |
| **Saved searches**: in-app UI (save / run / delete) | [x] |
| **Filters**: date range, type (note/doc), tag-only, inbox-only | [~] (type, tag, date range, inbox via API; minimal UI) |
| **Sort** results by recency / source type | [~] (recency + relevance in API; UI sort control) |
| **“Similar to this chunk”** (vector neighborhood) | [ ] |

---

## D. Notes & memory (Mem-like)

| Capability | Status |
|------------|--------|
| Markdown + preview, tags, autosave | [x] |
| Daily note, inbox capture, `NOTE_TEMPLATE` | [x] |
| `[[wiki]]` resolve by title | [x] |
| **Backlinks** panel (“notes linking here”) | [x] |
| **Graph** view (nodes/edges) | [ ] |
| **Images / attachments** inline in note body | [ ] |
| **AI-suggested** titles, tags, or links after save | [ ] |
| **Rules / smart collections** (e.g. tag `project/x` auto-group) | [ ] |
| **Mem-like resurfacing** (e.g. “on this day”, stale note nudges) — local heuristics | [ ] |
| Note **templates** picker (multiple named templates, not one env string) | [ ] |

---

## E. Documents & media

| Capability | Status |
|------------|--------|
| `.docx` `.pdf` (simple layout) | [x] |
| `.html` `.rtf` (basic) | [x] |
| Legacy **`.doc`** | [ ] |
| **`.pptx` `.xlsx`** text/table extract | [ ] |
| **ePub** | [ ] |
| **OCR** for scanned PDF / images | [ ] |
| **Layout-aware PDF** (columns, tables) | [ ] |
| **Resumable / chunked** upload for huge files | [ ] |
| **`MAX_UPLOAD_MB`** cap | [x] |

---

## F. Trust, ops, single-host

| Capability | Status |
|------------|--------|
| Rate limiting | [x] |
| JSON request logging | [x] |
| Backup ZIP export | [x] |
| **Restore** from backup (see §A) | [x] |
| Upload **malware / type** hardening beyond extension/MIME | [ ] |
| **Encryption at rest** for SQLite or uploads (optional) | [ ] |
| Operator doc: **reverse proxy + TLS** | [~] (mention in README / PERSONAL_AI_BRAIN only) |

*Responsive deep-dive, PWA offline, a11y, i18n, themes, desktop shell → **`future_development.md` §3**.*

---

## G. Engineering (core quality)

| Capability | Status |
|------------|--------|
| Smoke API test (`/health`) | [x] |
| CI: install, test, build | [x] |
| **API tests**: auth, notes, documents, search, chat (contract) | [ ] |
| **Load / fuzz** tests for upload & FTS | [ ] |
| **Lint** in CI (ESLint / Prettier policy) | [ ] |
| **`npm audit`** / dependency upgrade cadence doc | [ ] |
| **Migrations** playbook for existing user `DATA_DIR` | [~] (incremental `user_version`; expand runbook) |

---

## Recently shipped (short)

Workspaces · URL/ZIP · HTML/RTF · embedding rerank · threads · stream · search highlights · wiki · daily/inbox · versions · backup export/import · library JSON/MD export · saved-search UI · search filters/sort · PDF page cites · per-source chat hints · artifacts · folder watch · backlinks · rate limit · logging · manifest · smoke + CI.

---

## Maintenance

1. Ship a row → flip `[ ]` → `[x]` or `[~]` → `[x]`.
2. If it is **only** multi-device, sync, or **non-core UI**, do **not** add here — use **`future_development.md`**.
3. Prefer **one row = one ticket** level of specificity.
