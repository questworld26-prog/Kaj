// [spec: BACKUP-001]
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import type { DatabaseSync } from "node:sqlite";
import { encryptDatabase } from "./crypto.js";

export interface BackupRunOptions {
  db: DatabaseSync;
  backupDir?: string | null;
  passphrase?: string | null;
  retentionDays?: number;
  now?: Date;
}

export interface BackupResult {
  success: boolean;
  skipped?: boolean;
  filename?: string;
  error?: string;
}

export interface BackupNotificationInput {
  success: boolean;
  filename?: string;
  error?: string;
}

// [spec: BACKUP-001]
export function getBackupFilename(date: Date): string {
  const d = String(date.getUTCDate()).padStart(2, "0");
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const y = date.getUTCFullYear();
  return `kaj-backup-${d}-${m}-${y}.db.enc`;
}

// [spec: BACKUP-001]
export function parseBackupDate(filename: string): Date | null {
  const match = filename.match(/^kaj-backup-(\d{2})-(\d{2})-(\d{4})\.db\.enc$/);
  if (!match) return null;
  const day = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  const year = parseInt(match[3], 10);
  return new Date(Date.UTC(year, month - 1, day));
}

// [spec: BACKUP-001]
export function pruneOldBackups(
  backupDir: string,
  retentionDays: number = 7,
  now: Date = new Date(),
): string[] {
  // AC-BACKUP-001.5: Restrict operations strictly to backupDir without scanning parents
  if (!fs.existsSync(backupDir)) return [];

  const pruned: string[] = [];
  const entries = fs.readdirSync(backupDir);

  for (const entry of entries) {
    const backupDate = parseBackupDate(entry);
    if (!backupDate) continue; // Leaves non-backup files completely untouched

    const ageMs = now.getTime() - backupDate.getTime();
    const ageDays = ageMs / (24 * 60 * 60 * 1000);

    // AC-BACKUP-001.2: Delete backups older than retentionDays (default 7 days)
    if (ageDays >= retentionDays) {
      const fullPath = path.join(backupDir, entry);
      try {
        fs.unlinkSync(fullPath);
        pruned.push(entry);
      } catch {
        // Skip on file lock or permission issue
      }
    }
  }

  return pruned;
}

// [spec: BACKUP-001]
export function formatBackupNotificationMessage(
  input: BackupNotificationInput,
): string {
  if (input.success && input.filename) {
    // AC-BACKUP-001.3: Brief success notification without exposing directory path
    return `✅ Kaj Backup Successful: ${input.filename}`;
  }

  // AC-BACKUP-001.4: Brief failure notification without exposing directory path
  return "⚠️ Kaj Backup Failed: Backup directory not accessible or not found. Please check Google Drive.";
}

// [spec: BACKUP-001]
export function resolveBackupPassphrase(
  explicitKey?: string | null,
): string | null {
  if (explicitKey && explicitKey.trim()) {
    return explicitKey.trim();
  }

  const envKey = process.env.KAJ_BACKUP_KEY;
  if (envKey && envKey.trim()) {
    return envKey.trim();
  }

  // Fallback to protected key file: ~/.config/kaj/backup.key
  const homeDir = process.env.HOME || process.env.USERPROFILE || "";
  if (homeDir) {
    const keyPath = path.join(homeDir, ".config", "kaj", "backup.key");
    if (fs.existsSync(keyPath)) {
      try {
        const fileContent = fs.readFileSync(keyPath, "utf-8").trim();
        if (fileContent) return fileContent;
      } catch {
        // Ignore read error
      }
    }
  }

  return null;
}

// [spec: BACKUP-001]
export function performDailyBackup(options: BackupRunOptions): BackupResult {
  const now = options.now || new Date();
  const backupDir =
    options.backupDir !== undefined
      ? options.backupDir
      : process.env.KAJ_BACKUP_DIR || null;

  // AC-BACKUP-001.4: Directory validation
  if (!backupDir || !fs.existsSync(backupDir)) {
    return {
      success: false,
      error: "Backup directory not accessible or not found. Please check Google Drive.",
    };
  }

  const passphrase = resolveBackupPassphrase(options.passphrase);
  if (!passphrase) {
    return {
      success: false,
      error: "Encryption key not configured.",
    };
  }

  const filename = getBackupFilename(now);
  const targetPath = path.join(backupDir, filename);

  // AC-BACKUP-001.1: Exactly one backup per calendar day (skip if already exists)
  if (fs.existsSync(targetPath)) {
    return {
      success: true,
      skipped: true,
      filename,
    };
  }

  const tempSnapshotPath = path.join(
    os.tmpdir(),
    `kaj-hotbackup-${Date.now()}-${Math.random().toString(36).substring(2, 8)}.db`,
  );

  try {
    // Hot atomic non-locking snapshot via SQLite VACUUM INTO
    options.db.exec(`VACUUM INTO '${tempSnapshotPath.replace(/'/g, "''")}';`);

    // Encrypt snapshot directly to target backup directory
    encryptDatabase(tempSnapshotPath, targetPath, passphrase);

    // Prune backups older than retention window
    const retention = options.retentionDays !== undefined ? options.retentionDays : 7;
    pruneOldBackups(backupDir, retention, now);

    return {
      success: true,
      skipped: false,
      filename,
    };
  } catch (err) {
    return {
      success: false,
      error: (err as Error).message,
    };
  } finally {
    // Always clean up unencrypted temporary snapshot
    if (fs.existsSync(tempSnapshotPath)) {
      try {
        fs.unlinkSync(tempSnapshotPath);
      } catch {
        // Ignore cleanup error
      }
    }
  }
}
