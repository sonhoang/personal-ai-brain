import { getDb } from "../../db/database";
import { config } from "../../config";
import { searchChunks, type ChunkHit } from "../indexing/indexing.service";
import { rerankChunkHits } from "../indexing/embedding.service";

export type LibrarySearchHit = {
  source_type: string;
  source_id: string;
  chunk_index: number;
  rank: number;
  label: string;
  excerpt: string;
  excerpt_html: string;
};

function labelForSource(sourceType: string, sourceId: string): string {
  const db = getDb();
  if (sourceType === "note") {
    const row = db.prepare(`SELECT title FROM notes WHERE id = ?`).get(sourceId) as { title: string } | undefined;
    return row?.title?.trim() || "Untitled note";
  }
  if (sourceType === "document") {
    const row = db
      .prepare(`SELECT original_name FROM documents WHERE id = ?`)
      .get(sourceId) as { original_name: string } | undefined;
    return row?.original_name || "Document";
  }
  return sourceId.slice(0, 8);
}

/** Attach display labels for notes/documents (cached per source). */
export function annotateChunkHits(hits: ChunkHit[]): Array<ChunkHit & { label: string }> {
  const cache = new Map<string, string>();
  const key = (st: string, sid: string) => `${st}\0${sid}`;
  return hits.map(h => {
    const k = key(h.source_type, h.source_id);
    let label = cache.get(k);
    if (label === undefined) {
      label = labelForSource(h.source_type, h.source_id);
      cache.set(k, label);
    }
    return { ...h, label };
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function highlightExcerpt(text: string, query: string): string {
  const tokens = query
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .split(/\s+/)
    .map(s => s.trim())
    .filter(Boolean)
    .slice(0, 12);
  let out = escapeHtml(text);
  if (tokens.length === 0) return out;
  for (const t of tokens) {
    if (t.length < 2) continue;
    const re = new RegExp(`(${escapeRegex(t)})`, "gi");
    out = out.replace(re, "<mark>$1</mark>");
  }
  return out;
}

export async function searchLibrary(
  query: string,
  limit = 30,
  workspaceId?: string | null
): Promise<LibrarySearchHit[]> {
  const candidates = config.embeddingModel ? config.ftsCandidateChunks : undefined;
  let hits = searchChunks(query, limit, undefined, workspaceId ?? undefined, candidates);
  if (config.embeddingModel && candidates && hits.length > 0) {
    hits = await rerankChunkHits(query, hits, limit);
  } else if (candidates == null) {
    hits = hits.slice(0, limit);
  } else {
    hits = hits.slice(0, limit);
  }
  return annotateChunkHits(hits).map(h => {
    const excerpt = h.content.slice(0, 220) + (h.content.length > 220 ? "…" : "");
    return {
      source_type: h.source_type,
      source_id: h.source_id,
      chunk_index: h.chunk_index,
      rank: h.rank,
      label: h.label,
      excerpt,
      excerpt_html: highlightExcerpt(excerpt, query)
    };
  });
}
