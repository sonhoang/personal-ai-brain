/** Split plain text into overlapping chunks for RAG (local, no embeddings). */
export function chunkText(text: string, maxLen = 900, overlap = 120): string[] {
  const t = text.replace(/\r\n/g, "\n").trim();
  if (!t) return [];
  if (t.length <= maxLen) return [t];
  const chunks: string[] = [];
  let start = 0;
  while (start < t.length) {
    let end = Math.min(start + maxLen, t.length);
    if (end < t.length) {
      const slice = t.slice(start, end);
      const lastPara = slice.lastIndexOf("\n\n");
      const lastSpace = slice.lastIndexOf(" ");
      const breakAt = lastPara > maxLen * 0.5 ? lastPara : lastSpace > maxLen * 0.5 ? lastSpace : end;
      end = start + Math.max(breakAt, Math.min(maxLen, t.length - start));
    }
    const piece = t.slice(start, end).trim();
    if (piece) chunks.push(piece);
    if (end >= t.length) break;
    start = Math.max(end - overlap, start + 1);
  }
  return chunks;
}

/** Escape user input for FTS5 prefix query (simple token OR). */
export function ftsQueryFromUserInput(q: string): string {
  const tokens = q
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .split(/\s+/)
    .map(s => s.trim())
    .filter(Boolean)
    .slice(0, 12);
  if (tokens.length === 0) return "";
  return tokens.map(t => `"${t.replace(/"/g, '""')}"`).join(" OR ");
}
