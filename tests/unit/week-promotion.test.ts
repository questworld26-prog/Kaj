// [verifies: TASK-009]
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { createDatabase, initSchema } from "../../src/server/db.js";
import {
  TaskRepository,
  ProjectRepository,
} from "../../src/server/repository.js";
import {
  formatLocalDateYMD,
  getMondayWeekStartYMD,
  isDateInCurrentMondayWeek,
} from "../../src/shared/types.js";

describe("Automatic Triage-to-Todo Promotion for Current Monday-Start Week (TASK-009)", () => {
  let db: DatabaseSync;
  let taskRepo: TaskRepository;
  let projectRepo: ProjectRepository;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 14, 12, 0, 0));
    db = createDatabase(":memory:");
    initSchema(db);
    taskRepo = new TaskRepository(db);
    projectRepo = new ProjectRepository(db);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // [verifies: TASK-009/AC-TASK-009.1]
  it("treats Monday as the start of the week and Sunday as the end of the week", () => {
    // 2026-11-09 (Mon) .. 2026-11-15 (Sun)
    expect(getMondayWeekStartYMD("2026-11-09")).toBe("2026-11-09");
    expect(getMondayWeekStartYMD("2026-11-13")).toBe("2026-11-09");
    expect(getMondayWeekStartYMD("2026-11-15")).toBe("2026-11-09");
    // 2026-11-16 (Mon) starts the next week
    expect(getMondayWeekStartYMD("2026-11-16")).toBe("2026-11-16");

    // Sunday belongs to Mon-Sun week, NOT next Monday's week
    expect(isDateInCurrentMondayWeek("2026-11-15", "2026-11-13")).toBe(true);
    expect(isDateInCurrentMondayWeek("2026-11-16", "2026-11-15")).toBe(false);
    expect(isDateInCurrentMondayWeek("2026-11-15", "2026-11-16")).toBe(false);

    // Cross-year boundary: Mon Dec 29 2025 .. Sun Jan 4 2026
    expect(isDateInCurrentMondayWeek("2026-01-04", "2025-12-29")).toBe(true);
    expect(isDateInCurrentMondayWeek("2026-01-05", "2025-12-29")).toBe(false);
  });

  // [verifies: TASK-009/AC-TASK-009.2]
  it("moves non-deleted triage tasks with action_date in the current Monday-to-Sunday week to todo without altering priority, project, or dates", () => {
    const project = projectRepo.createProject({ name: "Platform Roadmap" });
    // Simulated Wednesday 2026-11-18 (week 2026-11-16 Mon .. 2026-11-22 Sun)
    const simulatedWednesday = "2026-11-18";

    const mondayTask = taskRepo.createTask({
      title: "Monday Triage Item",
      status: "triage",
      priority: "quarter",
      project_id: project.id,
      action_date: "2026-11-16",
      due_date: "2026-11-28",
    });

    const sundayTask = taskRepo.createTask({
      title: "Sunday Triage Item",
      status: "triage",
      priority: "month",
      project_id: project.id,
      action_date: "2026-11-22",
    });

    const promoted = taskRepo.promoteThisWeekTriageTasks(simulatedWednesday);
    expect(promoted.map((t) => t.id).sort()).toEqual(
      [mondayTask.id, sundayTask.id].sort(),
    );

    const updatedMon = taskRepo.getTask(mondayTask.id)!;
    expect(updatedMon.status).toBe("todo");
    expect(updatedMon.priority).toBe("quarter");
    expect(updatedMon.project_id).toBe(project.id);
    expect(updatedMon.action_date).toBe("2026-11-16");
    expect(updatedMon.due_date).toBe("2026-11-28");

    expect(taskRepo.getTask(sundayTask.id)!.status).toBe("todo");
  });

  // [verifies: TASK-009/AC-TASK-009.3]
  it("promotes triage tasks to todo immediately on createTask and updateTask when action_date falls in this week, while promoting today action_date further to in_progress_today", () => {
    const todayStr = formatLocalDateYMD();
    const mondayStr = getMondayWeekStartYMD(todayStr);
    // Pick a day in this Mon-Sun week that is guaranteed != today
    const [my, mm, md] = mondayStr.split("-").map(Number);
    const otherWeekDayDt = new Date(Date.UTC(my, mm - 1, md));
    const offset = mondayStr === todayStr ? 1 : 0;
    otherWeekDayDt.setUTCDate(otherWeekDayDt.getUTCDate() + offset);
    const otherDayThisWeek = `${otherWeekDayDt.getUTCFullYear()}-${String(otherWeekDayDt.getUTCMonth() + 1).padStart(2, "0")}-${String(otherWeekDayDt.getUTCDate()).padStart(2, "0")}`;

    const createdThisWeek = taskRepo.createTask({
      title: "Created Triage This Week",
      status: "triage",
      action_date: otherDayThisWeek,
    });
    expect(createdThisWeek.status).toBe("todo");

    const futureTriage = taskRepo.createTask({
      title: "Moved Into This Week",
      status: "triage",
      action_date: "2099-12-31",
    });
    expect(futureTriage.status).toBe("triage");

    const updatedThisWeek = taskRepo.updateTask(futureTriage.id, {
      action_date: otherDayThisWeek,
    })!;
    expect(updatedThisWeek.status).toBe("todo");

    const createdToday = taskRepo.createTask({
      title: "Created Triage Action Today",
      status: "triage",
      action_date: todayStr,
    });
    expect(createdToday.status).toBe("in_progress_today");
  });

  // [verifies: TASK-009/AC-TASK-009.4]
  it("excludes tasks outside triage, soft-deleted tasks, dateless tasks, and tasks in past or future Monday-to-Sunday weeks", () => {
    const simulatedSunday = "2027-01-24"; // End of week 2027-01-18 (Mon) .. 2027-01-24 (Sun)

    const pastSunday = taskRepo.createTask({
      title: "Last Week Sunday Triage",
      status: "triage",
      action_date: "2027-01-17",
    });
    const nextMonday = taskRepo.createTask({
      title: "Next Week Monday Triage",
      status: "triage",
      action_date: "2027-01-25",
    });
    const datelessTriage = taskRepo.createTask({
      title: "Undated Triage",
      status: "triage",
      action_date: null,
    });
    const alreadyWeek = taskRepo.createTask({
      title: "Already In Progress Week",
      status: "in_progress_week",
      action_date: "2027-01-20",
    });
    const deletedTriage = taskRepo.createTask({
      title: "Deleted This Week Triage",
      status: "triage",
      action_date: "2027-01-20",
    });
    taskRepo.deleteTask(deletedTriage.id, true);

    const promoted = taskRepo.promoteThisWeekTriageTasks(simulatedSunday);
    expect(promoted).toEqual([]);

    expect(taskRepo.getTask(pastSunday.id)!.status).toBe("triage");
    expect(taskRepo.getTask(nextMonday.id)!.status).toBe("triage");
    expect(taskRepo.getTask(datelessTriage.id)!.status).toBe("triage");
    expect(taskRepo.getTask(alreadyWeek.id)!.status).toBe("in_progress_week");
  });
});
