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
