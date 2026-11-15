// [spec: TASK-007]
// [spec: TASK-008]
// [spec: TASK-009]
import { DatabaseSync } from "node:sqlite";
import {
  type Task,
  type TaskStatus,
  isActionDateToday,
  isDateInCurrentMondayWeek,
} from "../../shared/types.js";
import {
  formatLocalDateYMD,
  shouldPromoteRecurringTask,
} from "../recurrence.js";

export function resolveAutoPromotionStatus(
  status: TaskStatus,
  actionDate: string | null,
): TaskStatus {
  if (
    status === "done" ||
    status === "tracking" ||
    status === "in_progress_today"
  ) {
    return status;
  }
  if (isActionDateToday(actionDate)) {
    return "in_progress_today";
  }
  if (status === "triage" && isDateInCurrentMondayWeek(actionDate)) {
    return "todo";
  }
  return status;
}

export function batchPromoteStatus(
  db: DatabaseSync,
  candidates: Task[],
  nextStatus: TaskStatus,
  extraWhereClause: string,
): Task[] {
  if (candidates.length === 0) return [];
  const now = new Date().toISOString();
  const promoted: Task[] = [];

  db.exec("BEGIN IMMEDIATE;");
  try {
    const stmt = db.prepare(
      `UPDATE tasks SET status = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL AND ${extraWhereClause}`,
    );
    for (const task of candidates) {
      stmt.run(nextStatus, now, task.id);
      promoted.push({
        ...task,
        status: nextStatus,
        updated_at: now,
      });
    }
    db.exec("COMMIT;");
  } catch (err) {
    db.exec("ROLLBACK;");
    throw err;
  }

  return promoted;
}

export function promoteDueRecurringTasksForDb(
  db: DatabaseSync,
  todayDateStr?: string,
): Task[] {
  const today = todayDateStr || formatLocalDateYMD();
  const candidates = db
    .prepare(
      "SELECT * FROM tasks WHERE status = 'triage' AND deleted_at IS NULL AND repeat_rule != 'none'",
    )
    .all() as unknown as Task[];

  const toPromote = candidates.filter((task) =>
    shouldPromoteRecurringTask(task, today),
  );
  return batchPromoteStatus(db, toPromote, "todo", "status = 'triage'");
}

export function promoteTodayActionDateTasksForDb(
  db: DatabaseSync,
  todayDateStr?: string,
): Task[] {
  const today = todayDateStr || formatLocalDateYMD();
  const candidates = db
    .prepare(
      `SELECT * FROM tasks
       WHERE deleted_at IS NULL
         AND action_date = ?
         AND status NOT IN ('done', 'in_progress_today', 'tracking')`,
    )
    .all(today) as unknown as Task[];

  return batchPromoteStatus(
    db,
    candidates,
    "in_progress_today",
    "status NOT IN ('done', 'in_progress_today', 'tracking')",
  );
}

export function promoteThisWeekTriageTasksForDb(
  db: DatabaseSync,
  todayDateStr?: string,
): Task[] {
  const today = todayDateStr || formatLocalDateYMD();
  const candidates = db
    .prepare(
      "SELECT * FROM tasks WHERE status = 'triage' AND deleted_at IS NULL AND action_date IS NOT NULL",
    )
    .all() as unknown as Task[];

  const toPromote = candidates.filter((task) =>
    isDateInCurrentMondayWeek(task.action_date, today),
  );
  return batchPromoteStatus(db, toPromote, "todo", "status = 'triage'");
}
