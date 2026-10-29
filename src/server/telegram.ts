// [spec: TG-001]
import fs from "node:fs";
import path from "node:path";
import {
  Project,
  Task,
  TaskPriority,
  TaskStatus,
  TASK_STATUSES,
} from "../shared/types.js";
import { TaskRepository, ProjectRepository } from "./repository.js";
import { EventBus } from "./events.js";

export interface TelegramConfig {
  enabled: boolean;
  bot_token: string;
  allowed_user_ids: number[];
  default_status: TaskStatus;
  poll_interval_ms: number;
}

export interface TelegramInlineButton {
  text: string;
  callback_data: string;
}

export interface TelegramInlineKeyboardMarkup {
  inline_keyboard: TelegramInlineButton[][];
}

export interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    from?: { id: number; first_name?: string; username?: string };
    chat: { id: number };
    text?: string;
  };
  callback_query?: {
    id: string;
    from: { id: number; first_name?: string; username?: string };
    message?: { chat: { id: number }; message_id: number };
    data?: string;
  };
}

export interface TelegramApiTransport {
  getUpdates(offset: number, timeoutSec: number): Promise<TelegramUpdate[]>;
  sendMessage(
    chatId: number,
    text: string,
    replyMarkup?: TelegramInlineKeyboardMarkup,
  ): Promise<void>;
  answerCallbackQuery(callbackQueryId: string, text?: string): Promise<void>;
}

const DEFAULT_CONFIG: TelegramConfig = {
  enabled: false,
  bot_token: "",
  allowed_user_ids: [],
  default_status: "triage",
  poll_interval_ms: 2000,
};

// [spec: TG-001]
export function resolveTelegramConfigPath(
  configPath?: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  if (configPath) return path.resolve(configPath);
  if (env.KAJ_TELEGRAM_CONFIG) return path.resolve(env.KAJ_TELEGRAM_CONFIG);
  return path.resolve("./telegram.config.json");
}

// [spec: TG-001]
export function loadTelegramConfig(
  configPath?: string,
  env: NodeJS.ProcessEnv = process.env,
): TelegramConfig {
  const resolvedPath = resolveTelegramConfigPath(configPath, env);
  let fileData: Partial<TelegramConfig> = {};

  if (fs.existsSync(resolvedPath)) {
    try {
      const raw = fs.readFileSync(resolvedPath, "utf-8");
      fileData = JSON.parse(raw) as Partial<TelegramConfig>;
    } catch {
      // Ignore malformed JSON and fall back to defaults
    }
  }

  const defaultStatus =
    fileData.default_status &&
    (TASK_STATUSES as readonly string[]).includes(fileData.default_status)
      ? fileData.default_status
      : DEFAULT_CONFIG.default_status;

  const config: TelegramConfig = {
    enabled:
      typeof fileData.enabled === "boolean"
        ? fileData.enabled
        : DEFAULT_CONFIG.enabled,
    bot_token:
      typeof fileData.bot_token === "string"
        ? fileData.bot_token.trim()
        : DEFAULT_CONFIG.bot_token,
    allowed_user_ids: Array.isArray(fileData.allowed_user_ids)
      ? fileData.allowed_user_ids
          .map((n) => Number(n))
          .filter((n) => Number.isFinite(n))
      : [...DEFAULT_CONFIG.allowed_user_ids],
    default_status: defaultStatus,
    poll_interval_ms:
      typeof fileData.poll_interval_ms === "number" &&
      fileData.poll_interval_ms >= 50
        ? fileData.poll_interval_ms
        : DEFAULT_CONFIG.poll_interval_ms,
  };

  if (env.KAJ_TELEGRAM_ENABLED !== undefined) {
    const val = env.KAJ_TELEGRAM_ENABLED.trim().toLowerCase();
    if (val === "true" || val === "1" || val === "on") {
      config.enabled = true;
    } else if (val === "false" || val === "0" || val === "off") {
      config.enabled = false;
    }
  }

  if (env.KAJ_TELEGRAM_BOT_TOKEN) {
    config.bot_token = env.KAJ_TELEGRAM_BOT_TOKEN.trim();
  }

  return config;
}

// [spec: TG-001]
export function saveTelegramConfig(
  updates: Partial<TelegramConfig>,
  configPath?: string,
  env: NodeJS.ProcessEnv = process.env,
): TelegramConfig {
  const resolvedPath = resolveTelegramConfigPath(configPath, env);
  const current = loadTelegramConfig(resolvedPath, {});
  const next: TelegramConfig = {
    ...current,
    ...updates,
  };
  fs.writeFileSync(resolvedPath, JSON.stringify(next, null, 2) + "\n", "utf-8");
  return loadTelegramConfig(resolvedPath, env);
}

function formatDateYMD(dt: Date): string {
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const d = String(dt.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function resolveDateToken(token: string, now: Date): string | null {
  const lower = token.toLowerCase();
  if (lower === "today") {
    return formatDateYMD(now);
  }
  if (lower === "tomorrow" || lower === "tmrw") {
    const next = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    return formatDateYMD(next);
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(token)) {
    return token;
  }
  return null;
}

export interface ParsedTelegramTask {
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  project_id: string | null;
  action_date: string | null;
  due_date: string | null;
  waiting_on: string;
}

// [spec: TG-001]
export function parseTelegramTaskInput(
  rawText: string,
  projects: Project[],
  defaultStatus: TaskStatus = "triage",
  now: Date = new Date(),
): ParsedTelegramTask {
  let text = rawText.trim();
  if (/^\/(add|new)\b/i.test(text)) {
    text = text.replace(/^\/(add|new)\s*/i, "");
  }

  let status: TaskStatus = defaultStatus;
  let priority: TaskPriority = "week";
  let projectId: string | null = null;
  let actionDate: string | null = null;
  let dueDate: string | null = null;
  let waitingOn = "";

  const tokens = text.split(/\s+/);
  const titleWords: string[] = [];

  for (const token of tokens) {
    if (!token) continue;

    // 1. Project tag: #ProjectName
    if (token.startsWith("#") && token.length > 1) {
      const projName = token.slice(1).toLowerCase();
      const matched = projects.find(
        (p) =>
          p.name.toLowerCase() === projName ||
          p.name.toLowerCase().replace(/\s+/g, "-") === projName ||
          p.name.toLowerCase().replace(/\s+/g, "") === projName,
      );
      if (matched) {
        projectId = matched.id;
        continue;
      }
    }

    // 2. Status / Priority token: !today, !week, !month, !todo, !triage, !track
    if (token.startsWith("!") && token.length > 1) {
      const flag = token.slice(1).toLowerCase();
      if (flag === "today") {
        status = "in_progress_today";
        priority = "today";
        continue;
      }
      if (flag === "week") {
        status = "in_progress_week";
        priority = "week";
        continue;
      }
      if (flag === "month") {
        status = "in_progress_month";
        priority = "month";
        continue;
      }
      if (flag === "todo") {
        status = "todo";
        continue;
      }
      if (flag === "triage") {
        status = "triage";
        continue;
      }
      if (flag === "track" || flag === "tracking") {
        status = "tracking";
        continue;
      }
    }

    // 3. Action date token: @today, @tomorrow, @YYYY-MM-DD
    if (token.startsWith("@") && token.length > 1) {
      const resolved = resolveDateToken(token.slice(1), now);
      if (resolved) {
        actionDate = resolved;
        continue;
      }
    }

    // 4. Due date token: due:today, due:tomorrow, due:YYYY-MM-DD
    if (/^due:/i.test(token)) {
      const resolved = resolveDateToken(token.slice(4), now);
      if (resolved) {
        dueDate = resolved;
        continue;
      }
    }

    // 5. Waiting on token: wait:<note>
    if (/^wait:/i.test(token)) {
      const note = token.slice(5).replace(/_/g, " ").trim();
      if (note) {
        waitingOn = note;
        continue;
      }
    }

    titleWords.push(token);
  }

  return {
    title: titleWords.join(" ").trim(),
    status,
    priority,
    project_id: projectId,
    action_date: actionDate,
    due_date: dueDate,
    waiting_on: waitingOn,
  };
}

export function createFetchTelegramTransport(
  botToken: string,
): TelegramApiTransport {
  const baseUrl = `https://api.telegram.org/bot${botToken}`;

  return {
    async getUpdates(offset: number, timeoutSec: number) {
      const res = await fetch(
        `${baseUrl}/getUpdates?offset=${offset}&timeout=${timeoutSec}`,
      );
      if (!res.ok) return [];
      const data = (await res.json()) as {
        ok: boolean;
        result?: TelegramUpdate[];
      };
      return data.ok && Array.isArray(data.result) ? data.result : [];
    },

    async sendMessage(chatId, text, replyMarkup) {
      await fetch(`${baseUrl}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
        }),
      });
    },

    async answerCallbackQuery(callbackQueryId, text) {
      await fetch(`${baseUrl}/answerCallbackQuery`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          callback_query_id: callbackQueryId,
          ...(text ? { text } : {}),
        }),
      });
    },
  };
}

export interface TelegramBotServiceOptions {
  config: TelegramConfig;
  taskRepo: TaskRepository;
  projectRepo: ProjectRepository;
  eventBus: EventBus;
  transport?: TelegramApiTransport;
}

function buildTaskActionKeyboard(taskId: string): TelegramInlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        { text: "✓ Done", callback_data: `done:${taskId}` },
        { text: "⚡ Today", callback_data: `status:${taskId}:in_progress_today` },
        { text: "📅 Week", callback_data: `status:${taskId}:in_progress_week` },
        { text: "🗓 Month", callback_data: `status:${taskId}:in_progress_month` },
        { text: "Todo", callback_data: `status:${taskId}:todo` },
      ],
    ],
  };
}

function formatTaskSummary(task: Task, projects: Project[]): string {
  const proj = task.project_id
    ? projects.find((p) => p.id === task.project_id)?.name
    : null;
  const parts = [`• ${task.title} [${task.status}]`];
  if (proj) parts.push(`#${proj}`);
  if (task.action_date) parts.push(`@${task.action_date}`);
  if (task.due_date) parts.push(`due:${task.due_date}`);
  if (task.waiting_on) parts.push(`wait:${task.waiting_on}`);
  return parts.join(" ");
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

  constructor(options: TelegramBotServiceOptions) {
    this.config = options.config;
    this.taskRepo = options.taskRepo;
    this.projectRepo = options.projectRepo;
    this.eventBus = options.eventBus;
    this.transport =
      options.transport || createFetchTelegramTransport(this.config.bot_token);
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

  public updateConfig(newConfig: TelegramConfig, transport?: TelegramApiTransport): void {
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
    this.scheduleNextPoll();
  }

  public stop(): void {
    this.running = false;
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
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
        return;
      }

      const data = cb.data || "";
      if (data.startsWith("done:")) {
        const taskId = data.slice(5);
        try {
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
          await this.transport.answerCallbackQuery(cb.id, "⚠️ Task not found");
        }
        return;
      }

      if (data.startsWith("status:")) {
        const [, taskId, rawStatus] = data.split(":");
        if (
          taskId &&
          rawStatus &&
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
            await this.transport.answerCallbackQuery(cb.id, "⚠️ Task not found");
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
          "• Send any text or /add <title> [#Project] [!today|!week|!todo] [@today|@tomorrow|@YYYY-MM-DD] [due:YYYY-MM-DD] [wait:Person]",
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
            (t.waiting_on && t.waiting_on.toLowerCase().includes(lowerQ)),
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
      buildTaskActionKeyboard(created.id),
    );
  }
}
