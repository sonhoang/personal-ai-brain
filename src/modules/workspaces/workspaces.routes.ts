import { Router } from "express";
import * as ws from "./workspaces.service";

export const workspacesRouter = Router();

workspacesRouter.get("/", (_req, res) => {
  res.json({ workspaces: ws.listWorkspaces() });
});

workspacesRouter.post("/", (req, res) => {
  const name = String(req.body?.name ?? "").trim();
  if (!name) {
    res.status(400).json({ error: "name required" });
    return;
  }
  const w = ws.createWorkspace(name);
  res.status(201).json(w);
});

workspacesRouter.patch("/:id", (req, res) => {
  const name = String(req.body?.name ?? "").trim();
  if (!name) {
    res.status(400).json({ error: "name required" });
    return;
  }
  const w = ws.renameWorkspace(req.params.id, name);
  if (!w) {
    res.status(404).json({ error: "Workspace not found" });
    return;
  }
  res.json(w);
});

workspacesRouter.delete("/:id", (req, res) => {
  const ok = ws.deleteWorkspace(req.params.id);
  if (!ok) {
    res.status(400).json({ error: "Cannot delete default or missing workspace" });
    return;
  }
  res.status(204).send();
});
