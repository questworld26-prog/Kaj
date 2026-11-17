// [verifies: UI-014]
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { initSchema } from "../../src/server/db.js";
import { TaskRepository } from "../../src/server/repository.js";
import {
  buildMonthlyVelocityStackFromSummary,
  buildTelemetrySummaryFromTasks,
} from "../../src/client/components/cockpit/types.js";

describe("UI-014: Cockpit Monthly Velocity Telemetry Aggregation", () => {
  let db: DatabaseSync;
  let taskRepo: TaskRepository;

  beforeEach(() => {
    db = new DatabaseSync(":memory:");
    initSchema(db);
    taskRepo = new TaskRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  // [verifies: UI-014/AC-UI-014.3]
  it("builds 6 chronological monthly velocity columns stacked by creator with unspecified attributed to configured non-VIP member", () => {
    const now = new Date(2026, 10, 17, 12, 0, 0); // 2026-11-17 (Nov = current month, Jun..Nov)
    const octTaskTime = new Date(2026, 9, 29, 12, 0, 0).toISOString(); // 2026-10 (same ISO week W44 as Nov 1)
    const novFirstTime = new Date(2026, 10, 1, 12, 0, 0).toISOString(); // 2026-11
    const novSeventeenthTime = new Date(2026, 10, 17, 10, 0, 0).toISOString(); // 2026-11
    const junTime = new Date(2026, 5, 15, 12, 0, 0).toISOString(); // 2026-06 (6 months window start)
    const mayTime = new Date(2026, 4, 15, 12, 0, 0).toISOString(); // 2026-05 (outside 6-month window)

    const summary = buildTelemetrySummaryFromTasks(
      [
        { completed_at: mayTime, created_by: "Oblix", project_id: null },
        { completed_at: junTime, created_by: null, project_id: null },
        { completed_at: octTaskTime, created_by: "Asterix", project_id: null },
        { completed_at: novFirstTime, created_by: null, project_id: null },
        { completed_at: novSeventeenthTime, created_by: "Asterix", project_id: null },
      ],
      90,
      "Oblix",
    );

    const monthly = buildMonthlyVelocityStackFromSummary(summary, now, "Oblix");

    expect(monthly.weeks).toHaveLength(6);
    expect(monthly.weeks.map((m) => m.label)).toEqual([
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
    ]);

    expect(monthly.weeks[0].total).toBe(1);
    expect(monthly.weeks[0].creators).toEqual({ Oblix: 1 });
    expect(monthly.weeks[0].isCurrent).toBe(false);

    // Oct 29 stays in Oct rather than bleeding into Nov despite sharing ISO week W44
    expect(monthly.weeks[4].total).toBe(1);
    expect(monthly.weeks[4].creators).toEqual({ Asterix: 1 });

    // Nov 1 + Nov 17 both aggregate in Nov with Unspecified attributed to Oblix
    expect(monthly.weeks[5].isCurrent).toBe(true);
    expect(monthly.weeks[5].total).toBe(2);
    expect(monthly.weeks[5].creators).toEqual({ Oblix: 1, Asterix: 1 });
    expect(monthly.creatorList).toEqual(["Oblix", "Asterix"]);
  });

  // [verifies: UI-014/AC-UI-014.4]
  it("combines live completed tasks with archived telemetry snapshots across the 6-month velocity summary", () => {
    const now = new Date(2026, 10, 17, 12, 0, 0); // 2026-11
    const oldCompletedAt = new Date(2026, 7, 6, 12, 0, 0).toISOString(); // 2026-08-06 (W32, >90 days before Nov 17)
    const liveCompletedAt = new Date(2026, 10, 10, 12, 0, 0).toISOString(); // 2026-11-10

    const archivedTask = taskRepo.createTask({
      title: "August archived task",
      status: "todo",
      created_by: null,
    });
    taskRepo.completeTask(archivedTask.id);
    db.prepare("UPDATE tasks SET completed_at = ? WHERE id = ?").run(
      oldCompletedAt,
      archivedTask.id,
    );

    const purgeRes = taskRepo.purgeExpiredDoneTasks(90, now);
    expect(purgeRes.purged_count).toBe(1);
    expect(purgeRes.snapshotted_count).toBe(1);

    const liveTask = taskRepo.createTask({
      title: "November live task",
      status: "todo",
      created_by: "Asterix",
    });
    taskRepo.completeTask(liveTask.id);
    db.prepare("UPDATE tasks SET completed_at = ? WHERE id = ?").run(
      liveCompletedAt,
      liveTask.id,
    );

    const summary = taskRepo.getTelemetrySummary(90, "Oblix");
    expect(summary.total_completed).toBe(2);
    expect(summary.snapshotted_completed).toBe(1);
    expect(summary.live_completed).toBe(1);

    const monthly = buildMonthlyVelocityStackFromSummary(summary, now, "Oblix");
    expect(monthly.weeks.map((m) => m.label)).toEqual([
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
    ]);
    // Aug archived snapshot attributed to configured non-VIP creator Oblix
    expect(monthly.weeks[2].total).toBe(1);
    expect(monthly.weeks[2].creators).toEqual({ Oblix: 1 });
    // Nov live task attributed to Asterix
    expect(monthly.weeks[5].total).toBe(1);
    expect(monthly.weeks[5].creators).toEqual({ Asterix: 1 });
  });
});
