import { Router } from "express";
import axios from "axios";
import { config } from "../../config";
import { prepareChatContext, toChatSources } from "./chat_shared";
import type { ChatFocus } from "./chat_types";
import * as chatThreads from "../chat_threads/chat_threads.service";

export const chatStreamRouter = Router();

chatStreamRouter.post("/", async (req, res, next) => {
  const message = String(req.body?.message ?? "").trim();
  if (!message) {
    res.status(400).json({ error: "message required" });
    return;
  }
  if (!config.llmBaseUrl) {
    res.status(503).json({ error: "LLM not configured" });
    return;
  }

  let focus: ChatFocus | undefined;
  const raw = req.body?.focus;
  if (raw && typeof raw === "object") {
    const st = String((raw as { source_type?: unknown }).source_type ?? "").trim();
    const sid = String((raw as { source_id?: unknown }).source_id ?? "").trim();
    if (st && sid) {
      if (st !== "document" && st !== "note") {
        res.status(400).json({ error: "focus.source_type must be document or note" });
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
    const { messages, labeled } = await prepareChatContext(
      message,
      focus,
      workspaceId ?? null,
      threadId ?? null
    );

    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    if (typeof res.flushHeaders === "function") res.flushHeaders();

    const upstream = await axios.post(
      `${config.llmBaseUrl}/chat/completions`,
      {
        model: config.llmModel,
        messages,
        temperature: 0.35,
        stream: true
      },
      {
        responseType: "stream",
        headers: {
          "Content-Type": "application/json",
          ...(config.llmApiKey ? { Authorization: `Bearer ${config.llmApiKey}` } : {})
        },
        timeout: 0,
        validateStatus: () => true
      }
    );

    if (upstream.status >= 400) {
      res.status(upstream.status).json({ error: `LLM HTTP ${upstream.status}` });
      return;
    }

    let fullReply = "";
    const sourcesJson = JSON.stringify(toChatSources(labeled));

    upstream.data.on("data", (chunk: Buffer) => {
      const s = chunk.toString("utf8");
      const lines = s.split("\n");
      for (const line of lines) {
        const t = line.replace(/^data:\s*/, "").trim();
        if (!t || t === "[DONE]") continue;
        try {
          const j = JSON.parse(t) as {
            choices?: { delta?: { content?: string } }[];
          };
          const piece = j.choices?.[0]?.delta?.content ?? "";
          if (piece) {
            fullReply += piece;
            res.write(`data: ${JSON.stringify({ token: piece })}\n\n`);
          }
        } catch {
          /* ignore partial JSON */
        }
      }
    });

    upstream.data.on("end", () => {
      if (threadId) {
        chatThreads.appendMessage(threadId, "user", message);
        chatThreads.appendMessage(threadId, "assistant", fullReply, sourcesJson);
      }
      res.write(`data: ${JSON.stringify({ done: true, sources: toChatSources(labeled) })}\n\n`);
      res.end();
    });

    upstream.data.on("error", (err: Error) => {
      if (!res.writableEnded) {
        res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
        res.end();
      }
    });
  } catch (e) {
    next(e);
  }
});
