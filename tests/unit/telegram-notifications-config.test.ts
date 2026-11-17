// [spec: NOTIF-003]
import { describe, it, expect, beforeEach } from "vitest";
import { createDatabase, initSchema } from "../../src/server/db.js";
import { EventBus } from "../../src/server/events.js";
import { ProjectRepository, TaskRepository } from "../../src/server/repository.js";
import { createApp } from "../../src/server/app.js";
import {
  TelegramBotService,
  loadTelegramConfig,
  resolveNotificationRecipients,
  type TelegramApiTransport,
} from "../../src/server/telegram.js";

function createMockTransport() {
  const sentMessages: Array<{ chatId: number; text: string }> = [];
  const transport: TelegramApiTransport = {
    async getUpdates() {
      return [];
    },
    async sendMessage(chatId, text) {
      sentMessages.push({ chatId, text });
    },
    async answerCallbackQuery() {},
  };
  return { transport, sentMessages };
}

describe("NOTIF-003: Per-user Telegram notification subscriptions", () => {
  let db: ReturnType<typeof createDatabase>;
  let taskRepo: TaskRepository;
  let projRepo: ProjectRepository;
  let eventBus: EventBus;

  beforeEach(() => {
    db = createDatabase(":memory:");
    initSchema(db);
    taskRepo = new TaskRepository(db);
    projRepo = new ProjectRepository(db);
    eventBus = new EventBus();
  });

  // [verifies: NOTIF-003/AC-NOTIF-003.1]
  it("parses explicit user notification lists in KAJ_TELEGRAM_USER_NAMES and preserves empty lists", () => {
    const cfg = loadTelegramConfig(undefined, {
      KAJ_TELEGRAM_ENABLED: "true",
      KAJ_TELEGRAM_BOT_TOKEN: "test-token",
      KAJ_TELEGRAM_ALLOWED_USER_IDS: "847921997,928147325,111222333",
      KAJ_TELEGRAM_USER_NAMES: JSON.stringify({
        "847921997": {
          name: "Oblix",
          notifications: ["daily_digest", "backup_status", "unknown_ignored"],
        },
        "928147325": {
          name: "Asterix",
          vip: true,
          notifications: ["task_completed"],
        },
        "111222333": {
          name: "SilentUser",
          notifications: [],
        },
      }),
    });

    expect(cfg.user_names).toEqual({
      "847921997": "Oblix",
      "928147325": "Asterix",
      "111222333": "SilentUser",
    });
    expect(cfg.vip_users).toEqual(["Asterix", "928147325"]);
    expect(cfg.user_notifications).toEqual({
      "847921997": ["daily_digest", "backup_status"],
      "928147325": ["task_completed"],
      "111222333": [],
    });
  });

  // [verifies: NOTIF-003/AC-NOTIF-003.2]
  it("synthesizes VIP and non-VIP default notification lists when omitted", () => {
    const cfg = loadTelegramConfig(undefined, {
      KAJ_TELEGRAM_ENABLED: "true",
      KAJ_TELEGRAM_BOT_TOKEN: "test-token",
      KAJ_TELEGRAM_ALLOWED_USER_IDS: "847921997,928147325,555000111",
      KAJ_TELEGRAM_USER_NAMES: JSON.stringify({
        "847921997": "Oblix",
        "928147325": { name: "Asterix", vip: true },
        "555000111": "Panoramix [VIP]",
      }),
    });

    expect(cfg.user_notifications).toEqual({
      "847921997": ["task_completed", "daily_digest", "backup_status"],
      "928147325": ["task_completed", "task_triaged"],
      "555000111": ["task_completed", "task_triaged"],
    });
  });

  // [verifies: NOTIF-003/AC-NOTIF-003.3]
  it("routes each notification type strictly to subscribed authorized users", async () => {
    const cfg = loadTelegramConfig(undefined, {
      KAJ_TELEGRAM_ENABLED: "true",
      KAJ_TELEGRAM_BOT_TOKEN: "test-token",
      KAJ_TELEGRAM_ALLOWED_USER_IDS: "847921997,928147325,777888999",
      KAJ_TELEGRAM_DAILY_DIGEST_ENABLED: "true",
      KAJ_TELEGRAM_DAILY_DIGEST_TIME: "08:00",
      KAJ_TELEGRAM_USER_NAMES: JSON.stringify({
        "847921997": {
          name: "Oblix",
          notifications: ["task_triaged", "backup_status"],
        },
        "928147325": {
          name: "Asterix",
          vip: true,
          notifications: ["task_completed", "daily_digest"],
        },
        "777888999": {
          name: "Muted",
          notifications: [],
        },
      }),
    });

    expect(resolveNotificationRecipients(cfg, "backup_status")).toEqual([
      847921997,
    ]);
    expect(resolveNotificationRecipients(cfg, "daily_digest")).toEqual([
      928147325,
    ]);

    const { transport, sentMessages } = createMockTransport();
    const bot = new TelegramBotService({
      config: cfg,
      taskRepo,
      projectRepo: projRepo,
      eventBus,
      db,
      transport,
    });

    // Seed tasks created by Asterix (subscribed to task_completed, NOT task_triaged)
    // and Oblix (subscribed to task_triaged, NOT task_completed)
    const asterixTask = taskRepo.createTask({
      title: "Asterix report",
      status: "triage",
      project_id: null,
      created_by: "Asterix",
    });
    const oblixTask = taskRepo.createTask({
      title: "Oblix inbox item",
      status: "triage",
      project_id: null,
      created_by: "Oblix",
    });

    // Triaging Asterix's task -> Asterix does NOT have task_triaged -> suppressed
    await bot.handleTaskTriagedNotification({
      task: { ...asterixTask, status: "todo" },
      previous: asterixTask,
    });
    expect(sentMessages).toHaveLength(0);

    // Triaging Oblix's task -> Oblix HAS task_triaged -> delivered
    await bot.handleTaskTriagedNotification({
      task: { ...oblixTask, status: "todo" },
      previous: oblixTask,
    });
    expect(sentMessages).toHaveLength(1);
    expect(sentMessages[0].chatId).toBe(847921997);
    expect(sentMessages[0].text).toContain("Seen/Triaged: Oblix inbox item");

    // Completing Asterix's task -> Asterix HAS task_completed -> delivered
    // Completing Oblix's task -> Oblix does NOT have task_completed -> suppressed
    await bot.handleTaskCompletedNotification({ ...asterixTask, status: "done" });
    await bot.handleTaskCompletedNotification({ ...oblixTask, status: "done" });
    expect(sentMessages).toHaveLength(2);
    expect(sentMessages[1].chatId).toBe(928147325);
    expect(sentMessages[1].text).toContain("Asterix report");

    // Backup status -> ONLY Oblix (847921997)
    await bot.broadcastBackupNotification("✅ Kaj Backup Successful: x.db.enc");
    expect(sentMessages).toHaveLength(3);
    expect(sentMessages[2].chatId).toBe(847921997);

    // Daily digest -> ONLY Asterix (928147325) because Asterix explicitly subscribed
    const digestTask = taskRepo.createTask({
      title: "Morning review",
      status: "in_progress_today",
      action_date: "2026-11-17",
    });
    expect(digestTask.status).toBe("in_progress_today");
    const digestRes = await bot.runDailyDigest({
      now: new Date(2026, 10, 17, 9, 0, 0),
    });
    expect(digestRes.recipients).toEqual([928147325]);
    expect(sentMessages).toHaveLength(4);
    expect(sentMessages[3].chatId).toBe(928147325);
  });

  // [verifies: NOTIF-003/AC-NOTIF-003.4]
  it("exposes resolved user_notifications on GET /api/telegram/status without exposing bot_token", async () => {
    const cfg = loadTelegramConfig(undefined, {
      KAJ_TELEGRAM_ENABLED: "true",
      KAJ_TELEGRAM_BOT_TOKEN: "super-secret-bot-token",
      KAJ_TELEGRAM_ALLOWED_USER_IDS: "847921997,928147325",
      KAJ_TELEGRAM_USER_NAMES: JSON.stringify({
        "847921997": {
          name: "Oblix",
          notifications: ["task_completed", "daily_digest", "backup_status"],
        },
        "928147325": {
          name: "Asterix",
          vip: true,
          notifications: ["task_completed"],
        },
      }),
    });

    const { transport } = createMockTransport();
    const bot = new TelegramBotService({
      config: cfg,
      taskRepo,
      projectRepo: projRepo,
      eventBus,
      db,
      transport,
    });
    const app = createApp({ db, eventBus, telegramBot: bot });

    const res = await app.request("/api/telegram/status");
    expect(res.status).toBe(200);
    const raw = await res.text();
    expect(raw).not.toContain("super-secret-bot-token");

    const body = JSON.parse(raw) as {
      vip_users: string[];
      user_notifications: Record<string, string[]>;
    };
    expect(body.vip_users).toEqual(["Asterix", "928147325"]);
    expect(body.user_notifications).toEqual({
      "847921997": ["task_completed", "daily_digest", "backup_status"],
      "928147325": ["task_completed"],
    });
  });
});
