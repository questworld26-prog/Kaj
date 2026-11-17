// [spec: TASK-011]
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { createDatabase, initSchema } from "../../src/server/db.js";
import { EventBus } from "../../src/server/events.js";
import { createApp } from "../../src/server/app.js";
import {
  ProjectRepository,
  TaskRepository,
} from "../../src/server/repository.js";

describe("Automatic Roll-Forward of Past Action Dates (TASK-011)", () => {
  let db: DatabaseSync;
  let taskRepo: TaskRepository;
  let projectRepo: ProjectRepository;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 17, 9, 0, 0)); // 2026-11-17
    db = createDatabase(":memory:");
    initSchema(db);
    taskRepo = new TaskRepository(db);
    projectRepo = new ProjectRepository(db);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // [verifies: TASK-011/AC-TASK-011.1]
  it("updates past action_date on all active non-completed tasks to today on maintenance or board fetch", async () => {
    const simulatedToday = "2026-11-17";
    const pastTriage = taskRepo.createTask({
      title: "Overdue Triage Task",
      status: "triage",
      action_date: "2026-10-29",
    });
    const pastTodo = taskRepo.createTask({
      title: "Overdue Todo Task",
      status: "todo",
      action_date: "2026-11-10",
    });
    const pastTracking = taskRepo.createTask({
      title: "Overdue Tracking Parcel",
      status: "tracking",
      waiting_on: "Courier",
      action_date: "2026-11-16",
    });

    const rolled = taskRepo.rollForwardPastActionDates(simulatedToday);
    expect(rolled.map((t) => t.id).sort()).toEqual(
      [pastTriage.id, pastTodo.id, pastTracking.id].sort(),
    );

    expect(taskRepo.getTask(pastTriage.id)!.action_date).toBe(simulatedToday);
    expect(taskRepo.getTask(pastTodo.id)!.action_date).toBe(simulatedToday);
    expect(taskRepo.getTask(pastTracking.id)!.action_date).toBe(simulatedToday);

    // Also verify GET /api/board triggers roll-forward automatically
    const boardPast = taskRepo.createTask({
      title: "Overdue Before Board Fetch",
      status: "in_progress_week",
      action_date: "2026-11-05",
    });
    const app = createApp({ db, eventBus: new EventBus() });
    const res = await app.request("/api/board");
    expect(res.status).toBe(200);
    expect(taskRepo.getTask(boardPast.id)!.action_date).toBe(simulatedToday);
  });

  // [verifies: TASK-011/AC-TASK-011.2]
  it("preserves priority, project, and due_date when rolling forward and allows subsequent today-action promotion", () => {
    const simulatedToday = "2026-11-17";
    const project = projectRepo.createProject({ name: "Operations" });

    const overdueWeek = taskRepo.createTask({
      title: "Overdue Weekly Task",
      status: "in_progress_week",
      priority: "quarter",
      project_id: project.id,
      action_date: "2026-11-12",
      due_date: "2026-11-28",
    });
    const overdueTracking = taskRepo.createTask({
      title: "Overdue Blocked Shipment",
      status: "tracking",
      priority: "month",
      project_id: project.id,
      waiting_on: "Customs clearance",
      action_date: "2026-11-14",
    });

    const promoted = taskRepo.runScheduledPromotions(simulatedToday);
    expect(promoted.map((t) => t.id)).toContain(overdueWeek.id);
    expect(promoted.map((t) => t.id)).toContain(overdueTracking.id);

    const updatedWeek = taskRepo.getTask(overdueWeek.id)!;
    expect(updatedWeek.action_date).toBe(simulatedToday);
    expect(updatedWeek.status).toBe("in_progress_today");
    expect(updatedWeek.priority).toBe("quarter");
    expect(updatedWeek.project_id).toBe(project.id);
    expect(updatedWeek.due_date).toBe("2026-11-28");

    const updatedTracking = taskRepo.getTask(overdueTracking.id)!;
    expect(updatedTracking.action_date).toBe(simulatedToday);
    expect(updatedTracking.status).toBe("tracking");
  });

  // [verifies: TASK-011/AC-TASK-011.3]
  it("excludes done, soft-deleted, dateless, today, and future action_date tasks from roll-forward", () => {
    const simulatedToday = "2026-11-17";

    const doneTask = taskRepo.createTask({
      title: "Completed Past Task",
      status: "done",
      action_date: "2026-10-15",
    });
    const deletedTask = taskRepo.createTask({
      title: "Deleted Past Task",
      status: "todo",
      action_date: "2026-10-16",
    });
    taskRepo.deleteTask(deletedTask.id, true);

    const datelessTask = taskRepo.createTask({
      title: "No Action Date",
      status: "triage",
      action_date: null,
    });
    const todayTask = taskRepo.createTask({
      title: "Already Today",
      status: "in_progress_today",
      action_date: simulatedToday,
    });
    const futureTask = taskRepo.createTask({
      title: "Future Action Date",
      status: "triage",
      action_date: "2026-12-01",
    });

    const rolled = taskRepo.rollForwardPastActionDates(simulatedToday);
    expect(rolled).toHaveLength(0);

    expect(taskRepo.getTask(doneTask.id)!.action_date).toBe("2026-10-15");
    const rawDeleted = db
      .prepare("SELECT action_date FROM tasks WHERE id = ?")
      .get(deletedTask.id) as { action_date: string | null };
    expect(rawDeleted.action_date).toBe("2026-10-16");
    expect(taskRepo.getTask(datelessTask.id)!.action_date).toBeNull();
    expect(taskRepo.getTask(todayTask.id)!.action_date).toBe(simulatedToday);
    expect(taskRepo.getTask(futureTask.id)!.action_date).toBe("2026-12-01");
  });
});
