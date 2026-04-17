import { Router } from "express";
import * as saved from "./saved_searches.service";

export const savedSearchesRouter = Router();

savedSearchesRouter.get("/", (req, res) => {
  const ws = String(req.query.workspace_id ?? "default");
  res.json({ saved: saved.listSaved(ws) });
});

savedSearchesRouter.post("/", (req, res) => {
  const ws = String(req.body?.workspace_id ?? "default");
  const name = String(req.body?.name ?? "").trim();
  const query = String(req.body?.query ?? "").trim();
  if (!name || !query) {
    res.status(400).json({ error: "name and query required" });
    return;
  }
  const row = saved.createSaved(ws, name, query);
  res.status(201).json(row);
});

savedSearchesRouter.delete("/:id", (req, res) => {
  const ok = saved.deleteSaved(req.params.id);
  if (!ok) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.status(204).send();
});
