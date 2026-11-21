// [verifies: TG-002]
import { describe, it, expect, beforeEach } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { initSchema } from "../../src/server/db.js";
import {
  TaskRepository,
  ProjectRepository,
} from "../../src/server/repository.js";
import { EventBus } from "../../src/server/events.js";
import {
  TelegramBotService,
  type TelegramApiTransport,
  type TelegramConfig,
  type TelegramInlineKeyboardMarkup,
} from "../../src/server/telegram.js";

function createMockTransport() {
  const sentMessages: Array<{
    chatId: number;
    text: string;
    keyboard?: TelegramInlineKeyboardMarkup;
  }> = [];

  const transport: TelegramApiTransport = {
    async getUpdates() {
      return [];
    },
    async sendMessage(chatId, text, keyboard) {
      sentMessages.push({ chatId, text, keyboard });
    },
    async answerCallbackQuery() {},
  };

  return { transport, sentMessages };
}

describe("Telegram Task Update Inquiries & Cosine Similarity (TG-002)", () => {
  let db: DatabaseSync;
  let taskRepo: TaskRepository;
  let projectRepo: ProjectRepository;
  let eventBus: EventBus;
  let config: TelegramConfig;

  beforeEach(() => {
    db = new DatabaseSync(":memory:");
    initSchema(db);
    taskRepo = new TaskRepository(db);
    projectRepo = new ProjectRepository(db);
    eventBus = new EventBus();

    config = {
      enabled: true,
      bot_token: "123456:TG-UPDATE-TEST",
      allowed_user_ids: [1001, 2001],
      user_names: {
        "1001": "Oblix",
        "2001": "Asterix",
      },
      vip_users: ["2001", "Asterix"],
      notify_on_completion: true,
      default_status: "triage",
      poll_interval_ms: 2000,
    };
  });

  // [verifies: TG-002/AC-TG-002.1]
  it("routes /updates and natural 'any update' inquiries without creating tasks while allowing normal titles starting with update", async () => {
    const { transport, sentMessages } = createMockTransport();
    const service = new TelegramBotService({
      config,
      taskRepo,
      projectRepo,
      eventBus,
      transport,
    });

    taskRepo.createTask({
      title: "Passport renewal appointment",
      status: "todo",
      created_by: "Oblix",
    });

    await service.handleUpdate({
      update_id: 1,
      message: {
        message_id: 1,
        chat: { id: 1001 },
        from: { id: 1001, first_name: "Oblix" },
        text: "/updates passport",
      },
    });

    await service.handleUpdate({
      update_id: 2,
      message: {
        message_id: 2,
        chat: { id: 1001 },
        from: { id: 1001, first_name: "Oblix" },
        text: "Any updates on the following tasks please:\n1. Passport renewal",
      },
    });

    expect(sentMessages).toHaveLength(2);
    expect(sentMessages[0].text).toContain("Passport renewal appointment");
    expect(sentMessages[1].text).toContain("Passport renewal appointment");
    expect(taskRepo.listTasks(true)).toHaveLength(1);

    // Normal task title starting with "Update " still creates a task
    await service.handleUpdate({
      update_id: 3,
      message: {
        message_id: 3,
        chat: { id: 1001 },
        from: { id: 1001, first_name: "Oblix" },
        text: "Update phone number for India SIP",
      },
    });

    expect(taskRepo.listTasks(true)).toHaveLength(2);
    expect(sentMessages[2].text).toContain("Added:");
  });

  // [verifies: TG-002/AC-TG-002.2]
  it("ranks reworded multi-line queries via word + char-trigram TF-IDF cosine similarity across all active and completed stages", async () => {
    const { transport, sentMessages } = createMockTransport();
    const service = new TelegramBotService({
      config,
      taskRepo,
      projectRepo,
      eventBus,
      transport,
    });

    const homeProj = projectRepo.createProject({ name: "Home", color: "#10B981" });

    taskRepo.createTask({
      title: "What each year meant (2017-2025), complete by Saturday",
      status: "in_progress_today",
      project_id: homeProj.id,
      created_by: "Asterix",
    });

    taskRepo.createTask({
      title: "Singapore Airlines membership sign up",
      status: "triage",
      action_date: "2026-11-24",
      created_by: "Asterix",
    });

    taskRepo.createTask({
      title: "Boubou land Christmas lunch",
      status: "tracking",
      project_id: homeProj.id,
      waiting_on: "Restaurant confirmation",
      created_by: "Asterix",
    });

    const completedGift = taskRepo.createTask({
      title: "Order winter jacket gift",
      status: "todo",
      created_by: "Asterix",
    });
    taskRepo.completeTask(completedGift.id);

    await service.handleUpdate({
      update_id: 10,
      message: {
        message_id: 10,
        chat: { id: 2001 },
        from: { id: 2001, first_name: "Asterix" },
        text: [
          "Any updates on the following tasks please:",
          "1. Scrapbook year wise what the year meant",
          "2. Singapore airlines membership and app",
          "3. Boubou land Christmas lunch reservation",
          "4. Order winter jacket",
          "5. Completely nonexistent unicorn errand",
        ].join("\n"),
      },
    });

    expect(sentMessages).toHaveLength(1);
    const reply = sentMessages[0].text;
    expect(reply).toContain("1. Scrapbook year wise what the year meant");
    expect(reply).toContain("What each year meant (2017-2025), complete by Saturday");
    expect(reply).toContain("In Progress (Today)");
    expect(reply).toContain("Singapore Airlines membership sign up");
    expect(reply).toContain("In Triage");
    expect(reply).toContain("24-11-2026");
    expect(reply).toContain("Boubou land Christmas lunch");
    expect(reply).toContain("Restaurant confirmation");
    expect(reply).toContain("Order winter jacket gift");
    expect(reply).toContain("Completed");
    expect(reply).toContain("5. Completely nonexistent unicorn errand");
    expect(reply).toMatch(/No matching .*task/i);
  });

  // [verifies: TG-002/AC-TG-002.3]
  it("restricts VIP update lookups and overviews strictly to tasks created by that VIP", async () => {
    const { transport, sentMessages } = createMockTransport();
    const service = new TelegramBotService({
      config,
      taskRepo,
      projectRepo,
      eventBus,
      transport,
    });

    taskRepo.createTask({
      title: "Singapore investment 1140",
      status: "in_progress_today",
      created_by: "Oblix",
    });
    taskRepo.createTask({
      title: "Boubou land Christmas lunch",
      status: "triage",
      created_by: "Asterix",
    });
    taskRepo.createTask({
      title: "Asterix VIP Parcel",
      status: "tracking",
      waiting_on: "Courier",
      created_by: "Asterix [VIP]",
    });

    // VIP asks specifically about Oblix's Singapore task -> excluded by created_by VIP scope
    await service.handleUpdate({
      update_id: 20,
      message: {
        message_id: 20,
        chat: { id: 2001 },
        from: { id: 2001, first_name: "Asterix" },
        text: "Any updates on Singapore investment?",
      },
    });

    expect(sentMessages).toHaveLength(1);
    expect(sentMessages[0].text).not.toContain("Singapore investment 1140");
    expect(sentMessages[0].text).toMatch(/No matching .*task/i);

    // VIP sends bare /updates -> gets only Asterix's tasks
    await service.handleUpdate({
      update_id: 21,
      message: {
        message_id: 21,
        chat: { id: 2001 },
        from: { id: 2001, first_name: "Asterix" },
        text: "/updates",
      },
    });

    expect(sentMessages).toHaveLength(2);
    expect(sentMessages[1].text).toContain("Boubou land Christmas lunch");
    expect(sentMessages[1].text).toContain("Asterix VIP Parcel");
    expect(sentMessages[1].text).not.toContain("Singapore investment 1140");
    expect(sentMessages[1].keyboard).toBeUndefined();
  });

  // [verifies: TG-002/AC-TG-002.4]
  it("searches across all creators for non-VIP users and replies without inline action keyboards", async () => {
    const { transport, sentMessages } = createMockTransport();
    const service = new TelegramBotService({
      config,
      taskRepo,
      projectRepo,
      eventBus,
      transport,
    });

    taskRepo.createTask({
      title: "Singapore investment 1140",
      status: "in_progress_today",
      action_date: "2026-11-21",
      created_by: "Oblix",
    });
    taskRepo.createTask({
      title: "Singapore Airlines membership sign up",
      status: "triage",
      action_date: "2026-11-24",
      created_by: "Asterix",
    });

    await service.handleUpdate({
      update_id: 30,
      message: {
        message_id: 30,
        chat: { id: 1001 },
        from: { id: 1001, first_name: "Oblix" },
        text: "/updates Singapore",
      },
    });

    expect(sentMessages).toHaveLength(1);
    expect(sentMessages[0].text).toContain("Singapore investment 1140");
    expect(sentMessages[0].text).toContain("Singapore Airlines membership sign up");
    expect(sentMessages[0].text).toContain("Oblix");
    expect(sentMessages[0].text).toContain("Asterix");
    expect(sentMessages[0].keyboard).toBeUndefined();
  });
});
