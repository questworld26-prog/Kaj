import os from "node:os";
import { execSync } from "node:child_process";
import { serve } from "@hono/node-server";
import { createDatabase, initSchema } from "./db.js";
import { EventBus } from "./events.js";
import { createApp } from "./app.js";

function getLocalNetworkHost(): string {
  if (process.env.KAJ_HOST_NAME) return process.env.KAJ_HOST_NAME;
  try {
    const name = execSync("scutil --get LocalHostName", {
      encoding: "utf-8",
      timeout: 1000,
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    if (name) return `${name}.local`;
  } catch {}
  return "jarvis.local";
}

function getLanIp(): string | null {
  const nets = os.networkInterfaces();
  for (const addrs of Object.values(nets)) {
    if (!addrs) continue;
    for (const a of addrs) {
      if (
        a.family === "IPv4" &&
        !a.internal &&
        (a.address.startsWith("192.168.") ||
          a.address.startsWith("10.") ||
          a.address.startsWith("172."))
      ) {
        return a.address;
      }
    }
  }
  return null;
}

// [spec: MCP-002]
async function startDaemon() {
  const db = createDatabase(process.env.KAJ_DB_PATH);
  initSchema(db);
  const eventBus = new EventBus();

  const app = createApp({ db, eventBus });

  const port = Number(process.env.PORT || 4820);
  const hostname = process.env.HOST || "0.0.0.0";

  serve(
    {
      fetch: app.fetch,
      port,
      hostname,
    },
    (info) => {
      const memoryMb = Math.round(process.memoryUsage().rss / (1024 * 1024));
      const networkHost = getLocalNetworkHost();
      const lanIp = getLanIp();
      const networkStr = lanIp
        ? `http://${networkHost}:${info.port} (or http://${lanIp}:${info.port})`
        : `http://${networkHost}:${info.port}`;
      console.log(`
╔═════════════════════════════════════════════════════════════════╗
║  Kaj (কাজ) Background Task Management & MCP Server             ║
╚═════════════════════════════════════════════════════════════════╝
- Local Dashboard:   http://localhost:${info.port}
- Network Dashboard: ${networkStr}
- Health Check:      http://localhost:${info.port}/api/health
- MCP Endpoint:      http://localhost:${info.port}/mcp (Streamable HTTP)
- SSE Live Push:     http://localhost:${info.port}/events
- Memory RSS:        ~${memoryMb} MB (Low footprint daemon)
`);
    },
  );
}

startDaemon().catch((err) => {
  console.error("Failed to start Kaj daemon:", err);
  process.exit(1);
});
