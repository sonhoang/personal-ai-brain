import axios from "axios";
import { config } from "../../config";
import { listSampleChunks } from "../indexing/indexing.service";
import { annotateChunkHits } from "../search/search.service";

export type ArtifactKind = "outline" | "flashcards" | "quiz" | "slide_bullets";

const INSTRUCTIONS: Record<ArtifactKind, string> = {
  outline:
    "From LIBRARY EXCERPTS only, write a clear hierarchical outline in Markdown (# / ## / ###). If excerpts are thin, say what is missing.",
  flashcards:
    "From LIBRARY EXCERPTS only, write 8–15 flashcards as Markdown: each line `- **Q:** … / **A:** …`. Cover distinct facts; no filler.",
  quiz:
    "From LIBRARY EXCERPTS only, write a short quiz: 5 multiple-choice questions in Markdown (numbered, with A–D options and a separate answer key).",
  slide_bullets:
    "From LIBRARY EXCERPTS only, produce 6–10 slide titles as `## Title` each followed by 3–5 tight bullets (`-`). Suitable for a talk deck."
};

export async function generateArtifact(workspaceId: string, kind: ArtifactKind): Promise<string> {
  if (!config.llmBaseUrl) {
    throw Object.assign(
      new Error("LLM not configured — set LLM_BASE_URL in .env to generate artifacts."),
      { status: 503 }
    );
  }
  const hits = listSampleChunks(workspaceId, 56);
  const labeled = annotateChunkHits(hits);
  const lib =
    labeled.length === 0
      ? "(No indexed chunks in this workspace yet.)"
      : labeled
          .map(
            (h, i) =>
              `[${i + 1} ${h.label} §${h.chunk_index}${h.page != null ? ` p.${h.page}` : ""}]\n${h.content}`
          )
          .join("\n\n---\n\n");

  const url = `${config.llmBaseUrl}/chat/completions`;
  const res = await axios.post(
    url,
    {
      model: config.llmModel,
      messages: [
        {
          role: "system",
          content: `You generate study and presentation artifacts from the user's local library. ${INSTRUCTIONS[kind]} Do not invent citations; ground claims in the excerpts when possible.`
        },
        {
          role: "user",
          content: `Task: ${kind.replace("_", " ")}\n\nLIBRARY EXCERPTS:\n${lib}`
        }
      ],
      temperature: 0.4,
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
      (res.data as { error?: { message?: string } })?.error?.message || `LLM HTTP ${res.status}`;
    throw Object.assign(new Error(msg), { status: res.status });
  }

  return (
    (res.data as { choices?: { message?: { content?: string } }[] })?.choices?.[0]?.message
      ?.content ?? ""
  ).trim();
}
