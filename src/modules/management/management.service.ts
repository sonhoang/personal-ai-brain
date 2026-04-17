import fs from "fs";
import path from "path";
import os from "os";
import archiver from "archiver";
import AdmZip from "adm-zip";
import type { Response } from "express";
import { closeDb, getDb } from "../../db/database";
import { config } from "../../config";
import * as notes from "../notes/notes.service";

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

function safeExportFilename(s: string, fallback: string): string {
  const t = (s || fallback).replace(/[/\\?%*:|"<>]/g, "_").trim().slice(0, 80);
  return t || fallback;
}

/** JSON export of notes + document text for one workspace (portable, not a full DB backup). */
export function streamLibraryJsonExport(res: Response, workspaceId: string): void {
  const db = getDb();
  const noteRows = notes.listNotes(50_000, workspaceId);
  const docRows = db
    .prepare(
      `SELECT id, original_name, extracted_text, created_at, source_url, chat_instruction, mime, bytes
       FROM documents WHERE workspace_id = ? ORDER BY created_at DESC`
    )
    .all(workspaceId) as {
    id: string;
    original_name: string;
    extracted_text: string | null;
    created_at: string;
    source_url: string | null;
    chat_instruction: string | null;
    mime: string | null;
    bytes: number;
  }[];
  const payload = {
    exported_at: new Date().toISOString(),
    workspace_id: workspaceId,
    notes: noteRows.map(n => ({
      id: n.id,
      title: n.title,
      body: n.body,
      tags: n.tags,
      inbox: n.inbox,
      chat_instruction: n.chat_instruction,
      created_at: n.created_at,
      updated_at: n.updated_at
    })),
    documents: docRows.map(d => ({
      id: d.id,
      original_name: d.original_name,
      extracted_text: d.extracted_text,
      created_at: d.created_at,
      source_url: d.source_url,
      chat_instruction: d.chat_instruction,
      mime: d.mime,
      bytes: d.bytes
    }))
  };
  const name = `brain-library-${safeExportFilename(workspaceId, "workspace")}.json`;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${name}"`);
  res.send(JSON.stringify(payload, null, 2));
}

/** ZIP of markdown files (notes + document text) for one workspace. */
export function streamLibraryMarkdownZip(res: Response, workspaceId: string): void {
  const db = getDb();
  const noteRows = notes.listNotes(50_000, workspaceId);
  const docRows = db
    .prepare(
      `SELECT id, original_name, extracted_text, created_at FROM documents WHERE workspace_id = ? ORDER BY created_at DESC`
    )
    .all(workspaceId) as {
    id: string;
    original_name: string;
    extracted_text: string | null;
    created_at: string;
  }[];

  res.setHeader("Content-Type", "application/zip");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="brain-library-${safeExportFilename(workspaceId, "workspace")}.zip"`
  );
  const archive = archiver("zip", { zlib: { level: 6 } });
  archive.on("error", (err: Error) => {
    if (!res.headersSent) res.status(500).json({ error: err.message });
  });
  archive.pipe(res);

  const seen = new Map<string, number>();
  for (const n of noteRows) {
    const base = safeExportFilename(n.title || "note", n.id);
    let name = `${base}.md`;
    const c = (seen.get(name) ?? 0) + 1;
    seen.set(name, c);
    if (c > 1) name = `${base}-${c}.md`;
    const md = `---\nid: ${n.id}\nupdated: ${n.updated_at}\ntags: ${(n.tags || []).join(", ")}\n---\n\n# ${n.title || "Untitled"}\n\n${n.body || ""}\n`;
    archive.append(md, { name: `notes/${name}` });
  }
  seen.clear();
  for (const d of docRows) {
    const base = safeExportFilename(d.original_name.replace(/\.[^.]+$/, "") || "doc", d.id);
    let name = `${base}.md`;
    const c = (seen.get(name) ?? 0) + 1;
    seen.set(name, c);
    if (c > 1) name = `${base}-${c}.md`;
    const md = `---\nid: ${d.id}\nsource: document\noriginal_name: ${d.original_name}\ncreated: ${d.created_at}\n---\n\n# ${d.original_name}\n\n${d.extracted_text || ""}\n`;
    archive.append(md, { name: `documents/${name}` });
  }

  archive.append(
    JSON.stringify(
      {
        exported_at: new Date().toISOString(),
        workspace_id: workspaceId,
        note_count: noteRows.length,
        document_count: docRows.length
      },
      null,
      2
    ),
    { name: "manifest.json" }
  );
  void archive.finalize();
}
