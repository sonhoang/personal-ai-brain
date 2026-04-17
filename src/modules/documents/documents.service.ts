import fs from "fs";
import path from "path";
import { v4 as uuid } from "uuid";
import axios from "axios";
import * as cheerio from "cheerio";
import AdmZip from "adm-zip";
import { PDFParse } from "pdf-parse";
import mammoth from "mammoth";
import { getDb } from "../../db/database";
import { config } from "../../config";
import { reindexDocument, deleteChunksForSource } from "../indexing/indexing.service";
import { indexEmbeddingsForDocument } from "../indexing/embedding.service";

export type DocumentRow = {
  id: string;
  original_name: string;
  stored_path: string;
  mime: string | null;
  bytes: number;
  extracted_text: string | null;
  created_at: string;
  workspace_id: string;
  source_url: string | null;
};

export type DocumentListRow = Omit<DocumentRow, "extracted_text">;

function nowIso(): string {
  return new Date().toISOString();
}

function sanitizeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
}

async function extractTextFromFile(filePath: string, mime: string, originalName: string): Promise<string> {
  const ext = path.extname(originalName).toLowerCase();
  if (mime.includes("text") || ext === ".txt" || ext === ".md" || ext === ".markdown" || ext === ".text") {
    return fs.promises.readFile(filePath, "utf8");
  }
  if (ext === ".html" || ext === ".htm" || mime.includes("html")) {
    const raw = await fs.promises.readFile(filePath, "utf8");
    return cheerio.load(raw).text().replace(/\s+/g, " ").trim();
  }
  if (ext === ".rtf") {
    const raw = await fs.promises.readFile(filePath, "utf8");
    return raw
      .replace(/\{\\[^}]*\}/g, " ")
      .replace(/\\'[0-9a-f]{2}/gi, " ")
      .replace(/[{}\\]/g, " ")
      .trim();
  }
  if (ext === ".pdf" || mime === "application/pdf" || mime.includes("pdf")) {
    const buf = await fs.promises.readFile(filePath);
    const parser = new PDFParse({ data: new Uint8Array(buf) });
    try {
      const result = await parser.getText();
      return (result.text || "").trim();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new Error(`PDF could not be read (${msg}). It may be encrypted, corrupt, or image-only.`);
    } finally {
      await parser.destroy().catch(() => {});
    }
  }
  if (
    ext === ".docx" ||
    mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    mime.includes("wordprocessingml")
  ) {
    const result = await mammoth.extractRawText({ path: filePath });
    const hardErrors = result.messages.filter(m => m.type === "error");
    if (hardErrors.length && !(result.value || "").trim()) {
      throw new Error(`DOCX: ${hardErrors.map(m => m.message).join("; ")}`);
    }
    return (result.value || "").trim();
  }
  throw new Error(`Unsupported type (${ext || mime}).`);
}

export function listDocuments(limit = 100, workspaceId?: string): DocumentListRow[] {
  const db = getDb();
  if (workspaceId) {
    return db
      .prepare(
        `SELECT id, original_name, stored_path, mime, bytes, created_at, workspace_id, source_url
         FROM documents WHERE workspace_id = ? ORDER BY created_at DESC LIMIT ?`
      )
      .all(workspaceId, limit) as DocumentListRow[];
  }
  return db
    .prepare(
      `SELECT id, original_name, stored_path, mime, bytes, created_at, workspace_id, source_url
       FROM documents ORDER BY created_at DESC LIMIT ?`
    )
    .all(limit) as DocumentListRow[];
}

export function getDocument(id: string): DocumentRow | undefined {
  return getDb()
    .prepare(
      `SELECT id, original_name, stored_path, mime, bytes, extracted_text, created_at, workspace_id, source_url
       FROM documents WHERE id = ?`
    )
    .get(id) as DocumentRow | undefined;
}

async function persistDocumentRow(
  id: string,
  originalName: string,
  relPath: string,
  mime: string | null,
  bytes: number,
  text: string,
  workspaceId: string,
  sourceUrl: string | null
): Promise<DocumentRow> {
  const t = nowIso();
  getDb()
    .prepare(
      `INSERT INTO documents (id, original_name, stored_path, mime, bytes, extracted_text, created_at, workspace_id, source_url)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(id, originalName, relPath, mime, bytes, text, t, workspaceId, sourceUrl);
  reindexDocument(id, text);
  if (config.embeddingModel) {
    void indexEmbeddingsForDocument(id, text).catch(() => {});
  }
  return getDocument(id)!;
}

export async function ingestUploadedFile(
  file: Express.Multer.File,
  workspaceId = "default"
): Promise<DocumentRow> {
  const id = uuid();
  const text = await extractTextFromFile(file.path, file.mimetype, file.originalname);
  const rel = path.relative(config.dataDir, file.path);
  return persistDocumentRow(
    id,
    file.originalname,
    rel,
    file.mimetype,
    file.size,
    text,
    workspaceId,
    null
  );
}

export async function ingestFromUrl(urlStr: string, workspaceId: string): Promise<DocumentRow> {
  let parsed: URL;
  try {
    parsed = new URL(urlStr);
  } catch {
    throw new Error("Invalid URL");
  }
  if (!/^https?:$/i.test(parsed.protocol)) {
    throw new Error("Only http(s) URLs are allowed");
  }
  const maxBytes = config.maxUploadMb * 1024 * 1024;
  const res = await axios.get<ArrayBuffer>(urlStr, {
    responseType: "arraybuffer",
    timeout: 45_000,
    maxContentLength: maxBytes,
    maxBodyLength: maxBytes,
    validateStatus: () => true,
    headers: { "User-Agent": "PersonalAIBrain/1.0" }
  });
  if (res.status >= 400) {
    throw new Error(`URL returned HTTP ${res.status}`);
  }
  const buf = Buffer.from(res.data);
  const ct = String(res.headers["content-type"] || "").split(";")[0].trim().toLowerCase();
  let name = path.basename(parsed.pathname) || "page";
  if (!path.extname(name)) {
    if (ct.includes("html")) name += ".html";
    else name += ".txt";
  }
  const tmp = path.join(config.uploadsDir, `${Date.now()}_${sanitizeName(name)}`);
  fs.writeFileSync(tmp, buf);
  try {
    const text = await extractTextFromFile(tmp, ct || "application/octet-stream", name);
    const id = uuid();
    const rel = path.relative(config.dataDir, tmp);
    return persistDocumentRow(id, name, rel, ct || null, buf.length, text, workspaceId, urlStr);
  } catch (e) {
    try {
      fs.unlinkSync(tmp);
    } catch {
      /* ignore */
    }
    throw e;
  }
}

const ZIP_EXTS = new Set([".txt", ".md", ".markdown", ".text", ".pdf", ".docx", ".html", ".htm", ".rtf"]);

export async function ingestZipBuffer(
  buffer: Buffer,
  originalZipName: string,
  workspaceId: string
): Promise<{ imported: number; errors: string[] }> {
  const zip = new AdmZip(buffer);
  const errors: string[] = [];
  let imported = 0;
  for (const entry of zip.getEntries()) {
    if (entry.isDirectory) continue;
    const base = path.basename(entry.entryName);
    const ext = path.extname(base).toLowerCase();
    if (!ZIP_EXTS.has(ext)) continue;
    try {
      const data = entry.getData();
      if (data.length > config.maxUploadMb * 1024 * 1024) {
        errors.push(`${base}: too large`);
        continue;
      }
      const tmp = path.join(config.uploadsDir, `${Date.now()}_${sanitizeName(base)}`);
      fs.writeFileSync(tmp, data);
      const mime =
        ext === ".pdf"
          ? "application/pdf"
          : ext === ".docx"
            ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            : "text/plain";
      const text = await extractTextFromFile(tmp, mime, base);
      const id = uuid();
      const rel = path.relative(config.dataDir, tmp);
      await persistDocumentRow(id, base, rel, mime, data.length, text, workspaceId, null);
      imported++;
    } catch (e) {
      errors.push(`${base}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  if (imported === 0 && errors.length === 0) {
    errors.push("No supported files in ZIP (.txt, .md, .pdf, .docx, .html, .rtf)");
  }
  return { imported, errors };
}

export function deleteDocument(id: string): boolean {
  const db = getDb();
  const row = db.prepare(`SELECT stored_path FROM documents WHERE id = ?`).get(id) as
    | { stored_path: string }
    | undefined;
  if (!row) return false;
  const abs = path.join(config.dataDir, row.stored_path);
  try {
    if (fs.existsSync(abs)) fs.unlinkSync(abs);
  } catch {
    /* ignore */
  }
  db.prepare(`DELETE FROM documents WHERE id = ?`).run(id);
  deleteChunksForSource("document", id);
  return true;
}
