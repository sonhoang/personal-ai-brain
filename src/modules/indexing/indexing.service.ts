import { getDb } from "../../db/database";
import { chunkText, ftsQueryFromUserInput } from "../../utils/chunkText";

export type IndexedChunk = { content: string; page?: number };

export type ChunkHit = {
  source_type: string;
  source_id: string;
  chunk_index: number;
  content: string;
  rank: number;
  page: number | null;
};

export function reindexNote(noteId: string, title: string, body: string): void {
  const db = getDb();
  db.prepare(`DELETE FROM chunks_fts WHERE source_type = 'note' AND source_id = ?`).run(noteId);
  db.prepare(`DELETE FROM chunk_meta WHERE source_type = 'note' AND source_id = ?`).run(noteId);
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
  const chunks = chunkText(text).map(c => ({ content: c }));
  reindexDocumentChunks(docId, chunks);
}

export function reindexDocumentChunks(docId: string, chunks: IndexedChunk[]): void {
  const db = getDb();
  db.prepare(`DELETE FROM chunks_fts WHERE source_type = 'document' AND source_id = ?`).run(docId);
  db.prepare(`DELETE FROM chunk_meta WHERE source_type = 'document' AND source_id = ?`).run(docId);
  const ins = db.prepare(
    `INSERT INTO chunks_fts (source_type, source_id, chunk_index, content) VALUES (?, ?, ?, ?)`
  );
  const insMeta = db.prepare(
    `INSERT INTO chunk_meta (source_type, source_id, chunk_index, page) VALUES ('document', ?, ?, ?)`
  );
  const tx = db.transaction(() => {
    chunks.forEach((c, i) => {
      ins.run("document", docId, i, c.content);
      if (c.page != null && Number.isFinite(c.page)) {
        insMeta.run(docId, i, c.page);
      }
    });
  });
  tx();
}

export function deleteChunksForSource(sourceType: string, sourceId: string): void {
  getDb().prepare(`DELETE FROM chunks_fts WHERE source_type = ? AND source_id = ?`).run(sourceType, sourceId);
  getDb()
    .prepare(`DELETE FROM chunk_meta WHERE source_type = ? AND source_id = ?`)
    .run(sourceType, sourceId);
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

function workspaceParams(workspaceId: string | null | undefined): unknown[] {
  if (workspaceId === null || workspaceId === undefined) return [];
  return [workspaceId, workspaceId];
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
        SELECT fts.source_type, fts.source_id, fts.chunk_index, fts.content, bm25(fts) AS rank,
               cm.page AS page
        FROM chunks_fts fts
        LEFT JOIN chunk_meta cm
          ON cm.source_type = fts.source_type AND cm.source_id = fts.source_id AND cm.chunk_index = fts.chunk_index
        WHERE fts MATCH ?
          AND fts.source_type = ?
          AND fts.source_id = ?
        ${workspaceClause(workspaceId)}
        ORDER BY bm25(fts)
        LIMIT ?
      `;
      const params: unknown[] = [q, scope.sourceType, scope.sourceId, ...workspaceParams(workspaceId), sqlLimit];
      const rows = db.prepare(sql).all(...params) as ChunkHit[];
      return candidatesForRerank != null ? rows : rows.slice(0, limit);
    }
    const sql = `
      SELECT fts.source_type, fts.source_id, fts.chunk_index, fts.content, bm25(fts) AS rank,
             cm.page AS page
      FROM chunks_fts fts
      LEFT JOIN chunk_meta cm
        ON cm.source_type = fts.source_type AND cm.source_id = fts.source_id AND cm.chunk_index = fts.chunk_index
      WHERE fts MATCH ?
      ${workspaceClause(workspaceId)}
      ORDER BY bm25(fts)
      LIMIT ?
    `;
    const params: unknown[] = [q, ...workspaceParams(workspaceId), sqlLimit];
    const rows = db.prepare(sql).all(...params) as ChunkHit[];
    return candidatesForRerank != null ? rows : rows.slice(0, limit);
  } catch {
    return [];
  }
}

/** Sample chunks from a workspace (no FTS query) for artifact generation. */
export function listSampleChunks(workspaceId: string, limit: number): ChunkHit[] {
  const db = getDb();
  const sql = `
    SELECT fts.source_type, fts.source_id, fts.chunk_index, fts.content, 0 AS rank,
           cm.page AS page
    FROM chunks_fts fts
    LEFT JOIN chunk_meta cm
      ON cm.source_type = fts.source_type AND cm.source_id = fts.source_id AND cm.chunk_index = fts.chunk_index
    WHERE (
      (fts.source_type = 'note' AND EXISTS (SELECT 1 FROM notes n WHERE n.id = fts.source_id AND n.workspace_id = ?))
      OR
      (fts.source_type = 'document' AND EXISTS (SELECT 1 FROM documents d WHERE d.id = fts.source_id AND d.workspace_id = ?))
    )
    LIMIT ?
  `;
  return db.prepare(sql).all(workspaceId, workspaceId, limit) as ChunkHit[];
}
