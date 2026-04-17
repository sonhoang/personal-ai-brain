import { v4 as uuid } from "uuid";
import { getDb } from "../../db/database";
import { config } from "../../config";
import { reindexNote, deleteChunksForSource } from "../indexing/indexing.service";
import { indexEmbeddingsForNote } from "../indexing/embedding.service";

export type NoteRow = {
  id: string;
  title: string;
  body: string;
  created_at: string;
  updated_at: string;
  workspace_id: string;
  inbox: number;
  chat_instruction: string | null;
  tags?: string[];
};

export type NoteVersionRow = {
  id: number;
  note_id: string;
  title: string;
  body: string;
  saved_at: string;
};

const MAX_VERSIONS = 20;

function nowIso(): string {
  return new Date().toISOString();
}

function attachTags(row: Omit<NoteRow, "tags">): NoteRow {
  const db = getDb();
  const tags = db
    .prepare(
      `
      SELECT t.name FROM tags t
      JOIN note_tags nt ON nt.tag_id = t.id
      WHERE nt.note_id = ?
      ORDER BY t.name
    `
    )
    .all(row.id) as { name: string }[];
  return { ...row, tags: tags.map(t => t.name) };
}

export function listNotes(limit = 100, workspaceId?: string, inboxOnly?: boolean): NoteRow[] {
  const db = getDb();
  let sql = `SELECT id, title, body, created_at, updated_at, workspace_id, inbox, chat_instruction FROM notes WHERE 1=1`;
  const params: unknown[] = [];
  if (workspaceId) {
    sql += ` AND workspace_id = ?`;
    params.push(workspaceId);
  }
  if (inboxOnly) {
    sql += ` AND inbox = 1`;
  }
  sql += ` ORDER BY updated_at DESC LIMIT ?`;
  params.push(limit);
  const rows = db.prepare(sql).all(...params) as Omit<NoteRow, "tags">[];
  return rows.map(attachTags) as NoteRow[];
}

export function getNote(id: string): NoteRow | undefined {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT id, title, body, created_at, updated_at, workspace_id, inbox, chat_instruction FROM notes WHERE id = ?`
    )
    .get(id) as Omit<NoteRow, "tags"> | undefined;
  return row ? attachTags(row) : undefined;
}

function pushNoteVersion(noteId: string, title: string, body: string): void {
  const db = getDb();
  const t = nowIso();
  db.prepare(
    `INSERT INTO note_versions (note_id, title, body, saved_at) VALUES (?, ?, ?, ?)`
  ).run(noteId, title, body, t);
  const row = db
    .prepare(`SELECT COUNT(*) AS c FROM note_versions WHERE note_id = ?`)
    .get(noteId) as { c: number };
  if (row.c > MAX_VERSIONS) {
    const excess = row.c - MAX_VERSIONS;
    const olds = db
      .prepare(
        `SELECT id FROM note_versions WHERE note_id = ? ORDER BY saved_at ASC LIMIT ?`
      )
      .all(noteId, excess) as { id: number }[];
    const del = db.prepare(`DELETE FROM note_versions WHERE id = ?`);
    for (const o of olds) del.run(o.id);
  }
}

export function listNoteVersions(noteId: string): NoteVersionRow[] {
  return getDb()
    .prepare(
      `SELECT id, note_id, title, body, saved_at FROM note_versions WHERE note_id = ? ORDER BY saved_at DESC`
    )
    .all(noteId) as NoteVersionRow[];
}

export function restoreNoteVersion(noteId: string, versionId: number): NoteRow | undefined {
  const db = getDb();
  const v = db
    .prepare(`SELECT title, body FROM note_versions WHERE id = ? AND note_id = ?`)
    .get(versionId, noteId) as { title: string; body: string } | undefined;
  if (!v) return undefined;
  return updateNote(noteId, { title: v.title, body: v.body });
}

export function createNote(input: {
  title?: string;
  body?: string;
  tags?: string[];
  workspace_id?: string;
  inbox?: number;
}): NoteRow {
  const db = getDb();
  const id = uuid();
  const t = nowIso();
  const title = (input.title ?? "").slice(0, 500);
  let body = input.body ?? "";
  if (!body && config.noteTemplate) {
    body = config.noteTemplate;
  }
  const workspaceId = (input.workspace_id || "default").trim() || "default";
  const inbox = input.inbox !== undefined ? (input.inbox ? 1 : 0) : 0;
  db.prepare(
    `INSERT INTO notes (id, title, body, created_at, updated_at, workspace_id, inbox, chat_instruction) VALUES (?, ?, ?, ?, ?, ?, ?, NULL)`
  ).run(id, title, body, t, t, workspaceId, inbox);
  setNoteTags(id, input.tags ?? []);
  reindexNote(id, title, body);
  if (config.embeddingModel) {
    void indexEmbeddingsForNote(id, title, body).catch(() => {});
  }
  return getNote(id)!;
}

export function updateNote(
  id: string,
  input: { title?: string; body?: string; tags?: string[]; chat_instruction?: string | null }
): NoteRow | undefined {
  const db = getDb();
  const cur = db
    .prepare(`SELECT id, title, body, chat_instruction FROM notes WHERE id = ?`)
    .get(id) as { id: string; title: string; body: string; chat_instruction: string | null } | undefined;
  if (!cur) return undefined;
  const title = input.title !== undefined ? input.title.slice(0, 500) : cur.title;
  const body = input.body !== undefined ? input.body : cur.body;
  const instr =
    input.chat_instruction !== undefined ? input.chat_instruction : cur.chat_instruction;
  if (input.title !== undefined || input.body !== undefined) {
    if (title !== cur.title || body !== cur.body) {
      pushNoteVersion(id, cur.title, cur.body);
    }
  }
  const t = nowIso();
  db.prepare(`UPDATE notes SET title = ?, body = ?, chat_instruction = ?, updated_at = ? WHERE id = ?`).run(
    title,
    body,
    instr,
    t,
    id
  );
  if (input.tags) setNoteTags(id, input.tags);
  if (input.title !== undefined || input.body !== undefined) {
    reindexNote(id, title, body);
    if (config.embeddingModel) {
      void indexEmbeddingsForNote(id, title, body).catch(() => {});
    }
  }
  return getNote(id);
}

function setNoteTags(noteId: string, tagNames: string[]): void {
  const db = getDb();
  db.prepare(`DELETE FROM note_tags WHERE note_id = ?`).run(noteId);
  const insTag = db.prepare(`INSERT OR IGNORE INTO tags (name) VALUES (?)`);
  const link = db.prepare(`INSERT INTO note_tags (note_id, tag_id) VALUES (?, ?)`);
  const tx = db.transaction(() => {
    for (const raw of tagNames) {
      const name = raw.trim().toLowerCase().slice(0, 64);
      if (!name) continue;
      insTag.run(name);
      const row = db.prepare(`SELECT id FROM tags WHERE name = ?`).get(name) as { id: number };
      link.run(noteId, row.id);
    }
  });
  tx();
}

export function deleteNote(id: string): boolean {
  const db = getDb();
  const r = db.prepare(`DELETE FROM notes WHERE id = ?`).run(id);
  if (r.changes === 0) return false;
  deleteChunksForSource("note", id);
  return true;
}

export function createDailyNote(workspaceId: string): NoteRow {
  const day = new Date().toISOString().slice(0, 10);
  return createNote({
    title: `Daily ${day}`,
    body: `# ${day}\n\n`,
    workspace_id: workspaceId,
    inbox: 1
  });
}
