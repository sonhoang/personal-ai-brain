# Future development — multi-device, sync, and UI enhancements

Work that is **not** required for a single-machine “core brain.” **All functional gaps for one device** stay in **`development.md`**.

---

## 1. Multi-device

- Same person, **multiple machines** (laptop + desktop + tablet) with one logical library.
- **Device roles** (e.g. primary writer vs read-mostly) if you avoid concurrent SQLite writers.
- **Conflict surfacing** when two devices edited the same note (merge UI, last-write-wins, or CRDT — product choice).
- Optional **phone** client or **responsive** shell that assumes sync exists (see §2).

---

## 2. Sync

- **Protocol**: snapshot export/import, op-log replication, or hybrid — see `development.md` for **import restore** as core; sync is **continuous** reconciliation across devices.
- **Transport**: your server, peer-to-peer, or encrypted blob store — not decided here.
- **Identity** beyond `BRAIN_PASSWORD` (device keys, optional accounts) only if sync needs it.
- **Shared libraries** (read-only or edit with others) are a **sync + policy** problem; defer until sync design exists.

---

## 3. UI enhancements

Pure **presentation and ergonomics** (same features, nicer or more surfaces):

- **Mobile / tablet** layouts beyond current breakpoint tweaks; gesture-friendly panes.
- **PWA**: service worker, **offline** cache for shell + last session, “install app.”
- **Accessibility**: full keyboard paths, focus order, ARIA on custom panes, contrast audit.
- **Internationalization** (i18n): extract strings, locales, RTL if needed.
- **Themes** (dark/light), density, font scale.
- **Desktop shell**: Electron / Tauri wrapper (tray, file associations) if you want a “real app” binary.
- **Saved searches UI** (API already exists): panel to save/run/delete named queries.
- **Richer visualizations**: note **graph** / backlinks view, timeline, tag cloud (if not “logic” in `development.md`, treat as UI-only exploration of existing data).
- **Streaming / thread UX polish**: typing indicators, abort, edit-last-message, copy/export thread.
- **Onboarding**, empty states, inline help, and tutorial overlays.

---

## How to use this file

- If it touches **data model**, **sync**, or **multi-writer** semantics, start in **§1–2** and link from `development.md` only as a pointer.
- If it is **look, feel, reachability, or device form factor**, use **§3**.
