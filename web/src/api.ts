const TOKEN_KEY = "personal_ai_brain_pw";

export function getToken(): string {
  return sessionStorage.getItem(TOKEN_KEY) || "";
}

export function setToken(t: string): void {
  sessionStorage.setItem(TOKEN_KEY, t);
}

export function clearToken(): void {
  sessionStorage.removeItem(TOKEN_KEY);
}

export type ApiInit = Omit<RequestInit, "body"> & { body?: unknown };

export async function api<T>(path: string, init?: ApiInit): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    ...((init?.headers as Record<string, string>) || {}),
    Authorization: "Bearer " + token
  };
  let body: BodyInit | undefined = init?.body as BodyInit | undefined;
  if (init?.body !== undefined && typeof init.body === "object" && !(init.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(init.body);
  }
  const r = await fetch("/api" + path, { ...init, headers, body });
  const data = (await r.json().catch(() => ({}))) as { error?: string };
  if (!r.ok) {
    throw new Error(data.error || r.statusText || "Request failed");
  }
  return data as T;
}

export async function uploadDocument(file: File, workspaceId: string): Promise<{ id: string; original_name: string }> {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("workspace_id", workspaceId);
  const r = await fetch("/api/documents", {
    method: "POST",
    headers: { Authorization: "Bearer " + getToken() },
    body: fd
  });
  const data = (await r.json().catch(() => ({}))) as { error?: string; id?: string; original_name?: string };
  if (!r.ok) {
    throw new Error(data.error || r.statusText || "Upload failed");
  }
  return data as { id: string; original_name: string };
}

export async function uploadZip(file: File, workspaceId: string): Promise<{ imported: number; errors: string[] }> {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("workspace_id", workspaceId);
  const r = await fetch("/api/documents/zip", {
    method: "POST",
    headers: { Authorization: "Bearer " + getToken() },
    body: fd
  });
  const data = (await r.json().catch(() => ({}))) as { error?: string; imported?: number; errors?: string[] };
  if (!r.ok) {
    throw new Error(data.error || r.statusText || "ZIP import failed");
  }
  return data as { imported: number; errors: string[] };
}

export async function downloadBackup(): Promise<void> {
  const r = await fetch("/api/management/export/backup", {
    headers: { Authorization: "Bearer " + getToken() }
  });
  if (!r.ok) {
    throw new Error("Backup failed");
  }
  const blob = await r.blob();
  const u = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = u;
  a.download = "personal-ai-brain-backup.zip";
  a.click();
  URL.revokeObjectURL(u);
}
