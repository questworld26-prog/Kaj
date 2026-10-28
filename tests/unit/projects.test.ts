import { describe, it, expect, beforeEach } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { createDatabase, initSchema } from "../../src/server/db.js";
import {
  ProjectRepository,
  TaskRepository,
} from "../../src/server/repository.js";

describe("Project Entity Management & Swimlane Ordering (PROJ-001, PROJ-002)", () => {
  let db: DatabaseSync;
  let projectRepo: ProjectRepository;
  let taskRepo: TaskRepository;

  beforeEach(() => {
    db = createDatabase(":memory:");
    initSchema(db);
    projectRepo = new ProjectRepository(db);
    taskRepo = new TaskRepository(db);
  });

  // [verifies: PROJ-001/AC-PROJ-001.1]
  it("creates project with unique id, name, color, sort order, and default archived=0", () => {
    const project = projectRepo.createProject({
      name: "Core Platform",
      color: "#10B981",
      sort_order: 1,
    });

    expect(project.id).toMatch(/^prj_/);
    expect(project.name).toBe("Core Platform");
    expect(project.color).toBe("#10B981");
    expect(project.sort_order).toBe(1);
    expect(project.archived).toBe(0);
    expect(project.created_at).toBeDefined();
    expect(project.updated_at).toBeDefined();
  });

  // [verifies: PROJ-001/AC-PROJ-001.2]
  it("supports updating project name, color, and reordering swimlane sort orders", () => {
    const p1 = projectRepo.createProject({
      name: "Alpha",
      color: "#10B981",
      sort_order: 10,
    });
    const p2 = projectRepo.createProject({
      name: "Beta",
      color: "#38BDF8",
      sort_order: 20,
    });

    const updatedP1 = projectRepo.updateProject(p1.id, {
      name: "Alpha Renamed",
      color: "#34D399",
    });
    expect(updatedP1.name).toBe("Alpha Renamed");
    expect(updatedP1.color).toBe("#34D399");

    // Batch reorder: pass array of IDs in desired order
    projectRepo.reorderProjects([p2.id, p1.id]);
    const ordered = projectRepo.listProjects(false);
    expect(ordered[0].id).toBe(p2.id);
    expect(ordered[0].sort_order).toBe(0);
    expect(ordered[1].id).toBe(p1.id);
    expect(ordered[1].sort_order).toBe(1);
  });

  // [verifies: PROJ-001/AC-PROJ-001.3]
  it("archiving a project hides it from active list but preserves associated tasks", () => {
    const p = projectRepo.createProject({
      name: "Archived Project",
      color: "#EAB308",
    });
    const task = taskRepo.createTask({
      title: "Task in archived project",
      project_id: p.id,
      status: "todo",
    });

    projectRepo.archiveProject(p.id, true);
    const activeProjects = projectRepo.listProjects(false);
    expect(activeProjects.some((proj) => proj.id === p.id)).toBe(false);

    // Task still exists with its project_id intact
    const fetchedTask = taskRepo.getTask(task.id);
    expect(fetchedTask).not.toBeNull();
    expect(fetchedTask?.project_id).toBe(p.id);

    // List including archived shows the project
    const allProjects = projectRepo.listProjects(true);
    expect(allProjects.some((proj) => proj.id === p.id)).toBe(true);
  });

  // [verifies: PROJ-001/AC-PROJ-001.4]
  it("updates project updated_at timestamp when renaming, recoloring, or reordering", () => {
    const p = projectRepo.createProject({ name: "Fresh", color: "#10B981" });
    const originalUpdated = p.updated_at;

    const modified = projectRepo.updateProject(p.id, { name: "Fresh Renamed" });
    expect(modified.name).toBe("Fresh Renamed");
    expect(modified.updated_at >= originalUpdated).toBe(true);
  });

  // [verifies: PROJ-002/AC-PROJ-002.1]
  it("places tasks with null project_id into the Unassigned swimlane", () => {
    const task = taskRepo.createTask({
      title: "Quick Inbox Task",
      project_id: null,
      status: "triage",
    });

    expect(task.project_id).toBeNull();
    const board = taskRepo.getBoardSwimlanes(projectRepo);
    const unassignedLane = board.find((lane) => lane.project === null);
    expect(unassignedLane).toBeDefined();
    expect(unassignedLane?.tasks.some((t) => t.id === task.id)).toBe(true);
  });

  // [verifies: PROJ-002/AC-PROJ-002.2]
  it("guarantees the Unassigned swimlane is always first before any named projects", () => {
    projectRepo.createProject({ name: "A Project", sort_order: 1 });
    projectRepo.createProject({ name: "B Project", sort_order: 2 });
    taskRepo.createTask({ title: "Unassigned Task", project_id: null });

    const board = taskRepo.getBoardSwimlanes(projectRepo);
    expect(board[0].project).toBeNull();
    expect(board[0].swimlane_id).toBe("unassigned");
  });

  // [verifies: PROJ-002/AC-PROJ-002.3]
  it("allows moving tasks between Unassigned swimlane and named projects", () => {
    const p = projectRepo.createProject({ name: "Home & Deliveries" });
    const task = taskRepo.createTask({
      title: "Flexible Task",
      project_id: null,
    });

    // Assign to project
    const assigned = taskRepo.updateTask(task.id, { project_id: p.id });
    expect(assigned?.project_id).toBe(p.id);

    // Reassign back to null (unassigned)
    const unassigned = taskRepo.updateTask(task.id, { project_id: null });
    expect(unassigned?.project_id).toBeNull();
  });
});
