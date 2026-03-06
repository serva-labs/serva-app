/**
 * SQLite database schema and migrations for Serva.
 *
 * Uses expo-sqlite's `PRAGMA user_version` for migration versioning.
 * Each migration is a function that runs SQL statements.
 *
 * Tables:
 * - conversations: Chat sessions
 * - messages: Individual messages within conversations
 * - provider_configs: Cached provider metadata (not secrets — those go in SecureStore)
 */

import type { SQLiteDatabase } from "expo-sqlite";

const CURRENT_VERSION = 1;

/**
 * Called by SQLiteProvider's onInit. Runs migrations up to CURRENT_VERSION.
 */
export async function migrateDb(db: SQLiteDatabase): Promise<void> {
  // Enable WAL mode for better concurrent read performance
  await db.execAsync("PRAGMA journal_mode = WAL;");
  // Enable foreign key enforcement (OFF by default in SQLite)
  await db.execAsync("PRAGMA foreign_keys = ON;");

  const result = await db.getFirstAsync<{ user_version: number }>(
    "PRAGMA user_version;",
  );
  let currentVersion = result?.user_version ?? 0;

  if (currentVersion >= CURRENT_VERSION) {
    return;
  }

  // Run migrations sequentially
  if (currentVersion < 1) {
    await migration001(db);
    currentVersion = 1;
  }

  // Add future migrations here:
  // if (currentVersion < 2) { await migration002(db); currentVersion = 2; }

  await db.execAsync(`PRAGMA user_version = ${CURRENT_VERSION};`);
}

/**
 * Migration 001: Create initial tables.
 */
async function migration001(db: SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL DEFAULT 'New Chat',
      provider_id TEXT NOT NULL,
      model_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('system', 'user', 'assistant')),
      content TEXT NOT NULL,
      provider_id TEXT NOT NULL,
      model_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_messages_conversation_id
      ON messages(conversation_id);

    CREATE INDEX IF NOT EXISTS idx_messages_created_at
      ON messages(created_at);

    CREATE INDEX IF NOT EXISTS idx_conversations_updated_at
      ON conversations(updated_at);
  `);
}
