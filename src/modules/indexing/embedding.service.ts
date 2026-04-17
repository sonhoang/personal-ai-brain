import axios from "axios";
import { config } from "../../config";
import { getDb } from "../../db/database";
import { chunkText } from "../../utils/chunkText";
import type { ChunkHit } from "./indexing.service";

export function cosineSim(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom < 1e-12 ? 0 : dot / denom;
}

export async function embedBatch(texts: string[]): Promise<number[][] | null> {
  if (!config.llmBaseUrl || !config.embeddingModel || texts.length === 0) return null;
  const res = await axios.post(
    `${config.llmBaseUrl}/embeddings`,
    { model: config.embeddingModel, input: texts },
    {
      headers: {
        "Content-Type": "application/json",
        ...(config.llmApiKey ? { Authorization: `Bearer ${config.llmApiKey}` } : {})
      },
      timeout: 120_000,
      validateStatus: () => true
    }
  );
  if (res.status >= 400) return null;
  const data = res.data as { data?: { embedding: number[]; index?: number }[] };
  const rows = [...(data.data ?? [])];
  rows.sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  return rows.map(r => r.embedding);
}

export async function storeEmbeddingsForChunks(
  sourceType: string,
  sourceId: string,
  chunks: string[]
): Promise<void> {
  if (!config.embeddingModel || chunks.length === 0) return;
  const vectors = await embedBatch(chunks);
  if (!vectors || vectors.length !== chunks.length) return;
  const db = getDb();
  db.prepare(`DELETE FROM chunk_embeddings WHERE source_type = ? AND source_id = ?`).run(sourceType, sourceId);
  const ins = db.prepare(
    `INSERT INTO chunk_embeddings (source_type, source_id, chunk_index, dim, vec) VALUES (?, ?, ?, ?, ?)`
  );
  const tx = db.transaction(() => {
    vectors.forEach((vec, i) => {
      ins.run(sourceType, sourceId, i, vec.length, JSON.stringify(vec));
    });
  });
  tx();
}

export async function indexEmbeddingsForNote(noteId: string, title: string, body: string): Promise<void> {
  const full = `${title}\n\n${body}`.trim();
  const chunks = chunkText(full);
  await storeEmbeddingsForChunks("note", noteId, chunks);
}

export async function indexEmbeddingsForDocument(docId: string, textOrChunks: string | string[]): Promise<void> {
  const chunks = Array.isArray(textOrChunks) ? textOrChunks : chunkText(textOrChunks);
  await storeEmbeddingsForChunks("document", docId, chunks);
}

export function loadEmbeddingsForHits(hits: ChunkHit[]): Map<string, number[]> {
  const db = getDb();
  const m = new Map<string, number[]>();
  const sel = db.prepare(
    `SELECT vec FROM chunk_embeddings WHERE source_type = ? AND source_id = ? AND chunk_index = ?`
  );
  for (const h of hits) {
    const row = sel.get(h.source_type, h.source_id, h.chunk_index) as { vec: string } | undefined;
    if (!row) continue;
    try {
      m.set(`${h.source_type}\0${h.source_id}\0${h.chunk_index}`, JSON.parse(row.vec) as number[]);
    } catch {
      /* ignore */
    }
  }
  return m;
}

export async function rerankChunkHits(query: string, hits: ChunkHit[], limit: number): Promise<ChunkHit[]> {
  if (!config.embeddingModel || hits.length === 0) return hits.slice(0, limit);
  const qv = await embedBatch([query]);
  if (!qv || !qv[0]) return hits.slice(0, limit);
  const qvec = qv[0];
  const embMap = loadEmbeddingsForHits(hits);
  const scored = hits.map(h => {
    const key = `${h.source_type}\0${h.source_id}\0${h.chunk_index}`;
    const ev = embMap.get(key);
    const sim = ev ? cosineSim(qvec, ev) : -1;
    return { h, sim };
  });
  const anyVec = scored.some(s => s.sim >= 0);
  if (!anyVec) return hits.slice(0, limit);
  scored.sort((a, b) => b.sim - a.sim);
  return scored.slice(0, limit).map(s => s.h);
}
