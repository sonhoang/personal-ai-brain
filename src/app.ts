import fs from "fs";
import path from "path";
import express from "express";
import rateLimit from "express-rate-limit";
import { brainAuth } from "./middleware/auth";
import { apiRouter } from "./routes/api";
import { config } from "./config";

const app = express();

app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    console.log(
      JSON.stringify({
        method: req.method,
        path: req.path,
        status: res.statusCode,
        ms: Date.now() - start
      })
    );
  });
  next();
});

app.use(express.json({ limit: `${Math.max(4, config.maxUploadMb)}mb` }));

const apiLimiter = rateLimit({
  windowMs: config.apiRateLimitWindowMs,
  max: config.apiRateLimitMax,
  standardHeaders: true,
  legacyHeaders: false
});

const webDist = path.join(process.cwd(), "web", "dist");
const webIndex = path.join(webDist, "index.html");
const staticRoot = fs.existsSync(webIndex) ? webDist : null;

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "personal-ai-brain" });
});

app.use("/api", apiLimiter, brainAuth, apiRouter);

if (staticRoot) {
  app.use(express.static(staticRoot, { index: false }));

  app.use((req, res, next) => {
    if (req.method !== "GET" && req.method !== "HEAD") return next();
    if (req.path.startsWith("/api") || req.path === "/health") return next();
    const ext = path.extname(req.path);
    if (ext && ext !== ".html") return next();
    if (!req.accepts("html")) return next();
    res.sendFile(path.join(staticRoot, "index.html"), err => {
      if (err) next(err);
    });
  });
} else {
  app.get("/", (_req, res) => {
    res
      .status(503)
      .type("text")
      .send("UI not built. Run: cd web && npm install && npm run build (or npm run build from repo root).");
  });
}

app.use(
  (
    err: unknown,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ): void => {
    if (res.headersSent) return;
    const status =
      typeof (err as { status?: number })?.status === "number" ? (err as { status: number }).status : 500;
    const message = err instanceof Error ? err.message : "Internal error";
    res.status(status >= 400 && status < 600 ? status : 500).json({ error: message });
  }
);

export default app;
