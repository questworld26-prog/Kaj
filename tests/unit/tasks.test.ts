import { describe, it, expect, beforeEach } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { createDatabase, initSchema } from "../../src/server/db.js";
import {
  TaskRepository,
  ProjectRepository,
} from "../../src/server/repository.js";

describe("Tasks Core Workflow & Attributes (TASK-001, TASK-002, TASK-003)", () => {
  let db: DatabaseSync;
  let taskRepo: TaskRepository;
  let projectRepo: ProjectRepository;

  beforeEach(() => {
    db = createDatabase(":memory:");
    initSchema(db);
    taskRepo = new TaskRepository(db);
    projectRepo = new ProjectRepository(db);
  });

  // [verifies: TASK-001/AC-TASK-001.1]
  it("assigns and preserves valid Kanban status across all 6 columns", () => {
    const statuses = [
      "triage",
      "todo",
      "in_progress_today",
      "in_progress_week",
      "in_progress_month",
      "tracking",
    ] as const;

    for (const s of statuses) {
      const task = taskRepo.createTask({
        title: `Task for ${s}`,
        status: s,
      });
      expect(task.status).toBe(s);
    }
  });

  // [verifies: TASK-001/AC-TASK-001.2]
  it("preserves project assignment and stores waiting-on note when moved to tracking", () => {
    const p = projectRepo.createProject({ name: "Logistics" });
    const task = taskRepo.createTask({
      title: "OLED Monitor",
      project_id: p.id,
      status: "todo",
    });

    const updated = taskRepo.updateTask(task.id, {
      status: "tracking",
      waiting_on: "DHL #8829104 · Est Oct 30",
    });

    expect(updated?.status).toBe("tracking");
    expect(updated?.project_id).toBe(p.id);
    expect(updated?.waiting_on).toBe("DHL #8829104 · Est Oct 30");
  });

  // [verifies: TASK-001/AC-TASK-001.3]
  it("moves task to done status and archives it out of active columns", () => {
    const task = taskRepo.createTask({
      title: "Review PR",
      status: "in_progress_today",
    });

    const completed = taskRepo.completeTask(task.id);
    expect(completed.completed_task.status).toBe("done");
    expect(completed.completed_task.completed_at).not.toBeNull();

    // Verify it is not in active board swimlanes
    const board = taskRepo.getBoardSwimlanes(projectRepo);
    const allActiveTasks = board.flatMap((lane) => lane.tasks);
    expect(allActiveTasks.some((t) => t.id === task.id)).toBe(false);

    // Verify it is present in completed tasks query
    const completedList = taskRepo.listCompletedTasks();
    expect(completedList.some((t) => t.id === task.id)).toBe(true);
  });

  // [verifies: TASK-001/AC-TASK-001.4]
  it("reopening a completed task restores status to todo", () => {
    const task = taskRepo.createTask({ title: "Tax filing", status: "todo" });
    taskRepo.completeTask(task.id);

    const reopened = taskRepo.reopenTask(task.id);
    expect(reopened.status).toBe("todo");
    expect(reopened.completed_at).toBeNull();

    const board = taskRepo.getBoardSwimlanes(projectRepo);
    const allActiveTasks = board.flatMap((lane) => lane.tasks);
    expect(allActiveTasks.some((t) => t.id === task.id)).toBe(true);
  });

  // [verifies: TASK-002/AC-TASK-002.1]
  it("rejects task creation and update when title is empty or only whitespace", () => {
    expect(() => taskRepo.createTask({ title: "" })).toThrow();
    expect(() => taskRepo.createTask({ title: "   " })).toThrow();

    const validTask = taskRepo.createTask({ title: "Valid Title" });
    expect(() => taskRepo.updateTask(validTask.id, { title: "" })).toThrow();
    expect(() => taskRepo.updateTask(validTask.id, { title: "   " })).toThrow();
  });

  // [verifies: TASK-002/AC-TASK-002.2]
  it("strictly validates priority values against allowed horizons", () => {
    const validPriorities = [
      "today",
      "week",
      "month",
      "quarter",
      "year",
    ] as const;
    for (const prio of validPriorities) {
      const t = taskRepo.createTask({ title: `Prio ${prio}`, priority: prio });
      expect(t.priority).toBe(prio);
    }

    // @ts-expect-error invalid priority testing
    expect(() =>
      taskRepo.createTask({ title: "Bad prio", priority: "invalid" }),
    ).toThrow();
  });

  // [verifies: TASK-002/AC-TASK-002.3]
  it("strictly validates repeat rule values", () => {
    const validRules = ["none", "weekly", "monthly", "yearly"] as const;
    for (const rule of validRules) {
      const t = taskRepo.createTask({
        title: `Repeat ${rule}`,
        repeat_rule: rule,
      });
      expect(t.repeat_rule).toBe(rule);
    }

    // @ts-expect-error invalid rule testing
    expect(() =>
      taskRepo.createTask({ title: "Bad repeat", repeat_rule: "biweekly" }),
    ).toThrow();
  });

  // [verifies: TASK-002/AC-TASK-002.4]
  it("validates action date and due date as YYYY-MM-DD or null", () => {
    const valid = taskRepo.createTask({
      title: "Valid Dates",
      action_date: "2026-10-28",
      due_date: "2026-11-04",
    });
    expect(valid.action_date).toBe("2026-10-28");
    expect(valid.due_date).toBe("2026-11-04");

    expect(() =>
      taskRepo.createTask({ title: "Bad Date", action_date: "10/28/2026" }),
    ).toThrow();
    expect(() =>
      taskRepo.createTask({ title: "Bad Date", due_date: "2026-1-1" }),
    ).toThrow();
  });

  // [verifies: TASK-002/AC-TASK-002.5]
  it("allows creating tasks without action date or without due date", () => {
    const noAction = taskRepo.createTask({
      title: "No Action Date",
      action_date: null,
      due_date: "2026-11-01",
    });
    expect(noAction.action_date).toBeNull();
    expect(noAction.due_date).toBe("2026-11-01");

    const noDue = taskRepo.createTask({
      title: "No Due Date",
      action_date: "2026-10-28",
      due_date: null,
    });
    expect(noDue.action_date).toBe("2026-10-28");
    expect(noDue.due_date).toBeNull();

    const noDates = taskRepo.createTask({ title: "No Dates at all" });
    expect(noDates.action_date).toBeNull();
    expect(noDates.due_date).toBeNull();
  });

  // [verifies: TASK-003/AC-TASK-003.1]
  it("keeps priority intact as quarter or year when task is moved to in_progress_today", () => {
    const taskQuarter = taskRepo.createTask({
      title: "Q4 Core Feature",
      priority: "quarter",
      status: "todo",
    });

    const movedToToday = taskRepo.updateTask(taskQuarter.id, {
      status: "in_progress_today",
    });

    expect(movedToToday?.status).toBe("in_progress_today");
    expect(movedToToday?.priority).toBe("quarter");

    const taskYear = taskRepo.createTask({
      title: "Annual Migration",
      priority: "year",
      status: "triage",
    });

    const movedYear = taskRepo.updateTask(taskYear.id, {
      status: "in_progress_today",
    });
    expect(movedYear?.status).toBe("in_progress_today");
    expect(movedYear?.priority).toBe("year");
  });

  // [verifies: TASK-003/AC-TASK-003.2]
  it("switching sub-columns between today, this week, and this month preserves priority", () => {
    const task = taskRepo.createTask({
      title: "Sprint Item",
      priority: "month",
      status: "in_progress_today",
    });

    const movedWeek = taskRepo.updateTask(task.id, {
      status: "in_progress_week",
    });
    expect(movedWeek?.status).toBe("in_progress_week");
    expect(movedWeek?.priority).toBe("month");

    const movedMonth = taskRepo.updateTask(task.id, {
      status: "in_progress_month",
    });
    expect(movedMonth?.status).toBe("in_progress_month");
    expect(movedMonth?.priority).toBe("month");
  });

  // [verifies: TASK-003/AC-TASK-003.3]
  it("updating priority does not alter task status or column", () => {
    const task = taskRepo.createTask({
      title: "Stable Status Task",
      status: "in_progress_today",
      priority: "today",
    });

    const updated = taskRepo.updateTask(task.id, { priority: "year" });
    expect(updated?.priority).toBe("year");
    expect(updated?.status).toBe("in_progress_today");
  });
});
