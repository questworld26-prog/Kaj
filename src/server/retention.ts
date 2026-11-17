// [spec: TASK-010]
// [spec: UI-014]
import type { DatabaseSync } from "node:sqlite";
import {
  getISOYearWeekKey,
  getYearMonthKey,
  isoYearWeekToYearMonth,
  parseDoneRetentionDays,
  type PurgeCompletedResult,
  type TelemetryMonthCreatorEntry,
  type TelemetryProjectEntry,
  type TelemetrySummary,
  type TelemetryWeekCreatorEntry,
  type TelemetryWeekEntry,
} from "../shared/types.js";

const DAY_MS = 24 * 60 * 60 * 1000;

export function getConfiguredDoneRetentionDays(
  env: Record<string, string | undefined> = process.env,
): number {
  return parseDoneRetentionDays(env.KAJ_DONE_RETENTION_DAYS);
}

interface ExpiredDoneRow {
  id: string;
  project_id: string | null;
  created_by: string | null;
  completed_at: string;
}

interface SnapshotBucketRow {
  iso_week: string;
  project_key: string;
  creator_key: string;
  completed_count: number;
}

/**
 * Atomically aggregate expired `done` tasks into `completed_telemetry_snapshots`
 * and permanently remove them from `tasks`.
 */
// [spec: TASK-010]
export function purgeExpiredDoneTasks(
  db: DatabaseSync,
  retentionDays: number = getConfiguredDoneRetentionDays(),
  now: Date = new Date(),
): PurgeCompletedResult {
  if (!Number.isFinite(retentionDays) || retentionDays <= 0) {
    return {
      retention_days: 0,
      purged_count: 0,
      snapshotted_count: 0,
      cutoff_iso: null,
    };
  }

  const normalizedDays = Math.floor(retentionDays);
  const cutoffIso = new Date(now.getTime() - normalizedDays * DAY_MS).toISOString();
  const updatedAt = now.toISOString();

  db.exec("BEGIN IMMEDIATE;");
  try {
    const expiredRows = db
      .prepare(
        `SELECT id, project_id, created_by, completed_at
         FROM tasks
         WHERE status = 'done'
           AND deleted_at IS NULL
           AND completed_at IS NOT NULL
           AND completed_at < ?`,
      )
      .all(cutoffIso) as unknown as ExpiredDoneRow[];

    if (expiredRows.length === 0) {
      db.exec("COMMIT;");
      return {
        retention_days: normalizedDays,
        purged_count: 0,
        snapshotted_count: 0,
        cutoff_iso: cutoffIso,
      };
    }

    const bucketMap = new Map<
      string,
      { iso_week: string; project_key: string; creator_key: string; count: number }
    >();

    const snapshottedIds: string[] = [];
    for (const row of expiredRows) {
      const compDate = new Date(row.completed_at);
      if (isNaN(compDate.getTime())) continue;
      snapshottedIds.push(row.id);
      const isoWeek = getISOYearWeekKey(compDate);
      const projectKey = row.project_id || "unassigned";
      const creatorKey = row.created_by?.trim() || "Unspecified";
      const key = `${isoWeek}\0${projectKey}\0${creatorKey}`;
      const existing = bucketMap.get(key);
      if (existing) {
        existing.count += 1;
      } else {
        bucketMap.set(key, {
          iso_week: isoWeek,
          project_key: projectKey,
          creator_key: creatorKey,
          count: 1,
        });
      }
    }

    const upsertStmt = db.prepare(`
      INSERT INTO completed_telemetry_snapshots (
        iso_week, project_key, creator_key, completed_count, updated_at
      ) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(iso_week, project_key, creator_key)
      DO UPDATE SET
        completed_count = completed_count + excluded.completed_count,
        updated_at = excluded.updated_at
    `);

    let snapshottedCount = 0;
    for (const bucket of bucketMap.values()) {
      upsertStmt.run(
        bucket.iso_week,
        bucket.project_key,
        bucket.creator_key,
        bucket.count,
        updatedAt,
      );
      snapshottedCount += bucket.count;
    }

    const deleteStmt = db.prepare("DELETE FROM tasks WHERE id = ?");
    let purgedCount = 0;
    for (const id of snapshottedIds) {
      const res = deleteStmt.run(id);
      purgedCount += Number(res.changes || 0);
    }

    db.exec("COMMIT;");
    return {
      retention_days: normalizedDays,
      purged_count: purgedCount,
      snapshotted_count: snapshottedCount,
      cutoff_iso: cutoffIso,
    };
  } catch (err) {
    try {
      db.exec("ROLLBACK;");
    } catch {
      // Ignore secondary rollback error
    }
    throw err;
  }
}

/**
 * Combine live non-deleted `done` tasks with persisted telemetry snapshots.
 */
// [spec: TASK-010]
// [spec: UI-014]
export function getTelemetrySummary(
  db: DatabaseSync,
  retentionDays: number = getConfiguredDoneRetentionDays(),
  defaultCreatorName?: string | null,
): TelemetrySummary {
  const fallbackCreator = defaultCreatorName?.trim() || "Unspecified";
  const weekMap = new Map<string, number>();
  const projectMap = new Map<string, number>();
  const weekCreatorMap = new Map<string, number>();
  const monthCreatorMap = new Map<string, number>();

  const addBucket = (
    isoWeek: string | null,
    yearMonth: string | null,
    projectKey: string,
    creatorKey: string,
    count: number,
  ) => {
    projectMap.set(projectKey, (projectMap.get(projectKey) || 0) + count);
    if (isoWeek) {
      weekMap.set(isoWeek, (weekMap.get(isoWeek) || 0) + count);
      const wcKey = `${isoWeek}\0${creatorKey}`;
      weekCreatorMap.set(wcKey, (weekCreatorMap.get(wcKey) || 0) + count);
    }
    if (yearMonth) {
      const mcKey = `${yearMonth}\0${creatorKey}`;
      monthCreatorMap.set(mcKey, (monthCreatorMap.get(mcKey) || 0) + count);
    }
  };

  const liveRows = db
    .prepare(
      `SELECT project_id, created_by, completed_at
       FROM tasks
       WHERE status = 'done' AND deleted_at IS NULL`,
    )
    .all() as unknown as Array<{
    project_id: string | null;
    created_by: string | null;
    completed_at: string | null;
  }>;

  for (const row of liveRows) {
    const projectKey = row.project_id || "unassigned";
    const creatorKey = row.created_by?.trim() || fallbackCreator;
    let isoWeek: string | null = null;
    let yearMonth: string | null = null;
    if (row.completed_at) {
      const d = new Date(row.completed_at);
      if (!isNaN(d.getTime())) {
        isoWeek = getISOYearWeekKey(d);
        yearMonth = getYearMonthKey(d);
      }
    }
    addBucket(isoWeek, yearMonth, projectKey, creatorKey, 1);
  }

  const snapshotRows = db
    .prepare(
      `SELECT iso_week, project_key, creator_key, completed_count
       FROM completed_telemetry_snapshots`,
    )
    .all() as unknown as SnapshotBucketRow[];

  let snapshottedCompleted = 0;
  for (const row of snapshotRows) {
    const count = Number(row.completed_count || 0);
    if (count <= 0) continue;
    snapshottedCompleted += count;
    const rawCreator = row.creator_key?.trim();
    const creatorKey =
      !rawCreator || rawCreator === "Unspecified"
        ? fallbackCreator
        : rawCreator;
    const yearMonth = isoYearWeekToYearMonth(row.iso_week);
    addBucket(row.iso_week, yearMonth, row.project_key, creatorKey, count);
  }

  const byWeek: TelemetryWeekEntry[] = Array.from(weekMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([iso_week, count]) => ({ iso_week, count }));

  const byProject: TelemetryProjectEntry[] = Array.from(projectMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([project_key, count]) => ({ project_key, count }));

  const byWeekCreator: TelemetryWeekCreatorEntry[] = Array.from(
    weekCreatorMap.entries(),
  )
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, count]) => {
      const [iso_week, creator] = key.split("\0");
      return { iso_week, creator, count };
    });

  const byMonthCreator: TelemetryMonthCreatorEntry[] = Array.from(
    monthCreatorMap.entries(),
  )
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, count]) => {
      const [year_month, creator] = key.split("\0");
      return { year_month, creator, count };
    });

  return {
    retention_days: retentionDays,
    total_completed: liveRows.length + snapshottedCompleted,
    live_completed: liveRows.length,
    snapshotted_completed: snapshottedCompleted,
    by_week: byWeek,
    by_project: byProject,
    by_week_creator: byWeekCreator,
    by_month_creator: byMonthCreator,
  };
}
