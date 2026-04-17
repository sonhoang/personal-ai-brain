import { Router } from "express";
import * as management from "./management.service";

export const managementRouter = Router();

managementRouter.get("/summary", (_req, res) => {
  res.json(management.getSummary());
});

managementRouter.get("/export/backup", (_req, res) => {
  management.streamDataBackup(res);
});
