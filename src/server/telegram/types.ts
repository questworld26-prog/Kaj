// [spec: TG-001]
// [spec: NOTIF-002]
// [spec: NOTIF-003]
import type { DatabaseSync } from "node:sqlite";
import type { TaskPriority, TaskStatus } from "../../shared/types.js";
import type { TaskRepository, ProjectRepository } from "../repository.js";
import type { EventBus } from "../events.js";

export const TELEGRAM_NOTIFICATION_TYPES = [
  "task_completed",
  "task_triaged",
  "daily_digest",
  "backup_status",
] as const;

export type TelegramNotificationType =
  (typeof TELEGRAM_NOTIFICATION_TYPES)[number];

export interface TelegramConfig {
  enabled: boolean;
  bot_token: string;
  allowed_user_ids: number[];
  user_names?: Record<string, string>;
  user_notifications?: Record<string, TelegramNotificationType[]>;
  vip_users?: string[];
  notify_on_completion?: boolean;
  daily_digest_enabled?: boolean;
  daily_digest_time?: string;
  daily_digest_max_items?: number;
  daily_digest_skip_empty?: boolean;
  default_status: TaskStatus;
  poll_interval_ms: number;
}

export interface DailyDigestResult {
  dispatched_count: number;
  recipients: number[];
  task_count: number;
  skipped_reason?:
    | "telegram_disabled"
    | "digest_disabled"
    | "before_time"
    | "already_dispatched"
    | "no_nonvip_recipients"
    | "empty";
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
  setMyCommands?(
    commands: Array<{ command: string; description: string }>,
    scope?: unknown,
  ): Promise<void>;
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

export interface TelegramBotServiceOptions {
  config: TelegramConfig;
  taskRepo: TaskRepository;
  projectRepo: ProjectRepository;
  eventBus: EventBus;
  db?: DatabaseSync;
  transport?: TelegramApiTransport;
}
