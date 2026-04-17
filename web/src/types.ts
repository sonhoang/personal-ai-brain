export type Note = {
  id: string;
  title: string;
  body: string;
  created_at: string;
  updated_at: string;
  workspace_id?: string;
  inbox?: number;
  tags?: string[];
};

export type NoteVersion = {
  id: number;
  note_id: string;
  title: string;
  body: string;
  saved_at: string;
};

export type DocumentListItem = {
  id: string;
  original_name: string;
  stored_path: string;
  mime: string | null;
  bytes: number;
  created_at: string;
  workspace_id?: string;
  source_url?: string | null;
};

export type Workspace = {
  id: string;
  name: string;
  sort_order: number;
  created_at: string;
};

export type ChatThread = {
  id: string;
  workspace_id: string;
  title: string | null;
  created_at: string;
  updated_at: string;
};

export type ManagementSummary = {
  notes: number;
  documents: number;
  indexedChunks: number;
  dataDir: string;
  llmConfigured: boolean;
  embeddingConfigured?: boolean;
};

export type ChatSource = {
  source_type: string;
  source_id: string;
  chunk_index: number;
  label: string;
  excerpt: string;
};

export type LibrarySearchHit = {
  source_type: string;
  source_id: string;
  chunk_index: number;
  rank: number;
  label: string;
  excerpt: string;
  excerpt_html?: string;
};

export type ChatResponse = {
  reply: string;
  model: string;
  sources: ChatSource[];
};
