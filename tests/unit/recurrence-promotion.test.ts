// [verifies: TASK-007]
import { describe, it, expect, beforeEach } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { createDatabase, initSchema } from "../../src/server/db.js";
import {
  TaskRepository,
  ProjectRepository,
} from "../../src/server/repository.js";

describe("Automatic Triage-to-Todo Recurrence Promotion (TASK-007)", () => {
  let db: DatabaseSync;
  let taskRepo: TaskRepository;
  let projectRepo: ProjectRepository;

  beforeEach(() => {
    db = createDatabase(":memory:");
    initSchema(db);
    taskRepo = new TaskRepository(db);
    projectRepo = new ProjectRepository(db);
  });

  // [verifies: TASK-007/AC-TASK-007.1]
  it("moves weekly recurring tasks in triage to todo when today's ISO week matches action or due date without altering priority or project", () => {
    const project = projectRepo.createProject({ name: "Engineering Ops" });

    // Task scheduled for Wednesday of Week 47 (2026-11-18)
    const weeklyByAction = taskRepo.createTask({
      title: "Weekly Server Check [47]",
      status: "triage",
      priority: "quarter",
      project_id: project.id,
      repeat_rule: "weekly",
      action_date: "2026-11-18",
    });

    // Task scheduled ONLY via due_date on Friday of Week 47 (2026-11-20)
    const weeklyByDue = taskRepo.createTask({
      title: "Weekly Expense Audit [47]",
      status: "triage",
      priority: "month",
      project_id: project.id,
      repeat_rule: "weekly",
      action_date: null,
      due_date: "2026-11-20",
    });

    // Run promotion on Monday of Week 47 (2026-11-16)
    const promoted = taskRepo.promoteDueRecurringTasks("2026-11-16");

    expect(promoted.map((t) => t.id).sort()).toEqual(
      [weeklyByAction.id, weeklyByDue.id].sort(),
    );

    const fetchedAction = taskRepo.getTask(weeklyByAction.id)!;
    expect(fetchedAction.status).toBe("todo");
    expect(fetchedAction.priority).toBe("quarter");
    expect(fetchedAction.project_id).toBe(project.id);

    const fetchedDue = taskRepo.getTask(weeklyByDue.id)!;
    expect(fetchedDue.status).toBe("todo");
    expect(fetchedDue.priority).toBe("month");
    expect(fetchedDue.project_id).toBe(project.id);
  });

  // [verifies: TASK-007/AC-TASK-007.2]
  it("moves monthly and yearly recurring tasks in triage to todo when today's month or ISO week matches", () => {
    const project = projectRepo.createProject({ name: "Finance" });

    // Monthly task on Nov 28 2026 -> checked on Nov 13 2026 (same YYYY-MM)
    const monthlyTask = taskRepo.createTask({
      title: "Pay Internet Bill [11]",
      status: "triage",
      priority: "year",
      project_id: project.id,
      repeat_rule: "monthly",
      action_date: "2026-11-28",
    });

    // Yearly task on Nov 25 2026 -> checked on Nov 13 2026 (same YYYY-MM)
    const yearlyTask = taskRepo.createTask({
      title: "Annual Domain Renewal [2026]",
      status: "triage",
      priority: "quarter",
      project_id: project.id,
      repeat_rule: "yearly",
      action_date: "2026-11-25",
    });

    // Monthly task on Dec 2 2026 (Wednesday, Week 49) -> checked on Nov 30 2026 (Monday, Week 49)
    const crossMonthWeekTask = taskRepo.createTask({
      title: "Monthly Cloud Budget [12]",
      status: "triage",
      priority: "week",
      repeat_rule: "monthly",
      action_date: "2026-12-02",
    });

    const firstPass = taskRepo.promoteDueRecurringTasks("2026-11-13");
    expect(firstPass.map((t) => t.id).sort()).toEqual(
      [monthlyTask.id, yearlyTask.id].sort(),
    );

    expect(taskRepo.getTask(monthlyTask.id)!.status).toBe("todo");
    expect(taskRepo.getTask(monthlyTask.id)!.priority).toBe("year");
    expect(taskRepo.getTask(yearlyTask.id)!.status).toBe("todo");
    expect(taskRepo.getTask(yearlyTask.id)!.project_id).toBe(project.id);
    // Dec 2 task is not yet in Nov 13's month or week
    expect(taskRepo.getTask(crossMonthWeekTask.id)!.status).toBe("triage");

    // Cross-month week match on Mon Nov 30 2026 (2026-W49)
    const secondPass = taskRepo.promoteDueRecurringTasks("2026-11-30");
    expect(secondPass.map((t) => t.id)).toEqual([crossMonthWeekTask.id]);
    expect(taskRepo.getTask(crossMonthWeekTask.id)!.status).toBe("todo");
  });

  // [verifies: TASK-007/AC-TASK-007.3]
  it("keeps future-period recurring tasks in triage until their matching week or month begins", () => {
    // Weekly task 2 weeks ahead in the SAME month (2026-11-27 is Week 48; today 2026-11-13 is Week 46)
    const futureWeeklySameMonth = taskRepo.createTask({
      title: "Future Weekly [48]",
      status: "triage",
      repeat_rule: "weekly",
      action_date: "2026-11-27",
    });

    // Monthly task next month (2026-12-13)
    const futureMonthly = taskRepo.createTask({
      title: "Future Monthly [12]",
      status: "triage",
      repeat_rule: "monthly",
      action_date: "2026-12-13",
    });

    // Yearly task same month NEXT year (2027-11-13)
    const futureYearly = taskRepo.createTask({
      title: "Future Yearly [2027]",
      status: "triage",
      repeat_rule: "yearly",
      action_date: "2027-11-13",
    });

    const promoted = taskRepo.promoteDueRecurringTasks("2026-11-13");
    expect(promoted).toEqual([]);

    expect(taskRepo.getTask(futureWeeklySameMonth.id)!.status).toBe("triage");
    expect(taskRepo.getTask(futureMonthly.id)!.status).toBe("triage");
    expect(taskRepo.getTask(futureYearly.id)!.status).toBe("triage");
  });

  // [verifies: TASK-007/AC-TASK-007.4]
  it("excludes non-recurring tasks, soft-deleted tasks, dateless recurring tasks, and tasks outside triage", () => {
    // 1. Non-recurring task in triage scheduled for today
    const nonRecurring = taskRepo.createTask({
      title: "One-off Triage Item",
      status: "triage",
      repeat_rule: "none",
      action_date: "2026-11-13",
    });

    // 2. Soft-deleted recurring task in triage matching today
    const deletedRecurring = taskRepo.createTask({
      title: "Deleted Recurring [46]",
      status: "triage",
      repeat_rule: "weekly",
      action_date: "2026-11-13",
    });
    taskRepo.deleteTask(deletedRecurring.id);

    // 3. Recurring task already in in_progress_today / tracking
    const activeInProgress = taskRepo.createTask({
      title: "Already Working [46]",
      status: "in_progress_today",
      repeat_rule: "weekly",
      action_date: "2026-11-13",
    });

    // 4. Dateless recurring task in triage
    const datelessRecurring = taskRepo.createTask({
      title: "Undated Recurring",
      status: "triage",
      repeat_rule: "monthly",
      action_date: null,
      due_date: null,
    });

    const promoted = taskRepo.promoteDueRecurringTasks("2026-11-13");
    expect(promoted).toEqual([]);

    expect(taskRepo.getTask(nonRecurring.id)!.status).toBe("triage");
    expect(taskRepo.getTask(activeInProgress.id)!.status).toBe("in_progress_today");
    expect(taskRepo.getTask(datelessRecurring.id)!.status).toBe("triage");

    const deletedRow = db
      .prepare("SELECT status FROM tasks WHERE id = ?")
      .get(deletedRecurring.id) as { status: string };
    expect(deletedRow.status).toBe("triage");
  });
});

