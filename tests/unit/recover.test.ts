// [verifies: BACKUP-002]
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { DatabaseSync } from "node:sqlite";
import { createDatabase, initSchema, resolveDatabasePath } from "../../src/server/db.js";
import { encryptDatabase } from "../../src/server/backup/crypto.js";
import {
  recoverDatabase,
  listAvailableBackups,
} from "../../src/server/backup/recover.js";

describe("Verified Encrypted Database Recovery (BACKUP-002)", () => {
  let tmpRoot: string;
  let backupDir: string;
  let targetDir: string;
  let targetDbPath: string;
  const passphrase = "recovery-test-passphrase";

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "kaj-recover-test-"));
    backupDir = path.join(tmpRoot, "backups");
    targetDir = path.join(tmpRoot, "data");
    fs.mkdirSync(backupDir, { recursive: true });
    fs.mkdirSync(targetDir, { recursive: true });
    targetDbPath = path.join(targetDir, "tasks.db");
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  // [verifies: BACKUP-002/AC-BACKUP-002.1]
  it("validates encryption authentication and SQLite integrity in staging and aborts without altering target DB on failure", () => {
    // Seed an existing live database that must remain untouched
    const liveDb = createDatabase(targetDbPath);
    initSchema(liveDb);
    liveDb
      .prepare(
        "INSERT INTO tasks (id, title, status, priority, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .run("live-1", "Keep Me Intact", "today", "today", "2026-11-13T00:00:00Z", "2026-11-13T00:00:00Z");
    liveDb.close();

    // 1. Create a valid encrypted backup, test wrong passphrase rejection
    const sourcePlain = path.join(tmpRoot, "source.db");
    const srcDb = new DatabaseSync(sourcePlain);
    initSchema(srcDb);
    srcDb.close();

    const validEnc = path.join(backupDir, "kaj-backup-13-11-2026.db.enc");
    encryptDatabase(sourcePlain, validEnc, passphrase);

    const wrongKeyResult = recoverDatabase({
      backupFilePath: validEnc,
      targetDbPath,
      passphrase: "wrong-passphrase-value",
    });

    expect(wrongKeyResult.success).toBe(false);
    expect(wrongKeyResult.error).toBeDefined();

    // 2. Test valid encryption of non-SQLite garbage bytes (fails SQLite integrity/schema check)
    const bogusPlain = path.join(tmpRoot, "not-a-db.bin");
    fs.writeFileSync(bogusPlain, "this is definitely not a sqlite database file");
    const bogusEnc = path.join(backupDir, "kaj-backup-12-11-2026.db.enc");
    encryptDatabase(bogusPlain, bogusEnc, passphrase);

    const corruptSqliteResult = recoverDatabase({
      backupFilePath: bogusEnc,
      targetDbPath,
      passphrase,
    });

    expect(corruptSqliteResult.success).toBe(false);
    expect(corruptSqliteResult.error).toMatch(/database|sqlite|integrity|schema|invalid/i);

    // Confirm live DB was completely untouched
    const checkDb = new DatabaseSync(targetDbPath);
    const rows = checkDb.prepare("SELECT title FROM tasks WHERE id = 'live-1'").all() as { title: string }[];
    checkDb.close();
    expect(rows.length).toBe(1);
    expect(rows[0].title).toBe("Keep Me Intact");
  });

  // [verifies: BACKUP-002/AC-BACKUP-002.2]
  it("executes sequential transactional forward migrations on staging DB when backup schema version is older than app version", () => {
    // Create an older v0 schema backup (before PRAGMA user_version and created_by column)
    const oldPlain = path.join(tmpRoot, "old-v0.db");
    const oldDb = new DatabaseSync(oldPlain);
    oldDb.exec(`
      CREATE TABLE projects (
        id TEXT PRIMARY KEY,
        name TEXT UNIQUE NOT NULL,
        color TEXT NOT NULL DEFAULT '#10B981',
        sort_order INTEGER NOT NULL DEFAULT 0,
        archived INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE tasks (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'triage',
        details TEXT NOT NULL DEFAULT '',
        project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
        priority TEXT NOT NULL DEFAULT 'week',
        action_date TEXT,
        due_date TEXT,
        repeat_rule TEXT NOT NULL DEFAULT 'none',
        waiting_on TEXT NOT NULL DEFAULT '',
        sort_order REAL NOT NULL DEFAULT 0,
        completed_at TEXT,
        deleted_at TEXT,
        parent_recurring_id TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      PRAGMA user_version = 0;
    `);
    oldDb
      .prepare(
        "INSERT INTO tasks (id, title, status, priority, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .run("legacy-1", "Legacy Task From v0", "todo", "week", "2026-10-01T00:00:00Z", "2026-10-01T00:00:00Z");
    oldDb.close();

    const oldEnc = path.join(backupDir, "kaj-backup-01-10-2026.db.enc");
    encryptDatabase(oldPlain, oldEnc, passphrase);

    const res = recoverDatabase({
      backupFilePath: oldEnc,
      targetDbPath,
      passphrase,
    });

    expect(res.success).toBe(true);
    expect(res.backupSchemaVersion).toBe(0);
    expect(res.migrated).toBe(true);
    expect(res.taskCount).toBe(1);

    // Verify restored database is upgraded with user_version >= 1 and missing columns added cleanly
    const restoredDb = new DatabaseSync(targetDbPath);
    const uv = restoredDb.prepare("PRAGMA user_version").get() as { user_version: number };
    const cols = restoredDb.prepare("PRAGMA table_info(tasks)").all() as { name: string }[];
    const colNames = cols.map((c) => c.name);
    const row = restoredDb.prepare("SELECT id, title, created_by FROM tasks WHERE id = 'legacy-1'").get() as {
      id: string;
      title: string;
      created_by: string | null;
    };
    restoredDb.close();

    expect(uv.user_version).toBeGreaterThanOrEqual(1);
    expect(colNames).toContain("created_by");
    expect(colNames).toContain("repeat_day_of_week");
    expect(row.title).toBe("Legacy Task From v0");
  });

  // [verifies: BACKUP-002/AC-BACKUP-002.3]
  it("aborts with version incompatibility error when backup schema version is newer than application version", () => {
    const liveDb = createDatabase(targetDbPath);
    initSchema(liveDb);
    liveDb
      .prepare(
        "INSERT INTO tasks (id, title, status, priority, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .run("stay-1", "Current Live Task", "today", "today", "2026-11-13T00:00:00Z", "2026-11-13T00:00:00Z");
    liveDb.close();

    const futurePlain = path.join(tmpRoot, "future-v99.db");
    const futureDb = new DatabaseSync(futurePlain);
    initSchema(futureDb);
    futureDb.exec("PRAGMA user_version = 99;");
    futureDb.close();

    const futureEnc = path.join(backupDir, "kaj-backup-13-11-2026.db.enc");
    encryptDatabase(futurePlain, futureEnc, passphrase);

    const res = recoverDatabase({
      backupFilePath: futureEnc,
      targetDbPath,
      passphrase,
      appSchemaVersion: 1,
    });

    expect(res.success).toBe(false);
    expect(res.backupSchemaVersion).toBe(99);
    expect(res.error).toMatch(/newer|incompatible|version/i);

    // Live DB remains intact
    const checkDb = new DatabaseSync(targetDbPath);
    const row = checkDb.prepare("SELECT title FROM tasks WHERE id = 'stay-1'").get() as { title: string };
    checkDb.close();
    expect(row.title).toBe("Current Live Task");
  });

  // [verifies: BACKUP-002/AC-BACKUP-002.4]
  it("creates pre-restore snapshot, purges stale WAL/SHM sidecars, and atomically swaps migrated DB", () => {
    // Existing live DB in WAL mode with active transactions
    const liveDb = createDatabase(targetDbPath);
    initSchema(liveDb);
    liveDb
      .prepare(
        "INSERT INTO tasks (id, title, status, priority, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .run("old-live", "Before Restore Task", "today", "today", "2026-11-13T00:00:00Z", "2026-11-13T00:00:00Z");
    liveDb.close();

    // Ensure stale -wal and -shm files exist beside targetDbPath
    fs.writeFileSync(`${targetDbPath}-wal`, "stale-wal-garbage");
    fs.writeFileSync(`${targetDbPath}-shm`, "stale-shm-garbage");

    // Prepare clean encrypted backup with different content
    const backupPlain = path.join(tmpRoot, "backup-clean.db");
    const bDb = new DatabaseSync(backupPlain);
    initSchema(bDb);
    bDb
      .prepare(
        "INSERT INTO tasks (id, title, status, priority, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .run("restored-1", "Restored Task", "todo", "week", "2026-11-12T00:00:00Z", "2026-11-12T00:00:00Z");
    bDb.close();

    const encPath = path.join(backupDir, "kaj-backup-12-11-2026.db.enc");
    encryptDatabase(backupPlain, encPath, passphrase);

    const fixedNow = new Date(Date.UTC(2026, 10, 13, 12, 30, 45));
    const res = recoverDatabase({
      backupFilePath: encPath,
      targetDbPath,
      passphrase,
      now: fixedNow,
    });

    expect(res.success).toBe(true);
    expect(res.preRestoreBackupPath).toBeDefined();
    expect(fs.existsSync(res.preRestoreBackupPath!)).toBe(true);
    expect(res.preRestoreBackupPath).toContain("tasks.db.pre-restore-13-11-2026-123045.bak");

    // Stale -wal and -shm must be gone before atomic swap
    expect(fs.existsSync(`${targetDbPath}-wal`)).toBe(false);
    expect(fs.existsSync(`${targetDbPath}-shm`)).toBe(false);

    // Pre-restore snapshot has the previous live task
    const preSnapDb = new DatabaseSync(res.preRestoreBackupPath!);
    const preRows = preSnapDb.prepare("SELECT id FROM tasks").all() as { id: string }[];
    preSnapDb.close();
    expect(preRows.map((r) => r.id)).toEqual(["old-live"]);

    // Target DB has only the restored task
    const newLiveDb = new DatabaseSync(targetDbPath);
    const liveRows = newLiveDb.prepare("SELECT id, title FROM tasks").all() as { id: string; title: string }[];
    newLiveDb.close();
    expect(liveRows).toEqual([{ id: "restored-1", title: "Restored Task" }]);
  });

  // [verifies: BACKUP-002/AC-BACKUP-002.5]
  it("applies KAJ_DB_PATH environment variable for DB resolution and restricts backup listing strictly to KAJ_BACKUP_DIR", () => {
    const prevDbEnv = process.env.KAJ_DB_PATH;
    const prevBackupEnv = process.env.KAJ_BACKUP_DIR;

    try {
      const customDb = path.join(tmpRoot, "custom-env", "kaj-env.db");
      process.env.KAJ_DB_PATH = customDb;
      expect(resolveDatabasePath()).toBe(path.resolve(customDb));

      // Create decoy backup outside backupDir (in parent tmpRoot) that must NEVER be listed
      fs.writeFileSync(path.join(tmpRoot, "kaj-backup-01-11-2026.db.enc"), "decoy");
      fs.writeFileSync(path.join(backupDir, "kaj-backup-10-11-2026.db.enc"), "b1");
      fs.writeFileSync(path.join(backupDir, "kaj-backup-13-11-2026.db.enc"), "b2");
      fs.writeFileSync(path.join(backupDir, "unrelated-file.txt"), "ignore");

      process.env.KAJ_BACKUP_DIR = backupDir;
      const available = listAvailableBackups();

      expect(available.map((b) => b.filename)).toEqual([
        "kaj-backup-13-11-2026.db.enc",
        "kaj-backup-10-11-2026.db.enc",
      ]);
      // Parent directory decoy is excluded
      expect(available.some((b) => b.filename === "kaj-backup-01-11-2026.db.enc")).toBe(false);
    } finally {
      if (prevDbEnv === undefined) delete process.env.KAJ_DB_PATH;
      else process.env.KAJ_DB_PATH = prevDbEnv;
      if (prevBackupEnv === undefined) delete process.env.KAJ_BACKUP_DIR;
      else process.env.KAJ_BACKUP_DIR = prevBackupEnv;
    }
  });
});
