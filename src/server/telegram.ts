// [spec: TG-001]
// [spec: TG-002]
// [spec: NOTIF-001]
// [spec: NOTIF-002]
// [spec: NOTIF-003]
import type { DatabaseSync } from "node:sqlite";
import { TaskRepository, ProjectRepository } from "./repository.js";
import { EventBus } from "./events.js";
import {
  TELEGRAM_NOTIFICATION_TYPES,
  type TelegramConfig,
  type TelegramNotificationType,
  type TelegramInlineButton,
  type TelegramInlineKeyboardMarkup,
  type TelegramUpdate,
  type TelegramApiTransport,
  type ParsedTelegramTask,
  type TelegramBotServiceOptions,
  type DailyDigestResult,
} from "./telegram/types.js";
import {
  resolveTelegramConfigPath,
  loadTelegramConfig,
  saveTelegramConfig,
} from "./telegram/config.js";
import { parseTelegramTaskInput } from "./telegram/parser.js";
import { createFetchTelegramTransport } from "./telegram/transport.js";
import {
  dispatchDailyNonVipDigest,
  isVipUser,
  resolveDefaultNonVipCreatorName,
  resolveNonVipRecipients,
  resolveNotificationRecipients,
  selectDailyDigestTasks,
  userReceivesNotification,
} from "./telegram/digest.js";
import {
  broadcastBackupMessage,
  hasValidBotToken,
  notifyTaskCompleted,
  notifyVipTaskTriaged,
  resolveUserIdForCreator,
} from "./telegram/notifications.js";
import { handleTelegramUpdate } from "./telegram/handlers.js";

// Re-export for seamless backward compatibility
export type {
  TelegramConfig,
  TelegramNotificationType,
  TelegramInlineButton,
  TelegramInlineKeyboardMarkup,
  TelegramUpdate,
  TelegramApiTransport,
  ParsedTelegramTask,
  TelegramBotServiceOptions,
  DailyDigestResult,
};
export {
  TELEGRAM_NOTIFICATION_TYPES,
  resolveTelegramConfigPath,
  loadTelegramConfig,
  saveTelegramConfig,
  parseTelegramTaskInput,
  createFetchTelegramTransport,
  isVipUser,
  resolveDefaultNonVipCreatorName,
  resolveNonVipRecipients,
  resolveNotificationRecipients,
  selectDailyDigestTasks,
  resolveUserIdForCreator,
  userReceivesNotification,
};

// [spec: TG-001]
export class TelegramBotService {
  private config: TelegramConfig;
  private taskRepo: TaskRepository;
  private projectRepo: ProjectRepository;
  private eventBus: EventBus;
  private db?: DatabaseSync;
  private transport: TelegramApiTransport;
  private running = false;
  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  private offset = 0;
  private eventUnsubscribe?: () => void;
  private inTelegramCompletedTaskIds = new Set<string>();
  private memorySentDigestKeys = new Set<string>();

  constructor(options: TelegramBotServiceOptions) {
    this.config = options.config;
    this.taskRepo = options.taskRepo;
    this.projectRepo = options.projectRepo;
    this.eventBus = options.eventBus;
    this.db = options.db;
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
    } else if (hasValidBotToken(this.config)) {
      this.transport = createFetchTelegramTransport(this.config.bot_token);
    }
    if (this.config.enabled && hasValidBotToken(this.config)) {
      this.start();
    }
  }

  public start(): void {
    if (!this.config.enabled || !hasValidBotToken(this.config)) {
      this.running = false;
      return;
    }
    if (this.running) return;
    this.running = true;

    if (this.transport.setMyCommands) {
      const kajCommands = [
        {
          command: "today",
          description: "View today tasks with quick actions",
        },
        {
          command: "updates",
          description: "Get clean task status updates (supports keyword queries)",
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
    await notifyTaskCompleted(
      {
        config: this.config,
        projectRepo: this.projectRepo,
        transport: this.transport,
        inTelegramCompletedTaskIds: this.inTelegramCompletedTaskIds,
      },
      data,
    );
  }

  // [spec: NOTIF-001]
  public async handleTaskTriagedNotification(data: unknown): Promise<void> {
    await notifyVipTaskTriaged(
      {
        config: this.config,
        projectRepo: this.projectRepo,
        transport: this.transport,
      },
      data,
    );
  }

  // [spec: BACKUP-001]
  public async broadcastBackupNotification(text: string): Promise<void> {
    await broadcastBackupMessage(this.config, this.transport, text);
  }

  // [spec: NOTIF-002]
  public async runDailyDigest(
    options: { force?: boolean; now?: Date } = {},
  ): Promise<DailyDigestResult> {
    return dispatchDailyNonVipDigest({
      config: this.config,
      taskRepo: this.taskRepo,
      projectRepo: this.projectRepo,
      transport: this.transport,
      db: this.db,
      memorySentKeys: this.memorySentDigestKeys,
      force: options.force,
      now: options.now,
    });
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
    if (!this.config.enabled || !hasValidBotToken(this.config)) {
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

  public async handleUpdate(update: TelegramUpdate): Promise<void> {
    await handleTelegramUpdate(
      {
        config: this.config,
        taskRepo: this.taskRepo,
        projectRepo: this.projectRepo,
        eventBus: this.eventBus,
        transport: this.transport,
        inTelegramCompletedTaskIds: this.inTelegramCompletedTaskIds,
      },
      update,
    );
  }
}
