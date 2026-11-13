// [spec: BACKUP-001]
export { encryptDatabase, decryptDatabase } from "./crypto.js";
export {
  getBackupFilename,
  parseBackupDate,
  pruneOldBackups,
  formatBackupNotificationMessage,
  resolveBackupPassphrase,
  performDailyBackup,
  type BackupRunOptions,
  type BackupResult,
  type BackupNotificationInput,
} from "./service.js";
