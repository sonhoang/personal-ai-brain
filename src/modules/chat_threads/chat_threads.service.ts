import { v4 as uuid } from "uuid";
import { getDb } from "../../db/database";

export type ChatThreadRow = {
  id: string;
  workspace_id: string;
  title: string | null;
  created_at: string;
  updated_at: string;
};

export type ChatMessageRow = {
  id: string;
  thread_id: string;
  role: string;
  content: string;
  sources_json: string | null;
  created_at: string;
};

function nowIso(): string {
  return new Date().toISOString();
}

export function listThreads(workspaceId: string, limit = 50): ChatThreadRow[] {
  return getDb()
    .prepare(
      `SELECT id, workspace_id, title, created_at, updated_at FROM chat_threads
       WHERE workspace_id = ? ORDER BY updated_at DESC LIMIT ?`
    )
    .all(workspaceId, limit) as ChatThreadRow[];
}

export function createThread(workspaceId: string, title?: string): ChatThreadRow {
  const db = getDb();
  const id = uuid();
  const t = nowIso();
  db.prepare(
    `INSERT INTO chat_threads (id, workspace_id, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`
  ).run(id, workspaceId, title?.slice(0, 200) || null, t, t);
  return db.prepare(`SELECT * FROM chat_threads WHERE id = ?`).get(id) as ChatThreadRow;
}

export function updateThreadTitle(id: string, title: string): ChatThreadRow | undefined {
  const db = getDb();
  const t = nowIso();
  const r = db.prepare(`UPDATE chat_threads SET title = ?, updated_at = ? WHERE id = ?`).run(
    title.slice(0, 200),
    t,
    id
  );
  if (r.changes === 0) return undefined;
  return db.prepare(`SELECT * FROM chat_threads WHERE id = ?`).get(id) as ChatThreadRow;
}

export function deleteThread(id: string): boolean {
  const r = getDb().prepare(`DELETE FROM chat_threads WHERE id = ?`).run(id);
  return r.changes > 0;
}

export function listMessages(threadId: string, limit = 80): ChatMessageRow[] {
  return getDb()
    .prepare(
      `SELECT id, thread_id, role, content, sources_json, created_at FROM chat_messages
       WHERE thread_id = ? ORDER BY created_at ASC LIMIT ?`
    )
    .all(threadId, limit) as ChatMessageRow[];
}

export function appendMessage(
  threadId: string,
  role: "user" | "assistant" | "system",
  content: string,
  sourcesJson?: string | null
): ChatMessageRow {
  const db = getDb();
  const id = uuid();
  const t = nowIso();
  db.prepare(
    `INSERT INTO chat_messages (id, thread_id, role, content, sources_json, created_at) VALUES (?, ?, ?, ?, ?, ?)`
  ).run(id, threadId, role, content, sourcesJson ?? null, t);
  db.prepare(`UPDATE chat_threads SET updated_at = ? WHERE id = ?`).run(t, threadId);
  return db.prepare(`SELECT * FROM chat_messages WHERE id = ?`).get(id) as ChatMessageRow;
}

export function getThread(id: string): ChatThreadRow | undefined {
  return getDb().prepare(`SELECT * FROM chat_threads WHERE id = ?`).get(id) as ChatThreadRow | undefined;
}
