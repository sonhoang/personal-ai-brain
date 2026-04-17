import { config } from "../../config";
import { searchChunks, type ChunkHit } from "../indexing/indexing.service";
import { annotateChunkHits } from "../search/search.service";
import { rerankChunkHits } from "../indexing/embedding.service";
import * as chatThreads from "../chat_threads/chat_threads.service";
import type { ChatFocus, ChatSource } from "./chat_types";

export type PreparedChat = {
  messages: { role: "system" | "user" | "assistant"; content: string }[];
  labeled: Array<ChunkHit & { label: string }>;
  hits: ChunkHit[];
};

export async function prepareChatContext(
  userMessage: string,
  focus: ChatFocus | undefined,
  workspaceId: string | null | undefined,
  threadId: string | null | undefined
): Promise<PreparedChat> {
  if (threadId) {
    const th = chatThreads.getThread(threadId);
    if (!th) {
      throw Object.assign(new Error("thread not found"), { status: 404 });
    }
    if (workspaceId && th.workspace_id !== workspaceId) {
      throw Object.assign(new Error("thread workspace mismatch"), { status: 400 });
    }
  }

  const scope =
    focus && (focus.source_type === "document" || focus.source_type === "note")
      ? { sourceType: focus.source_type, sourceId: focus.source_id }
      : undefined;

  const candidates = config.embeddingModel ? config.ftsCandidateChunks : undefined;
  let hits = searchChunks(
    userMessage,
    config.chatContextChunks,
    scope,
    workspaceId ?? undefined,
    candidates
  );
  if (config.embeddingModel && candidates && hits.length > 0) {
    hits = await rerankChunkHits(userMessage, hits, config.chatContextChunks);
  } else {
    hits = hits.slice(0, config.chatContextChunks);
  }

  const labeled = annotateChunkHits(hits);
  const scopeHint = scope
    ? `Retrieval is limited to one ${scope.sourceType} (${scope.sourceId}). If CONTEXT is empty, say that this source had no matching text for the question.`
    : "";
  const context =
    hits.length === 0
      ? "(No matching chunks in index — try different keywords or add notes/documents.)"
      : hits
          .map(
            (h, i) =>
              `[#${i + 1} ${h.source_type} ${h.source_id} part ${h.chunk_index}]\n${h.content}`
          )
          .join("\n\n---\n\n");

  const prior: { role: "user" | "assistant"; content: string }[] = [];
  if (threadId) {
    for (const m of chatThreads.listMessages(threadId, 40)) {
      if (m.role === "user" || m.role === "assistant") {
        prior.push({ role: m.role, content: m.content });
      }
    }
  }

  const messages: PreparedChat["messages"] = [
    {
      role: "system",
      content: `You are a personal knowledge assistant. Answer using the CONTEXT when it helps. If context is empty or irrelevant, answer from general knowledge and say what is missing from the user's library.${scopeHint ? `\n${scopeHint}` : ""}\n\nCONTEXT:\n${context}`
    },
    ...prior,
    { role: "user", content: userMessage }
  ];

  return { messages, labeled, hits };
}

export function toChatSources(labeled: PreparedChat["labeled"]): ChatSource[] {
  return labeled.map(h => ({
    source_type: h.source_type,
    source_id: h.source_id,
    chunk_index: h.chunk_index,
    label: h.label,
    excerpt: h.content.slice(0, 280) + (h.content.length > 280 ? "…" : "")
  }));
}
