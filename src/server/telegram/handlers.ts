// [spec: TG-001]
// [spec: NOTIF-001]
import { TASK_STATUSES, type TaskStatus } from "../../shared/types.js";
import type { EventBus } from "../events.js";
import type { ProjectRepository, TaskRepository } from "../repository.js";
import {
  buildNewTaskActionKeyboard,
  buildTaskActionKeyboard,
  formatTaskSummary,
} from "./formatters.js";
import { isAuthorizedTelegramUser } from "./notifications.js";
import { parseTelegramTaskInput } from "./parser.js";
import type {
  TelegramApiTransport,
  TelegramConfig,
  TelegramUpdate,
} from "./types.js";

export interface TelegramUpdateContext {
  config: TelegramConfig;
  taskRepo: TaskRepository;
  projectRepo: ProjectRepository;
  eventBus: EventBus;
  transport: TelegramApiTransport;
  inTelegramCompletedTaskIds: Set<string>;
}

function resolveTelegramCreatorName(
  config: TelegramConfig,
  userId?: number,
  from?: { id: number; first_name?: string; username?: string },
): string {
  const userNames = config.user_names || {};
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

async function handleCallbackQuery(
  ctx: TelegramUpdateContext,
  cb: NonNullable<TelegramUpdate["callback_query"]>,
): Promise<void> {
  const { config, taskRepo, eventBus, transport, inTelegramCompletedTaskIds } =
    ctx;
  const userId = cb.from?.id;
  const chatId = cb.message?.chat.id ?? userId;
  if (!isAuthorizedTelegramUser(config, userId)) {
    if (chatId) {
      await transport.sendMessage(
        chatId,
        `⛔ Unauthorized user ID: ${userId ?? "unknown"}`,
      );
    }
    await transport.answerCallbackQuery(cb.id, "Unauthorized");
    return;
  }

  const data = cb.data || "";
  if (data.startsWith("done:")) {
    const taskId = data.slice(5);
    const completionKey = chatId ? `${taskId}:${chatId}` : null;
    try {
      if (completionKey) {
        inTelegramCompletedTaskIds.add(completionKey);
      }
      const res = taskRepo.completeTask(taskId);
      eventBus.broadcast({
        type: "task",
        action: "completed",
        id: taskId,
        data: res,
      });
      await transport.answerCallbackQuery(
        cb.id,
        `✅ Completed: ${res.completed_task.title}`,
      );
      if (chatId) {
        await transport.sendMessage(
          chatId,
          `✅ Completed: ${res.completed_task.title}`,
        );
      }
    } catch {
      if (completionKey) {
        inTelegramCompletedTaskIds.delete(completionKey);
      }
      await transport.answerCallbackQuery(cb.id, "⚠️ Task not found");
    }
    return;
  }

  if (data.startsWith("status:")) {
    const parts = data.split(":");
    const taskId = parts[1];
    const rawStatus = parts[2];
    if (taskId && (TASK_STATUSES as readonly string[]).includes(rawStatus)) {
      const updated = taskRepo.updateTask(taskId, {
        status: rawStatus as TaskStatus,
      });
      if (updated) {
        eventBus.broadcast({
          type: "task",
          action: "updated",
          id: updated.id,
          data: updated,
        });
        await transport.answerCallbackQuery(cb.id, `Moved to ${rawStatus}`);
        if (chatId) {
          await transport.sendMessage(
            chatId,
            `🔄 Moved "${updated.title}" → ${rawStatus}`,
          );
        }
      } else {
        await transport.answerCallbackQuery(cb.id, "⚠️ Task not found");
      }
    }
  }
}

export async function handleTelegramUpdate(
  ctx: TelegramUpdateContext,
  update: TelegramUpdate,
): Promise<void> {
  if (update.callback_query) {
    await handleCallbackQuery(ctx, update.callback_query);
    return;
  }

  if (!update.message || !update.message.text) return;
  const { config, taskRepo, projectRepo, eventBus, transport } = ctx;
  const msg = update.message;
  const chatId = msg.chat.id;
  const userId = msg.from?.id;
  const text = (msg.text || "").trim();

  if (!isAuthorizedTelegramUser(config, userId)) {
    await transport.sendMessage(
      chatId,
      `⛔ Unauthorized user ID: ${userId ?? "unknown"}`,
    );
    return;
  }

  // 1. /start or /help
  if (/^\/(start|help)\b/i.test(text)) {
    await transport.sendMessage(
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
    const projects = projectRepo.listProjects();
    const todayTasks = taskRepo
      .listTasks(false)
      .filter((t) => t.status === "in_progress_today");

    if (todayTasks.length === 0) {
      await transport.sendMessage(chatId, "🎉 No tasks in Today right now!");
      return;
    }

    for (const t of todayTasks) {
      await transport.sendMessage(
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
      await transport.sendMessage(
        chatId,
        "Usage: /search <keyword> or ? <keyword>",
      );
      return;
    }

    const lowerQ = query.toLowerCase();
    const projects = projectRepo.listProjects();
    const matches = taskRepo
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
      await transport.sendMessage(
        chatId,
        `🔍 No active tasks matching "${query}".`,
      );
      return;
    }

    for (const t of matches) {
      await transport.sendMessage(
        chatId,
        formatTaskSummary(t, projects),
        buildTaskActionKeyboard(t.id),
      );
    }
    return;
  }

  // 4. Default: /add <text> or plain text message creates a task
  const projects = projectRepo.listProjects();
  const parsed = parseTelegramTaskInput(text, projects, config.default_status);

  if (!parsed.title) {
    await transport.sendMessage(chatId, "⚠️ Task title cannot be empty.");
    return;
  }

  const creatorName = resolveTelegramCreatorName(config, userId, msg.from);
  const created = taskRepo.createTask({
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

  eventBus.broadcast({
    type: "task",
    action: "created",
    id: created.id,
    data: created,
  });

  await transport.sendMessage(
    chatId,
    `✅ Added: ${formatTaskSummary(created, projects)}`,
    buildNewTaskActionKeyboard(created.id),
  );
}
