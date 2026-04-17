export type ChatFocus = { source_type: "document" | "note"; source_id: string };

export type ChatSource = {
  source_type: string;
  source_id: string;
  chunk_index: number;
  label: string;
  excerpt: string;
};

export type ChatResult = {
  reply: string;
  sources: ChatSource[];
  model: string;
};
