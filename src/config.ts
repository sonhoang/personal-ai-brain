import path from "path";

function req(name: string): string {
  const v = process.env[name];
  if (!v || !String(v).trim()) {
    throw new Error(`Missing required env: ${name}`);
  }
  return String(v).trim();
}

export const config = {
  port: Number(process.env.PORT) || 3030,
  /** Single password — send as Authorization: Bearer <value> */
  brainPassword: req("BRAIN_PASSWORD"),
  dataDir: path.resolve(process.cwd(), (process.env.DATA_DIR || "./data").trim()),
  dbPath: path.resolve(process.cwd(), (process.env.DATA_DIR || "./data").trim(), "brain.sqlite"),
  uploadsDir: path.resolve(process.cwd(), (process.env.DATA_DIR || "./data").trim(), "uploads"),

  llmBaseUrl: (process.env.LLM_BASE_URL || "").trim().replace(/\/$/, ""),
  llmApiKey: (process.env.LLM_API_KEY || "").trim(),
  llmModel: (process.env.LLM_MODEL || "llama3").trim(),
  chatContextChunks: Math.min(32, Math.max(1, Number(process.env.CHAT_CONTEXT_CHUNKS) || 8)),
  /** OpenAI-compatible embeddings model (same base URL). Optional; enables semantic reranking over FTS candidates. */
  embeddingModel: (process.env.LLM_EMBEDDING_MODEL || "").trim(),
  /** FTS hits to retrieve before embedding rerank (when LLM_EMBEDDING_MODEL set). */
  ftsCandidateChunks: Math.min(96, Math.max(8, Number(process.env.FTS_CANDIDATE_CHUNKS) || 48)),

  maxUploadMb: Math.min(200, Math.max(5, Number(process.env.MAX_UPLOAD_MB) || 40)),
  /** Max ZIP size for POST /management/import/backup (full library restore). */
  maxRestoreZipMb: Math.min(2048, Math.max(50, Number(process.env.BRAIN_MAX_RESTORE_ZIP_MB) || 512)),
  /** Comma-separated note template for new notes (optional). */
  noteTemplate: (process.env.NOTE_TEMPLATE || "").trim(),

  apiRateLimitWindowMs: Math.max(1000, Number(process.env.API_RATE_WINDOW_MS) || 60_000),
  apiRateLimitMax: Math.max(10, Number(process.env.API_RATE_MAX) || 300)
};
