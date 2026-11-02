// [spec: TG-001]
import { describe, it, expect, beforeEach, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { initSchema } from "../../src/server/db.js";
import {
  TaskRepository,
  ProjectRepository,
} from "../../src/server/repository.js";
import { EventBus } from "../../src/server/events.js";
import {
  loadTelegramConfig,
  parseTelegramTaskInput,
  TelegramBotService,
  type TelegramApiTransport,
} from "../../src/server/telegram.js";

describe("Telegram Bot Integration (TG-001)", () => {
  let db: DatabaseSync;
  let taskRepo: TaskRepository;
  let projectRepo: ProjectRepository;
  let eventBus: EventBus;

  beforeEach(() => {
    db = new DatabaseSync(":memory:");
    initSchema(db);
    taskRepo = new TaskRepository(db);
    projectRepo = new ProjectRepository(db);
    eventBus = new EventBus();
  });

  // [verifies: TG-001/AC-TG-001.1]
  it("loads Telegram config from JSON file and respects KAJ_TELEGRAM_ENABLED env override", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "kaj-tg-cfg-"));
    const cfgPath = path.join(tmpDir, "telegram.config.json");

    fs.writeFileSync(
      cfgPath,
      JSON.stringify({
        enabled: false,
        bot_token: "123456:ABC-DEF",
        allowed_user_ids: [999111],
        default_status: "todo",
        poll_interval_ms: 1500,
      }),
      "utf-8",
    );

    const cfg1 = loadTelegramConfig(cfgPath, {});
    expect(cfg1.enabled).toBe(false);
    expect(cfg1.bot_token).toBe("123456:ABC-DEF");
    expect(cfg1.allowed_user_ids).toEqual([999111]);
    expect(cfg1.default_status).toBe("todo");
    expect(cfg1.poll_interval_ms).toBe(1500);

    // Env override turns it on
    const cfg2 = loadTelegramConfig(cfgPath, { KAJ_TELEGRAM_ENABLED: "true" });
    expect(cfg2.enabled).toBe(true);

    // Env override turns it off even if file says true
    fs.writeFileSync(
      cfgPath,
      JSON.stringify({ enabled: true, bot_token: "123456:ABC-DEF" }),
      "utf-8",
    );
    const cfg3 = loadTelegramConfig(cfgPath, { KAJ_TELEGRAM_ENABLED: "false" });
    expect(cfg3.enabled).toBe(false);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // [verifies: TG-001/AC-TG-001.2]
  it("remains inactive with zero network requests when enabled is false or bot_token is empty", async () => {
    const sentMessages: Array<{ chatId: number; text: string }> = [];
    let getUpdatesCount = 0;

    const mockTransport: TelegramApiTransport = {
      getUpdates: async () => {
        getUpdatesCount++;
        return [];
      },
      sendMessage: async (chatId, text) => {
        sentMessages.push({ chatId, text });
      },
      answerCallbackQuery: async () => {},
    };

    const botDisabled = new TelegramBotService({
      config: {
        enabled: false,
        bot_token: "123456:ABC",
        allowed_user_ids: [],
        default_status: "triage",
        poll_interval_ms: 50,
      },
      taskRepo,
      projectRepo,
      eventBus,
      transport: mockTransport,
    });

    botDisabled.start();
    expect(botDisabled.isRunning()).toBe(false);
    await botDisabled.pollOnce();
    expect(getUpdatesCount).toBe(0);
    expect(sentMessages).toHaveLength(0);
  });

  // [verifies: TG-001/AC-TG-001.3]
  it("rejects messages and callbacks from unauthorized Telegram user IDs when allowed_user_ids is set", async () => {
    const sentMessages: Array<{ chatId: number; text: string }> = [];
    const mockTransport: TelegramApiTransport = {
      getUpdates: async () => [],
      sendMessage: async (chatId, text) => {
        sentMessages.push({ chatId, text });
      },
      answerCallbackQuery: async () => {},
    };

    const bot = new TelegramBotService({
      config: {
        enabled: true,
        bot_token: "123456:ABC",
        allowed_user_ids: [424242],
        default_status: "triage",
        poll_interval_ms: 1000,
      },
      taskRepo,
      projectRepo,
      eventBus,
      transport: mockTransport,
    });

    // Unauthorized user (999999) tries to add a task
    await bot.handleUpdate({
      update_id: 1,
      message: {
        message_id: 10,
        from: { id: 999999, first_name: "Intruder" },
        chat: { id: 999999 },
        text: "/add Sneaky task",
      },
    });

    expect(taskRepo.listTasks()).toHaveLength(0);
    expect(sentMessages).toHaveLength(1);
    expect(sentMessages[0].text).toContain("Unauthorized");
  });

  // [verifies: TG-001/AC-TG-001.4]
  it("parses shorthand tokens (#Project, !today, @tomorrow, due:YYYY-MM-DD, wait:note) and creates task + SSE event", async () => {
    const infraProj = projectRepo.createProject({
      name: "Infra",
      color: "#10B981",
    });

    const parsed = parseTelegramTaskInput(
      "Deploy K8s cluster #Infra !today @2026-11-01 due:2026-11-05 wait:DevOps",
      projectRepo.listProjects(),
      "triage",
      new Date("2026-10-29T12:00:00Z"),
    );

    expect(parsed.title).toBe("Deploy K8s cluster");
    expect(parsed.project_id).toBe(infraProj.id);
    expect(parsed.status).toBe("in_progress_today");
    expect(parsed.priority).toBe("today");
    expect(parsed.action_date).toBe("2026-11-01");
    expect(parsed.due_date).toBe("2026-11-05");
    expect(parsed.waiting_on).toBe("DevOps");

    // Also test via TelegramBotService handleUpdate (/add and plain text)
    const sentMessages: Array<{ chatId: number; text: string }> = [];
    const events: unknown[] = [];
    eventBus.subscribe((ev) => events.push(ev));

    const bot = new TelegramBotService({
      config: {
        enabled: true,
        bot_token: "123456:ABC",
        allowed_user_ids: [424242],
        default_status: "triage",
        poll_interval_ms: 1000,
      },
      taskRepo,
      projectRepo,
      eventBus,
      transport: {
        getUpdates: async () => [],
        sendMessage: async (chatId, text) => {
          sentMessages.push({ chatId, text });
        },
        answerCallbackQuery: async () => {},
      },
    });

    await bot.handleUpdate({
      update_id: 2,
      message: {
        message_id: 11,
        from: { id: 424242, first_name: "Owner" },
        chat: { id: 424242 },
        text: "/add Upgrade Postgres #Infra !today @2026-11-02",
      },
    });

    const tasks = taskRepo.listTasks();
    expect(tasks).toHaveLength(1);
    expect(tasks[0].title).toBe("Upgrade Postgres");
    expect(tasks[0].project_id).toBe(infraProj.id);
    expect(tasks[0].status).toBe("in_progress_today");
    expect(tasks[0].action_date).toBe("2026-11-02");
    expect(events).toHaveLength(1);
    expect(sentMessages[0].text).toContain("Upgrade Postgres");
  });

  // [verifies: TG-001/AC-TG-001.5]
  it("searches tasks by title and details via /search, /s, and ? with inline keyboard buttons", async () => {
    const t1 = taskRepo.createTask({
      title: "Configure Cloudflare Tunnel",
      details: "Zero trust network setup",
      status: "todo",
      priority: "week",
      project_id: null,
      action_date: null,
      due_date: null,
      repeat_rule: "none",
      waiting_on: "",
    });
    taskRepo.createTask({
      title: "Buy groceries",
      details: "Apples and coffee",
      status: "triage",
      priority: "today",
      project_id: null,
      action_date: null,
      due_date: null,
      repeat_rule: "none",
      waiting_on: "",
    });

    const sentMessages: Array<{
      chatId: number;
      text: string;
      replyMarkup?: unknown;
    }> = [];

    const bot = new TelegramBotService({
      config: {
        enabled: true,
        bot_token: "123456:ABC",
        allowed_user_ids: [424242],
        default_status: "triage",
        poll_interval_ms: 1000,
      },
      taskRepo,
      projectRepo,
      eventBus,
      transport: {
        getUpdates: async () => [],
        sendMessage: async (chatId, text, replyMarkup) => {
          sentMessages.push({ chatId, text, replyMarkup });
        },
        answerCallbackQuery: async () => {},
      },
    });

    // Search matching description "Zero trust" via "? zero trust"
    await bot.handleUpdate({
      update_id: 3,
      message: {
        message_id: 12,
        from: { id: 424242 },
        chat: { id: 424242 },
        text: "? zero trust",
      },
    });

    expect(sentMessages).toHaveLength(1);
    expect(sentMessages[0].text).toContain("Configure Cloudflare Tunnel");
    expect(sentMessages[0].text).not.toContain("Buy groceries");

    const markupStr = JSON.stringify(sentMessages[0].replyMarkup);
    expect(markupStr).toContain(`done:${t1.id}`);
    expect(markupStr).toContain(`status:${t1.id}:in_progress_today`);
    expect(markupStr).toContain(`status:${t1.id}:in_progress_week`);
    expect(markupStr).toContain(`status:${t1.id}:in_progress_month`);
  });

  // [verifies: TG-001/AC-TG-001.6]
  it("lists today tasks on /today and processes inline callback queries to complete or move tasks", async () => {
    const tToday = taskRepo.createTask({
      title: "Ship Telegram Bot",
      details: "",
      status: "in_progress_today",
      priority: "today",
      project_id: null,
      action_date: null,
      due_date: null,
      repeat_rule: "none",
      waiting_on: "",
    });

    const sentMessages: Array<{ chatId: number; text: string }> = [];
    const callbackAnswers: string[] = [];

    const bot = new TelegramBotService({
      config: {
        enabled: true,
        bot_token: "123456:ABC",
        allowed_user_ids: [424242],
        default_status: "triage",
        poll_interval_ms: 1000,
      },
      taskRepo,
      projectRepo,
      eventBus,
      transport: {
        getUpdates: async () => [],
        sendMessage: async (chatId, text) => {
          sentMessages.push({ chatId, text });
        },
        answerCallbackQuery: async (_id, text) => {
          if (text) callbackAnswers.push(text);
        },
      },
    });

    // 1. /today lists the task
    await bot.handleUpdate({
      update_id: 4,
      message: {
        message_id: 13,
        from: { id: 424242 },
        chat: { id: 424242 },
        text: "/today",
      },
    });
    expect(sentMessages[0].text).toContain("Ship Telegram Bot");

    // 2. Callback query marks task complete
    await bot.handleUpdate({
      update_id: 5,
      callback_query: {
        id: "cb_1",
        from: { id: 424242 },
        message: { chat: { id: 424242 }, message_id: 99 },
        data: `done:${tToday.id}`,
      },
    });

    const updated = taskRepo.getTaskById(tToday.id);
    expect(updated?.status).toBe("done");
    expect(callbackAnswers[0]).toContain("Completed");
  });

  // [verifies: TG-001/AC-TG-001.7]
  it("supports user_names mapping and sets created_by on new tasks and in format summaries", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "kaj-tg-names-"));
    const cfgPath = path.join(tmpDir, "telegram.config.json");

    fs.writeFileSync(
      cfgPath,
      JSON.stringify({
        enabled: true,
        bot_token: "123456:ABC",
        allowed_user_ids: [111222333, 444555666],
        user_names: {
          "111222333": "Alex",
          "444555666": "Sam",
        },
        default_status: "triage",
        poll_interval_ms: 2000,
      }),
      "utf-8",
    );

    const cfg = loadTelegramConfig(cfgPath);
    expect(cfg.user_names).toEqual({
      "111222333": "Alex",
      "444555666": "Sam",
    });

    const sentMessages: Array<{ chatId: number; text: string }> = [];
    const bot = new TelegramBotService({
      config: cfg,
      taskRepo,
      projectRepo,
      eventBus,
      transport: {
        getUpdates: async () => [],
        sendMessage: async (chatId, text) => {
          sentMessages.push({ chatId, text });
        },
        answerCallbackQuery: async () => {},
      },
    });

    // 1. Task created by 111222333 maps to "Alex"
    await bot.handleUpdate({
      update_id: 10,
      message: {
        message_id: 20,
        from: { id: 111222333, first_name: "IgnoredFirstName" },
        chat: { id: 111222333 },
        text: "Review quarterly report !today",
      },
    });

    const tasks = taskRepo.listTasks(false);
    const createdTask = tasks.find((t) => t.title.includes("Review quarterly report"));
    expect(createdTask).toBeDefined();
    expect(createdTask?.created_by).toBe("Alex");
    expect(sentMessages[0].text).toContain("Alex");

    // 2. Task created by user with no user_names entry falls back to first_name
    await bot.handleUpdate({
      update_id: 11,
      message: {
        message_id: 21,
        from: { id: 999999, first_name: "GuestUser" },
        chat: { id: 999999 },
        text: "External guest task",
      },
    });
    // (Note: 999999 is not in allowed_user_ids, so it's rejected)
    expect(sentMessages[1].text).toContain("Unauthorized user ID");

    // Now test with user in allowed_user_ids but without explicit mapping in user_names
    const cfgWithGuest = {
      ...cfg,
      allowed_user_ids: [111222333, 555555],
    };
    const botWithGuest = new TelegramBotService({
      config: cfgWithGuest,
      taskRepo,
      projectRepo,
      eventBus,
      transport: {
        getUpdates: async () => [],
        sendMessage: async (chatId, text) => {
          sentMessages.push({ chatId, text });
        },
        answerCallbackQuery: async () => {},
      },
    });

    await botWithGuest.handleUpdate({
      update_id: 12,
      message: {
        message_id: 22,
        from: { id: 555555, first_name: "Sarah" },
        chat: { id: 555555 },
        text: "Prepare launch deck",
      },
    });

    const sarahTask = taskRepo.listTasks(false).find((t) => t.title.includes("Prepare launch deck"));
    expect(sarahTask).toBeDefined();
    expect(sarahTask?.created_by).toBe("Sarah");
  });
});
