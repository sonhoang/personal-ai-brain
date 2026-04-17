import { getDb } from "../../db/database";
import { chunkText, ftsQueryFromUserInput } from "../../utils/chunkText";

export type ChunkHit = {
  source_type: string;
  source_id: string;
  chunk_index: number;
  content: string;
  rank: number;
};

export function reindexNote(noteId: string, title: string, body: string): void {
  const db = getDb();
  db.prepare(`DELETE FROM chunks_fts WHERE source_type = 'note' AND source_id = ?`).run(noteId);
  const full = `${title}\n\n${body}`.trim();
  const chunks = chunkText(full);
  const ins = db.prepare(
    `INSERT INTO chunks_fts (source_type, source_id, chunk_index, content) VALUES (?, ?, ?, ?)`
  );
  const tx = db.transaction(() => {
    chunks.forEach((c, i) => {
      ins.run("note", noteId, i, c);
    });
  });
  tx();
}

export function reindexDocument(docId: string, text: string): void {
  const db = getDb();
  db.prepare(`DELETE FROM chunks_fts WHERE source_type = 'document' AND source_id = ?`).run(docId);
  const chunks = chunkText(text);
  const ins = db.prepare(
    `INSERT INTO chunks_fts (source_type, source_id, chunk_index, content) VALUES (?, ?, ?, ?)`
  );
  const tx = db.transaction(() => {
    chunks.forEach((c, i) => {
      ins.run("document", docId, i, c);
    });
  });
  tx();
}

export function deleteChunksForSource(sourceType: string, sourceId: string): void {
  getDb().prepare(`DELETE FROM chunks_fts WHERE source_type = ? AND source_id = ?`).run(sourceType, sourceId);
  getDb()
    .prepare(`DELETE FROM chunk_embeddings WHERE source_type = ? AND source_id = ?`)
    .run(sourceType, sourceId);
}

export type SearchScope = { sourceType: string; sourceId: string };

function workspaceClause(workspaceId: string | null | undefined): string {
  if (workspaceId === null || workspaceId === undefined) return "";
  return `AND (
    (fts.source_type = 'note' AND EXISTS (SELECT 1 FROM notes n WHERE n.id = fts.source_id AND n.workspace_id = ?))
    OR
    (fts.source_type = 'document' AND EXISTS (SELECT 1 FROM documents d WHERE d.id = fts.source_id AND d.workspace_id = ?))
  )`;
}

/**
 * @param candidatesForRerank When set, fetch at least this many FTS hits (for embedding rerank); returns all fetched rows.
 */
export function searchChunks(
  userQuery: string,
  limit: number,
  scope?: SearchScope,
  workspaceId?: string | null,
  candidatesForRerank?: number
): ChunkHit[] {
  const q = ftsQueryFromUserInput(userQuery);
  if (!q) return [];
  const db = getDb();
  const sqlLimit = candidatesForRerank != null ? Math.max(limit, candidatesForRerank) : limit;
  try {
    if (scope) {
      const sql = `
        SELECT fts.source_type, fts.source_id, fts.chunk_index, fts.content, bm25(fts) AS rank
        FROM chunks_fts fts
        WHERE fts MATCH ?
          AND fts.source_type = ?
          AND fts.source_id = ?
        ${workspaceClause(workspaceId)}
        ORDER BY bm25(fts)
        LIMIT ?
      `;
      const params: unknown[] = [q, scope.sourceType, scope.sourceId];
      if (workspaceId !== null && workspaceId !== undefined) {
        params.push(workspaceId, workspaceId);
      }
      params.push(sqlLimit);
      const rows = db.prepare(sql).all(...params) as ChunkHit[];
      return candidatesForRerank != null ? rows : rows.slice(0, limit);
    }
    const sql = `
      SELECT fts.source_type, fts.source_id, fts.chunk_index, fts.content, bm25(fts) AS rank
      FROM chunks_fts fts
      WHERE fts MATCH ?
      ${workspaceClause(workspaceId)}
      ORDER BY bm25(fts)
      LIMIT ?
    `;
    const params: unknown[] = [q];
    if (workspaceId !== null && workspaceId !== undefined) {
      params.push(workspaceId, workspaceId);
    }
    params.push(sqlLimit);
    const rows = db.prepare(sql).all(...params) as ChunkHit[];
    return candidatesForRerank != null ? rows : rows.slice(0, limit);
  } catch {
    return [];
  }
}
