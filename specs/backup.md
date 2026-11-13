# Backup and Disaster Recovery Specification (BACKUP)

This specification defines the low-footprint automated encrypted daily backup engine, local folder isolation, automated 7-day retention pruning, and brief Telegram notifications for Kaj (কাজ).

---

## BACKUP-001: Automated Daily Encrypted Database Backup and Telegram Status Notifications

Where a backup directory is configured via `KAJ_BACKUP_DIR` and an encryption key is configured, the system shall generate daily encrypted backups of the database and dispatch brief status notifications via Telegram without local LLM overhead.

Acceptance Criteria:
- AC-BACKUP-001.1: Where a backup directory is configured via `KAJ_BACKUP_DIR` and an encryption key is configured, the system shall generate exactly one encrypted backup file named `kaj-backup-DD-MM-YYYY.db.enc` per calendar day using AES-256-GCM encryption without locking concurrent database operations.
- AC-BACKUP-001.2: While operating within the configured backup directory, the system shall automatically delete existing backup files matching `kaj-backup-*.db.enc` older than seven calendar days while leaving all other directory contents unmodified.
- AC-BACKUP-001.3: When a daily encrypted backup completes successfully, the system shall dispatch a brief Telegram notification stating the generated backup filename without exposing the directory path.
- AC-BACKUP-001.4: If the configured backup directory is inaccessible or backup generation fails, then the system shall dispatch a brief Telegram failure notification describing the failure without exposing the directory path.
- AC-BACKUP-001.5: The system shall restrict all backup filesystem read, write, and pruning operations strictly to the configured directory without scanning or traversing parent or external storage directories.

## BACKUP-002: Verified Encrypted Database Recovery and Schema Migration

When executing database recovery from an encrypted backup archive, the recovery engine shall validate cryptographic integrity, execute staged forward schema migrations, preserve a pre-restore snapshot, and replace the active database atomically.

Acceptance Criteria:
- AC-BACKUP-002.1: When an encrypted backup archive and target database path are supplied, the recovery engine shall decrypt the archive to a temporary staging file, verify encryption authentication and SQLite integrity checks, and abort without altering the target database on validation failure.
- AC-BACKUP-002.2: While the decrypted staging database carries a schema version equal to or older than the application schema version, the recovery engine shall execute sequential transactional forward migrations on the staging database before replacing the active database.
- AC-BACKUP-002.3: If the decrypted staging database carries a schema version newer than the application schema version, then the recovery engine shall abort recovery with a version incompatibility error without modifying the target database.
- AC-BACKUP-002.4: When replacing an existing target database, the recovery engine shall consolidate a pre-restore snapshot archive beside the target path, remove stale write-ahead log sidecar files, and swap the migrated staging file atomically into the target location.
- AC-BACKUP-002.5: When resolving backup files or database connections across daemon, transport, and recovery commands, the system shall apply the configured environment database path and restrict backup listing exclusively to the configured backup directory.
