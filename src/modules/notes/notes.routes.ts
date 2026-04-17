import { Router } from "express";
import * as notes from "./notes.service";

export const notesRouter = Router();

notesRouter.get("/", (req, res) => {
  const ws = typeof req.query.workspace_id === "string" ? req.query.workspace_id : undefined;
  const inboxOnly = req.query.inbox === "1" || req.query.inbox === "true";
  res.json({ notes: notes.listNotes(200, ws, inboxOnly) });
});

notesRouter.post("/daily", (req, res) => {
  const ws = String(req.body?.workspace_id ?? "default").trim() || "default";
  const n = notes.createDailyNote(ws);
  res.status(201).json(n);
});

notesRouter.post("/quick", (req, res) => {
  const ws = String(req.body?.workspace_id ?? "default").trim() || "default";
  const n = notes.createNote({
    title: String(req.body?.title ?? "Inbox").slice(0, 500),
    body: String(req.body?.body ?? ""),
    tags: req.body?.tags,
    workspace_id: ws,
    inbox: 1
  });
  res.status(201).json(n);
});

notesRouter.get("/:id/versions", (req, res) => {
  if (!notes.getNote(req.params.id)) {
    res.status(404).json({ error: "Note not found" });
    return;
  }
  res.json({ versions: notes.listNoteVersions(req.params.id) });
});

notesRouter.post("/:id/restore_version", (req, res) => {
  const vid = Number(req.body?.version_id);
  if (!Number.isFinite(vid)) {
    res.status(400).json({ error: "version_id required" });
    return;
  }
  const n = notes.restoreNoteVersion(req.params.id, vid);
  if (!n) {
    res.status(404).json({ error: "Note or version not found" });
    return;
  }
  res.json(n);
});

notesRouter.get("/:id", (req, res) => {
  const n = notes.getNote(req.params.id);
  if (!n) {
    res.status(404).json({ error: "Note not found" });
    return;
  }
  res.json(n);
});

notesRouter.post("/", (req, res) => {
  const n = notes.createNote({
    title: req.body?.title,
    body: req.body?.body,
    tags: req.body?.tags,
    workspace_id: req.body?.workspace_id,
    inbox: req.body?.inbox === 1 || req.body?.inbox === true ? 1 : 0
  });
  res.status(201).json(n);
});

notesRouter.patch("/:id", (req, res) => {
  const n = notes.updateNote(req.params.id, {
    title: req.body?.title,
    body: req.body?.body,
    tags: req.body?.tags
  });
  if (!n) {
    res.status(404).json({ error: "Note not found" });
    return;
  }
  res.json(n);
});

notesRouter.delete("/:id", (req, res) => {
  const ok = notes.deleteNote(req.params.id);
  if (!ok) {
    res.status(404).json({ error: "Note not found" });
    return;
  }
  res.status(204).send();
});
