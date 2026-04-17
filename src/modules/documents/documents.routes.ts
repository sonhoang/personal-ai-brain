import fs from "fs";
import path from "path";
import multer from "multer";
import { Router } from "express";
import { config } from "../../config";
import * as docs from "./documents.service";

const maxBytes = config.maxUploadMb * 1024 * 1024;

const allowedExt = new Set([
  ".txt",
  ".md",
  ".markdown",
  ".text",
  ".pdf",
  ".docx",
  ".html",
  ".htm",
  ".rtf"
]);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, config.uploadsDir);
  },
  filename: (_req, file, cb) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
    cb(null, `${Date.now()}_${safe}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: maxBytes },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase();
    if (!allowedExt.has(ext)) {
      cb(new Error("Unsupported type for this field."));
      return;
    }
    cb(null, true);
  }
});

const zipUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: maxBytes },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase();
    if (ext !== ".zip") {
      cb(new Error("Upload a .zip file"));
      return;
    }
    cb(null, true);
  }
});

export const documentsRouter = Router();

documentsRouter.get("/", (req, res) => {
  const ws = typeof req.query.workspace_id === "string" ? req.query.workspace_id : undefined;
  res.json({ documents: docs.listDocuments(100, ws) });
});

documentsRouter.post("/url", async (req, res) => {
  const url = String(req.body?.url ?? "").trim();
  const workspaceId = String(req.body?.workspace_id ?? "default").trim() || "default";
  if (!url) {
    res.status(400).json({ error: "url required" });
    return;
  }
  try {
    const d = await docs.ingestFromUrl(url, workspaceId);
    res.status(201).json(d);
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

documentsRouter.post("/zip", zipUpload.single("file"), async (req, res) => {
  if (!req.file?.buffer) {
    res.status(400).json({ error: "Missing file (multipart name: file)" });
    return;
  }
  const workspaceId = String(req.body?.workspace_id ?? "default").trim() || "default";
  try {
    const out = await docs.ingestZipBuffer(req.file.buffer, req.file.originalname, workspaceId);
    res.status(201).json(out);
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

documentsRouter.get("/:id", (req, res) => {
  const d = docs.getDocument(req.params.id);
  if (!d) {
    res.status(404).json({ error: "Document not found" });
    return;
  }
  res.json(d);
});

documentsRouter.post("/", upload.single("file"), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: "Missing file field (multipart name: file)" });
    return;
  }
  const workspaceId = String(req.body?.workspace_id ?? "default").trim() || "default";
  try {
    const d = await docs.ingestUploadedFile(req.file, workspaceId);
    res.status(201).json(d);
  } catch (e) {
    try {
      if (req.file.path) fs.unlinkSync(req.file.path);
    } catch {
      /* ignore */
    }
    res.status(400).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

documentsRouter.delete("/:id", (req, res) => {
  const ok = docs.deleteDocument(req.params.id);
  if (!ok) {
    res.status(404).json({ error: "Document not found" });
    return;
  }
  res.status(204).send();
});
