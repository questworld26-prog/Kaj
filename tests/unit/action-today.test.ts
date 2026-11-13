// [verifies: TASK-008]
import { describe, it, expect, beforeEach } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { createDatabase, initSchema } from "../../src/server/db.js";
import {
  TaskRepository,
  ProjectRepository,
} from "../../src/server/repository.js";
import { formatLocalDateYMD } from "../../src/shared/types.js";

describe("Automatic In-Progress-Today Promotion for Action Date Today (TASK-008)", () => {
  let db: DatabaseSync;
  let taskRepo: TaskRepository;
  let projectRepo: ProjectRepository;

  beforeEach(() => {
    db = createDatabase(":memory:");
    initSchema(db);
    taskRepo = new TaskRepository(db);
    projectRepo = new ProjectRepository(db);
  });

  // [verifies: TASK-008/AC-TASK-008.1]
  it("moves non-completed active tasks with action_date matching today from triage, todo, week, and month into in_progress_today without altering priority, project, or dates", () => {
    const project = projectRepo.createProject({ name: "Launch Ops" });
    const simulatedToday = "2026-11-18";

    const fromTriage = taskRepo.createTask({
      title: "Triage Action Today",
      status: "triage",
      priority: "quarter",
      project_id: project.id,
      action_date: simulatedToday,
      due_date: "2026-11-25",
    });
    const fromTodo = taskRepo.createTask({
      title: "Todo Action Today",
      status: "todo",
      priority: "month",
      project_id: project.id,
      action_date: simulatedToday,
    });
    const fromWeek = taskRepo.createTask({
      title: "Week Action Today",
      status: "in_progress_week",
      priority: "week",
      action_date: simulatedToday,
    });
    const fromMonth = taskRepo.createTask({
      title: "Month Action Today",
      status: "in_progress_month",
      priority: "month",
      action_date: simulatedToday,
    });

    const promoted = taskRepo.promoteTodayActionDateTasks(simulatedToday);

    expect(promoted.map((t) => t.id).sort()).toEqual(
      [fromTriage.id, fromTodo.id, fromWeek.id, fromMonth.id].sort(),
    );

    const updatedTriage = taskRepo.getTask(fromTriage.id)!;
    expect(updatedTriage.status).toBe("in_progress_today");
    expect(updatedTriage.priority).toBe("quarter");
    expect(updatedTriage.project_id).toBe(project.id);
    expect(updatedTriage.action_date).toBe(simulatedToday);
    expect(updatedTriage.due_date).toBe("2026-11-25");

    expect(taskRepo.getTask(fromTodo.id)!.status).toBe("in_progress_today");
    expect(taskRepo.getTask(fromWeek.id)!.status).toBe("in_progress_today");
    expect(taskRepo.getTask(fromMonth.id)!.status).toBe("in_progress_today");
  });

  // [verifies: TASK-008/AC-TASK-008.2]
  it("automatically sets status to in_progress_today on createTask and updateTask when action_date equals local today", () => {
    const todayStr = formatLocalDateYMD();

    const created = taskRepo.createTask({
      title: "Created With Today Action Date",
      status: "todo",
      action_date: todayStr,
    });
    expect(created.status).toBe("in_progress_today");

    const futureTask = taskRepo.createTask({
      title: "Rescheduled To Today",
      status: "triage",
      action_date: "2099-12-31",
    });
    expect(futureTask.status).toBe("triage");

    const updated = taskRepo.updateTask(futureTask.id, {
      action_date: todayStr,
    })!;
    expect(updated.status).toBe("in_progress_today");
  });

  // [verifies: TASK-008/AC-TASK-008.3]
  it("excludes done tasks, soft-deleted tasks, tasks already in in_progress_today, and tasks in tracking", () => {
    const simulatedToday = "2026-11-18";

    const doneTask = taskRepo.createTask({
      title: "Already Completed Today",
      status: "done",
      action_date: simulatedToday,
    });
    const trackingTask = taskRepo.createTask({
      title: "Waiting On Delivery Today",
      status: "tracking",
      waiting_on: "Courier",
      action_date: simulatedToday,
    });
    const alreadyToday = taskRepo.createTask({
      title: "Already In Progress Today",
      status: "in_progress_today",
      action_date: simulatedToday,
    });
    const deletedTask = taskRepo.createTask({
      title: "Soft Deleted Today Task",
      status: "todo",
      action_date: simulatedToday,
    });
    taskRepo.deleteTask(deletedTask.id, true);

    const otherDayTask = taskRepo.createTask({
      title: "Tomorrow Task",
      status: "todo",
      action_date: "2026-11-19",
    });

    const promoted = taskRepo.promoteTodayActionDateTasks(simulatedToday);
    expect(promoted).toHaveLength(0);

    expect(taskRepo.getTask(doneTask.id)!.status).toBe("done");
    expect(taskRepo.getTask(trackingTask.id)!.status).toBe("tracking");
    expect(taskRepo.getTask(alreadyToday.id)!.status).toBe(
      "in_progress_today",
    );
    expect(taskRepo.getTask(otherDayTask.id)!.status).toBe("todo");
  });

  // [verifies: TASK-008/AC-TASK-008.4]
  it("evaluates recurring triage-to-todo promotion first and then promotes matching today action_date recurring task to in_progress_today", () => {
    const simulatedToday = "2026-11-18"; // Wednesday of ISO Week 47

    const recurringToday = taskRepo.createTask({
      title: "Weekly Standup Notes [47]",
      status: "triage",
      repeat_rule: "weekly",
      repeat_day_of_week: 3,
      action_date: simulatedToday,
    });

    const recurrencePromoted =
      taskRepo.promoteDueRecurringTasks(simulatedToday);
    expect(recurrencePromoted.map((t) => t.id)).toContain(recurringToday.id);
    expect(taskRepo.getTask(recurringToday.id)!.status).toBe("todo");

    const actionTodayPromoted =
      taskRepo.promoteTodayActionDateTasks(simulatedToday);
    expect(actionTodayPromoted.map((t) => t.id)).toContain(recurringToday.id);
    expect(taskRepo.getTask(recurringToday.id)!.status).toBe(
      "in_progress_today",
    );
  });
});
