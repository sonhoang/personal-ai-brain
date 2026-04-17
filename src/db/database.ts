import fs from "fs";
import path from "path";
import Database from "better-sqlite3";
import { config } from "../config";
import { runMigrations } from "./migrate";

let db: Database.Database | null = null;

const MIGRATIONS = [
  `
  CREATE TABLE IF NOT EXISTS notes (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL DEFAULT '',
    body TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE
  );

  CREATE TABLE IF NOT EXISTS note_tags (
    note_id TEXT NOT NULL,
    tag_id INTEGER NOT NULL,
    PRIMARY KEY (note_id, tag_id),
    FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE,
    FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS documents (
    id TEXT PRIMARY KEY,
    original_name TEXT NOT NULL,
    stored_path TEXT NOT NULL,
    mime TEXT,
    bytes INTEGER NOT NULL DEFAULT 0,
    extracted_text TEXT,
    created_at TEXT NOT NULL
  );

  CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
    source_type UNINDEXED,
    source_id UNINDEXED,
    chunk_index UNINDEXED,
    content,
    tokenize = 'porter unicode61'
  );

  CREATE INDEX IF NOT EXISTS idx_notes_updated ON notes(updated_at DESC);
  CREATE INDEX IF NOT EXISTS idx_docs_created ON documents(created_at DESC);
  `
];

export function getDb(): Database.Database {
  if (db) return db;
  fs.mkdirSync(config.dataDir, { recursive: true });
  fs.mkdirSync(config.uploadsDir, { recursive: true });
  db = new Database(config.dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  for (const sql of MIGRATIONS) {
    db.exec(sql);
  }
  runMigrations(db);
  return db;
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}
