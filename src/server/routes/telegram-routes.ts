// [spec: TG-001]
// [spec: NOTIF-001]
// [spec: NOTIF-002]
// [spec: NOTIF-003]
import type { Hono } from "hono";
import {
  TelegramBotService,
  loadTelegramConfig,
  resolveDefaultNonVipCreatorName,
  saveTelegramConfig,
} from "../telegram.js";

export function registerTelegramRoutes(
  app: Hono,
  telegramBot?: TelegramBotService,
): void {
  // REST: Telegram integration status & feature toggle (TG-001, NOTIF-003)
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
      user_notifications: cfg.user_notifications || {},
      daily_digest_enabled: Boolean(cfg.daily_digest_enabled),
      daily_digest_time: cfg.daily_digest_time || "08:00",
      default_status: cfg.default_status,
      poll_interval_ms: cfg.poll_interval_ms,
    });
  });

  // [spec: NOTIF-002]
  // REST: Trigger or force daily non-VIP digest
  app.post("/api/telegram/daily-digest", async (c) => {
    if (!telegramBot) {
      return c.json({ error: "Telegram bot service not active" }, 400);
    }
    let force = true;
    try {
      const raw = await c.req.text();
      if (raw) {
        const body = JSON.parse(raw) as { force?: boolean };
        if (typeof body.force === "boolean") force = body.force;
      }
    } catch {
      return c.json({ error: "Invalid JSON payload" }, 400);
    }
    const result = await telegramBot.runDailyDigest({ force });
    return c.json(result);
  });

  // REST: VIP users list & default non-VIP creator attribution (TG-001, UI-012)
  app.get("/api/vip-users", (c) => {
    const cfg = telegramBot ? telegramBot.getConfig() : loadTelegramConfig();
    return c.json({
      vip_users: cfg.vip_users || [],
      default_creator: resolveDefaultNonVipCreatorName(cfg),
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
}
