import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import fs from "node:fs";

export function createDatabase(dbPath?: string): DatabaseSync {
  let targetPath = dbPath;
  if (!targetPath) {
    const homeDir = process.env.HOME || process.env.USERPROFILE || ".";
    const dataDir = path.join(homeDir, ".local", "share", "kaj");
    fs.mkdirSync(dataDir, { recursive: true });
    targetPath = path.join(dataDir, "tasks.db");
  }

  const db = new DatabaseSync(targetPath);

  // Configure SQLite WAL mode & concurrency settings
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;
    PRAGMA foreign_keys = ON;
    PRAGMA synchronous = NORMAL;
  `);

  return db;
}

export function initSchema(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      color TEXT NOT NULL DEFAULT '#10B981',
      sort_order INTEGER NOT NULL DEFAULT 0,
      archived INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'triage',
      details TEXT NOT NULL DEFAULT '',
      project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
      priority TEXT NOT NULL DEFAULT 'week',
      action_date TEXT,
      due_date TEXT,
      repeat_rule TEXT NOT NULL DEFAULT 'none',
      repeat_day_of_week INTEGER,
      repeat_day_of_month INTEGER,
      repeat_day_of_year TEXT,
      waiting_on TEXT NOT NULL DEFAULT '',
      sort_order REAL NOT NULL DEFAULT 0,
      completed_at TEXT,
      deleted_at TEXT,
      parent_recurring_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_tasks_status_sort ON tasks(status, sort_order);
    CREATE INDEX IF NOT EXISTS idx_tasks_project_id ON tasks(project_id);
    CREATE INDEX IF NOT EXISTS idx_tasks_action_date ON tasks(action_date);
    CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(due_date);
    CREATE INDEX IF NOT EXISTS idx_tasks_deleted_at ON tasks(deleted_at);
    CREATE INDEX IF NOT EXISTS idx_projects_sort_order ON projects(sort_order);
  `);

  // Migrate existing databases: add repeat customization columns if missing
  try {
    const cols = db
      .prepare("PRAGMA table_info(tasks)")
      .all() as { name: string }[];
    const colNames = new Set(cols.map((c) => c.name));
    if (!colNames.has("repeat_day_of_week")) {
      db.exec("ALTER TABLE tasks ADD COLUMN repeat_day_of_week INTEGER;");
    }
    if (!colNames.has("repeat_day_of_month")) {
      db.exec("ALTER TABLE tasks ADD COLUMN repeat_day_of_month INTEGER;");
    }
    if (!colNames.has("repeat_day_of_year")) {
      db.exec("ALTER TABLE tasks ADD COLUMN repeat_day_of_year TEXT;");
    }
  } catch {}
}
