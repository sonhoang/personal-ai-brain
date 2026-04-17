import { v4 as uuid } from "uuid";
import { getDb } from "../../db/database";

export type WorkspaceRow = {
  id: string;
  name: string;
  sort_order: number;
  created_at: string;
};

function nowIso(): string {
  return new Date().toISOString();
}

export function listWorkspaces(): WorkspaceRow[] {
  return getDb()
    .prepare(`SELECT id, name, sort_order, created_at FROM workspaces ORDER BY sort_order ASC, name ASC`)
    .all() as WorkspaceRow[];
}

export function createWorkspace(name: string): WorkspaceRow {
  const db = getDb();
  const id = uuid();
  const t = nowIso();
  const max =
    (db.prepare(`SELECT COALESCE(MAX(sort_order), 0) AS m FROM workspaces`).get() as { m: number }).m + 1;
  db.prepare(
    `INSERT INTO workspaces (id, name, sort_order, created_at) VALUES (?, ?, ?, ?)`
  ).run(id, name.trim().slice(0, 120) || "Notebook", max, t);
  return db.prepare(`SELECT id, name, sort_order, created_at FROM workspaces WHERE id = ?`).get(id) as WorkspaceRow;
}

export function renameWorkspace(id: string, name: string): WorkspaceRow | undefined {
  if (id === "default") return listWorkspaces().find(w => w.id === id);
  const db = getDb();
  const r = db.prepare(`UPDATE workspaces SET name = ? WHERE id = ?`).run(name.trim().slice(0, 120), id);
  if (r.changes === 0) return undefined;
  return db.prepare(`SELECT id, name, sort_order, created_at FROM workspaces WHERE id = ?`).get(id) as WorkspaceRow;
}

export function deleteWorkspace(id: string): boolean {
  if (id === "default") return false;
  const db = getDb();
  const tx = db.transaction(() => {
    db.prepare(`UPDATE notes SET workspace_id = 'default' WHERE workspace_id = ?`).run(id);
    db.prepare(`UPDATE documents SET workspace_id = 'default' WHERE workspace_id = ?`).run(id);
    db.prepare(`UPDATE chat_threads SET workspace_id = 'default' WHERE workspace_id = ?`).run(id);
    db.prepare(`DELETE FROM saved_searches WHERE workspace_id = ?`).run(id);
    db.prepare(`DELETE FROM workspaces WHERE id = ?`).run(id);
  });
  try {
    tx();
    return true;
  } catch {
    return false;
  }
}
