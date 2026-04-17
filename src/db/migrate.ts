import type Database from "better-sqlite3";

export function runMigrations(db: Database.Database): void {
  let ver = db.pragma("user_version", { simple: true }) as number;
  if (ver < 2) {
    migrateV2(db);
    db.pragma("user_version = 2");
    ver = 2;
  }
  if (ver < 3) {
    migrateV3(db);
    db.pragma("user_version = 3");
    ver = 3;
  }
  if (ver < 4) {
    migrateV4(db);
    db.pragma("user_version = 4");
  }
}

function migrateV2(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS workspaces (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );
    INSERT OR IGNORE INTO workspaces (id, name, sort_order, created_at)
    VALUES ('default', 'Default', 0, datetime('now'));
  `);

  const noteCols = db.prepare(`PRAGMA table_info(notes)`).all() as { name: string }[];
  if (!noteCols.some(c => c.name === "workspace_id")) {
    db.exec(`ALTER TABLE notes ADD COLUMN workspace_id TEXT DEFAULT 'default'`);
  }
  if (!noteCols.some(c => c.name === "inbox")) {
    db.exec(`ALTER TABLE notes ADD COLUMN inbox INTEGER NOT NULL DEFAULT 0`);
  }

  const docCols = db.prepare(`PRAGMA table_info(documents)`).all() as { name: string }[];
  if (!docCols.some(c => c.name === "workspace_id")) {
    db.exec(`ALTER TABLE documents ADD COLUMN workspace_id TEXT DEFAULT 'default'`);
  }
  if (!docCols.some(c => c.name === "source_url")) {
    db.exec(`ALTER TABLE documents ADD COLUMN source_url TEXT`);
  }

  db.exec(`UPDATE notes SET workspace_id = 'default' WHERE workspace_id IS NULL OR workspace_id = ''`);
  db.exec(`UPDATE documents SET workspace_id = 'default' WHERE workspace_id IS NULL OR workspace_id = ''`);
}

function migrateV3(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS chat_threads (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL DEFAULT 'default',
      title TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_chat_threads_ws ON chat_threads(workspace_id, updated_at DESC);

    CREATE TABLE IF NOT EXISTS chat_messages (
      id TEXT PRIMARY KEY,
      thread_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      sources_json TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (thread_id) REFERENCES chat_threads(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_chat_messages_thread ON chat_messages(thread_id, created_at);

    CREATE TABLE IF NOT EXISTS note_versions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      note_id TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      saved_at TEXT NOT NULL,
      FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_note_versions_note ON note_versions(note_id, saved_at DESC);

    CREATE TABLE IF NOT EXISTS chunk_embeddings (
      source_type TEXT NOT NULL,
      source_id TEXT NOT NULL,
      chunk_index INTEGER NOT NULL,
      dim INTEGER NOT NULL,
      vec TEXT NOT NULL,
      PRIMARY KEY (source_type, source_id, chunk_index)
    );

    CREATE TABLE IF NOT EXISTS saved_searches (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL DEFAULT 'default',
      name TEXT NOT NULL,
      query TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_saved_searches_ws ON saved_searches(workspace_id);
  `);
}

function migrateV4(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS chunk_meta (
      source_type TEXT NOT NULL,
      source_id TEXT NOT NULL,
      chunk_index INTEGER NOT NULL,
      page INTEGER,
      PRIMARY KEY (source_type, source_id, chunk_index)
    );
  `);

  const docCols = db.prepare(`PRAGMA table_info(documents)`).all() as { name: string }[];
  if (!docCols.some(c => c.name === "chat_instruction")) {
    db.exec(`ALTER TABLE documents ADD COLUMN chat_instruction TEXT`);
  }

  const noteCols = db.prepare(`PRAGMA table_info(notes)`).all() as { name: string }[];
  if (!noteCols.some(c => c.name === "chat_instruction")) {
    db.exec(`ALTER TABLE notes ADD COLUMN chat_instruction TEXT`);
  }
}
