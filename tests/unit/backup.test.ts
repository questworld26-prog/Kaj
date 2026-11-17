// [spec: BACKUP-001]
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { DatabaseSync } from "node:sqlite";
import {
  encryptDatabase,
  decryptDatabase,
  performDailyBackup,
  pruneOldBackups,
  formatBackupNotificationMessage,
} from "../../src/server/backup/index.js";
import { TelegramBotService } from "../../src/server/telegram.js";
import { TaskRepository, ProjectRepository } from "../../src/server/repository.js";
import { EventBus } from "../../src/server/events.js";

describe("Automated Encrypted Daily Backup (BACKUP-001)", () => {
  let tmpBaseDir: string;
  let backupDir: string;
  let dbPath: string;
  let db: DatabaseSync;
  const testKey = "super-secret-backup-passphrase-2026";

  beforeEach(() => {
    tmpBaseDir = fs.mkdtempSync(path.join(os.tmpdir(), "kaj-backup-test-"));
    backupDir = path.join(tmpBaseDir, "google-drive-kaj-backups");
    fs.mkdirSync(backupDir, { recursive: true });

    dbPath = path.join(tmpBaseDir, "test-tasks.db");
    db = new DatabaseSync(dbPath);
    db.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE test_data (id INTEGER PRIMARY KEY, note TEXT);
      INSERT INTO test_data (note) VALUES ('Critical business item');
    `);
  });

  afterEach(() => {
    try {
      db.close();
    } catch {
      // Ignore if already closed
    }
    fs.rmSync(tmpBaseDir, { recursive: true, force: true });
  });

  // [verifies: BACKUP-001/AC-BACKUP-001.1]
  it("generates exactly one encrypted backup kaj-backup-DD-MM-YYYY.db.enc per day and decrypts cleanly", () => {
    const fakeNow = new Date("2026-11-13T12:00:00Z");
    const expectedFilename = "kaj-backup-13-11-2026.db.enc";

    // Run first backup
    const result1 = performDailyBackup({
      db,
      backupDir,
      passphrase: testKey,
      now: fakeNow,
    });

    expect(result1.success).toBe(true);
    expect(result1.skipped).toBe(false);
    expect(result1.filename).toBe(expectedFilename);

    const backupFilePath = path.join(backupDir, expectedFilename);
    expect(fs.existsSync(backupFilePath)).toBe(true);

    // Verify raw file is encrypted (does not contain plaintext SQLite header)
    const rawBytes = fs.readFileSync(backupFilePath);
    expect(rawBytes.subarray(0, 16).toString("utf-8")).not.toContain("SQLite format 3");

    // Decrypt to new file and verify contents
    const restoredPath = path.join(tmpBaseDir, "restored.db");
    decryptDatabase(backupFilePath, restoredPath, testKey);

    const restoredDb = new DatabaseSync(restoredPath);
    const rows = restoredDb.prepare("SELECT * FROM test_data").all() as Array<{ id: number; note: string }>;
    expect(rows).toHaveLength(1);
    expect(rows[0].note).toBe("Critical business item");
    restoredDb.close();

    // Run second backup on same calendar day: must be idempotent and skipped
    const result2 = performDailyBackup({
      db,
      backupDir,
      passphrase: testKey,
      now: fakeNow,
    });
    expect(result2.success).toBe(true);
    expect(result2.skipped).toBe(true);
    expect(result2.filename).toBe(expectedFilename);
  });

  // [verifies: BACKUP-001/AC-BACKUP-001.2]
  it("automatically prunes backups older than seven days leaving other files untouched", () => {
    // Populate backup directory with a mix of backups and other non-backup files
    const nonBackupDoc = path.join(backupDir, "important-notes.txt");
    fs.writeFileSync(nonBackupDoc, "Do not delete me", "utf-8");

    // 2 days old (keep)
    const recentBackup = path.join(backupDir, "kaj-backup-11-11-2026.db.enc");
    fs.writeFileSync(recentBackup, "dummy encrypted 2d");

    // 6 days old (keep)
    const boundaryBackup = path.join(backupDir, "kaj-backup-07-11-2026.db.enc");
    fs.writeFileSync(boundaryBackup, "dummy encrypted 6d");

    // 8 days old (delete)
    const oldBackup1 = path.join(backupDir, "kaj-backup-05-11-2026.db.enc");
    fs.writeFileSync(oldBackup1, "dummy encrypted 8d");

    // 15 days old (delete)
    const oldBackup2 = path.join(backupDir, "kaj-backup-29-10-2026.db.enc");
    fs.writeFileSync(oldBackup2, "dummy encrypted 15d");

    const now = new Date("2026-11-13T12:00:00Z");
    const pruned = pruneOldBackups(backupDir, 7, now);

    expect(pruned).toContain("kaj-backup-05-11-2026.db.enc");
    expect(pruned).toContain("kaj-backup-29-10-2026.db.enc");
    expect(pruned).toHaveLength(2);

    expect(fs.existsSync(oldBackup1)).toBe(false);
    expect(fs.existsSync(oldBackup2)).toBe(false);
    expect(fs.existsSync(recentBackup)).toBe(true);
    expect(fs.existsSync(boundaryBackup)).toBe(true);
    expect(fs.existsSync(nonBackupDoc)).toBe(true);
  });

  // [verifies: BACKUP-001/AC-BACKUP-001.3]
  it("formats brief Telegram success notification without exposing directory paths", async () => {
    const filename = "kaj-backup-13-11-2026.db.enc";
    const msg = formatBackupNotificationMessage({
      success: true,
      filename,
    });

    expect(msg).toBe("✅ Kaj Backup Successful: kaj-backup-13-11-2026.db.enc");
    expect(msg).not.toContain("/");
    expect(msg).not.toContain("google-drive");
    expect(msg).not.toContain(backupDir);

    const sent: Array<{ chatId: number; text: string }> = [];
    const bot = new TelegramBotService({
      config: {
        enabled: true,
        bot_token: "123456:TEST",
        allowed_user_ids: [424242, 928147325],
        user_names: { "424242": "Oblix", "928147325": "Asterix [VIP]" },
        vip_users: ["Asterix", "928147325"],
        default_status: "triage",
        poll_interval_ms: 1000,
      },
      taskRepo: new TaskRepository(db),
      projectRepo: new ProjectRepository(db),
      eventBus: new EventBus(),
      transport: {
        getUpdates: async () => [],
        sendMessage: async (chatId, text) => {
          sent.push({ chatId, text });
        },
        answerCallbackQuery: async () => {},
      },
    });

    await bot.broadcastBackupNotification(msg);
    expect(sent).toHaveLength(1);
    expect(sent[0].chatId).toBe(424242);
    expect(sent[0].text).toContain("Kaj Backup Successful");
    expect(sent[0].text).not.toContain(backupDir);
  });

  // [verifies: BACKUP-001/AC-BACKUP-001.4]
  it("formats brief Telegram failure notification without exposing directory paths", async () => {
    const msg = formatBackupNotificationMessage({
      success: false,
      error: "Directory not found or inaccessible",
    });

    expect(msg).toBe("⚠️ Kaj Backup Failed: Backup directory not accessible or not found. Please check Google Drive.");
    expect(msg).not.toContain("/");
    expect(msg).not.toContain(backupDir);

    const sent: Array<{ chatId: number; text: string }> = [];
    const bot = new TelegramBotService({
      config: {
        enabled: true,
        bot_token: "123456:TEST",
        allowed_user_ids: [424242, 928147325],
        user_names: { "424242": "Oblix", "928147325": "Asterix [VIP]" },
        vip_users: ["Asterix", "928147325"],
        default_status: "triage",
        poll_interval_ms: 1000,
      },
      taskRepo: new TaskRepository(db),
      projectRepo: new ProjectRepository(db),
      eventBus: new EventBus(),
      transport: {
        getUpdates: async () => [],
        sendMessage: async (chatId, text) => {
          sent.push({ chatId, text });
        },
        answerCallbackQuery: async () => {},
      },
    });

    await bot.broadcastBackupNotification(msg);
    expect(sent).toHaveLength(1);
    expect(sent[0].chatId).toBe(424242);
    expect(sent[0].text).toContain("Kaj Backup Failed");
    expect(sent[0].text).not.toContain(backupDir);
  });

  // [verifies: BACKUP-001/AC-BACKUP-001.5]
  it("restricts all operations strictly to configured directory without traversing parents", () => {
    // Create an old backup in the parent directory
    const parentOldBackup = path.join(tmpBaseDir, "kaj-backup-01-01-2020.db.enc");
    fs.writeFileSync(parentOldBackup, "should never be touched");

    const now = new Date("2026-11-13T12:00:00Z");
    const pruned = pruneOldBackups(backupDir, 7, now);

    expect(pruned).not.toContain("kaj-backup-01-01-2020.db.enc");
    expect(fs.existsSync(parentOldBackup)).toBe(true);
  });
});
