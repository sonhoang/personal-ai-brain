import { Router } from "express";
import { searchLibrary, type SearchOptions } from "./search.service";

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

    const options: SearchOptions = {};
    const st = String(req.query.type ?? "").toLowerCase();
    if (st === "note" || st === "document") options.sourceType = st;
    else options.sourceType = "all";

    const tag = typeof req.query.tag === "string" ? req.query.tag : undefined;
    if (tag?.trim()) options.tag = tag.trim();

    if (req.query.inbox === "1" || req.query.inbox === "true") options.inboxOnly = true;

    const df = typeof req.query.date_from === "string" ? req.query.date_from.trim() : "";
    const dt = typeof req.query.date_to === "string" ? req.query.date_to.trim() : "";
    if (df) options.dateFrom = df;
    if (dt) options.dateTo = dt;

    const sort = String(req.query.sort ?? "").toLowerCase();
    if (sort === "recency" || sort === "recent") options.sort = "recency";

    const hits = await searchLibrary(q, limit, ws, options);
    res.json({ hits });
  } catch (e) {
    next(e);
  }
});
