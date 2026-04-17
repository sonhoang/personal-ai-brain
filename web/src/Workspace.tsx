import { useCallback, useEffect, useRef, useState } from "react";
import { api, clearToken, uploadDocument, uploadZip, downloadBackup, getToken } from "./api";
import { mdToHtml } from "./md";
import type {
  ChatResponse,
  ChatSource,
  ChatThread,
  DocumentListItem,
  LibrarySearchHit,
  ManagementSummary,
  Note,
  NoteVersion,
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
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const zipInputRef = useRef<HTMLInputElement>(null);
  const wikiIndex = notes.map(n => ({ id: n.id, title: n.title || "Untitled" }));

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

  useEffect(() => {
    loadWorkspaces().catch(() => {});
  }, [loadWorkspaces]);

  useEffect(() => {
    loadLibrary().catch(() => {});
    loadThreads().catch(() => {});
  }, [loadLibrary, loadThreads]);

  useEffect(() => {
    const q = filter.trim();
    if (q.length < 2) {
      setFtsHits([]);
      return;
    }
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      api<{ hits: LibrarySearchHit[] }>(
        `/search?q=${encodeURIComponent(q)}&limit=25&workspace_id=${encodeURIComponent(workspaceId)}`
      )
        .then(r => setFtsHits(r.hits))
        .catch(() => setFtsHits([]));
    }, 350);
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [filter, workspaceId]);

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
          body: { title, body, tags }
        });
        setSaveState("saved");
        await loadLibrary();
        const v = await api<{ versions: NoteVersion[] }>(`/notes/${activeNoteId}/versions`);
        setVersions(v.versions);
      } catch (e) {
        setSaveState("error");
      }
    }, 700);
  }, [activeNoteId, title, body, tagsStr, loadLibrary]);

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
    await loadLibrary();
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
          <button
            type="button"
            className="btn ghost"
            onClick={() => downloadBackup().catch(e => alert(e instanceof Error ? e.message : String(e)))}
          >
            Backup
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
                        <span className="chunk-idx"> · §{h.chunk_index}</span>
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
          <p className="panel-sub">Grounded on this notebook; chips = sources.</p>
          {chatScope ? (
            <div className="chat-scope-banner">
              <span>
                Scoped to: <strong>{chatScope.label}</strong>
              </span>
              <button type="button" className="btn ghost tiny" onClick={() => setChatScope(null)}>
                All sources
              </button>
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
