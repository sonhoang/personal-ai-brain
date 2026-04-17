import fs from "fs";
import archiver from "archiver";
import type { Response } from "express";
import { getDb } from "../../db/database";
import { config } from "../../config";

export function getSummary() {
  const db = getDb();
  const notes = (db.prepare(`SELECT COUNT(*) AS n FROM notes`).get() as { n: number }).n;
  const documents = (db.prepare(`SELECT COUNT(*) AS n FROM documents`).get() as { n: number }).n;
  let chunks = 0;
  try {
    chunks = (db.prepare(`SELECT COUNT(*) AS n FROM chunks_fts`).get() as { n: number }).n;
  } catch {
    chunks = 0;
  }
  return {
    notes,
    documents,
    indexedChunks: chunks,
    dataDir: config.dataDir,
    llmConfigured: Boolean(config.llmBaseUrl),
    embeddingConfigured: Boolean(config.embeddingModel)
  };
}

/** Streams a ZIP of `brain.sqlite` + `uploads/` (same tree as DATA_DIR essentials). */
export function streamDataBackup(res: Response): void {
  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", 'attachment; filename="personal-ai-brain-backup.zip"');
  const archive = archiver("zip", { zlib: { level: 6 } });
  archive.on("error", (err: Error) => {
    if (!res.headersSent) res.status(500).json({ error: err.message });
  });
  archive.pipe(res);
  if (fs.existsSync(config.dbPath)) {
    archive.file(config.dbPath, { name: "brain.sqlite" });
  }
  if (fs.existsSync(config.uploadsDir)) {
    archive.directory(config.uploadsDir, "uploads");
  }
  void archive.finalize();
}
