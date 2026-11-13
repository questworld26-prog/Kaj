import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { createDatabase, initSchema } from "./db.js";
import { EventBus } from "./events.js";
import { createApp } from "./app.js";
import { TaskRepository, ProjectRepository } from "./repository.js";
import { loadTelegramConfig, TelegramBotService } from "./telegram.js";
import {
  performDailyBackup,
  formatBackupNotificationMessage,
} from "./backup/index.js";

// Load environment variables from .env if present
try {
  if (typeof process.loadEnvFile === "function") {
    const cwdEnv = path.resolve(process.cwd(), ".env");
    if (fs.existsSync(cwdEnv)) {
      process.loadEnvFile(cwdEnv);
    } else {
      const dirname = path.dirname(fileURLToPath(import.meta.url));
      const rootEnv = path.resolve(dirname, "../../.env");
      if (fs.existsSync(rootEnv)) {
        process.loadEnvFile(rootEnv);
      }
    }
  }
} catch {
  // Ignore missing or unreadable .env file
}

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
// [spec: TG-001]
async function startDaemon() {
  const db = createDatabase(process.env.KAJ_DB_PATH);
  initSchema(db);
  const eventBus = new EventBus();

  const telegramConfig = loadTelegramConfig();
  const telegramBot = new TelegramBotService({
    config: telegramConfig,
    taskRepo: new TaskRepository(db),
    projectRepo: new ProjectRepository(db),
    eventBus,
  });
  telegramBot.start();

  // [spec: BACKUP-001]
  let lastFailureAlertDate = "";
  const runScheduledBackup = async () => {
    if (!process.env.KAJ_BACKUP_DIR) return;

    const result = performDailyBackup({ db });
    const now = new Date();
    const todayKey = `${now.getUTCDate()}-${now.getUTCMonth() + 1}-${now.getUTCFullYear()}`;

    if (result.success && !result.skipped) {
      const msg = formatBackupNotificationMessage(result);
      await telegramBot.broadcastBackupNotification(msg);
    } else if (!result.success) {
      if (lastFailureAlertDate !== todayKey) {
        lastFailureAlertDate = todayKey;
        const msg = formatBackupNotificationMessage(result);
        await telegramBot.broadcastBackupNotification(msg);
      }
    }
  };

  runScheduledBackup().catch(() => {});
  setInterval(() => {
    runScheduledBackup().catch(() => {});
  }, 60 * 60 * 1000);

  const app = createApp({ db, eventBus, telegramBot });

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
      const tgStatus = telegramBot.isRunning()
        ? "ACTIVE (polling)"
        : telegramConfig.enabled
          ? "ENABLED (missing bot_token in telegram.config.json)"
          : "DISABLED (flag off)";
      console.log(`
╔═════════════════════════════════════════════════════════════════╗
║  Kaj (কাজ) Background Task Management & MCP Server             ║
╚═════════════════════════════════════════════════════════════════╝
- Local Dashboard:   http://localhost:${info.port}
- Network Dashboard: ${networkStr}
- Health Check:      http://localhost:${info.port}/api/health
- MCP Endpoint:      http://localhost:${info.port}/mcp (Streamable HTTP)
- SSE Live Push:     http://localhost:${info.port}/events
- Telegram Bot:      ${tgStatus}
- Memory RSS:        ~${memoryMb} MB (Low footprint daemon)
`);
    },
  );
}

startDaemon().catch((err) => {
  console.error("Failed to start Kaj daemon:", err);
  process.exit(1);
});
