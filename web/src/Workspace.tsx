import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  api,
  clearToken,
  uploadDocument,
  uploadZip,
  downloadBackup,
  downloadLibraryExport,
  uploadBackupRestore,
  getToken
} from "./api";
import { extractWikiLinkTargets, mdToHtml } from "./md";
import type {
  ChatResponse,
  ChatSource,
  ChatThread,
  DocumentListItem,
  LibrarySearchHit,
  ManagementSummary,
  Note,
  NoteVersion,
  SavedSearch,
  Workspace
} from "./types";

type ChatMsg =
  | { kind: "user"; text: string }
  | { kind: "assistant"; text: string; sources?: ChatSource[] }
  | { kind: "error"; text: string }
  | { kind: "system"; md: string };

const SUGGESTED_PROMPTS = [
  "Summarize the main themes across my sources.",
  "What are open questions I should research next?",
  "Compare conflicting claims in my notes.",
  "List action items mentioned in my library."
];

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  } catch {
    return "";
  }
}

type Props = { onLogout: () => void };

export function Workspace({ onLogout }: Props) {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [workspaceId, setWorkspaceId] = useState("default");
  const [filter, setFilter] = useState("");
  const [notes, setNotes] = useState<Note[]>([]);
  const [documents, setDocuments] = useState<DocumentListItem[]>([]);
  const [llmOn, setLlmOn] = useState(false);
  const [embedOn, setEmbedOn] = useState(false);
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [tagsStr, setTagsStr] = useState("");
  const [saveState, setSaveState] = useState<"saved" | "saving" | "error">("saved");
  const [chatInput, setChatInput] = useState("");
  const [chatMsgs, setChatMsgs] = useState<ChatMsg[]>([]);
  const [chatScope, setChatScope] = useState<{
    type: "document" | "note";
    id: string;
    label: string;
  } | null>(null);
  const [uploadDrag, setUploadDrag] = useState(false);
  const [ftsHits, setFtsHits] = useState<LibrarySearchHit[]>([]);
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [useStream, setUseStream] = useState(false);
  const [streamingDraft, setStreamingDraft] = useState<string | null>(null);
  const [urlImport, setUrlImport] = useState("");
  const [versions, setVersions] = useState<NoteVersion[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>([]);
  const [searchSourceType, setSearchSourceType] = useState<"all" | "note" | "document">("all");
  const [searchSort, setSearchSort] = useState<"rank" | "recency">("rank");
  const [searchTag, setSearchTag] = useState("");
  const [noteChatInstr, setNoteChatInstr] = useState("");
  const [docChatInstr, setDocChatInstr] = useState("");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const zipInputRef = useRef<HTMLInputElement>(null);
  const backupRestoreInputRef = useRef<HTMLInputElement>(null);
  const wikiIndex = notes.map(n => ({ id: n.id, title: n.title || "Untitled" }));

  const backlinks = useMemo(() => {
    if (!activeNoteId) return [] as { id: string; title: string }[];
    const target = (title.trim() || "Untitled").toLowerCase();
    const out: { id: string; title: string }[] = [];
    for (const n of notes) {
      if (n.id === activeNoteId) continue;
      const targets = extractWikiLinkTargets(n.body || "");
      if (targets.some(t => t.toLowerCase() === target)) {
        out.push({ id: n.id, title: n.title || "Untitled" });
      }
    }
    return out;
  }, [activeNoteId, title, notes]);

  const loadWorkspaces = useCallback(async () => {
    const r = await api<{ workspaces: Workspace[] }>("/workspaces");
    setWorkspaces(r.workspaces);
  }, []);

  const loadThreads = useCallback(async () => {
    const r = await api<{ threads: ChatThread[] }>(
      `/chat-threads?workspace_id=${encodeURIComponent(workspaceId)}`
    );
    setThreads(r.threads);
  }, [workspaceId]);

  const loadLibrary = useCallback(async () => {
    const [nRes, dRes, s] = await Promise.all([
      api<{ notes: Note[] }>(`/notes?workspace_id=${encodeURIComponent(workspaceId)}`),
      api<{ documents: DocumentListItem[] }>(
        `/documents?workspace_id=${encodeURIComponent(workspaceId)}`
      ),
      api<ManagementSummary>("/management/summary")
    ]);
    setNotes(nRes.notes);
    setDocuments(dRes.documents);
    setLlmOn(s.llmConfigured);
    setEmbedOn(Boolean(s.embeddingConfigured));
  }, [workspaceId]);

  const loadSavedSearches = useCallback(async () => {
    const r = await api<{ saved: SavedSearch[] }>(
      `/saved-searches?workspace_id=${encodeURIComponent(workspaceId)}`
    );
    setSavedSearches(r.saved);
  }, [workspaceId]);

  useEffect(() => {
    loadWorkspaces().catch(() => {});
  }, [loadWorkspaces]);

  useEffect(() => {
    loadLibrary().catch(() => {});
    loadThreads().catch(() => {});
    loadSavedSearches().catch(() => {});
  }, [loadLibrary, loadThreads, loadSavedSearches]);

  useEffect(() => {
    const q = filter.trim();
    if (q.length < 2) {
      setFtsHits([]);
      return;
    }
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      const p = new URLSearchParams({
        q,
        limit: "25",
        workspace_id: workspaceId
      });
      if (searchSourceType !== "all") p.set("type", searchSourceType);
      if (searchSort === "recency") p.set("sort", "recency");
      const tag = searchTag.trim();
      if (tag) p.set("tag", tag);
      api<{ hits: LibrarySearchHit[] }>(`/search?${p.toString()}`)
        .then(r => setFtsHits(r.hits))
        .catch(() => setFtsHits([]));
    }, 350);
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [filter, workspaceId, searchSourceType, searchSort, searchTag]);

  useEffect(() => {
    if (chatScope?.type === "document") {
      const d = documents.find(x => x.id === chatScope.id);
      setDocChatInstr(d?.chat_instruction ?? "");
    } else {
      setDocChatInstr("");
    }
  }, [chatScope, documents]);

  const selectThread = useCallback(
    async (tid: string | null) => {
      setActiveThreadId(tid);
      if (!tid) {
        setChatMsgs([]);
        return;
      }
      const r = await api<{ messages: { role: string; content: string; sources_json: string | null }[] }>(
        `/chat-threads/${tid}/messages`
      );
      const msgs: ChatMsg[] = [];
      for (const m of r.messages) {
        if (m.role === "user") msgs.push({ kind: "user", text: m.content });
        if (m.role === "assistant") {
          let sources: ChatSource[] | undefined;
          try {
            sources = JSON.parse(m.sources_json || "null") ?? undefined;
          } catch {
            sources = undefined;
          }
          msgs.push({ kind: "assistant", text: m.content, sources });
        }
      }
      setChatMsgs(msgs);
    },
    []
  );

  const selectNote = useCallback(async (id: string) => {
    setActiveNoteId(id);
    const n = await api<Note>(`/notes/${id}`);
    setTitle(n.title || "");
    setBody(n.body || "");
    setTagsStr((n.tags || []).join(", "));
    setNoteChatInstr(n.chat_instruction ?? "");
    setSaveState("saved");
    setShowHistory(false);
    const v = await api<{ versions: NoteVersion[] }>(`/notes/${id}/versions`).catch(() => ({
      versions: [] as NoteVersion[]
    }));
    setVersions(v.versions);
  }, []);

  const scheduleSave = useCallback(() => {
    if (!activeNoteId) return;
    setSaveState("saving");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        const tags = tagsStr
          .split(",")
          .map(t => t.trim())
          .filter(Boolean);
        await api(`/notes/${activeNoteId}`, {
          method: "PATCH",
          body: { title, body, tags, chat_instruction: noteChatInstr.trim() || null }
        });
        setSaveState("saved");
        await loadLibrary();
        const v = await api<{ versions: NoteVersion[] }>(`/notes/${activeNoteId}/versions`);
        setVersions(v.versions);
      } catch (e) {
        setSaveState("error");
      }
    }, 700);
  }, [activeNoteId, title, body, tagsStr, noteChatInstr, loadLibrary]);

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  async function newNote() {
    const n = await api<Note>("/notes", {
      method: "POST",
      body: { title: "New note", body: "", tags: [], workspace_id: workspaceId }
    });
    await loadLibrary();
    await selectNote(n.id);
  }

  async function newDaily() {
    const n = await api<Note>("/notes/daily", {
      method: "POST",
      body: { workspace_id: workspaceId }
    });
    await loadLibrary();
    await selectNote(n.id);
  }

  async function quickCapture() {
    const n = await api<Note>("/notes/quick", {
      method: "POST",
      body: { workspace_id: workspaceId, title: "Inbox", body: "" }
    });
    await loadLibrary();
    await selectNote(n.id);
  }

  async function deleteNote() {
    if (!activeNoteId || !confirm("Delete this note?")) return;
    await api(`/notes/${activeNoteId}`, { method: "DELETE" });
    setActiveNoteId(null);
    setTitle("");
    setBody("");
    setTagsStr("");
    setNoteChatInstr("");
    await loadLibrary();
  }

  async function saveDocChatInstr() {
    if (chatScope?.type !== "document") return;
    try {
      await api(`/documents/${chatScope.id}`, {
        method: "PATCH",
        body: { chat_instruction: docChatInstr.trim() || null }
      });
      await loadLibrary();
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    }
  }

  async function runArtifact(kind: "outline" | "flashcards" | "quiz" | "slide_bullets") {
    try {
      const r = await api<{ markdown: string }>("/artifacts/generate", {
        method: "POST",
        body: { workspace_id: workspaceId, kind }
      });
      setChatMsgs(m => [...m, { kind: "system", md: r.markdown }]);
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    }
  }

  async function restoreVersion(vid: number) {
    if (!activeNoteId) return;
    await api<Note>(`/notes/${activeNoteId}/restore_version`, {
      method: "POST",
      body: { version_id: vid }
    });
    await selectNote(activeNoteId);
  }

  async function onUploadFile(file: File) {
    try {
      const d = await uploadDocument(file, workspaceId);
      await loadLibrary();
      setChatMsgs(m => [...m, { kind: "system", md: `Indexed **${d.original_name}** for search & chat.` }]);
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    }
  }

  async function onZip(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const out = await uploadZip(file, workspaceId);
      await loadLibrary();
      setChatMsgs(m => [
        ...m,
        {
          kind: "system",
          md: `ZIP: imported **${out.imported}** file(s).${out.errors.length ? ` Warnings: ${out.errors.join("; ")}` : ""}`
        }
      ]);
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    }
  }

  async function saveNamedSearch() {
    const q = filter.trim();
    if (q.length < 2) {
      alert("Enter a search in the top bar (2+ characters) before saving.");
      return;
    }
    const name = window.prompt("Name for this saved search?", q.slice(0, 48));
    if (!name?.trim()) return;
    try {
      await api<SavedSearch>("/saved-searches", {
        method: "POST",
        body: { workspace_id: workspaceId, name: name.trim(), query: q }
      });
      await loadSavedSearches();
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    }
  }

  async function deleteNamedSearch(id: string) {
    if (!confirm("Delete this saved search?")) return;
    try {
      await api(`/saved-searches/${id}`, { method: "DELETE" });
      await loadSavedSearches();
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    }
  }

  async function onRestoreBackup(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (
      !confirm(
        "Replace this entire library with the backup ZIP? Current notes and documents on disk will be overwritten. Continue?"
      )
    ) {
      return;
    }
    try {
      await uploadBackupRestore(file);
      window.location.reload();
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    }
  }

  async function doUrlImport() {
    const u = urlImport.trim();
    if (!u) return;
    try {
      const d = await api<{ original_name: string }>("/documents/url", {
        method: "POST",
        body: { url: u, workspace_id: workspaceId }
      });
      setUrlImport("");
      await loadLibrary();
      setChatMsgs(m => [...m, { kind: "system", md: `Fetched **${d.original_name}** from URL.` }]);
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    }
  }

  async function newChatThread() {
    const t = await api<ChatThread>("/chat-threads", {
      method: "POST",
      body: { workspace_id: workspaceId, title: "Chat" }
    });
    await loadThreads();
    await selectThread(t.id);
  }

  function buildChatBody(message: string) {
    const body: {
      message: string;
      workspace_id: string;
      thread_id?: string;
      focus?: { source_type: string; source_id: string };
    } = { message, workspace_id: workspaceId };
    if (activeThreadId) body.thread_id = activeThreadId;
    if (chatScope) body.focus = { source_type: chatScope.type, source_id: chatScope.id };
    return body;
  }

  async function sendChat() {
    const text = chatInput.trim();
    if (!text) return;
    if (useStream) {
      await sendChatStream(text);
      return;
    }
    setChatInput("");
    setChatMsgs(m => [...m, { kind: "user", text }]);
    try {
      const out = await api<ChatResponse>("/chat", { method: "POST", body: buildChatBody(text) });
      setChatMsgs(m => [...m, { kind: "assistant", text: out.reply, sources: out.sources }]);
      if (activeThreadId) loadThreads().catch(() => {});
    } catch (e) {
      setChatMsgs(m => [...m, { kind: "error", text: e instanceof Error ? e.message : "Chat failed" }]);
    }
  }

  async function sendChatStream(text: string) {
    setChatInput("");
    setChatMsgs(m => [...m, { kind: "user", text }]);
    setStreamingDraft("");
    try {
      const r = await fetch("/api/chat/stream", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + getToken()
        },
        body: JSON.stringify(buildChatBody(text))
      });
      if (!r.ok) {
        const j = (await r.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error || r.statusText);
      }
      const reader = r.body?.getReader();
      const dec = new TextDecoder();
      let buf = "";
      let full = "";
      let sources: ChatSource[] | undefined;
      if (!reader) throw new Error("No stream");
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const parts = buf.split("\n\n");
        buf = parts.pop() || "";
        for (const block of parts) {
          const line = block.replace(/^data:\s*/, "").trim();
          if (!line) continue;
          try {
            const j = JSON.parse(line) as {
              token?: string;
              done?: boolean;
              sources?: ChatSource[];
              error?: string;
            };
            if (j.error) throw new Error(j.error);
            if (j.token) {
              full += j.token;
              setStreamingDraft(full);
            }
            if (j.done && j.sources) sources = j.sources;
          } catch (e) {
            if (e instanceof SyntaxError) continue;
            throw e;
          }
        }
      }
      setStreamingDraft(null);
      setChatMsgs(m => [...m, { kind: "assistant", text: full, sources }]);
      if (activeThreadId) loadThreads().catch(() => {});
    } catch (e) {
      setStreamingDraft(null);
      setChatMsgs(m => [...m, { kind: "error", text: e instanceof Error ? e.message : "Stream failed" }]);
    }
  }

  const f = filter.toLowerCase();
  const docFiltered = documents.filter(d => !f || d.original_name.toLowerCase().includes(f));
  const noteFiltered = notes.filter(n => {
    if (!f) return true;
    const hay = `${n.title} ${(n.tags || []).join(" ")}`.toLowerCase();
    return hay.includes(f);
  });

  function onPreviewClick(e: React.MouseEvent<HTMLDivElement>) {
    const el = (e.target as HTMLElement).closest(".wiki-link");
    if (el) {
      e.preventDefault();
      const id = el.getAttribute("data-note-target");
      if (id) void selectNote(id);
    }
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-left">
          <span className="brand-mini">◈</span>
          <strong>Brain</strong>
          <span className={`pill ${llmOn ? "on" : "off"}`}>{llmOn ? "LLM" : "no LLM"}</span>
          {embedOn ? (
            <span className="pill on" title="Embeddings configured">
              embed
            </span>
          ) : null}
          <label className="workspace-picker">
            <span className="sr-only">Notebook</span>
            <select
              value={workspaceId}
              onChange={e => {
                setWorkspaceId(e.target.value);
                setActiveThreadId(null);
                setChatMsgs([]);
              }}
            >
              {workspaces.map(w => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="topbar-center">
          <input
            type="search"
            placeholder="Filter titles or search content (2+ chars)…"
            value={filter}
            onChange={e => setFilter(e.target.value)}
          />
        </div>
        <div className="topbar-right">
          <input
            ref={backupRestoreInputRef}
            type="file"
            accept=".zip"
            hidden
            onChange={e => void onRestoreBackup(e)}
          />
          <button
            type="button"
            className="btn ghost"
            title="Restore from a ZIP created by Backup"
            onClick={() => backupRestoreInputRef.current?.click()}
          >
            Restore
          </button>
          <button
            type="button"
            className="btn ghost"
            onClick={() => downloadBackup().catch(e => alert(e instanceof Error ? e.message : String(e)))}
          >
            Backup
          </button>
          <button
            type="button"
            className="btn ghost"
            title="Export this notebook as JSON (notes + document text)"
            onClick={() =>
              downloadLibraryExport(workspaceId, "json").catch(e =>
                alert(e instanceof Error ? e.message : String(e))
              )
            }
          >
            Lib JSON
          </button>
          <button
            type="button"
            className="btn ghost"
            title="Export as ZIP of Markdown files"
            onClick={() =>
              downloadLibraryExport(workspaceId, "markdown").catch(e =>
                alert(e instanceof Error ? e.message : String(e))
              )
            }
          >
            Lib MD
          </button>
          <button type="button" className="btn ghost" onClick={newDaily}>
            Daily
          </button>
          <button type="button" className="btn ghost" onClick={quickCapture}>
            Inbox
          </button>
          <button type="button" className="btn ghost" onClick={newNote}>
            + Note
          </button>
          <button
            type="button"
            className="btn ghost"
            onClick={() => {
              clearToken();
              setChatMsgs([]);
              setChatScope(null);
              onLogout();
            }}
          >
            Sign out
          </button>
        </div>
      </header>

      <div className="workspace">
        <aside className="panel sources-panel">
          <div className="panel-header">
            <h2>Sources</h2>
            <span className="badge">{docFiltered.length + noteFiltered.length}</span>
          </div>
          <p className="panel-sub">This notebook: uploads, URL, ZIP, notes — all indexed.</p>

          <div className="url-import-row">
            <input
              type="url"
              placeholder="Import URL (HTML page)…"
              value={urlImport}
              onChange={e => setUrlImport(e.target.value)}
            />
            <button type="button" className="btn ghost tiny" onClick={() => void doUrlImport()}>
              Fetch
            </button>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept=".txt,.md,.text,.markdown,.pdf,.docx,.html,.htm,.rtf"
            hidden
            onChange={e => {
              const file = e.target.files?.[0];
              if (file) onUploadFile(file);
              e.target.value = "";
            }}
          />
          <input ref={zipInputRef} type="file" accept=".zip" hidden onChange={e => void onZip(e)} />

          <div
            className={`upload-zone ${uploadDrag ? "drag" : ""}`}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={e => {
              e.preventDefault();
              setUploadDrag(true);
            }}
            onDragLeave={() => setUploadDrag(false)}
            onDrop={e => {
              e.preventDefault();
              setUploadDrag(false);
              const file = e.dataTransfer.files[0];
              if (file) onUploadFile(file);
            }}
          >
            <span className="upload-label">Drop files or click · ZIP batch</span>
            <button
              type="button"
              className="btn ghost tiny zip-btn"
              onClick={ev => {
                ev.stopPropagation();
                zipInputRef.current?.click();
              }}
            >
              Upload ZIP
            </button>
          </div>

          <div className="source-section search-filters-section">
            <h3>Search filters</h3>
            <p className="panel-sub tight">Applies to content search (top bar, 2+ chars).</p>
            <div className="search-filters-grid">
              <label className="sf-label">
                Type
                <select
                  value={searchSourceType}
                  onChange={e =>
                    setSearchSourceType(e.target.value as "all" | "note" | "document")
                  }
                >
                  <option value="all">All</option>
                  <option value="note">Notes</option>
                  <option value="document">Documents</option>
                </select>
              </label>
              <label className="sf-label">
                Sort
                <select
                  value={searchSort}
                  onChange={e => setSearchSort(e.target.value as "rank" | "recency")}
                >
                  <option value="rank">Relevance</option>
                  <option value="recency">Recent</option>
                </select>
              </label>
              <label className="sf-label sf-tag">
                Tag
                <input
                  placeholder="note tag"
                  value={searchTag}
                  onChange={e => setSearchTag(e.target.value)}
                  aria-label="Filter notes by tag"
                />
              </label>
            </div>
          </div>

          <div className="source-section saved-searches-section">
            <h3>Saved searches</h3>
            <div className="saved-search-toolbar">
              <button
                type="button"
                className="btn ghost tiny"
                disabled={filter.trim().length < 2}
                onClick={() => void saveNamedSearch()}
              >
                Save current
              </button>
            </div>
            {savedSearches.length > 0 ? (
              <ul className="source-list saved-search-list">
                {savedSearches.map(s => (
                  <li key={s.id}>
                    <div className="saved-search-row">
                      <button
                        type="button"
                        className="saved-search-run"
                        title={s.query}
                        onClick={() => setFilter(s.query)}
                      >
                        <span className="title">🔎 {s.name}</span>
                        <span className="meta">{s.query}</span>
                      </button>
                      <button
                        type="button"
                        className="btn ghost tiny saved-search-delete"
                        aria-label={`Delete saved search ${s.name}`}
                        onClick={() => void deleteNamedSearch(s.id)}
                      >
                        ×
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="panel-sub tight">None yet — run a content search (2+ chars), then Save current.</p>
            )}
          </div>

          {ftsHits.length > 0 ? (
            <div className="source-section search-hits-section">
              <h3>Content matches</h3>
              <ul className="source-list search-hit-list">
                {ftsHits.map((h, idx) => (
                  <li key={`${h.source_type}-${h.source_id}-${h.chunk_index}-${idx}`}>
                    <button
                      type="button"
                      className="search-hit-btn"
                      onClick={() => {
                        if (h.source_type === "note") {
                          void selectNote(h.source_id);
                        } else {
                          setChatScope({ type: "document", id: h.source_id, label: h.label });
                          setChatMsgs(m => [
                            ...m,
                            {
                              kind: "system",
                              md: `Opened from search — chat scoped to **${h.label}**.`
                            }
                          ]);
                        }
                      }}
                    >
                      <span className="title">
                        {h.source_type === "note" ? "📝" : "📄"} {h.label}
                        <span className="chunk-idx">
                          {" "}
                          · §{h.chunk_index}
                          {h.page != null ? ` · p.${h.page}` : ""}
                        </span>
                      </span>
                      <span className="meta excerpt-preview">
                        {h.excerpt_html ? (
                          <span dangerouslySetInnerHTML={{ __html: h.excerpt_html }} />
                        ) : (
                          h.excerpt
                        )}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="source-section">
            <h3>Documents</h3>
            <ul className="source-list">
              {docFiltered.map(d => (
                <li key={d.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setChatScope({ type: "document", id: d.id, label: d.original_name });
                      setChatMsgs(m => [
                        ...m,
                        {
                          kind: "system",
                          md: `Chat retrieval is limited to **${d.original_name}** until you choose “All sources”.`
                        }
                      ]);
                    }}
                  >
                    <span className="title">📄 {d.original_name}</span>
                    <span className="meta">{formatBytes(d.bytes)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <div className="source-section">
            <h3>Notes</h3>
            <ul className="source-list mem-stream">
              {noteFiltered.map(n => (
                <li key={n.id}>
                  <button
                    type="button"
                    className={n.id === activeNoteId ? "active" : undefined}
                    onClick={() => void selectNote(n.id)}
                  >
                    <span className="title">{n.title || "Untitled"}</span>
                    <span className="meta">
                      {formatDate(n.updated_at)}
                      {n.tags?.length ? ` · ${n.tags.slice(0, 3).join(", ")}` : ""}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </aside>

        <main className="panel editor-panel">
          {!activeNoteId ? (
            <div className="editor-empty">
              <h2>Select a note or create one</h2>
              <p>
                Use <code>[[Note title]]</code> to link notes in markdown.
              </p>
            </div>
          ) : (
            <div className="editor-active">
              <input
                className="note-title-input"
                placeholder="Title"
                value={title}
                onChange={e => {
                  setTitle(e.target.value);
                  scheduleSave();
                }}
              />
              <div className="tags-row">
                <label>Tags</label>
                <input
                  placeholder="comma separated"
                  value={tagsStr}
                  onChange={e => {
                    setTagsStr(e.target.value);
                    scheduleSave();
                  }}
                />
              </div>
              <div className="tags-row chat-instr-row">
                <label>Chat hint (this note)</label>
                <textarea
                  className="chat-hint-input"
                  placeholder="Optional instructions prepended when this note is in chat scope…"
                  rows={2}
                  value={noteChatInstr}
                  onChange={e => {
                    setNoteChatInstr(e.target.value);
                    scheduleSave();
                  }}
                />
              </div>
              {backlinks.length > 0 ? (
                <div className="backlinks-bar">
                  <span className="backlinks-label">Backlinks</span>
                  <ul className="backlinks-list">
                    {backlinks.map(b => (
                      <li key={b.id}>
                        <button type="button" className="btn ghost tiny" onClick={() => void selectNote(b.id)}>
                          {b.title}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <div className="split-editor">
                <textarea
                  className="note-body-input"
                  placeholder="Write markdown…"
                  value={body}
                  onChange={e => {
                    setBody(e.target.value);
                    scheduleSave();
                  }}
                />
                <div
                  className="md-preview"
                  onClick={onPreviewClick}
                  dangerouslySetInnerHTML={{ __html: mdToHtml(body, wikiIndex) }}
                />
              </div>
              <div className="editor-footer">
                <span
                  className={`save-state ${saveState === "saving" ? "dirty" : ""} ${saveState === "error" ? "error" : ""}`}
                >
                  {saveState === "saving" ? "Saving…" : saveState === "error" ? "Save failed" : "Saved"}
                </span>
                <button type="button" className="btn ghost" onClick={() => setShowHistory(h => !h)}>
                  History ({versions.length})
                </button>
                <button
                  type="button"
                  className="btn ghost"
                  onClick={() => {
                    if (!activeNoteId) return;
                    const label = title.trim() || "Untitled note";
                    setChatScope({ type: "note", id: activeNoteId, label });
                    setChatMsgs(m => [
                      ...m,
                      {
                        kind: "system",
                        md: `Chat retrieval is limited to this note (**${label}**) until you choose “All sources”.`
                      }
                    ]);
                  }}
                >
                  Scope chat to this note
                </button>
                <button type="button" className="btn danger ghost" onClick={() => void deleteNote()}>
                  Delete note
                </button>
              </div>
              {showHistory && versions.length > 0 ? (
                <ul className="version-list">
                  {versions.map(v => (
                    <li key={v.id}>
                      <button type="button" className="btn ghost tiny" onClick={() => void restoreVersion(v.id)}>
                        {new Date(v.saved_at).toLocaleString()} — {v.title.slice(0, 40)}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          )}
        </main>

        <aside className="panel chat-panel">
          <div className="panel-header">
            <h2>Chat</h2>
          </div>
          <div className="thread-toolbar">
            <select
              value={activeThreadId ?? ""}
              onChange={e => void selectThread(e.target.value || null)}
              aria-label="Chat thread"
            >
              <option value="">New session</option>
              {threads.map(t => (
                <option key={t.id} value={t.id}>
                  {t.title || t.id.slice(0, 8)}
                </option>
              ))}
            </select>
            <button type="button" className="btn ghost tiny" onClick={() => void newChatThread()}>
              + Thread
            </button>
          </div>
          <label className="stream-toggle">
            <input type="checkbox" checked={useStream} onChange={e => setUseStream(e.target.checked)} />
            Stream tokens
          </label>
          <div className="suggested-prompts">
            {SUGGESTED_PROMPTS.map(p => (
              <button key={p} type="button" className="chip prompt-chip" title={p} onClick={() => setChatInput(p)}>
                {p.length > 40 ? `${p.slice(0, 40)}…` : p}
              </button>
            ))}
          </div>
          {llmOn ? (
            <div className="artifact-bar">
              <span className="artifact-bar-label">Artifacts</span>
              <button type="button" className="btn ghost tiny" onClick={() => void runArtifact("outline")}>
                Outline
              </button>
              <button type="button" className="btn ghost tiny" onClick={() => void runArtifact("flashcards")}>
                Cards
              </button>
              <button type="button" className="btn ghost tiny" onClick={() => void runArtifact("quiz")}>
                Quiz
              </button>
              <button type="button" className="btn ghost tiny" onClick={() => void runArtifact("slide_bullets")}>
                Slides
              </button>
            </div>
          ) : null}
          <p className="panel-sub">Grounded on this notebook; chips = sources.</p>
          {chatScope ? (
            <div className="chat-scope-banner">
              <div className="chat-scope-top">
                <span>
                  Scoped to: <strong>{chatScope.label}</strong>
                </span>
                <button type="button" className="btn ghost tiny" onClick={() => setChatScope(null)}>
                  All sources
                </button>
              </div>
              {chatScope.type === "document" ? (
                <label className="scope-doc-hint">
                  <span>Chat hint for this document</span>
                  <textarea
                    rows={2}
                    value={docChatInstr}
                    onChange={e => setDocChatInstr(e.target.value)}
                    onBlur={() => void saveDocChatInstr()}
                  />
                </label>
              ) : null}
            </div>
          ) : null}
          <div className="chat-thread">
            {chatMsgs.map((msg, i) => {
              if (msg.kind === "user") {
                return (
                  <div key={i} className="msg msg-user">
                    <div className="bubble">{msg.text}</div>
                  </div>
                );
              }
              if (msg.kind === "assistant") {
                return (
                  <div key={i} className="msg msg-asst">
                    <div
                      className="bubble md-bubble"
                      dangerouslySetInnerHTML={{ __html: mdToHtml(msg.text) }}
                    />
                    {msg.sources && msg.sources.length > 0 ? (
                      <div className="sources">
                        {msg.sources.map((s, j) => (
                          <span key={j} className="chip" title={s.excerpt}>
                            {s.label} · §{s.chunk_index}
                            {s.page != null ? ` · p.${s.page}` : ""}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                );
              }
              if (msg.kind === "error") {
                return (
                  <div key={i} className="msg msg-error">
                    <div className="bubble">{msg.text}</div>
                  </div>
                );
              }
              return (
                <div key={i} className="msg msg-asst">
                  <div className="bubble md-bubble" dangerouslySetInnerHTML={{ __html: mdToHtml(msg.md) }} />
                </div>
              );
            })}
            {streamingDraft !== null ? (
              <div className="msg msg-asst">
                <div className="bubble md-bubble" dangerouslySetInnerHTML={{ __html: mdToHtml(streamingDraft) }} />
              </div>
            ) : null}
          </div>
          <div className="chat-compose">
            <textarea
              rows={3}
              placeholder="Ask about this notebook… (Ctrl/Cmd+Enter)"
              value={chatInput}
              onChange={e => setChatInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  void sendChat();
                }
              }}
            />
            <button type="button" className="btn primary" onClick={() => void sendChat()}>
              Send
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}
