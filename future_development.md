# Future development — multi-device, sync, and release

This document is for work **after** the **single-device** baseline in **`development.md`**. Nothing here is required to run the app today.

---

## Goals (typical order)

1. **Reliable backup** — one-click export/import of a library (archive `DATA_DIR` or logical export) so users can move machines manually before true sync exists.
2. **Identity** — optional accounts (email/OAuth) if you move beyond `BRAIN_PASSWORD`, or device keys for E2E sync.
3. **Multi-device sync** — same library on phone + laptop + tablet with conflict handling.
4. **Sharing** — read-only links, shared workspaces, or comment-only collaborators (policy decision).
5. **Hosted / team release** — multi-tenant or self-hosted server SKU, billing if applicable.

---

## Multi-device sync — design axes

| Approach | Pros | Cons |
|----------|------|------|
| **Folder / cloud drive** (user points Syncthing, iCloud, Dropbox at `DATA_DIR`) | Simple, no server | SQLite + WAL across OSes is fragile; need **exclusive use** or **export bundle** workflow |
| **Dedicated sync service** | Safe merges, optional E2E | You operate or ship a sync server |
| **CRDT / event log** | Great for notes text | Heavy engineering; documents/binary need separate strategy |
| **“Primary device” + pull** | Simpler than bidirectional | Worse UX on secondary devices |

**Likely path for this codebase:** keep **single-writer SQLite** per device; introduce **sync protocol** (upload/download snapshots or op-log) + **merge policy**; avoid two live writers on one file.

---

## Sharing & collaboration (later)

- Workspace membership (owner, editor, viewer).
- Share links with expiry; optional password on link.
- Comment threads on notes or highlights (if you add highlights).
- Real-time co-editing is **optional** and expensive; async + locking is easier.

---

## Release & distribution

- **Desktop:** Electron/Tauri wrapper, or documented “run Node + open browser.”
- **Mobile:** native or Capacitor; sync becomes mandatory for good UX.
- **Versioning:** semver API, migration scripts for SQLite schema.
- **Update channel:** in-app update vs package managers.

---

## Security when networked

- TLS termination (reverse proxy).
- Per-user auth, session rotation, CSRF for cookie-based UI if you drop Bearer-only.
- Rate limits, upload quotas, audit log for shared instances.
- Optional **E2E encryption** of note bodies / attachments (key management is hard; often deferred).

---

## What to pull from `development.md` when going multi-device

Items that **block** sync or sharing if left local-only:

- Note/document **identity** stable across devices (UUIDs already OK).
- **Schema migrations** with backward compatibility.
- **Conflict UI** (last-write-wins vs merge).
- **Attachment deduplication** and large blob sync.

Track concrete tickets here as you commit to a sync design; keep **`development.md`** focused on **single-device parity** with reference products.
