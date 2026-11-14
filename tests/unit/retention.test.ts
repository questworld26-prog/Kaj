// [spec: TASK-010]
import { describe, it, expect, beforeEach } from "vitest";
import { createDatabase, initSchema } from "../../src/server/db.js";
import { ProjectRepository, TaskRepository } from "../../src/server/repository.js";
import { getISOYearWeekKey, parseDoneRetentionDays } from "../../src/shared/types.js";

describe("TASK-010: Completed task retention purge & telemetry snapshot", () => {
  let db: ReturnType<typeof createDatabase>;
  let taskRepo: TaskRepository;
  let projRepo: ProjectRepository;

  beforeEach(() => {
    db = createDatabase(":memory:");
    initSchema(db);
    taskRepo = new TaskRepository(db);
    projRepo = new ProjectRepository(db);
  });

  // [verifies: TASK-010/AC-TASK-010.1]
  it("defaults done retention to 90 days and purges done tasks older than 90 days", () => {
    expect(parseDoneRetentionDays(undefined)).toBe(90);
    expect(parseDoneRetentionDays("")).toBe(90);

    const now = new Date("2026-11-14T12:00:00.000Z");
    const day91Ago = new Date(now.getTime() - 91 * 24 * 60 * 60 * 1000).toISOString();
    const day89Ago = new Date(now.getTime() - 89 * 24 * 60 * 60 * 1000).toISOString();

    const oldDone = taskRepo.createTask({ title: "Old done task", status: "todo" });
    taskRepo.completeTask(oldDone.id);
    db.prepare("UPDATE tasks SET completed_at = ? WHERE id = ?").run(day91Ago, oldDone.id);

    const recentDone = taskRepo.createTask({ title: "Recent done task", status: "todo" });
    taskRepo.completeTask(recentDone.id);
    db.prepare("UPDATE tasks SET completed_at = ? WHERE id = ?").run(day89Ago, recentDone.id);

    const result = taskRepo.purgeExpiredDoneTasks(parseDoneRetentionDays(undefined), now);
    expect(result.retention_days).toBe(90);
    expect(result.purged_count).toBe(1);
    expect(taskRepo.getTask(oldDone.id)).toBeNull();
    expect(taskRepo.getTask(recentDone.id)?.title).toBe("Recent done task");
  });

  // [verifies: TASK-010/AC-TASK-010.2]
  it("disables automatic retention purging when retention setting is zero", () => {
    expect(parseDoneRetentionDays("0")).toBe(0);

    const now = new Date("2026-11-14T12:00:00.000Z");
    const yearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000).toISOString();

    const oldDone = taskRepo.createTask({ title: "Ancient done task", status: "todo" });
    taskRepo.completeTask(oldDone.id);
    db.prepare("UPDATE tasks SET completed_at = ? WHERE id = ?").run(yearAgo, oldDone.id);

    const result = taskRepo.purgeExpiredDoneTasks(parseDoneRetentionDays("0"), now);
    expect(result.retention_days).toBe(0);
    expect(result.purged_count).toBe(0);
    expect(result.snapshotted_count).toBe(0);
    expect(taskRepo.getTask(oldDone.id)?.title).toBe("Ancient done task");
  });

  // [verifies: TASK-010/AC-TASK-010.3]
  it("atomically snapshots purged done task counts by ISO year-week, project, and creator before deleting", () => {
    const now = new Date("2026-11-14T12:00:00.000Z");
    const ts100d = new Date(now.getTime() - 100 * 24 * 60 * 60 * 1000);
    const expectedWeek = getISOYearWeekKey(ts100d);

    const proj = projRepo.createProject({ name: "Alpha", color: "#10B981" });
    const t1 = taskRepo.createTask({
      title: "Expired 1",
      status: "todo",
      project_id: proj.id,
      created_by: "Alice",
    });
    const t2 = taskRepo.createTask({
      title: "Expired 2",
      status: "todo",
      project_id: null,
      created_by: null,
    });
    taskRepo.completeTask(t1.id);
    taskRepo.completeTask(t2.id);
    db.prepare("UPDATE tasks SET completed_at = ? WHERE id IN (?, ?)").run(
      ts100d.toISOString(),
      t1.id,
      t2.id,
    );

    const firstPurge = taskRepo.purgeExpiredDoneTasks(90, now);
    expect(firstPurge.purged_count).toBe(2);
    expect(firstPurge.snapshotted_count).toBe(2);

    // Running purge a second time must not double-count or remove more rows
    const secondPurge = taskRepo.purgeExpiredDoneTasks(90, now);
    expect(secondPurge.purged_count).toBe(0);
    expect(secondPurge.snapshotted_count).toBe(0);

    const summary = taskRepo.getTelemetrySummary(90);
    expect(summary.total_completed).toBe(2);
    expect(summary.live_completed).toBe(0);
    expect(summary.snapshotted_completed).toBe(2);
    expect(summary.by_week).toEqual([{ iso_week: expectedWeek, count: 2 }]);
    expect(summary.by_project).toEqual(
      expect.arrayContaining([
        { project_key: proj.id, count: 1 },
        { project_key: "unassigned", count: 1 },
      ]),
    );
    expect(summary.by_week_creator).toEqual(
      expect.arrayContaining([
        { iso_week: expectedWeek, creator: "Alice", count: 1 },
        { iso_week: expectedWeek, creator: "Unspecified", count: 1 },
      ]),
    );
  });

  // [verifies: TASK-010/AC-TASK-010.4]
  it("excludes non-completed, soft-deleted, and recent completed tasks from retention purge and snapshot", () => {
    const now = new Date("2026-11-14T12:00:00.000Z");
    const ts120d = new Date(now.getTime() - 120 * 24 * 60 * 60 * 1000).toISOString();
    const ts10d = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString();

    const activeTodo = taskRepo.createTask({ title: "Old active", status: "todo" });
    db.prepare("UPDATE tasks SET created_at = ?, updated_at = ? WHERE id = ?").run(
      ts120d,
      ts120d,
      activeTodo.id,
    );

    const softDeletedDone = taskRepo.createTask({ title: "Soft deleted done", status: "todo" });
    taskRepo.completeTask(softDeletedDone.id);
    db.prepare("UPDATE tasks SET completed_at = ?, deleted_at = ? WHERE id = ?").run(
      ts120d,
      ts10d,
      softDeletedDone.id,
    );

    const recentDone = taskRepo.createTask({ title: "Recent done", status: "todo" });
    taskRepo.completeTask(recentDone.id);
    db.prepare("UPDATE tasks SET completed_at = ? WHERE id = ?").run(ts10d, recentDone.id);

    const result = taskRepo.purgeExpiredDoneTasks(90, now);
    expect(result.purged_count).toBe(0);
    expect(result.snapshotted_count).toBe(0);
    expect(taskRepo.getTask(activeTodo.id)?.title).toBe("Old active");
    expect(taskRepo.getTask(recentDone.id)?.title).toBe("Recent done");

    const summary = taskRepo.getTelemetrySummary(90);
    expect(summary.snapshotted_completed).toBe(0);
    expect(summary.live_completed).toBe(1);
    expect(summary.total_completed).toBe(1);
  });
});
