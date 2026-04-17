import { Router } from "express";
import * as chat from "./chat.service";
import type { ChatFocus } from "./chat_types";
import * as chatThreads from "../chat_threads/chat_threads.service";

export const chatRouter = Router();

chatRouter.post("/", async (req, res, next) => {
  const message = String(req.body?.message ?? "").trim();
  if (!message) {
    res.status(400).json({ error: "message required" });
    return;
  }

  let focus: ChatFocus | undefined;
  const raw = req.body?.focus;
  if (raw && typeof raw === "object") {
    const st = String((raw as { source_type?: unknown }).source_type ?? "").trim();
    const sid = String((raw as { source_id?: unknown }).source_id ?? "").trim();
    if (st || sid) {
      if (st !== "document" && st !== "note") {
        res.status(400).json({ error: "focus.source_type must be document or note" });
        return;
      }
      if (!sid) {
        res.status(400).json({ error: "focus.source_id required when focus is set" });
        return;
      }
      focus = { source_type: st, source_id: sid };
    }
  }

  const workspaceId =
    typeof req.body?.workspace_id === "string" ? req.body.workspace_id.trim() || undefined : undefined;
  const threadId =
    typeof req.body?.thread_id === "string" ? req.body.thread_id.trim() || undefined : undefined;

  try {
    const out = await chat.chatWithBrain(message, focus, workspaceId ?? null, threadId ?? null);
    if (threadId) {
      chatThreads.appendMessage(threadId, "user", message);
      chatThreads.appendMessage(
        threadId,
        "assistant",
        out.reply,
        JSON.stringify(out.sources)
      );
    }
    res.json(out);
  } catch (e) {
    next(e);
  }
});
