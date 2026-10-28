import { describe, it, expect, beforeEach } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { createDatabase, initSchema } from "../../src/server/db.js";
import {
  TaskRepository,
  ProjectRepository,
} from "../../src/server/repository.js";

describe("Spawn-on-Complete Recurrence Rollover (TASK-004)", () => {
  let db: DatabaseSync;
  let taskRepo: TaskRepository;
  let projectRepo: ProjectRepository;

  beforeEach(() => {
    db = createDatabase(":memory:");
    initSchema(db);
    taskRepo = new TaskRepository(db);
    projectRepo = new ProjectRepository(db);
  });

  // [verifies: TASK-004/AC-TASK-004.1]
  it("weekly recurring task spawns next instance in todo with dates shifted forward by 7 days", () => {
    const p = projectRepo.createProject({ name: "Weekly Routines" });
    const weeklyTask = taskRepo.createTask({
      title: "Weekly Standup Notes",
      project_id: p.id,
      priority: "week",
      repeat_rule: "weekly",
      action_date: "2026-10-28",
      due_date: "2026-10-30",
      status: "in_progress_today",
    });

    const result = taskRepo.completeTask(weeklyTask.id);
    expect(result.completed_task.status).toBe("done");
    expect(result.spawned_task).not.toBeNull();

    const next = result.spawned_task!;
    expect(next.status).toBe("todo");
    expect(next.action_date).toBe("2026-11-04"); // +7 days
    expect(next.due_date).toBe("2026-11-06"); // +7 days
    expect(next.repeat_rule).toBe("weekly");
    expect(next.parent_recurring_id).toBe(weeklyTask.id);
  });

  // [verifies: TASK-004/AC-TASK-004.2]
  it("monthly recurring task spawns next instance with 1 month advance and end-of-month clamping", () => {
    // Standard month advance: 2026-10-15 -> 2026-11-15
    const monthlyStandard = taskRepo.createTask({
      title: "Monthly Review",
      repeat_rule: "monthly",
      action_date: "2026-10-15",
      due_date: "2026-10-20",
      status: "todo",
    });

    const resStandard = taskRepo.completeTask(monthlyStandard.id);
    expect(resStandard.spawned_task?.action_date).toBe("2026-11-15");
    expect(resStandard.spawned_task?.due_date).toBe("2026-11-20");

    // End-of-month clamping: e.g. Jan 31 -> Feb 28 (or 29)
    const monthlyEOM = taskRepo.createTask({
      title: "End of Month Reconcile",
      repeat_rule: "monthly",
      action_date: "2026-01-31",
      due_date: "2026-01-31",
      status: "todo",
    });

    const resEOM = taskRepo.completeTask(monthlyEOM.id);
    expect(resEOM.spawned_task?.action_date).toBe("2026-02-28");
    expect(resEOM.spawned_task?.due_date).toBe("2026-02-28");
  });

  // [verifies: TASK-004/AC-TASK-004.3]
  it("yearly recurring task spawns next instance with dates shifted forward by exactly 1 year", () => {
    const yearlyTask = taskRepo.createTask({
      title: "Annual Property Insurance Review",
      repeat_rule: "yearly",
      action_date: "2026-10-28",
      due_date: "2026-11-15",
      status: "todo",
    });

    const res = taskRepo.completeTask(yearlyTask.id);
    expect(res.spawned_task?.action_date).toBe("2027-10-28");
    expect(res.spawned_task?.due_date).toBe("2027-11-15");
  });

  // [verifies: TASK-004/AC-TASK-004.4]
  it("newly spawned recurring task inherits title, details, project, priority, and repeat rule", () => {
    const p = projectRepo.createProject({ name: "Platform Ops" });
    const parent = taskRepo.createTask({
      title: "Rotate API Keys",
      details: "Follow security checklist in docs",
      project_id: p.id,
      priority: "quarter",
      repeat_rule: "monthly",
      waiting_on: "",
      action_date: "2026-10-01",
      due_date: "2026-10-05",
    });

    const res = taskRepo.completeTask(parent.id);
    const spawned = res.spawned_task!;
    expect(spawned.title).toBe(parent.title);
    expect(spawned.details).toBe(parent.details);
    expect(spawned.project_id).toBe(parent.project_id);
    expect(spawned.priority).toBe(parent.priority);
    expect(spawned.repeat_rule).toBe(parent.repeat_rule);
  });

  // [verifies: TASK-004/AC-TASK-004.5]
  it("completed recurring occurrence remains archived in done with completed_at timestamp", () => {
    const task = taskRepo.createTask({
      title: "Weekly Sync",
      repeat_rule: "weekly",
      action_date: "2026-10-28",
    });

    const res = taskRepo.completeTask(task.id);
    expect(res.completed_task.id).toBe(task.id);
    expect(res.completed_task.status).toBe("done");
    expect(res.completed_task.completed_at).not.toBeNull();

    // Verify fetched from db
    const inDb = taskRepo.getTask(task.id);
    expect(inDb?.status).toBe("done");
    expect(inDb?.completed_at).toBe(res.completed_task.completed_at);
  });
});
