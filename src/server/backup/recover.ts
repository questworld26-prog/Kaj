// [spec: BACKUP-002]
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { DatabaseSync } from "node:sqlite";
import {
  LATEST_SCHEMA_VERSION,
  expandHomePath,
  getSchemaVersion,
  migrateDatabaseSchema,
  resolveDatabasePath,
} from "../db.js";
import { decryptDatabase } from "./crypto.js";
import { parseBackupDate, resolveBackupPassphrase } from "./service.js";

export interface AvailableBackup {
  filename: string;
  path: string;
  date: Date;
}

export interface RecoverOptions {
  backupFilePath: string;
  targetDbPath?: string;
  passphrase?: string | null;
  verifyOnly?: boolean;
  now?: Date;
  appSchemaVersion?: number;
}

export interface RecoverResult {
  success: boolean;
  verifyOnly?: boolean;
  targetDbPath: string;
  backupFilePath: string;
  preRestoreBackupPath?: string;
  backupSchemaVersion?: number;
  appSchemaVersion?: number;
  migrated?: boolean;
  taskCount?: number;
  projectCount?: number;
  error?: string;
}

interface StagingValidationResult {
  schemaVersion: number;
  migrated: boolean;
  taskCount: number;
  projectCount: number;
}

class SchemaIncompatibilityError extends Error {
  public readonly backupSchemaVersion: number;
  constructor(backupVersion: number, appVersion: number) {
    super(
      `Schema version incompatibility: backup schema v${backupVersion} is newer than application schema v${appVersion}. Please update Kaj before restoring this backup.`,
    );
    this.backupSchemaVersion = backupVersion;
  }
}

/**
 * List available encrypted backups strictly inside the configured backup directory, sorted newest first.
 */
export function listAvailableBackups(backupDir?: string | null): AvailableBackup[] {
  const rawDir =
    backupDir !== undefined ? backupDir : process.env.KAJ_BACKUP_DIR || null;
  if (!rawDir || !rawDir.trim()) return [];

  const resolvedDir = path.resolve(expandHomePath(rawDir));
  if (!fs.existsSync(resolvedDir)) return [];

  try {
    const entries = fs.readdirSync(resolvedDir);
    const backups: AvailableBackup[] = [];
    for (const entry of entries) {
      const date = parseBackupDate(entry);
      if (!date) continue;
      backups.push({
        filename: entry,
        path: path.join(resolvedDir, entry),
        date,
      });
    }
    return backups.sort((a, b) => b.date.getTime() - a.date.getTime());
  } catch {
    return [];
  }
}

/**
 * Format deterministic local pre-restore snapshot path beside target DB.
 */
export function formatPreRestoreFilename(
  targetDbPath: string,
  now: Date = new Date(),
): string {
  const d = String(now.getUTCDate()).padStart(2, "0");
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const y = now.getUTCFullYear();
  const hh = String(now.getUTCHours()).padStart(2, "0");
  const mm = String(now.getUTCMinutes()).padStart(2, "0");
  const ss = String(now.getUTCSeconds()).padStart(2, "0");
  return `${targetDbPath}.pre-restore-${d}-${m}-${y}-${hh}${mm}${ss}.bak`;
}

function validateAndMigrateStagingDb(
  stagingPath: string,
  appSchemaVersion: number,
): StagingValidationResult {
  let stagingDb: DatabaseSync | null = null;
  try {
    stagingDb = new DatabaseSync(stagingPath);
    stagingDb.exec("PRAGMA busy_timeout = 5000;");

    const integrity = stagingDb.prepare("PRAGMA integrity_check;").get() as
      | { integrity_check: string }
      | undefined;
    if (!integrity || integrity.integrity_check.toLowerCase() !== "ok") {
      throw new Error(
        `SQLite integrity check failed: ${integrity?.integrity_check || "unknown error"}`,
      );
    }

    const tables = stagingDb
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('tasks', 'projects')",
      )
      .all() as { name: string }[];
    const tableSet = new Set(tables.map((t) => t.name));
    if (!tableSet.has("tasks") || !tableSet.has("projects")) {
      throw new Error(
        "Invalid Kaj database schema: missing core 'tasks' or 'projects' tables.",
      );
    }

    const schemaVersion = getSchemaVersion(stagingDb);
    if (schemaVersion > appSchemaVersion) {
      throw new SchemaIncompatibilityError(schemaVersion, appSchemaVersion);
    }

    let migrated = false;
    if (schemaVersion < appSchemaVersion) {
      migrated = migrateDatabaseSchema(stagingDb, appSchemaVersion);
    }

    const taskCountRow = stagingDb
      .prepare("SELECT COUNT(*) AS cnt FROM tasks")
      .get() as { cnt: number };
    const projectCountRow = stagingDb
      .prepare("SELECT COUNT(*) AS cnt FROM projects")
      .get() as { cnt: number };

    return {
      schemaVersion,
      migrated,
      taskCount: Number(taskCountRow?.cnt ?? 0),
      projectCount: Number(projectCountRow?.cnt ?? 0),
    };
  } finally {
    if (stagingDb) {
      try {
        stagingDb.close();
      } catch {
        // Ignore close errors during cleanup
      }
    }
  }
}

function createPreRestoreSnapshot(targetDbPath: string, now: Date): string {
  const snapshotPath = formatPreRestoreFilename(targetDbPath, now);
  const existingDb = new DatabaseSync(targetDbPath);
  try {
    existingDb.exec("PRAGMA busy_timeout = 5000;");
    existingDb.exec(`VACUUM INTO '${snapshotPath.replace(/'/g, "''")}';`);
  } finally {
    existingDb.close();
  }
  return snapshotPath;
}

function purgeWalSidecars(dbFilePath: string): void {
  for (const suffix of ["-wal", "-shm"]) {
    const sidecar = `${dbFilePath}${suffix}`;
    if (fs.existsSync(sidecar)) {
      fs.unlinkSync(sidecar);
    }
  }
}

/**
 * Verify, forward-migrate, snapshot existing live DB, purge WAL sidecars, and atomically restore.
 */
export function recoverDatabase(options: RecoverOptions): RecoverResult {
  const now = options.now ?? new Date();
  const appSchemaVersion = options.appSchemaVersion ?? LATEST_SCHEMA_VERSION;
  const targetDbPath = resolveDatabasePath(options.targetDbPath);
  const backupFilePath = path.resolve(expandHomePath(options.backupFilePath));

  if (!fs.existsSync(backupFilePath)) {
    return {
      success: false,
      targetDbPath,
      backupFilePath,
      appSchemaVersion,
      error: `Encrypted backup file not found: ${backupFilePath}`,
    };
  }

  const passphrase = resolveBackupPassphrase(options.passphrase);
  if (!passphrase) {
    return {
      success: false,
      targetDbPath,
      backupFilePath,
      appSchemaVersion,
      error: "Encryption key not configured. Provide via passphrase, KAJ_BACKUP_KEY, or ~/.config/kaj/backup.key.",
    };
  }

  const targetDir = path.dirname(targetDbPath);
  if (!options.verifyOnly) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  const stagingDir = options.verifyOnly ? os.tmpdir() : targetDir;
  const stagingPath = path.join(
    stagingDir,
    `.kaj-restore-${process.pid}-${Date.now()}.tmp.db`,
  );

  try {
    decryptDatabase(backupFilePath, stagingPath, passphrase);

    const validation = validateAndMigrateStagingDb(stagingPath, appSchemaVersion);

    if (options.verifyOnly) {
      return {
        success: true,
        verifyOnly: true,
        targetDbPath,
        backupFilePath,
        backupSchemaVersion: validation.schemaVersion,
        appSchemaVersion,
        migrated: validation.migrated,
        taskCount: validation.taskCount,
        projectCount: validation.projectCount,
      };
    }

    let preRestoreBackupPath: string | undefined;
    if (fs.existsSync(targetDbPath)) {
      preRestoreBackupPath = createPreRestoreSnapshot(targetDbPath, now);
    }

    purgeWalSidecars(targetDbPath);
    fs.renameSync(stagingPath, targetDbPath);

    return {
      success: true,
      verifyOnly: false,
      targetDbPath,
      backupFilePath,
      preRestoreBackupPath,
      backupSchemaVersion: validation.schemaVersion,
      appSchemaVersion,
      migrated: validation.migrated,
      taskCount: validation.taskCount,
      projectCount: validation.projectCount,
    };
  } catch (err) {
    return {
      success: false,
      targetDbPath,
      backupFilePath,
      appSchemaVersion,
      backupSchemaVersion:
        err instanceof SchemaIncompatibilityError
          ? err.backupSchemaVersion
          : undefined,
      error: (err as Error).message,
    };
  } finally {
    for (const file of [stagingPath, `${stagingPath}-wal`, `${stagingPath}-shm`]) {
      if (fs.existsSync(file)) {
        try {
          fs.unlinkSync(file);
        } catch {
          // Ignore cleanup errors
        }
      }
    }
  }
}
