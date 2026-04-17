import fs from "fs";
import os from "os";
import path from "path";
import multer from "multer";
import { Router } from "express";
import { getDb } from "../../db/database";
import { config } from "../../config";
import * as management from "./management.service";

const restoreMaxBytes = config.maxRestoreZipMb * 1024 * 1024;

const restoreUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      cb(null, os.tmpdir());
    },
    filename: (_req, _file, cb) => {
      cb(null, `brain-restore-${Date.now()}.zip`);
    }
  }),
  limits: { fileSize: restoreMaxBytes },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase();
    if (ext !== ".zip") {
      cb(new Error("Upload a .zip backup"));
      return;
    }
    cb(null, true);
  }
});

export const managementRouter = Router();

managementRouter.get("/summary", (_req, res) => {
  res.json(management.getSummary());
});

managementRouter.get("/export/backup", (_req, res) => {
  management.streamDataBackup(res);
});

managementRouter.post("/import/backup", restoreUpload.single("file"), (req, res) => {
  const file = req.file;
  const cleanup = () => {
    if (file?.path) {
      try {
        fs.unlinkSync(file.path);
      } catch {
        /* ignore */
      }
    }
  };
  const confirm = String(req.body?.confirm_replace ?? "").trim();
  if (confirm !== "yes") {
    cleanup();
    res.status(400).json({
      error: "Send confirm_replace=yes to replace this library with the backup (destructive)."
    });
    return;
  }
  if (!file?.path) {
    res.status(400).json({ error: "file required (multipart field: file)" });
    return;
  }
  try {
    management.restoreFromBackupZip(file.path);
    cleanup();
    res.json({ ok: true });
  } catch (e) {
    cleanup();
    try {
      getDb();
    } catch {
      /* process may need restart if DB is corrupted */
    }
    res.status(400).json({ error: e instanceof Error ? e.message : String(e) });
  }
});
