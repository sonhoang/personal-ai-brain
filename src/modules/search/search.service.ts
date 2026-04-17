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
  page: number | null;
};

export type SearchOptions = {
  sourceType?: "note" | "document" | "all";
  tag?: string;
  inboxOnly?: boolean;
  dateFrom?: string;
  dateTo?: string;
  sort?: "rank" | "recency";
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

type NoteSearchMeta = { updated_at: string; inbox: number; tags: string[] };
type DocSearchMeta = { created_at: string };

function loadNoteMetas(ids: string[]): Map<string, NoteSearchMeta> {
  if (ids.length === 0) return new Map();
  const db = getDb();
  const uniq = [...new Set(ids)];
  const ph = uniq.map(() => "?").join(",");
  const rows = db
    .prepare(
      `SELECT n.id, n.updated_at, n.inbox, IFNULL(GROUP_CONCAT(t.name, ','), '') AS tagcsv
       FROM notes n
       LEFT JOIN note_tags nt ON nt.note_id = n.id
       LEFT JOIN tags t ON t.id = nt.tag_id
       WHERE n.id IN (${ph})
       GROUP BY n.id`
    )
    .all(...uniq) as { id: string; updated_at: string; inbox: number; tagcsv: string }[];
  const m = new Map<string, NoteSearchMeta>();
  for (const r of rows) {
    const tags = r.tagcsv
      ? r.tagcsv
          .split(",")
          .map(s => s.trim().toLowerCase())
          .filter(Boolean)
      : [];
    m.set(r.id, { updated_at: r.updated_at, inbox: r.inbox, tags });
  }
  return m;
}

function loadDocMetas(ids: string[]): Map<string, DocSearchMeta> {
  if (ids.length === 0) return new Map();
  const db = getDb();
  const uniq = [...new Set(ids)];
  const ph = uniq.map(() => "?").join(",");
  const rows = db
    .prepare(`SELECT id, created_at FROM documents WHERE id IN (${ph})`)
    .all(...uniq) as { id: string; created_at: string }[];
  const m = new Map<string, DocSearchMeta>();
  for (const r of rows) m.set(r.id, { created_at: r.created_at });
  return m;
}

function hasActiveFilters(o?: SearchOptions): boolean {
  if (!o) return false;
  return Boolean(
    (o.sourceType && o.sourceType !== "all") ||
      o.tag?.trim() ||
      o.inboxOnly ||
      o.dateFrom ||
      o.dateTo ||
      o.sort === "recency"
  );
}

function applyFilters(hits: ChunkHit[], options?: SearchOptions): ChunkHit[] {
  if (!options || !hasActiveFilters(options)) return hits;
  const tagNeedle = options.tag?.trim().toLowerCase();
  const noteIds = hits.filter(h => h.source_type === "note").map(h => h.source_id);
  const docIds = hits.filter(h => h.source_type === "document").map(h => h.source_id);
  const noteMeta = loadNoteMetas(noteIds);
  const docMeta = loadDocMetas(docIds);

  let out = hits.filter(h => {
    if (options.sourceType === "note" && h.source_type !== "note") return false;
    if (options.sourceType === "document" && h.source_type !== "document") return false;
    if (h.source_type === "note") {
      const nm = noteMeta.get(h.source_id);
      if (!nm) return false;
      if (options.inboxOnly && nm.inbox !== 1) return false;
      if (tagNeedle && !nm.tags.includes(tagNeedle)) return false;
      if (options.dateFrom && nm.updated_at < options.dateFrom) return false;
      if (options.dateTo && nm.updated_at > options.dateTo) return false;
    } else {
      const dm = docMeta.get(h.source_id);
      if (!dm) return false;
      if (options.inboxOnly) return false;
      if (tagNeedle) return false;
      if (options.dateFrom && dm.created_at < options.dateFrom) return false;
      if (options.dateTo && dm.created_at > options.dateTo) return false;
    }
    return true;
  });

  if (options.sort === "recency") {
    const nm = loadNoteMetas(out.filter(h => h.source_type === "note").map(h => h.source_id));
    const dm = loadDocMetas(out.filter(h => h.source_type === "document").map(h => h.source_id));
    out = [...out].sort((a, b) => {
      const ta =
        a.source_type === "note"
          ? (nm.get(a.source_id)?.updated_at ?? "")
          : (dm.get(a.source_id)?.created_at ?? "");
      const tb =
        b.source_type === "note"
          ? (nm.get(b.source_id)?.updated_at ?? "")
          : (dm.get(b.source_id)?.created_at ?? "");
      return tb.localeCompare(ta);
    });
  }

  return out;
}

export async function searchLibrary(
  query: string,
  limit = 30,
  workspaceId?: string | null,
  options?: SearchOptions
): Promise<LibrarySearchHit[]> {
  const filtering = hasActiveFilters(options);
  const mult = filtering ? 15 : 1;
  const cappedMult = Math.min(400, Math.max(limit, limit * mult));
  const candidates = config.embeddingModel ? config.ftsCandidateChunks : undefined;
  const sqlLimit =
    config.embeddingModel && candidates != null ? Math.max(cappedMult, candidates) : cappedMult;

  let hits = searchChunks(query, sqlLimit, undefined, workspaceId ?? undefined, candidates);
  hits = applyFilters(hits, options);

  const skipRerank = options?.sort === "recency";
  if (config.embeddingModel && candidates && hits.length > 0 && !skipRerank) {
    hits = await rerankChunkHits(query, hits, limit);
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
      excerpt_html: highlightExcerpt(excerpt, query),
      page: h.page ?? null
    };
  });
}
