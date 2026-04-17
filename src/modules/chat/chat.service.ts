import axios from "axios";
import { config } from "../../config";
import { prepareChatContext, toChatSources } from "./chat_shared";
import type { ChatFocus, ChatResult } from "./chat_types";

export type { ChatFocus, ChatSource, ChatResult } from "./chat_types";

export async function chatWithBrain(
  userMessage: string,
  focus?: ChatFocus | null,
  workspaceId?: string | null,
  threadId?: string | null
): Promise<ChatResult> {
  if (!config.llmBaseUrl) {
    throw Object.assign(
      new Error(
        "LLM not configured — set LLM_BASE_URL (and LLM_API_KEY if needed) in .env. Example: Ollama http://127.0.0.1:11434/v1"
      ),
      { status: 503 }
    );
  }

  const { messages, labeled } = await prepareChatContext(
    userMessage,
    focus ?? undefined,
    workspaceId ?? null,
    threadId ?? null
  );

  const url = `${config.llmBaseUrl}/chat/completions`;
  const res = await axios.post(
    url,
    {
      model: config.llmModel,
      messages,
      temperature: 0.35,
      stream: false
    },
    {
      headers: {
        "Content-Type": "application/json",
        ...(config.llmApiKey ? { Authorization: `Bearer ${config.llmApiKey}` } : {})
      },
      timeout: 120_000,
      validateStatus: () => true
    }
  );

  if (res.status >= 400) {
    const msg =
      (res.data as { error?: { message?: string } })?.error?.message ||
      `LLM HTTP ${res.status}`;
    throw Object.assign(new Error(msg), { status: res.status });
  }

  const reply =
    (res.data as { choices?: { message?: { content?: string } }[] })?.choices?.[0]?.message
      ?.content ?? "";
  const model = (res.data as { model?: string })?.model ?? config.llmModel;

  return {
    reply,
    model,
    sources: toChatSources(labeled)
  };
}
