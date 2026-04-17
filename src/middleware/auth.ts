import { Request, Response, NextFunction } from "express";
import { config } from "../config";

export function brainAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization || "";
  const token =
    typeof header === "string" && header.startsWith("Bearer ")
      ? header.slice(7).trim()
      : typeof header === "string"
        ? header.trim()
        : "";
  if (!token || token !== config.brainPassword) {
    res.status(401).json({ error: "Unauthorized — set Authorization: Bearer <BRAIN_PASSWORD>" });
    return;
  }
  next();
}
