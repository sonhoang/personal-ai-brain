import { useState } from "react";
import { api, setToken } from "./api";
import type { ManagementSummary } from "./types";

type Props = { onSuccess: () => void };

export function Login({ onSuccess }: Props) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    const pw = password.trim();
    if (!pw) {
      setError("Enter password");
      return;
    }
    setToken(pw);
    setError(null);
    try {
      await api<ManagementSummary>("/management/summary");
      setPassword("");
      onSuccess();
    } catch (e) {
      setToken("");
      setError(e instanceof Error ? e.message : "Wrong password");
    }
  }

  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="brand">
          <span className="brand-icon">◈</span>
          <h1>Personal AI Brain</h1>
          <p className="tagline">Local React UI — Mem × NotebookLM style</p>
        </div>
        <label className="field-label">
          Password <span className="hint">(BRAIN_PASSWORD in .env)</span>
        </label>
        <input
          type="password"
          className="login-password-input"
          value={password}
          onChange={e => setPassword(e.target.value)}
          onKeyDown={e => e.key === "Enter" && submit()}
          autoComplete="current-password"
          placeholder="Enter password"
        />
        {error ? <p className="error-text">{error}</p> : null}
        <button type="button" className="btn primary" onClick={submit}>
          Unlock
        </button>
        <p className="fine-print">
          Dev UI: run <code>npm run dev</code> (Vite + API). Data stays in <code>./data</code>.
        </p>
      </div>
    </div>
  );
}
