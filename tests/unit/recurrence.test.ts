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
  it("weekly recurring task spawns next instance in triage with dates shifted forward and week number appended", () => {
    const p = projectRepo.createProject({ name: "Weekly Routines" });
    const weeklyTask = taskRepo.createTask({
      title: "Weekly Standup Notes",
      project_id: p.id,
      priority: "week",
      repeat_rule: "weekly",
      action_date: "2026-10-28", // Wednesday (day 3, week 44)
      due_date: "2026-10-30", // Friday (day 5)
      status: "in_progress_today",
    });

    const result = taskRepo.completeTask(weeklyTask.id);
    expect(result.completed_task.status).toBe("done");
    expect(result.spawned_task).not.toBeNull();

    const next = result.spawned_task!;
    expect(next.status).toBe("triage");
    expect(next.action_date).toBe("2026-11-04"); // +7 days (week 45)
    expect(next.due_date).toBe("2026-11-06"); // +7 days
    expect(next.repeat_rule).toBe("weekly");
    expect(next.parent_recurring_id).toBe(weeklyTask.id);
    expect(next.title).toBe("Weekly Standup Notes [45]");

    // Weekly with custom repeat_day_of_week (e.g. 1 = Monday)
    const mondayTask = taskRepo.createTask({
      title: "Weekly Team Planning",
      repeat_rule: "weekly",
      repeat_day_of_week: 1, // Monday
      action_date: "2026-10-28", // Wednesday
      status: "todo",
    });
    const mondayRes = taskRepo.completeTask(mondayTask.id);
    // Next Monday from Wed Oct 28 2026 is Nov 2 2026 (week 45)
    expect(mondayRes.spawned_task?.status).toBe("triage");
    expect(mondayRes.spawned_task?.action_date).toBe("2026-11-02");
    expect(mondayRes.spawned_task?.repeat_day_of_week).toBe(1);
    expect(mondayRes.spawned_task?.title).toBe("Weekly Team Planning [45]");
  });

  // [verifies: TASK-004/AC-TASK-004.2]
  it("monthly recurring task spawns next instance in triage with 1 month advance and month appended", () => {
    // Standard month advance: 2026-10-15 -> 2026-11-15 (Month 11)
    const monthlyStandard = taskRepo.createTask({
      title: "Monthly Review",
      repeat_rule: "monthly",
      action_date: "2026-10-15",
      due_date: "2026-10-20",
      status: "todo",
    });

    const resStandard = taskRepo.completeTask(monthlyStandard.id);
    expect(resStandard.spawned_task?.status).toBe("triage");
    expect(resStandard.spawned_task?.action_date).toBe("2026-11-15");
    expect(resStandard.spawned_task?.due_date).toBe("2026-11-20");
    expect(resStandard.spawned_task?.title).toBe("Monthly Review [11]");

    // Monthly with explicit repeat_day_of_month (e.g. 5th of each month)
    const monthly5th = taskRepo.createTask({
      title: "Pay Rent",
      repeat_rule: "monthly",
      repeat_day_of_month: 5,
      action_date: "2026-10-05",
      status: "todo",
    });
    const res5th = taskRepo.completeTask(monthly5th.id);
    expect(res5th.spawned_task?.status).toBe("triage");
    expect(res5th.spawned_task?.action_date).toBe("2026-11-05");
    expect(res5th.spawned_task?.repeat_day_of_month).toBe(5);
    expect(res5th.spawned_task?.title).toBe("Pay Rent [11]");

    // End-of-month clamping: e.g. Jan 31 -> Feb 28 (or 29)
    const monthlyEOM = taskRepo.createTask({
      title: "End of Month Reconcile",
      repeat_rule: "monthly",
      action_date: "2026-01-31",
      due_date: "2026-01-31",
      status: "todo",
    });

    const resEOM = taskRepo.completeTask(monthlyEOM.id);
    expect(resEOM.spawned_task?.status).toBe("triage");
    expect(resEOM.spawned_task?.action_date).toBe("2026-02-28");
    expect(resEOM.spawned_task?.due_date).toBe("2026-02-28");
    expect(resEOM.spawned_task?.title).toBe("End of Month Reconcile [2]");
  });

  // [verifies: TASK-004/AC-TASK-004.3]
  it("yearly recurring task spawns next instance in triage with dates shifted forward by 1 year and year appended", () => {
    const yearlyTask = taskRepo.createTask({
      title: "Annual Property Insurance Review",
      repeat_rule: "yearly",
      action_date: "2026-10-28",
      due_date: "2026-11-15",
      status: "todo",
    });

    const res = taskRepo.completeTask(yearlyTask.id);
    expect(res.spawned_task?.status).toBe("triage");
    expect(res.spawned_task?.action_date).toBe("2027-10-28");
    expect(res.spawned_task?.due_date).toBe("2027-11-15");
    expect(res.spawned_task?.title).toBe("Annual Property Insurance Review [2027]");

    // Yearly with custom repeat_day_of_year (e.g. "04-15" for tax day)
    const taxTask = taskRepo.createTask({
      title: "File Taxes",
      repeat_rule: "yearly",
      repeat_day_of_year: "04-15",
      action_date: "2026-04-15",
      status: "todo",
    });
    const taxRes = taskRepo.completeTask(taxTask.id);
    expect(taxRes.spawned_task?.status).toBe("triage");
    expect(taxRes.spawned_task?.action_date).toBe("2027-04-15");
    expect(taxRes.spawned_task?.repeat_day_of_year).toBe("04-15");
    expect(taxRes.spawned_task?.title).toBe("File Taxes [2027]");
  });

  // [verifies: TASK-004/AC-TASK-004.4]
  it("newly spawned recurring task inherits base title (replacing prior tag), details, project, priority, and repeat rule", () => {
    const p = projectRepo.createProject({ name: "Platform Ops" });
    const parent = taskRepo.createTask({
      title: "Rotate API Keys [10]",
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
    expect(spawned.status).toBe("triage");
    expect(spawned.title).toBe("Rotate API Keys [11]");
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
