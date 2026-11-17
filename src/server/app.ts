import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import fs from "node:fs";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { streamSSE } from "hono/streaming";
import { serveStatic } from "@hono/node-server/serve-static";
import { TaskRepository, ProjectRepository } from "./repository.js";
import { EventBus } from "./events.js";
import { TelegramBotService, loadTelegramConfig } from "./telegram.js";
import { registerTelegramRoutes } from "./routes/telegram-routes.js";
import { registerTaskRoutes } from "./routes/task-routes.js";
import { createMcpServer } from "../mcp/server.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

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

  registerTelegramRoutes(app, telegramBot);
  registerTaskRoutes(app, { db, eventBus, taskRepo, projectRepo, telegramBot });

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
