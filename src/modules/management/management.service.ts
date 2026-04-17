import fs from "fs";
import path from "path";
import os from "os";
import archiver from "archiver";
import AdmZip from "adm-zip";
import type { Response } from "express";
import { closeDb, getDb } from "../../db/database";
import { config } from "../../config";

function removeSqliteSidecars(dbPath: string): void {
  for (const ext of ["-wal", "-shm"]) {
    const p = dbPath + ext;
    try {
      if (fs.existsSync(p)) fs.unlinkSync(p);
    } catch {
      /* ignore */
    }
  }
}

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

/**
 * Replace `brain.sqlite` and `uploads/` under DATA_DIR with contents of a backup ZIP
 * (same layout as `streamDataBackup`). Closes and reopens the DB.
 */
export function restoreFromBackupZip(zipPath: string): void {
  const extractDir = fs.mkdtempSync(path.join(os.tmpdir(), "brain-restore-"));
  try {
    const zip = new AdmZip(zipPath);
    zip.extractAllTo(extractDir, true);
    const dbExtracted = path.join(extractDir, "brain.sqlite");
    if (!fs.existsSync(dbExtracted)) {
      throw new Error("Backup ZIP must contain brain.sqlite at the archive root");
    }
    closeDb();
    removeSqliteSidecars(config.dbPath);
    if (fs.existsSync(config.uploadsDir)) {
      fs.rmSync(config.uploadsDir, { recursive: true });
    }
    fs.mkdirSync(config.uploadsDir, { recursive: true });
    const uploadsExtracted = path.join(extractDir, "uploads");
    if (fs.existsSync(uploadsExtracted)) {
      fs.cpSync(uploadsExtracted, config.uploadsDir, { recursive: true });
    }
    fs.copyFileSync(dbExtracted, config.dbPath);
    removeSqliteSidecars(config.dbPath);
  } finally {
    fs.rmSync(extractDir, { recursive: true, force: true });
  }
  getDb();
}
