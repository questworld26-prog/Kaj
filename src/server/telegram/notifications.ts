// [spec: TG-001]
// [spec: NOTIF-001]
// [spec: BACKUP-001]
import type { Task } from "../../shared/types.js";
import type { ProjectRepository } from "../repository.js";
import {
  formatTaskCompletedNotification,
  formatTaskTriagedNotification,
} from "./formatters.js";
import { isVipUser, resolveNonVipRecipients } from "./digest.js";
import type { TelegramApiTransport, TelegramConfig } from "./types.js";

export function hasValidBotToken(config: TelegramConfig): boolean {
  return Boolean(
    config.bot_token && config.bot_token !== "YOUR_TELEGRAM_BOT_TOKEN",
  );
}

export function isAuthorizedTelegramUser(
  config: TelegramConfig,
  userId?: number,
): boolean {
  if (config.allowed_user_ids.length === 0) return true;
  if (userId === undefined) return false;
  return config.allowed_user_ids.includes(userId);
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

export interface TelegramNotificationContext {
  config: TelegramConfig;
  projectRepo: ProjectRepository;
  transport: TelegramApiTransport;
  inTelegramCompletedTaskIds: Set<string>;
}

// [spec: NOTIF-001]
export async function notifyTaskCompleted(
  ctx: TelegramNotificationContext,
  data: unknown,
): Promise<void> {
  const { config, projectRepo, transport, inTelegramCompletedTaskIds } = ctx;
  if (!config.enabled || !hasValidBotToken(config)) return;
  if (config.notify_on_completion === false) return;

  const payload = data as
    | { completed_task?: Task; title?: string }
    | undefined;
  const task: Task | undefined =
    payload?.completed_task ||
    (payload && typeof payload.title === "string"
      ? (payload as Task)
      : undefined);

  if (!task || !task.created_by) return;

  const recipientId = resolveUserIdForCreator(
    task.created_by,
    config.user_names,
    config.allowed_user_ids,
  );
  if (!recipientId || !isAuthorizedTelegramUser(config, recipientId)) return;

  const completedKey = `${task.id}:${recipientId}`;
  if (inTelegramCompletedTaskIds.has(completedKey)) {
    inTelegramCompletedTaskIds.delete(completedKey);
    return;
  }

  try {
    const projects = projectRepo.listProjects(true);
    const text = formatTaskCompletedNotification(task, projects);
    await transport.sendMessage(recipientId, text);
  } catch {
    // Ignore background notification delivery failure
  }
}

// [spec: NOTIF-001]
export async function notifyVipTaskTriaged(
  ctx: Pick<TelegramNotificationContext, "config" | "projectRepo" | "transport">,
  data: unknown,
): Promise<void> {
  const { config, projectRepo, transport } = ctx;
  if (!config.enabled || !hasValidBotToken(config)) return;
  if (config.notify_on_completion === false) return;

  const payload = data as { task?: Task; previous?: Task } | undefined;
  const task = payload?.task;
  const previous = payload?.previous;

  if (!task || !task.created_by) return;
  if (!isVipUser(task.created_by, config.vip_users)) return;

  if (
    previous &&
    (previous.status !== "triage" ||
      (previous.project_id !== null &&
        previous.project_id !== undefined &&
        previous.project_id !== ""))
  ) {
    return;
  }

  const isStillUnassignedTriage =
    task.status === "triage" && (!task.project_id || task.project_id === "");
  if (isStillUnassignedTriage) return;

  const recipientId = resolveUserIdForCreator(
    task.created_by,
    config.user_names,
    config.allowed_user_ids,
  );
  if (!recipientId || !isAuthorizedTelegramUser(config, recipientId)) return;

  try {
    const projects = projectRepo.listProjects(true);
    const text = formatTaskTriagedNotification(task, projects);
    await transport.sendMessage(recipientId, text);
  } catch {
    // Ignore background notification delivery failure
  }
}

// [spec: BACKUP-001]
export async function broadcastBackupMessage(
  config: TelegramConfig,
  transport: TelegramApiTransport,
  text: string,
): Promise<void> {
  if (!config.enabled || !hasValidBotToken(config)) return;

  const recipients = resolveNonVipRecipients(config);

  for (const chatId of recipients) {
    try {
      await transport.sendMessage(chatId, text);
    } catch {
      // Ignore background delivery errors
    }
  }
}
