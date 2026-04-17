import { describe, it, expect } from "vitest";
import request from "supertest";
import app from "../src/app";

describe("HTTP", () => {
  it("GET /health", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it("POST /api/management/import/backup requires confirm_replace", async () => {
    const res = await request(app)
      .post("/api/management/import/backup")
      .set("Authorization", "Bearer vitest-brain-password");
    expect(res.status).toBe(400);
    expect(String((res.body as { error?: string }).error || "")).toMatch(/confirm_replace/i);
  });
});
