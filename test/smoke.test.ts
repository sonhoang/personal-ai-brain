import { describe, it, expect } from "vitest";
import request from "supertest";
import app from "../src/app";

describe("HTTP", () => {
  it("GET /health", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});
