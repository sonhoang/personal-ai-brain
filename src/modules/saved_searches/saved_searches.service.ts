import { v4 as uuid } from "uuid";
import { getDb } from "../../db/database";

export type SavedSearchRow = {
  id: string;
  workspace_id: string;
  name: string;
  query: string;
  created_at: string;
};

function nowIso(): string {
  return new Date().toISOString();
}

export function listSaved(workspaceId: string): SavedSearchRow[] {
  return getDb()
    .prepare(
      `SELECT id, workspace_id, name, query, created_at FROM saved_searches
       WHERE workspace_id = ? ORDER BY created_at DESC`
    )
    .all(workspaceId) as SavedSearchRow[];
}

export function createSaved(workspaceId: string, name: string, query: string): SavedSearchRow {
  const db = getDb();
  const id = uuid();
  const t = nowIso();
  db.prepare(
    `INSERT INTO saved_searches (id, workspace_id, name, query, created_at) VALUES (?, ?, ?, ?, ?)`
  ).run(id, workspaceId, name.trim().slice(0, 120), query.trim().slice(0, 500), t);
  return db.prepare(`SELECT * FROM saved_searches WHERE id = ?`).get(id) as SavedSearchRow;
}

export function deleteSaved(id: string): boolean {
  return getDb().prepare(`DELETE FROM saved_searches WHERE id = ?`).run(id).changes > 0;
}
