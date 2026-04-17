import { Router } from "express";
import * as threads from "./chat_threads.service";

export const chatThreadsRouter = Router();

chatThreadsRouter.get("/", (req, res) => {
  const ws = String(req.query.workspace_id ?? "default");
  res.json({ threads: threads.listThreads(ws) });
});

chatThreadsRouter.post("/", (req, res) => {
  const ws = String(req.body?.workspace_id ?? "default");
  const title = req.body?.title != null ? String(req.body.title) : undefined;
  const t = threads.createThread(ws, title);
  res.status(201).json(t);
});

chatThreadsRouter.get("/:id/messages", (req, res) => {
  res.json({ messages: threads.listMessages(req.params.id) });
});

chatThreadsRouter.get("/:id", (req, res) => {
  const t = threads.getThread(req.params.id);
  if (!t) {
    res.status(404).json({ error: "Thread not found" });
    return;
  }
  res.json(t);
});

chatThreadsRouter.patch("/:id", (req, res) => {
  const title = String(req.body?.title ?? "");
  if (!title) {
    res.status(400).json({ error: "title required" });
    return;
  }
  const t = threads.updateThreadTitle(req.params.id, title);
  if (!t) {
    res.status(404).json({ error: "Thread not found" });
    return;
  }
  res.json(t);
});

chatThreadsRouter.delete("/:id", (req, res) => {
  const ok = threads.deleteThread(req.params.id);
  if (!ok) {
    res.status(404).json({ error: "Thread not found" });
    return;
  }
  res.status(204).send();
});
