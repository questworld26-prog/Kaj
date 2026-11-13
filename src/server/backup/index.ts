// [spec: BACKUP-001]
// [spec: BACKUP-002]
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
export {
  listAvailableBackups,
  formatPreRestoreFilename,
  recoverDatabase,
  type AvailableBackup,
  type RecoverOptions,
  type RecoverResult,
} from "./recover.js";
