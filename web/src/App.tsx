import { useEffect, useState } from "react";
import { api, clearToken, getToken } from "./api";
import { Login } from "./Login";
import { Workspace } from "./Workspace";
import type { ManagementSummary } from "./types";

export function App() {
  const [phase, setPhase] = useState<"check" | "login" | "app">(() =>
    getToken() ? "check" : "login"
  );

  useEffect(() => {
    if (phase !== "check") return;
    api<ManagementSummary>("/management/summary")
      .then(() => setPhase("app"))
      .catch(() => {
        clearToken();
        setPhase("login");
      });
  }, [phase]);

  if (phase === "check") {
    return <div className="loading-center">Loading…</div>;
  }

  if (phase === "login") {
    return <Login onSuccess={() => setPhase("app")} />;
  }

  return <Workspace onLogout={() => setPhase("login")} />;
}
