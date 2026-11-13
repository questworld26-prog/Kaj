import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import fs from "node:fs";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { streamSSE } from "hono/streaming";
import { serveStatic } from "@hono/node-server/serve-static";
import { TaskRepository, ProjectRepository } from "./repository.js";
import { EventBus } from "./events.js";
import {
  TelegramBotService,
  loadTelegramConfig,
  saveTelegramConfig,
} from "./telegram.js";
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
  telegramBot?: TelegramBotService;
}

export function parseHostname(rawHost: string): string {
  try {
    const url = new URL(
      rawHost.includes("://") ? rawHost : `http://${rawHost}`,
    );
    return url.hostname.toLowerCase();
  } catch {
    return rawHost.split(":")[0].toLowerCase();
  }
}

// [spec: MCP-003]
export function isAllowedHost(hostHeader?: string): boolean {
  if (!hostHeader) return true;
  const host = parseHostname(hostHeader);

  // 1. Loopback
  if (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "::1" ||
    host === "[::1]" ||
    host.endsWith(".localhost")
  ) {
    return true;
  }

  // 2. Local mDNS / Bonjour (.local)
  if (host === "local" || host.endsWith(".local")) {
    return true;
  }

  // 3. Private LAN IPv4 ranges (RFC 1918 & Link-Local)
  if (/^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
  if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
  if (/^169\.254\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
  const match172 = /^172\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/.exec(host);
  if (match172) {
    const secondOctet = parseInt(match172[1], 10);
    if (secondOctet >= 16 && secondOctet <= 31) return true;
  }

  // 4. Private LAN IPv6 ranges (Link-Local fe80:: & ULA fc00::/fd00::)
  if (
    host.startsWith("fe80:") ||
    host.startsWith("fc") ||
    host.startsWith("fd") ||
    host.startsWith("[fe80:") ||
    host.startsWith("[fc") ||
    host.startsWith("[fd")
  ) {
    return true;
  }

  // 5. Configurable ALLOWED_HOSTS
  if (process.env.ALLOWED_HOSTS) {
    const allowed = process.env.ALLOWED_HOSTS.split(",").map((s) =>
      s.trim().toLowerCase(),
    );
    if (allowed.includes(host)) return true;
  }

  return false;
}

// [spec: MCP-003]
export function isAllowedOrigin(origin: string, reqHost?: string): boolean {
  try {
    const originHost = parseHostname(origin);

    // 1. Same-Origin check: matches incoming Host header
    if (reqHost) {
      const serverHost = parseHostname(reqHost);
      if (originHost === serverHost) {
        return true;
      }
    }

    // 2. Allowed Host check (Loopback, .local mDNS, LAN IP)
    if (isAllowedHost(originHost)) {
      return true;
    }

    // 3. Configurable ALLOWED_ORIGINS
    if (process.env.ALLOWED_ORIGINS) {
      const allowedOrigins = process.env.ALLOWED_ORIGINS.split(",").map((s) =>
        s.trim().toLowerCase(),
      );
      if (
        allowedOrigins.includes(origin.toLowerCase()) ||
        allowedOrigins.includes(originHost)
      ) {
        return true;
      }
    }

    return false;
  } catch {
    return false;
  }
}

// [spec: MCP-002]
// [spec: MCP-003]
// [spec: TG-001]
// [spec: NOTIF-001]
export function createApp(options: AppOptions): Hono {

  const { db, eventBus, telegramBot } = options;
  const taskRepo = new TaskRepository(db);
  const projectRepo = new ProjectRepository(db);

  const app = new Hono();

  // Host Header Guard against DNS Rebinding (AC-MCP-003.4)
  app.use("*", async (c, next) => {
    const host = c.req.header("host");
    if (host && !isAllowedHost(host)) {
      return c.text("Forbidden: Unauthorized Host header", 403);
    }
    await next();
  });

  // Origin Guard against Cross-Origin / CSRF Attacks (AC-MCP-003.4)
  app.use("*", async (c, next) => {
    const origin = c.req.header("origin");
    if (origin && !isAllowedOrigin(origin, c.req.header("host"))) {
      return c.text("Forbidden: Unauthorized cross-origin request", 403);
    }
    await next();
  });

  // Enable CORS for authorized origins (AC-MCP-003.4)
  app.use(
    "*",
    cors({
      origin: (origin, c) =>
        origin && isAllowedOrigin(origin, c.req.header("host")) ? origin : null,
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
    let appVersion = "2.0.0";
    try {
      const pkgPath = path.resolve("./package.json");
      if (fs.existsSync(pkgPath)) {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
        if (pkg.version) appVersion = pkg.version;
      }
    } catch {}

    const tgCfg = telegramBot ? telegramBot.getConfig() : loadTelegramConfig();

    return c.json({
      status: "ok",
      service: "kaj",
      version: appVersion,
      uptime: process.uptime(),
      memory_rss_mb: Math.round(process.memoryUsage().rss / (1024 * 1024)),
      telegram_enabled: tgCfg.enabled,
      telegram_running: telegramBot ? telegramBot.isRunning() : false,
      timestamp: new Date().toISOString(),
    });
  });

  // REST: Telegram integration status & feature toggle (TG-001)
  app.get("/api/telegram/status", (c) => {
    const cfg = telegramBot ? telegramBot.getConfig() : loadTelegramConfig();
    return c.json({
      enabled: cfg.enabled,
      running: telegramBot ? telegramBot.isRunning() : false,
      configured: Boolean(
        cfg.bot_token && cfg.bot_token !== "YOUR_TELEGRAM_BOT_TOKEN",
      ),
      allowed_user_ids: cfg.allowed_user_ids,
      vip_users: cfg.vip_users || [],
      default_status: cfg.default_status,
      poll_interval_ms: cfg.poll_interval_ms,
    });
  });

  // REST: VIP users list (TG-001)
  app.get("/api/vip-users", (c) => {
    const cfg = telegramBot ? telegramBot.getConfig() : loadTelegramConfig();
    return c.json({
      vip_users: cfg.vip_users || [],
    });
  });


  app.post("/api/telegram/toggle", async (c) => {
    try {
      const body = (await c.req.json()) as { enabled?: boolean };
      if (typeof body.enabled !== "boolean") {
        return c.json({ error: "enabled (boolean) is required" }, 400);
      }
      const updated = saveTelegramConfig({ enabled: body.enabled });
      if (telegramBot) {
        telegramBot.updateConfig(updated);
      }
      return c.json({
        enabled: updated.enabled,
        running: telegramBot ? telegramBot.isRunning() : false,
        configured: Boolean(
          updated.bot_token && updated.bot_token !== "YOUR_TELEGRAM_BOT_TOKEN",
        ),
      });
    } catch (err) {
      return c.json({ error: (err as Error).message }, 400);
    }
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
    if (origin && !isAllowedOrigin(origin, c.req.header("host"))) {
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
