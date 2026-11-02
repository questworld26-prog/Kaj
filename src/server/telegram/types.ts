// [spec: TG-001]
import type { TaskPriority, TaskStatus } from "../../shared/types.js";
import type { TaskRepository, ProjectRepository } from "../repository.js";
import type { EventBus } from "../events.js";

export interface TelegramConfig {
  enabled: boolean;
  bot_token: string;
  allowed_user_ids: number[];
  user_names?: Record<string, string>;
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
  transport?: TelegramApiTransport;
}
