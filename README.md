# personal-ai-brain

Local-first notes + documents + RAG chat (SQLite, FTS5, OpenAI-compatible LLM) with a **browser UI** (sources + editor + grounded chat). See **[PERSONAL_AI_BRAIN.md](./PERSONAL_AI_BRAIN.md)** for setup and API.

**Stack:** React UI (`web/`), Express API (`src/`), SQLite + files under `DATA_DIR`. Configure everything with the **single root** `.env` (copy from `.env.example`).

**Start everything (dev):** from repo root, after `npm install` and `cd web && npm install`, run **`npm run start:all`** (same as `npm run dev`) — API on port **3030**, UI at **http://127.0.0.1:5173**.

**Core backlog (single device):** **[development.md](./development.md)**.  
**Multi-device, sync, UI enhancements:** **[future_development.md](./future_development.md)**.
