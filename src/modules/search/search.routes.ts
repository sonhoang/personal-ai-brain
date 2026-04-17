import { Router } from "express";
import { searchLibrary } from "./search.service";

export const searchRouter = Router();

searchRouter.get("/", async (req, res, next) => {
  try {
    const q = String(req.query.q ?? "").trim();
    const limitRaw = parseInt(String(req.query.limit ?? "30"), 10);
    const limit = Number.isFinite(limitRaw) ? Math.min(50, Math.max(1, limitRaw)) : 30;
    const ws = typeof req.query.workspace_id === "string" ? req.query.workspace_id : undefined;
    if (q.length < 2) {
      res.json({ hits: [] });
      return;
    }
    const hits = await searchLibrary(q, limit, ws);
    res.json({ hits });
  } catch (e) {
    next(e);
  }
});
