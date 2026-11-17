// [spec: PROJ-001]
// [spec: PROJ-002]
// [spec: TASK-001]
// [spec: TASK-002]
// [spec: TASK-003]
// [spec: TASK-004]
// [spec: TASK-005]
// [spec: TASK-006]
// [spec: TASK-007]
// [spec: TASK-008]
// [spec: TASK-009]
// [spec: TASK-010]
import type { DatabaseSync } from "node:sqlite";
import type { Hono } from "hono";
import type { EventBus } from "../events.js";
import type { ProjectRepository, TaskRepository } from "../repository.js";
import {
  TelegramBotService,
  loadTelegramConfig,
  resolveDefaultNonVipCreatorName,
} from "../telegram.js";
import {
  CreateProjectInputSchema,
  CreateTaskInputSchema,
  UpdateProjectInputSchema,
  UpdateTaskInputSchema,
} from "../../shared/types.js";

export interface TaskRoutesContext {
  db: DatabaseSync;
  eventBus: EventBus;
  taskRepo: TaskRepository;
  projectRepo: ProjectRepository;
  telegramBot?: TelegramBotService;
}

export function registerTaskRoutes(app: Hono, ctx: TaskRoutesContext): void {
  const { db, eventBus, taskRepo, projectRepo, telegramBot } = ctx;

  // REST: Projects
  app.get("/api/projects", (c) => {
    const includeArchived = c.req.query("include_archived") === "true";
    const projects = projectRepo.listProjects(includeArchived);
    return c.json(projects);
  });

  app.post("/api/projects", async (c) => {
    try {
      const body = await c.req.json();
      const validated = CreateProjectInputSchema.parse(body);
      const project = projectRepo.createProject(validated);
      eventBus.broadcast({
        type: "project",
        action: "created",
        id: project.id,
        data: project,
      });
      return c.json(project, 201);
    } catch (err) {
      return c.json({ error: (err as Error).message }, 400);
    }
  });

  app.patch("/api/projects/:id", async (c) => {
    try {
      const id = c.req.param("id");
      const body = await c.req.json();
      const validated = UpdateProjectInputSchema.parse(body);
      const updated = projectRepo.updateProject(id, validated);
      eventBus.broadcast({
        type: "project",
        action: "updated",
        id: updated.id,
        data: updated,
      });
      return c.json(updated);
    } catch (err) {
      return c.json({ error: (err as Error).message }, 400);
    }
  });

  app.post("/api/projects/reorder", async (c) => {
    try {
      const body = await c.req.json();
      const { project_ids } = body as { project_ids: string[] };
      if (!Array.isArray(project_ids)) {
        return c.json({ error: "project_ids must be an array" }, 400);
      }
      projectRepo.reorderProjects(project_ids);
      eventBus.broadcast({ type: "project", action: "reordered", id: "all" });
      return c.json({ success: true });
    } catch (err) {
      return c.json({ error: (err as Error).message }, 400);
    }
  });

  // REST: Tasks
  app.get("/api/tasks", (c) => {
    const includeCompleted = c.req.query("include_completed") === "true";
    const status = c.req.query("status");
    const projectId = c.req.query("project_id");
    const search = c.req.query("search");

    type SQLBinding = string | number | bigint | null | Uint8Array;
    let sql = "SELECT * FROM tasks WHERE deleted_at IS NULL";
    const params: SQLBinding[] = [];

    if (!includeCompleted) {
      sql += " AND status != ?";
      params.push("done");
    }
    if (status) {
      sql += " AND status = ?";
      params.push(status);
    }
    if (projectId !== undefined) {
      if (projectId === "null" || projectId === "") {
        sql += " AND project_id IS NULL";
      } else {
        sql += " AND project_id = ?";
        params.push(projectId);
      }
    }
    if (search) {
      sql +=
        " AND (title LIKE ? OR details LIKE ? OR waiting_on LIKE ? OR created_by LIKE ?)";
      params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }

    sql += " ORDER BY sort_order ASC, created_at DESC";
    const tasks = db.prepare(sql).all(...params);
    return c.json(tasks);
  });

  app.post("/api/tasks", async (c) => {
    try {
      const body = await c.req.json();
      const validated = CreateTaskInputSchema.parse(body);
      const task = taskRepo.createTask(validated);
      eventBus.broadcast({
        type: "task",
        action: "created",
        id: task.id,
        data: task,
      });
      return c.json(task, 201);
    } catch (err) {
      return c.json({ error: (err as Error).message }, 400);
    }
  });

  // [spec: TASK-006]
  app.post("/api/tasks/reorder", async (c) => {
    try {
      const body = await c.req.json();
      const { task_ids } = body as { task_ids: string[] };
      if (!Array.isArray(task_ids)) {
        return c.json({ error: "task_ids must be an array" }, 400);
      }
      taskRepo.reorderTasks(task_ids);
      eventBus.broadcast({ type: "task", action: "reordered", id: "all" });
      return c.json({ success: true });
    } catch (err) {
      return c.json({ error: (err as Error).message }, 400);
    }
  });

  app.get("/api/tasks/:id", (c) => {
    const id = c.req.param("id");
    const task = taskRepo.getTask(id);
    if (!task) {
      return c.json({ error: "Task not found" }, 404);
    }
    return c.json(task);
  });

  app.patch("/api/tasks/:id", async (c) => {
    try {
      const id = c.req.param("id");
      const body = await c.req.json();
      const validated = UpdateTaskInputSchema.parse(body);
      const existing = taskRepo.getTask(id);
      const updated = taskRepo.updateTask(id, validated);
      if (!updated) {
        return c.json({ error: "Task not found" }, 404);
      }
      if (existing && existing.status !== "done" && updated.status === "done") {
        eventBus.broadcast({
          type: "task",
          action: "completed",
          id: updated.id,
          data: { completed_task: updated, spawned_task: null },
        });
      }

      const wasUnassignedTriage =
        existing &&
        existing.status === "triage" &&
        (!existing.project_id || existing.project_id === "");
      const isNowOutOrAssigned =
        updated &&
        (updated.status !== "triage" ||
          (updated.project_id !== null &&
            updated.project_id !== undefined &&
            updated.project_id !== ""));

      if (wasUnassignedTriage && isNowOutOrAssigned) {
        eventBus.broadcast({
          type: "task",
          action: "triaged",
          id: updated.id,
          data: { task: updated, previous: existing },
        });
      }

      eventBus.broadcast({
        type: "task",
        action: "updated",
        id: updated.id,
        data: updated,
      });

      return c.json(updated);
    } catch (err) {
      return c.json({ error: (err as Error).message }, 400);
    }
  });

  app.post("/api/tasks/:id/complete", (c) => {
    try {
      const id = c.req.param("id");
      const existing = taskRepo.getTask(id);
      const res = taskRepo.completeTask(id);
      const wasUnassignedTriage =
        existing &&
        existing.status === "triage" &&
        (!existing.project_id || existing.project_id === "");
      if (wasUnassignedTriage) {
        eventBus.broadcast({
          type: "task",
          action: "triaged",
          id,
          data: { task: res.completed_task, previous: existing },
        });
      }
      eventBus.broadcast({ type: "task", action: "completed", id, data: res });
      return c.json(res);
    } catch (err) {
      return c.json({ error: (err as Error).message }, 400);
    }
  });

  app.post("/api/tasks/:id/reopen", (c) => {
    try {
      const id = c.req.param("id");
      const task = taskRepo.reopenTask(id);
      if (!task) {
        return c.json({ error: "Task not found" }, 404);
      }
      eventBus.broadcast({ type: "task", action: "reopened", id, data: task });
      return c.json(task);
    } catch (err) {
      return c.json({ error: (err as Error).message }, 400);
    }
  });

  app.delete("/api/tasks/:id", (c) => {
    const id = c.req.param("id");
    const soft = c.req.query("soft") !== "false";
    const ok = taskRepo.deleteTask(id, soft);
    if (!ok) {
      return c.json({ error: "Task not found" }, 404);
    }
    eventBus.broadcast({ type: "task", action: "deleted", id });
    return c.json({ success: true });
  });

  app.post("/api/tasks/:id/restore", (c) => {
    const id = c.req.param("id");
    const restored = taskRepo.restoreTask(id);
    if (!restored) {
      return c.json({ error: "Task not found" }, 404);
    }
    eventBus.broadcast({
      type: "task",
      action: "restored",
      id: restored.id,
      data: restored,
    });
    return c.json(restored);
  });

  // REST: Board swimlanes
  // [spec: TASK-007]
  // [spec: TASK-008]
  // [spec: TASK-009]
  // [spec: TASK-011]
  app.get("/api/board", (c) => {
    const promoted = taskRepo.runScheduledPromotions();
    for (const task of promoted) {
      eventBus.broadcast({
        type: "task",
        action: "updated",
        id: task.id,
        data: task,
      });
    }
    const swimlanes = taskRepo.getBoardSwimlanes(projectRepo);
    return c.json(swimlanes);
  });

  // REST: Calendar events
  app.get("/api/calendar", (c) => {
    const start = c.req.query("start");
    const end = c.req.query("end");
    if (!start || !end) {
      return c.json(
        { error: "start and end query parameters (YYYY-MM-DD) are required" },
        400,
      );
    }
    const events = taskRepo.queryCalendarEvents(start, end);
    return c.json(events);
  });

  // REST: Completed archive
  app.get("/api/completed", (c) => {
    const completed = taskRepo.listCompletedTasks();
    return c.json(completed);
  });

  // [spec: TASK-010]
  // [spec: UI-012]
  // REST: Combined completed telemetry (live done + purged snapshots)
  app.get("/api/telemetry", (c) => {
    const cfg = telegramBot ? telegramBot.getConfig() : loadTelegramConfig();
    const defaultCreator = resolveDefaultNonVipCreatorName(cfg);
    return c.json(taskRepo.getTelemetrySummary(undefined, defaultCreator));
  });

  // [spec: TASK-010]
  // REST: Manual retention purge trigger
  app.post("/api/completed/purge", (c) => {
    const result = taskRepo.purgeExpiredDoneTasks();
    if (result.purged_count > 0) {
      eventBus.broadcast({
        type: "task",
        action: "purged",
        id: "retention",
        data: result,
      });
    }
    return c.json(result);
  });

  // REST: Unscheduled tasks
  app.get("/api/unscheduled", (c) => {
    const unscheduled = taskRepo.listUnscheduledTasks();
    return c.json(unscheduled);
  });
}
