// [spec: PROJ-001]
// [spec: TASK-002]
// [spec: BACKUP-002]
import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { fileURLToPath } from "node:url";

export const LATEST_SCHEMA_VERSION = 1;

/**
 * Load environment variables from `.env` if present (cwd first, then project root).
 */
export function loadEnvFromRoot(): void {
  try {
    if (typeof process.loadEnvFile !== "function") return;
    const cwdEnv = path.resolve(process.cwd(), ".env");
    if (fs.existsSync(cwdEnv)) {
      process.loadEnvFile(cwdEnv);
      return;
    }
    const dirname = path.dirname(fileURLToPath(import.meta.url));
    const rootEnv = path.resolve(dirname, "../../.env");
    if (fs.existsSync(rootEnv)) {
      process.loadEnvFile(rootEnv);
    }
  } catch {
    // Ignore missing or unreadable .env file
  }
}

/**
 * Expand leading `~/` or `$HOME/` against the active user's home directory.
 */
export function expandHomePath(rawPath: string): string {
  const trimmed = rawPath.trim();
  const homeDir = process.env.HOME || process.env.USERPROFILE || os.homedir();
  if (!homeDir) return trimmed;
  if (trimmed === "~") return homeDir;
  if (trimmed.startsWith("~/")) return path.join(homeDir, trimmed.slice(2));
  if (trimmed.startsWith("$HOME/")) return path.join(homeDir, trimmed.slice(6));
  return trimmed;
}

/**
 * Resolve the SQLite database path cleanly:
 * explicitPath -> process.env.KAJ_DB_PATH -> ~/.local/share/kaj/tasks.db
 */
export function resolveDatabasePath(explicitPath?: string): string {
  const candidate =
    explicitPath && explicitPath.trim().length > 0
      ? explicitPath
      : process.env.KAJ_DB_PATH && process.env.KAJ_DB_PATH.trim().length > 0
        ? process.env.KAJ_DB_PATH
        : "";

  if (candidate === ":memory:") return ":memory:";
  if (candidate.length > 0) return path.resolve(expandHomePath(candidate));

  const homeDir = process.env.HOME || process.env.USERPROFILE || os.homedir() || ".";
  return path.resolve(path.join(homeDir, ".local", "share", "kaj", "tasks.db"));
}

export function createDatabase(dbPath?: string): DatabaseSync {
  const targetPath = dbPath === ":memory:" ? ":memory:" : resolveDatabasePath(dbPath);
  if (targetPath !== ":memory:") {
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
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

/**
 * Read SQLite native `PRAGMA user_version` integer schema version.
 */
export function getSchemaVersion(db: DatabaseSync): number {
  const row = db.prepare("PRAGMA user_version").get() as
    | { user_version: number }
    | undefined;
  return Number(row?.user_version ?? 0);
}

/**
 * Apply ordered, transactional forward schema migrations up to `targetVersion`.
 * Returns `true` if one or more migrations were applied.
 */
export function migrateDatabaseSchema(
  db: DatabaseSync,
  targetVersion: number = LATEST_SCHEMA_VERSION,
): boolean {
  const currentVersion = getSchemaVersion(db);
  if (currentVersion >= targetVersion) {
    return false;
  }

  const migrations: Array<{ version: number; up: () => void }> = [
    {
      version: 1,
      up: () => {
        ensureBaseTablesAndIndices(db);
        const cols = db.prepare("PRAGMA table_info(tasks)").all() as {
          name: string;
        }[];
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
        if (!colNames.has("created_by")) {
          db.exec("ALTER TABLE tasks ADD COLUMN created_by TEXT;");
        }
      },
    },
  ];

  db.exec("BEGIN IMMEDIATE;");
  try {
    for (const step of migrations) {
      if (step.version > currentVersion && step.version <= targetVersion) {
        step.up();
        db.exec(`PRAGMA user_version = ${step.version};`);
      }
    }
    db.exec("COMMIT;");
    return true;
  } catch (err) {
    try {
      db.exec("ROLLBACK;");
    } catch {
      // Ignore secondary rollback errors
    }
    throw err;
  }
}

function ensureBaseTablesAndIndices(db: DatabaseSync): void {
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
      created_by TEXT,
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
}

export function initSchema(db: DatabaseSync): void {
  ensureBaseTablesAndIndices(db);
  migrateDatabaseSchema(db, LATEST_SCHEMA_VERSION);
}
