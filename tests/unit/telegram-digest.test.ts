// [spec: NOTIF-002]
import { describe, it, expect, beforeEach } from "vitest";
import { createDatabase, initSchema } from "../../src/server/db.js";
import { EventBus } from "../../src/server/events.js";
import { ProjectRepository, TaskRepository } from "../../src/server/repository.js";
import { loadTelegramConfig } from "../../src/server/telegram/config.js";
import { formatDailyBriefTaskList } from "../../src/server/telegram/formatters.js";
import {
  resolveNonVipRecipients,
  selectDailyDigestTasks,
} from "../../src/server/telegram/digest.js";
import { TelegramBotService, type TelegramApiTransport } from "../../src/server/telegram.js";

function createMockTransport() {
  const sentMessages: Array<{ chatId: number; text: string; hasMarkup: boolean }> = [];
  const transport: TelegramApiTransport = {
    async getUpdates() {
      return [];
    },
    async sendMessage(chatId, text, replyMarkup) {
      sentMessages.push({
        chatId,
        text,
        hasMarkup: Boolean(replyMarkup),
      });
    },
    async answerCallbackQuery() {},
  };
  return { transport, sentMessages };
}

describe("NOTIF-002: Scheduled daily brief task digest for non-VIP Telegram members", () => {
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

  // [verifies: NOTIF-002/AC-NOTIF-002.1]
  it("resolves allowed Telegram recipients excluding VIP identities configured in env", () => {
    const cfg = loadTelegramConfig(undefined, {
      KAJ_TELEGRAM_ENABLED: "true",
      KAJ_TELEGRAM_BOT_TOKEN: "test-token",
      KAJ_TELEGRAM_ALLOWED_USER_IDS: "847921997,928147325,555000111",
      KAJ_TELEGRAM_USER_NAMES: JSON.stringify({
        "847921997": "Oblix",
        "928147325": { name: "Asterix", vip: true },
        "555000111": "Panoramix [VIP]",
      }),
      KAJ_TELEGRAM_DAILY_DIGEST_ENABLED: "true",
    });

    expect(cfg.daily_digest_enabled).toBe(true);
    expect(cfg.daily_digest_time).toBe("08:00");
    expect(resolveNonVipRecipients(cfg)).toEqual([847921997]);
  });

  // [verifies: NOTIF-002/AC-NOTIF-002.2]
  it("selects only In Progress Today tasks ordered with action_date today first and respects max item limit", () => {
    const todayYmd = "2026-11-14";

    const todayFirstByAction = taskRepo.createTask({
      title: "Today action first",
      status: "in_progress_today",
      action_date: todayYmd,
      sort_order: 5,
    });
    const todaySecondByAction = taskRepo.createTask({
      title: "Today action earlier sort",
      status: "in_progress_today",
      action_date: todayYmd,
      sort_order: 1,
    });
    const todayWithoutDate = taskRepo.createTask({
      title: "In progress today no date",
      status: "in_progress_today",
      sort_order: 2,
    });
    const todayOverflow = taskRepo.createTask({
      title: "In progress today overflow",
      status: "in_progress_today",
      sort_order: 10,
    });

    // Should be excluded (including Todo items)
    const todoExcluded = taskRepo.createTask({
      title: "Todo backlog item",
      status: "todo",
      sort_order: 1,
    });
    const todoWithTodayAction = taskRepo.createTask({
      title: "Todo with today action date",
      status: "todo",
      sort_order: 0,
    });
    db.prepare("UPDATE tasks SET status = 'todo', action_date = ? WHERE id = ?").run(
      todayYmd,
      todoWithTodayAction.id,
    );
    taskRepo.createTask({ title: "Triage noise", status: "triage" });
    taskRepo.createTask({ title: "Week horizon", status: "in_progress_week" });
    taskRepo.createTask({ title: "Tracking blocked", status: "tracking" });
    const doneTask = taskRepo.createTask({ title: "Already finished", status: "in_progress_today" });
    taskRepo.completeTask(doneTask.id);

    const allActive = taskRepo.listTasks(false);
    const { items, totalCount, truncatedCount } = selectDailyDigestTasks(
      allActive,
      todayYmd,
      3,
    );

    expect(totalCount).toBe(4);
    expect(truncatedCount).toBe(1);
    expect(items.map((t) => t.id)).toEqual([
      todaySecondByAction.id,
      todayFirstByAction.id,
      todayWithoutDate.id,
    ]);
    expect(items.map((t) => t.id)).not.toContain(todayOverflow.id);
    expect(items.map((t) => t.id)).not.toContain(todoExcluded.id);
    expect(items.map((t) => t.id)).not.toContain(todoWithTodayAction.id);
  });

  // [verifies: NOTIF-002/AC-NOTIF-002.3]
  it("formats a single concise numbered digest without descriptions or status clutter", () => {
    const todayYmd = "2026-11-14";
    const proj = projRepo.createProject({ name: "Home", color: "#10B981" });

    const t1 = taskRepo.createTask({
      title: "Buy groceries",
      status: "in_progress_today",
      action_date: todayYmd,
      project_id: proj.id,
      details: "Detailed shopping notes that should be omitted",
      created_by: "Asterix",
    });
    const t2 = taskRepo.createTask({
      title: "Pay electric bill",
      status: "in_progress_today",
      due_date: "2026-11-12",
      created_by: "Oblix",
    });

    const msg = formatDailyBriefTaskList(
      [t1, t2],
      [proj],
      todayYmd,
      2,
      1,
    );

    expect(msg).toContain("Today's Tasks (14-11-2026)");
    expect(msg).toContain("1. ⚡ Buy groceries #Home");
    expect(msg).toContain("2. • Pay electric bill ⚑ Overdue 12-11-2026");
    expect(msg).toContain("…and 1 more in Kaj");
    expect(msg).not.toContain("Detailed shopping notes");
    expect(msg).not.toContain("[in_progress_today]");
    expect(msg).not.toContain("Asterix");
  });

  // [verifies: NOTIF-002/AC-NOTIF-002.4]
  it("dispatches digest at or after 08:00 once per calendar day per non-VIP member across restarts", async () => {
    const todayLocal = new Date(2026, 10, 14, 7, 55, 0); // 07:55 local
    const after8Local = new Date(2026, 10, 14, 8, 5, 0); // 08:05 local
    const nextDayAfter8 = new Date(2026, 10, 15, 8, 1, 0); // next day 08:01 local

    taskRepo.createTask({
      title: "Morning errand",
      status: "in_progress_today",
      action_date: "2026-11-14",
    });

    const { transport, sentMessages } = createMockTransport();
    const cfg = loadTelegramConfig(undefined, {
      KAJ_TELEGRAM_ENABLED: "true",
      KAJ_TELEGRAM_BOT_TOKEN: "test-token",
      KAJ_TELEGRAM_ALLOWED_USER_IDS: "847921997,928147325",
      KAJ_TELEGRAM_USER_NAMES: JSON.stringify({
        "847921997": "Oblix",
        "928147325": { name: "Asterix", vip: true },
      }),
      KAJ_TELEGRAM_DAILY_DIGEST_ENABLED: "true",
      KAJ_TELEGRAM_DAILY_DIGEST_TIME: "08:00",
    });

    const bot1 = new TelegramBotService({
      config: cfg,
      taskRepo,
      projectRepo: projRepo,
      eventBus,
      db,
      transport,
    });

    // Before 08:00 -> must not send
    const earlyRes = await bot1.runDailyDigest({ now: todayLocal });
    expect(earlyRes.dispatched_count).toBe(0);
    expect(sentMessages).toHaveLength(0);

    // At 08:05 -> dispatches once exclusively to non-VIP member without inline buttons
    const onTimeRes = await bot1.runDailyDigest({ now: after8Local });
    expect(onTimeRes.dispatched_count).toBe(1);
    expect(sentMessages).toHaveLength(1);
    expect(sentMessages[0].chatId).toBe(847921997);
    expect(sentMessages[0].hasMarkup).toBe(false);
    expect(sentMessages[0].text).toContain("Morning errand");

    // Simulate daemon restart with a brand new service instance sharing SQLite DB -> must NOT resend today
    const botAfterRestart = new TelegramBotService({
      config: cfg,
      taskRepo,
      projectRepo: projRepo,
      eventBus,
      db,
      transport,
    });
    const duplicateRes = await botAfterRestart.runDailyDigest({
      now: new Date(2026, 10, 14, 9, 30, 0),
    });
    expect(duplicateRes.dispatched_count).toBe(0);
    expect(sentMessages).toHaveLength(1);

    // Next calendar day at 08:01 -> dispatches again cleanly
    const nextDayRes = await botAfterRestart.runDailyDigest({ now: nextDayAfter8 });
    expect(nextDayRes.dispatched_count).toBe(1);
    expect(sentMessages).toHaveLength(2);
  });

  // [verifies: NOTIF-002/AC-NOTIF-002.5]
  it("skips sending when empty-day suppression is enabled and zero In Progress Today tasks exist", async () => {
    taskRepo.createTask({ title: "Triage only item", status: "triage" });
    taskRepo.createTask({ title: "Todo only item", status: "todo" });

    const { transport, sentMessages } = createMockTransport();
    const cfgSkip = loadTelegramConfig(undefined, {
      KAJ_TELEGRAM_ENABLED: "true",
      KAJ_TELEGRAM_BOT_TOKEN: "test-token",
      KAJ_TELEGRAM_ALLOWED_USER_IDS: "847921997",
      KAJ_TELEGRAM_DAILY_DIGEST_ENABLED: "true",
      KAJ_TELEGRAM_DAILY_DIGEST_SKIP_EMPTY: "true",
    });

    const botSkip = new TelegramBotService({
      config: cfgSkip,
      taskRepo,
      projectRepo: projRepo,
      eventBus,
      db,
      transport,
    });

    const skipRes = await botSkip.runDailyDigest({
      now: new Date(2026, 10, 14, 8, 30, 0),
    });
    expect(skipRes.dispatched_count).toBe(0);
    expect(skipRes.skipped_reason).toBe("empty");
    expect(sentMessages).toHaveLength(0);
  });
});
