import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import fs from "node:fs";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { streamSSE } from "hono/streaming";
import { serveStatic } from "@hono/node-server/serve-static";
import { TaskRepository, ProjectRepository } from "./repository.js";
import { EventBus } from "./events.js";
import { createMcpServer } from "../mcp/server.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  CreateTaskInputSchema,
  UpdateTaskInputSchema,
  CreateProjectInputSchema,
  UpdateProjectInputSchema,
} from "../shared/types.js";

export interface AppOptions {
  db: DatabaseSync;
  eventBus: EventBus;
}

function isLoopbackOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    const host = url.hostname;
    return (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "[::1]" ||
      host.endsWith(".localhost")
    );
  } catch {
    return false;
  }
}

// [spec: MCP-002]
// [spec: MCP-003]
export function createApp(options: AppOptions): Hono {
  const { db, eventBus } = options;
  const taskRepo = new TaskRepository(db);
  const projectRepo = new ProjectRepository(db);

  const app = new Hono();

  // Loopback Origin Guard (AC-MCP-003.4)
  app.use("*", async (c, next) => {
    const origin = c.req.header("origin");
    if (origin && !isLoopbackOrigin(origin)) {
      return c.text("Forbidden: Unauthorized cross-origin request", 403);
    }
    await next();
  });

  // Enable CORS strictly for loopback origins
  app.use(
    "*",
    cors({
      origin: (origin) => (origin && isLoopbackOrigin(origin) ? origin : null),
      allowMethods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
      allowHeaders: ["Content-Type", "Authorization", "Accept"],
    }),
  );

  // Content-Type Guard for mutating JSON requests with bodies
  app.use("/api/*", async (c, next) => {
    const method = c.req.method.toUpperCase();
    if (["POST", "PATCH", "PUT"].includes(method)) {
      const contentType = c.req.header("content-type") || "";
      const contentLength = c.req.header("content-length");
      const transferEncoding = c.req.header("transfer-encoding");
      if (
        (contentLength && contentLength !== "0") ||
        transferEncoding ||
        contentType
      ) {
        if (!contentType.toLowerCase().includes("application/json")) {
          return c.json(
            { error: "Unsupported Media Type: expected application/json" },
            415,
          );
        }
      }
    }
    await next();
  });

  // Health check
  app.get("/api/health", (c) => {
    return c.json({
      status: "ok",
      service: "kaj",
      version: "1.0.1",
      uptime: process.uptime(),
      memory_rss_mb: Math.round(process.memoryUsage().rss / (1024 * 1024)),
      timestamp: new Date().toISOString(),
    });
  });

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
      sql += " AND (title LIKE ? OR details LIKE ? OR waiting_on LIKE ?)";
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
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
      const updated = taskRepo.updateTask(id, validated);
      if (!updated) {
        return c.json({ error: "Task not found" }, 404);
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
      const res = taskRepo.completeTask(id);
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
  app.get("/api/board", (c) => {
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

  // REST: Unscheduled tasks
  app.get("/api/unscheduled", (c) => {
    const unscheduled = taskRepo.listUnscheduledTasks();
    return c.json(unscheduled);
  });

  // SSE: Live event broadcast for UI clients
  app.get("/events", (c) => {
    return streamSSE(c, async (stream) => {
      const unsubscribe = eventBus.subscribe(async (evt) => {
        try {
          await stream.writeSSE({
            event: "mutation",
            data: JSON.stringify(evt),
          });
        } catch {
          // Client disconnected
        }
      });

      // Send initial ping
      await stream.writeSSE({
        event: "connected",
        data: JSON.stringify({ time: new Date().toISOString() }),
      });

      // Handle stream abort
      stream.onAbort(() => {
        unsubscribe();
      });

      // Keep alive loop
      while (!stream.aborted) {
        await stream.sleep(15000);
        await stream
          .writeSSE({ event: "ping", data: "keepalive" })
          .catch(() => {});
      }
    });
  });

  // MCP Streamable HTTP endpoint (POST, GET, DELETE /mcp)
  app.all("/mcp", async (c) => {
    // DNS rebinding guard (AC-MCP-003.4)
    const origin = c.req.header("origin");
    if (origin && !isLoopbackOrigin(origin)) {
      return c.text(
        "Forbidden: Unauthorized cross-origin request to local MCP server",
        403,
      );
    }

    const mcpServer = createMcpServer({ db, eventBus });
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // stateless HTTP per spec
    });

    await mcpServer.connect(transport);

    // Normalize accept header so any MCP client works seamlessly
    const headers = new Headers(c.req.raw.headers);
    if (!headers.has("accept") || headers.get("accept") === "*/*") {
      headers.set(
        "accept",
        "application/json, text/event-stream; charset=utf-8",
      );
    }

    const normalizedReq = new Request(c.req.raw.url, {
      method: c.req.raw.method,
      headers,
      body: c.req.raw.body,
      // @ts-expect-error duplex required in Node fetch for streaming
      duplex: "half",
    });

    // Access internal webStandardTransport for Streamable HTTP
    const response = await (
      transport as unknown as {
        _webStandardTransport: {
          handleRequest: (req: Request) => Promise<Response>;
        };
      }
    )._webStandardTransport.handleRequest(normalizedReq);
    return response;
  });

  // Explicit 404 handler for unknown /api/* endpoints
  app.all("/api/*", (c) => c.json({ error: "Endpoint not found" }, 404));

  // [spec: UI-001]
  // [spec: UI-002]
  // Serve static UI assets if built
  const clientDist = path.resolve("./dist/client");
  if (fs.existsSync(clientDist)) {
    app.use("/*", serveStatic({ root: "./dist/client" }));
    app.get("*", serveStatic({ path: "./dist/client/index.html" }));
  }

  return app;
}
