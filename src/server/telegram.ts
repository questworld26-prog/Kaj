// [spec: TG-001]
// [spec: NOTIF-001]
import {

  Project,
  Task,
  TaskPriority,
  TaskStatus,
  TASK_STATUSES,
} from "../shared/types.js";
import { TaskRepository, ProjectRepository } from "./repository.js";
import { EventBus } from "./events.js";
import type {
  TelegramConfig,
  TelegramInlineButton,
  TelegramInlineKeyboardMarkup,
  TelegramUpdate,
  TelegramApiTransport,
  ParsedTelegramTask,
  TelegramBotServiceOptions,
} from "./telegram/types.js";
import {
  DEFAULT_CONFIG,
  resolveTelegramConfigPath,
  loadTelegramConfig,
  saveTelegramConfig,
} from "./telegram/config.js";
import {
  formatDateYMD,
  resolveDateToken,
  parseTelegramTaskInput,
} from "./telegram/parser.js";
import { createFetchTelegramTransport } from "./telegram/transport.js";
import {
  buildTaskActionKeyboard,
  buildNewTaskActionKeyboard,
  formatTaskSummary,
  formatTaskCompletedNotification,
  formatTaskTriagedNotification,
} from "./telegram/formatters.js";



// Re-export for seamless backward compatibility
export type {
  TelegramConfig,
  TelegramInlineButton,
  TelegramInlineKeyboardMarkup,
  TelegramUpdate,
  TelegramApiTransport,
  ParsedTelegramTask,
  TelegramBotServiceOptions,
};
export {
  resolveTelegramConfigPath,
  loadTelegramConfig,
  saveTelegramConfig,
  parseTelegramTaskInput,
  createFetchTelegramTransport,
};


// [spec: TG-001]
// [spec: NOTIF-001]
export function isVipUser(
  creator: string | null | undefined,
  vipUsers?: string[],
): boolean {
  if (!creator || !creator.trim()) return false;
  const raw = creator.trim();
  if (/\[vip\]|\(vip\)|\bvip\b/i.test(raw)) return true;
  if (!vipUsers || vipUsers.length === 0) return false;
  const lower = raw.toLowerCase();
  return vipUsers.some((v) => v.toLowerCase() === lower);
}

// [spec: TG-001]
// [spec: NOTIF-001]
export function resolveUserIdForCreator(

  creator: string | null | undefined,
  userNames?: Record<string, string>,
  allowedUserIds?: number[],
): number | null {
  if (!creator || !creator.trim()) return null;
  const cleanCreator = creator.trim();
  const lowerCreator = cleanCreator.toLowerCase();

  // 1. Direct numeric match
  const numericId = Number(cleanCreator);
  if (Number.isFinite(numericId) && numericId > 0) {
    if (
      !allowedUserIds ||
      allowedUserIds.length === 0 ||
      allowedUserIds.includes(numericId)
    ) {
      return numericId;
    }
  }

  // 2. Lookup in userNames mapping (e.g. "847921997": "Oblix")
  if (userNames) {
    for (const [idStr, name] of Object.entries(userNames)) {
      if (
        name.trim().toLowerCase() === lowerCreator ||
        idStr === cleanCreator
      ) {
        const uid = Number(idStr);
        if (Number.isFinite(uid) && uid > 0) {
          return uid;
        }
      }
    }
  }

  return null;
}

// [spec: TG-001]
export class TelegramBotService {
  private config: TelegramConfig;
  private taskRepo: TaskRepository;
  private projectRepo: ProjectRepository;
  private eventBus: EventBus;
  private transport: TelegramApiTransport;
  private running = false;
  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  private offset = 0;
  private eventUnsubscribe?: () => void;
  private inTelegramCompletedTaskIds = new Set<string>();

  constructor(options: TelegramBotServiceOptions) {
    this.config = options.config;
    this.taskRepo = options.taskRepo;
    this.projectRepo = options.projectRepo;
    this.eventBus = options.eventBus;
    this.transport =
      options.transport || createFetchTelegramTransport(this.config.bot_token);

    this.eventUnsubscribe = this.eventBus.subscribe(async (event) => {
      if (event.type === "task") {
        if (event.action === "completed") {
          await this.handleTaskCompletedNotification(event.data);
        } else if (event.action === "triaged") {
          await this.handleTaskTriagedNotification(event.data);
        }
      }
    });

  }


  private hasValidToken(): boolean {
    return Boolean(
      this.config.bot_token &&
      this.config.bot_token !== "YOUR_TELEGRAM_BOT_TOKEN",
    );
  }

  public isRunning(): boolean {
    return this.running;
  }

  public getConfig(): TelegramConfig {
    return { ...this.config };
  }

  public updateConfig(
    newConfig: TelegramConfig,
    transport?: TelegramApiTransport,
  ): void {
    const wasRunning = this.running;
    if (wasRunning) {
      this.stop();
    }
    this.config = newConfig;
    if (transport) {
      this.transport = transport;
    } else if (this.hasValidToken()) {
      this.transport = createFetchTelegramTransport(this.config.bot_token);
    }
    if (this.config.enabled && this.hasValidToken()) {
      this.start();
    }
  }

  public start(): void {
    if (!this.config.enabled || !this.hasValidToken()) {
      this.running = false;
      return;
    }
    if (this.running) return;
    this.running = true;

    // Automatically sync official clean Kaj menu commands to Telegram (both default and chat-specific)
    if (this.transport.setMyCommands) {
      const kajCommands = [
        {
          command: "today",
          description: "View today tasks with quick actions",
        },
        {
          command: "search",
          description: "Search tasks by title, details, or notes",
        },
        {
          command: "add",
          description: "Add a task: /add <title> [#project] [!today]",
        },
        { command: "help", description: "Show Kaj syntax guide and commands" },
      ];
      this.transport.setMyCommands(kajCommands).catch(() => {});
      for (const userId of this.config.allowed_user_ids) {
        this.transport
          .setMyCommands(kajCommands, { type: "chat", chat_id: userId })
          .catch(() => {});
      }
    }

    this.scheduleNextPoll();
  }

  public stop(): void {
    this.running = false;
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
  }

  public destroy(): void {
    this.stop();
    if (this.eventUnsubscribe) {
      this.eventUnsubscribe();
      this.eventUnsubscribe = undefined;
    }
  }

  public async handleTaskCompletedNotification(data: unknown): Promise<void> {
    if (!this.config.enabled || !this.hasValidToken()) {
      return;
    }
    if (this.config.notify_on_completion === false) {
      return;
    }

    const payload = data as
      | { completed_task?: Task; title?: string }
      | undefined;
    const task: Task | undefined =
      payload?.completed_task ||
      (payload && typeof payload.title === "string"
        ? (payload as Task)
        : undefined);

    if (!task || !task.created_by) {
      return;
    }

    const recipientId = resolveUserIdForCreator(
      task.created_by,
      this.config.user_names,
      this.config.allowed_user_ids,
    );

    if (!recipientId) {
      return;
    }

    if (!this.isAuthorized(recipientId)) {
      return;
    }

    const completedKey = `${task.id}:${recipientId}`;
    if (this.inTelegramCompletedTaskIds.has(completedKey)) {
      this.inTelegramCompletedTaskIds.delete(completedKey);
      return;
    }

    try {
      const projects = this.projectRepo.listProjects(true);
      const text = formatTaskCompletedNotification(task, projects);
      await this.transport.sendMessage(recipientId, text);
    } catch {
      // Ignore background notification delivery failure
    }
  }

  // [spec: NOTIF-001]
  public async handleTaskTriagedNotification(data: unknown): Promise<void> {
    if (!this.config.enabled || !this.hasValidToken()) {
      return;
    }
    if (this.config.notify_on_completion === false) {
      return;
    }

    const payload = data as
      | { task?: Task; previous?: Task }
      | undefined;
    const task = payload?.task;
    const previous = payload?.previous;

    if (!task || !task.created_by) {
      return;
    }

    // Verify creator is a VIP
    if (!isVipUser(task.created_by, this.config.vip_users)) {
      return;
    }

    // Verify previous state was unassigned triage (project_id == null && status === "triage")
    if (
      previous &&
      (previous.status !== "triage" ||
        (previous.project_id !== null &&
          previous.project_id !== undefined &&
          previous.project_id !== ""))
    ) {
      return;
    }

    // Verify task is now moved to another column or assigned to a project
    const isStillUnassignedTriage =
      task.status === "triage" &&
      (!task.project_id || task.project_id === "");
    if (isStillUnassignedTriage) {
      return;
    }

    const recipientId = resolveUserIdForCreator(
      task.created_by,
      this.config.user_names,
      this.config.allowed_user_ids,
    );

    if (!recipientId) {
      return;
    }

    if (!this.isAuthorized(recipientId)) {
      return;
    }

    try {
      const projects = this.projectRepo.listProjects(true);
      const text = formatTaskTriagedNotification(task, projects);
      await this.transport.sendMessage(recipientId, text);
    } catch {
      // Ignore background notification delivery failure
    }
  }



  // [spec: BACKUP-001]
  public async broadcastBackupNotification(text: string): Promise<void> {
    if (!this.config.enabled || !this.hasValidToken()) {
      return;
    }
    const recipients: number[] = [];
    if (this.config.allowed_user_ids.length > 0) {
      recipients.push(...this.config.allowed_user_ids);
    } else if (this.config.user_names) {
      for (const idStr of Object.keys(this.config.user_names)) {
        const parsed = parseInt(idStr, 10);
        if (!isNaN(parsed) && parsed > 0 && !recipients.includes(parsed)) {
          recipients.push(parsed);
        }
      }
    }

    for (const chatId of recipients) {
      try {
        await this.transport.sendMessage(chatId, text);
      } catch {
        // Ignore background delivery errors
      }
    }
  }

  private scheduleNextPoll(): void {
    if (!this.running) return;
    this.pollTimer = setTimeout(async () => {
      await this.pollOnce();
      if (this.running) {
        this.scheduleNextPoll();
      }
    }, this.config.poll_interval_ms);
  }

  public async pollOnce(): Promise<void> {
    if (!this.config.enabled || !this.hasValidToken()) {
      return;
    }
    try {
      const updates = await this.transport.getUpdates(this.offset, 0);
      for (const update of updates) {
        this.offset = Math.max(this.offset, update.update_id + 1);
        await this.handleUpdate(update);
      }
    } catch {
      // Transient network error; continue polling on next interval
    }
  }

  private isAuthorized(userId?: number): boolean {
    if (this.config.allowed_user_ids.length === 0) return true;
    if (userId === undefined) return false;
    return this.config.allowed_user_ids.includes(userId);
  }

  private resolveCreatorName(
    userId?: number,
    from?: { id: number; first_name?: string; username?: string },
  ): string {
    const userNames = this.config.user_names || {};
    if (userId !== undefined) {
      const idKey = String(userId);
      if (userNames[idKey]) return userNames[idKey];
    }
    if (from?.username) {
      const unameKey = from.username.toLowerCase();
      for (const [k, v] of Object.entries(userNames)) {
        if (k.toLowerCase().replace(/^@/, "") === unameKey) {
          return v;
        }
      }
    }
    if (from?.first_name && from.first_name.trim()) {
      return from.first_name.trim();
    }
    if (from?.username && from.username.trim()) {
      return from.username.trim();
    }
    return userId !== undefined ? `Telegram User ${userId}` : "Telegram User";
  }

  public async handleUpdate(update: TelegramUpdate): Promise<void> {
    if (update.callback_query) {
      const cb = update.callback_query;
      const userId = cb.from?.id;
      const chatId = cb.message?.chat.id ?? userId;
      if (!this.isAuthorized(userId)) {
        if (chatId) {
          await this.transport.sendMessage(
            chatId,
            `⛔ Unauthorized user ID: ${userId ?? "unknown"}`,
          );
        }
        await this.transport.answerCallbackQuery(cb.id, "Unauthorized");
        return;
      }

      const data = cb.data || "";
      if (data.startsWith("done:")) {
        const taskId = data.slice(5);
        const completionKey = chatId ? `${taskId}:${chatId}` : null;
        try {
          if (completionKey) {
            this.inTelegramCompletedTaskIds.add(completionKey);
          }
          const res = this.taskRepo.completeTask(taskId);
          this.eventBus.broadcast({
            type: "task",
            action: "completed",
            id: taskId,
            data: res,
          });
          await this.transport.answerCallbackQuery(
            cb.id,
            `✅ Completed: ${res.completed_task.title}`,
          );
          if (chatId) {
            await this.transport.sendMessage(
              chatId,
              `✅ Completed: ${res.completed_task.title}`,
            );
          }
        } catch {
          if (completionKey) {
            this.inTelegramCompletedTaskIds.delete(completionKey);
          }
          await this.transport.answerCallbackQuery(cb.id, "⚠️ Task not found");
        }
        return;
      }


      if (data.startsWith("status:")) {
        const parts = data.split(":");
        const taskId = parts[1];
        const rawStatus = parts[2];
        if (
          taskId &&
          (TASK_STATUSES as readonly string[]).includes(rawStatus)
        ) {
          const updated = this.taskRepo.updateTask(taskId, {
            status: rawStatus as TaskStatus,
          });
          if (updated) {
            this.eventBus.broadcast({
              type: "task",
              action: "updated",
              id: updated.id,
              data: updated,
            });
            await this.transport.answerCallbackQuery(
              cb.id,
              `Moved to ${rawStatus}`,
            );
            if (chatId) {
              await this.transport.sendMessage(
                chatId,
                `🔄 Moved "${updated.title}" → ${rawStatus}`,
              );
            }
          } else {
            await this.transport.answerCallbackQuery(
              cb.id,
              "⚠️ Task not found",
            );
          }
        }
        return;
      }
      return;
    }

    if (!update.message || !update.message.text) return;
    const msg = update.message;
    const chatId = msg.chat.id;
    const userId = msg.from?.id;
    const text = (msg.text || "").trim();

    if (!this.isAuthorized(userId)) {
      await this.transport.sendMessage(
        chatId,
        `⛔ Unauthorized user ID: ${userId ?? "unknown"}`,
      );
      return;
    }

    // 1. /start or /help
    if (/^\/(start|help)\b/i.test(text)) {
      await this.transport.sendMessage(
        chatId,
        [
          "⚡ Kaj (কাজ) Telegram Bot",
          `Your Telegram User ID: ${userId ?? "unknown"}`,
          "",
          "Commands:",
          "• Send any text or /add <title> [#Project] [!today|!week|!todo] [@today|@tomorrow|@DD-MM|@DD-MM-YYYY] [due:DD-MM|due:DD-MM-YYYY] [wait:Person]",
          "• /search <query> (or /s <query> or ? <query>) — Search tasks by title & details",
          "• /today — List tasks in Today",
        ].join("\n"),
      );
      return;
    }

    // 2. /today
    if (/^\/today\b/i.test(text)) {
      const projects = this.projectRepo.listProjects();
      const todayTasks = this.taskRepo
        .listTasks(false)
        .filter((t) => t.status === "in_progress_today");

      if (todayTasks.length === 0) {
        await this.transport.sendMessage(
          chatId,
          "🎉 No tasks in Today right now!",
        );
        return;
      }

      for (const t of todayTasks) {
        await this.transport.sendMessage(
          chatId,
          formatTaskSummary(t, projects),
          buildTaskActionKeyboard(t.id),
        );
      }
      return;
    }

    // 3. /search <q>, /s <q>, or ? <q>
    if (/^(\/search|\/s|\?)\b/i.test(text) || text.startsWith("?")) {
      const query = text.replace(/^(\/search|\/s|\?)\s*/i, "").trim();
      if (!query) {
        await this.transport.sendMessage(
          chatId,
          "Usage: /search <keyword> or ? <keyword>",
        );
        return;
      }

      const lowerQ = query.toLowerCase();
      const projects = this.projectRepo.listProjects();
      const matches = this.taskRepo
        .listTasks(false)
        .filter(
          (t) =>
            t.title.toLowerCase().includes(lowerQ) ||
            (t.details && t.details.toLowerCase().includes(lowerQ)) ||
            (t.waiting_on && t.waiting_on.toLowerCase().includes(lowerQ)) ||
            (t.created_by && t.created_by.toLowerCase().includes(lowerQ)),
        )
        .slice(0, 10);

      if (matches.length === 0) {
        await this.transport.sendMessage(
          chatId,
          `🔍 No active tasks matching "${query}".`,
        );
        return;
      }

      for (const t of matches) {
        await this.transport.sendMessage(
          chatId,
          formatTaskSummary(t, projects),
          buildTaskActionKeyboard(t.id),
        );
      }
      return;
    }

    // 4. Default: /add <text> or plain text message creates a task
    const projects = this.projectRepo.listProjects();
    const parsed = parseTelegramTaskInput(
      text,
      projects,
      this.config.default_status,
    );

    if (!parsed.title) {
      await this.transport.sendMessage(
        chatId,
        "⚠️ Task title cannot be empty.",
      );
      return;
    }

    const creatorName = this.resolveCreatorName(userId, msg.from);

    const created = this.taskRepo.createTask({
      title: parsed.title,
      details: "",
      status: parsed.status,
      priority: parsed.priority,
      project_id: parsed.project_id,
      action_date: parsed.action_date,
      due_date: parsed.due_date,
      repeat_rule: "none",
      waiting_on: parsed.waiting_on,
      created_by: creatorName,
    });

    this.eventBus.broadcast({
      type: "task",
      action: "created",
      id: created.id,
      data: created,
    });

    await this.transport.sendMessage(
      chatId,
      `✅ Added: ${formatTaskSummary(created, projects)}`,
      buildNewTaskActionKeyboard(created.id),
    );
  }
}
