import { DatabaseSync } from "node:sqlite";
import {
  Project,
  CreateProjectInput,
  UpdateProjectInput,
  Task,
  CreateTaskInput,
  CreateTaskInputSchema,
  UpdateTaskInput,
  UpdateTaskInputSchema,
  CalendarEvent,
  TelemetrySummary,
  PurgeCompletedResult,
} from "../shared/types.js";
import {
  getTelemetrySummary as computeTelemetrySummary,
  purgeExpiredDoneTasks as runRetentionPurge,
} from "./retention.js";
import {
  type RecurrenceOptions,
  shiftDate,
  getISOWeekNumber,
  appendPeriodTag,
} from "./recurrence.js";
import { generateId } from "./repositories/shared.js";
import { ProjectRepository } from "./repositories/project-repository.js";
import { queryCalendarEventsForDb } from "./repositories/task-calendar.js";
import {
  resolveAutoPromotionStatus,
  promoteDueRecurringTasksForDb,
  promoteTodayActionDateTasksForDb,
  promoteThisWeekTriageTasksForDb,
} from "./repositories/task-promotions.js";

export type {
  RecurrenceOptions,
  CreateProjectInput,
  UpdateProjectInput,
};
export { ProjectRepository, shiftDate, getISOWeekNumber, appendPeriodTag };

// [spec: TASK-001]
// [spec: TASK-002]
// [spec: TASK-003]
// [spec: TASK-004]
// [spec: TASK-005]
// [spec: TASK-007]
// [spec: TASK-008]
// [spec: TASK-009]
// [spec: PROJ-002]
export class TaskRepository {
  constructor(private db: DatabaseSync) {}

  createTask(input: CreateTaskInput): Task {
    const validated = CreateTaskInputSchema.parse(input);
    const effectiveStatus = resolveAutoPromotionStatus(
      validated.status,
      validated.action_date,
    );
    const id = generateId("tsk");
    const now = new Date().toISOString();

    let sortOrder = validated.sort_order;
    if (sortOrder === undefined) {
      const row = this.db
        .prepare(
          "SELECT COALESCE(MAX(sort_order), 0) + 1.0 AS next_order FROM tasks",
        )
        .get() as { next_order: number };
      sortOrder = row.next_order;
    }

    this.db
      .prepare(
        `INSERT INTO tasks (
          id, title, status, details, project_id, priority, action_date, due_date,
          repeat_rule, repeat_day_of_week, repeat_day_of_month, repeat_day_of_year,
          waiting_on, created_by, sort_order, completed_at, deleted_at,
          parent_recurring_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, ?, ?)`,
      )
      .run(
        id,
        validated.title,
        effectiveStatus,
        validated.details,
        validated.project_id,
        validated.priority,
        validated.action_date,
        validated.due_date,
        validated.repeat_rule,
        validated.repeat_day_of_week ?? null,
        validated.repeat_day_of_month ?? null,
        validated.repeat_day_of_year ?? null,
        validated.waiting_on,
        validated.created_by ?? null,
        sortOrder,
        now,
        now,
      );

    return this.getTask(id)!;
  }

  getTask(id: string): Task | null {
    const row = this.db
      .prepare("SELECT * FROM tasks WHERE id = ? AND deleted_at IS NULL")
      .get(id) as Task | undefined;
    return row || null;
  }

  getTaskById(id: string): Task | null {
    return this.getTask(id);
  }

  listTasks(includeCompleted = false): Task[] {
    const sql = includeCompleted
      ? "SELECT * FROM tasks WHERE deleted_at IS NULL ORDER BY sort_order ASC, created_at DESC"
      : "SELECT * FROM tasks WHERE status != ? AND deleted_at IS NULL ORDER BY sort_order ASC, created_at DESC";
    return (includeCompleted
      ? this.db.prepare(sql).all()
      : this.db.prepare(sql).all("done")) as unknown as Task[];
  }

  updateTask(id: string, input: UpdateTaskInput): Task | null {
    const validated = UpdateTaskInputSchema.parse(input);
    const existing = this.getTask(id);
    if (!existing) {
      return null;
    }

    const title =
      validated.title !== undefined ? validated.title : existing.title;
    const rawStatus =
      validated.status !== undefined ? validated.status : existing.status;
    const details =
      validated.details !== undefined ? validated.details : existing.details;
    const projectId =
      validated.project_id !== undefined
        ? validated.project_id
        : existing.project_id;
    const priority =
      validated.priority !== undefined ? validated.priority : existing.priority;
    const actionDate =
      validated.action_date !== undefined
        ? validated.action_date
        : existing.action_date;
    const status = resolveAutoPromotionStatus(rawStatus, actionDate);
    const dueDate =
      validated.due_date !== undefined ? validated.due_date : existing.due_date;
    const repeatRule =
      validated.repeat_rule !== undefined
        ? validated.repeat_rule
        : existing.repeat_rule;
    const repeatDayOfWeek =
      validated.repeat_day_of_week !== undefined
        ? validated.repeat_day_of_week
        : existing.repeat_day_of_week;
    const repeatDayOfMonth =
      validated.repeat_day_of_month !== undefined
        ? validated.repeat_day_of_month
        : existing.repeat_day_of_month;
    const repeatDayOfYear =
      validated.repeat_day_of_year !== undefined
        ? validated.repeat_day_of_year
        : existing.repeat_day_of_year;
    const waitingOn =
      validated.waiting_on !== undefined
        ? validated.waiting_on
        : existing.waiting_on;
    const createdBy =
      validated.created_by !== undefined
        ? validated.created_by
        : existing.created_by;
    const sortOrder =
      validated.sort_order !== undefined
        ? validated.sort_order
        : existing.sort_order;
    const now = new Date().toISOString();

    if (validated.status === "done" && existing.status !== "done") {
      this.db
        .prepare(
          `UPDATE tasks
           SET title = ?, details = ?, project_id = ?, priority = ?,
               action_date = ?, due_date = ?, repeat_rule = ?,
               repeat_day_of_week = ?, repeat_day_of_month = ?, repeat_day_of_year = ?,
               waiting_on = ?, created_by = ?, sort_order = ?, updated_at = ?
           WHERE id = ?`,
        )
        .run(
          title,
          details,
          projectId,
          priority,
          actionDate,
          dueDate,
          repeatRule,
          repeatDayOfWeek ?? null,
          repeatDayOfMonth ?? null,
          repeatDayOfYear ?? null,
          waitingOn,
          createdBy ?? null,
          sortOrder,
          now,
          id,
        );
      this.completeTask(id);
      return this.getTask(id);
    }

    let completedAt = existing.completed_at;
    if (
      validated.status !== undefined &&
      validated.status !== "done" &&
      existing.status === "done"
    ) {
      completedAt = null;
    }

    this.db
      .prepare(
        `UPDATE tasks
         SET title = ?, status = ?, details = ?, project_id = ?, priority = ?,
             action_date = ?, due_date = ?, repeat_rule = ?,
             repeat_day_of_week = ?, repeat_day_of_month = ?, repeat_day_of_year = ?,
             waiting_on = ?, created_by = ?, sort_order = ?, completed_at = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(
        title,
        status,
        details,
        projectId,
        priority,
        actionDate,
        dueDate,
        repeatRule,
        repeatDayOfWeek ?? null,
        repeatDayOfMonth ?? null,
        repeatDayOfYear ?? null,
        waitingOn,
        createdBy ?? null,
        sortOrder,
        completedAt,
        now,
        id,
      );

    return this.getTask(id);
  }

  completeTask(id: string): {
    completed_task: Task;
    spawned_task: Task | null;
  } {
    const task = this.getTask(id);
    if (!task) {
      throw new Error(`Task ${id} not found`);
    }

    if (task.status === "done") {
      return { completed_task: task, spawned_task: null };
    }

    const now = new Date().toISOString();
    this.db
      .prepare(
        "UPDATE tasks SET status = ?, completed_at = ?, updated_at = ? WHERE id = ?",
      )
      .run("done", now, now, id);

    const completedTask = this.getTask(id) || {
      ...task,
      status: "done",
      completed_at: now,
      updated_at: now,
    };

    let spawnedTask: Task | null = null;
    if (task.repeat_rule !== "none") {
      let anchorActionDay: number | undefined;
      if (task.action_date) {
        if (task.parent_recurring_id) {
          const parent = this.db
            .prepare("SELECT action_date FROM tasks WHERE id = ?")
            .get(task.parent_recurring_id) as
            { action_date: string | null } | undefined;
          if (parent?.action_date) {
            anchorActionDay = Number(parent.action_date.split("-")[2]);
          }
        }
        if (!anchorActionDay) {
          anchorActionDay = Number(task.action_date.split("-")[2]);
        }
      }

      let anchorDueDay: number | undefined;
      if (task.due_date) {
        if (task.parent_recurring_id) {
          const parent = this.db
            .prepare("SELECT due_date FROM tasks WHERE id = ?")
            .get(task.parent_recurring_id) as
            { due_date: string | null } | undefined;
          if (parent?.due_date) {
            anchorDueDay = Number(parent.due_date.split("-")[2]);
          }
        }
        if (!anchorDueDay) {
          anchorDueDay = Number(task.due_date.split("-")[2]);
        }
      }

      const recurrenceOpts: RecurrenceOptions = {
        repeatDayOfWeek: task.repeat_day_of_week,
        repeatDayOfMonth: task.repeat_day_of_month,
        repeatDayOfYear: task.repeat_day_of_year,
      };

      const nextAction = task.action_date
        ? shiftDate(task.action_date, task.repeat_rule, {
            ...recurrenceOpts,
            targetDay: anchorActionDay,
          })
        : null;
      const nextDue = task.due_date
        ? shiftDate(task.due_date, task.repeat_rule, {
            ...recurrenceOpts,
            targetDay: anchorDueDay,
          })
        : null;
      const newId = generateId("tsk");

      const row = this.db
        .prepare(
          "SELECT COALESCE(MAX(sort_order), 0) + 1.0 AS next_order FROM tasks",
        )
        .get() as { next_order: number };

      const spawnedTitle = appendPeriodTag(
        task.title,
        task.repeat_rule,
        nextAction || nextDue,
      );

      this.db
        .prepare(
          `INSERT INTO tasks (
            id, title, status, details, project_id, priority, action_date, due_date,
            repeat_rule, repeat_day_of_week, repeat_day_of_month, repeat_day_of_year,
            waiting_on, sort_order, completed_at, deleted_at,
            parent_recurring_id, created_at, updated_at
          ) VALUES (?, ?, 'triage', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?)`,
        )
        .run(
          newId,
          spawnedTitle,
          task.details,
          task.project_id,
          task.priority,
          nextAction,
          nextDue,
          task.repeat_rule,
          task.repeat_day_of_week,
          task.repeat_day_of_month,
          task.repeat_day_of_year,
          task.waiting_on,
          row.next_order,
          task.id,
          now,
          now,
        );

      spawnedTask = this.getTask(newId);
    }

    return { completed_task: completedTask, spawned_task: spawnedTask };
  }

  reopenTask(id: string): Task | null {
    const existing = this.getTask(id);
    if (!existing) {
      return null;
    }
    const now = new Date().toISOString();
    this.db
      .prepare(
        "UPDATE tasks SET status = ?, completed_at = NULL, updated_at = ? WHERE id = ?",
      )
      .run("todo", now, id);
    return this.getTask(id);
  }

  // [spec: TASK-006]
  reorderTasks(taskIds: string[]): void {
    if (taskIds.length === 0) return;
    const placeholders = taskIds.map(() => "?").join(",");
    const existingRows = this.db
      .prepare(`SELECT id FROM tasks WHERE id IN (${placeholders})`)
      .all(...taskIds) as { id: string }[];
    if (existingRows.length !== taskIds.length) {
      throw new Error("One or more task IDs are invalid");
    }

    const now = new Date().toISOString();
    this.db.exec("BEGIN TRANSACTION;");
    try {
      const stmt = this.db.prepare(
        "UPDATE tasks SET sort_order = ?, updated_at = ? WHERE id = ?",
      );
      for (let i = 0; i < taskIds.length; i++) {
        stmt.run(i, now, taskIds[i]);
      }
      this.db.exec("COMMIT;");
    } catch (err) {
      this.db.exec("ROLLBACK;");
      throw err;
    }
  }

  deleteTask(id: string, soft = true): boolean {
    if (soft) {
      const now = new Date().toISOString();
      const res = this.db
        .prepare(
          "UPDATE tasks SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL",
        )
        .run(now, now, id);
      return res.changes > 0;
    }
    const res = this.db.prepare("DELETE FROM tasks WHERE id = ?").run(id);
    return res.changes > 0;
  }

  restoreTask(id: string): Task | null {
    const now = new Date().toISOString();
    this.db
      .prepare(
        "UPDATE tasks SET deleted_at = NULL, updated_at = ? WHERE id = ?",
      )
      .run(now, id);
    return this.getTask(id);
  }

  listCompletedTasks(): Task[] {
    return this.db
      .prepare(
        "SELECT * FROM tasks WHERE status = ? AND deleted_at IS NULL ORDER BY completed_at DESC",
      )
      .all("done") as unknown as Task[];
  }

  listUnscheduledTasks(): Task[] {
    return this.db
      .prepare(
        "SELECT * FROM tasks WHERE action_date IS NULL AND status != ? AND deleted_at IS NULL ORDER BY sort_order ASC",
      )
      .all("done") as unknown as Task[];
  }

  getBoardSwimlanes(
    projectRepo: ProjectRepository,
  ): { swimlane_id: string; project: Project | null; tasks: Task[] }[] {
    const activeTasks = this.db
      .prepare(
        "SELECT * FROM tasks WHERE status != ? AND deleted_at IS NULL ORDER BY sort_order ASC",
      )
      .all("done") as unknown as Task[];

    const projects = projectRepo.listProjects(false);

    const swimlanes: {
      swimlane_id: string;
      project: Project | null;
      tasks: Task[];
    }[] = [];

    // Top swimlane is always Unassigned
    const unassignedTasks = activeTasks.filter((t) => t.project_id === null);
    swimlanes.push({
      swimlane_id: "unassigned",
      project: null,
      tasks: unassignedTasks,
    });

    for (const proj of projects) {
      const projTasks = activeTasks.filter((t) => t.project_id === proj.id);
      swimlanes.push({
        swimlane_id: proj.id,
        project: proj,
        tasks: projTasks,
      });
    }

    return swimlanes;
  }

  queryCalendarEvents(startDate: string, endDate: string): CalendarEvent[] {
    return queryCalendarEventsForDb(this.db, startDate, endDate);
  }

  /**
   * Automatically move recurring tasks in `triage` to `todo` when `todayDateStr`'s
   * calendar week or month matches their scheduled period.
   */
  promoteDueRecurringTasks(todayDateStr?: string): Task[] {
    return promoteDueRecurringTasksForDb(this.db, todayDateStr);
  }

  /**
   * Automatically move active non-completed, non-tracking tasks with `action_date` matching
   * today's local calendar date into `in_progress_today`.
   */
  promoteTodayActionDateTasks(todayDateStr?: string): Task[] {
    return promoteTodayActionDateTasksForDb(this.db, todayDateStr);
  }

  /**
   * Automatically move active `triage` tasks whose `action_date` falls in the current
   * Monday-to-Sunday calendar week into `todo` (TASK-009).
   */
  promoteThisWeekTriageTasks(todayDateStr?: string): Task[] {
    return promoteThisWeekTriageTasksForDb(this.db, todayDateStr);
  }

  /**
   * Run all periodic/fetch-time promotions in canonical order:
   * 1) Due recurring triage tasks -> `todo` (TASK-007)
   * 2) Active triage tasks with `action_date` in this Mon-Sun week -> `todo` (TASK-009)
   * 3) Active tasks with `action_date === today` -> `in_progress_today` (TASK-008)
   */
  runScheduledPromotions(todayDateStr?: string): Task[] {
    const merged = new Map<string, Task>();
    for (const task of this.promoteDueRecurringTasks(todayDateStr)) {
      merged.set(task.id, task);
    }
    for (const task of this.promoteThisWeekTriageTasks(todayDateStr)) {
      merged.set(task.id, task);
    }
    for (const task of this.promoteTodayActionDateTasks(todayDateStr)) {
      merged.set(task.id, task);
    }
    return Array.from(merged.values());
  }

  // [spec: TASK-010]
  purgeExpiredDoneTasks(
    retentionDays?: number,
    now?: Date,
  ): PurgeCompletedResult {
    return runRetentionPurge(this.db, retentionDays, now);
  }

  // [spec: TASK-010]
  getTelemetrySummary(retentionDays?: number): TelemetrySummary {
    return computeTelemetrySummary(this.db, retentionDays);
  }
}
