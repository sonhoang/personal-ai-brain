import { Router } from "express";
import { generateArtifact, type ArtifactKind } from "./artifacts.service";

export const artifactsRouter = Router();

const KINDS = new Set<ArtifactKind>(["outline", "flashcards", "quiz", "slide_bullets"]);

artifactsRouter.post("/generate", async (req, res, next) => {
  try {
    const ws = String(req.body?.workspace_id ?? "default").trim() || "default";
    const kind = String(req.body?.kind ?? "").trim() as ArtifactKind;
    if (!KINDS.has(kind)) {
      res.status(400).json({ error: "kind must be outline | flashcards | quiz | slide_bullets" });
      return;
    }
    const markdown = await generateArtifact(ws, kind);
    res.json({ kind, workspace_id: ws, markdown });
  } catch (e) {
    next(e);
  }
});
