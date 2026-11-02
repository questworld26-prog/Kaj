// [spec: TG-001]
import type { Task, Project } from "../../shared/types.js";
import type { TelegramInlineKeyboardMarkup } from "./types.js";

export function buildTaskActionKeyboard(
  taskId: string,
): TelegramInlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        { text: "✓ Done", callback_data: `done:${taskId}` },
        {
          text: "⚡ Today",
          callback_data: `status:${taskId}:in_progress_today`,
        },
        { text: "📅 Week", callback_data: `status:${taskId}:in_progress_week` },
        {
          text: "🗓 Month",
          callback_data: `status:${taskId}:in_progress_month`,
        },
        { text: "Todo", callback_data: `status:${taskId}:todo` },
      ],
    ],
  };
}

export function buildNewTaskActionKeyboard(
  taskId: string,
): TelegramInlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        {
          text: "⚡ Today",
          callback_data: `status:${taskId}:in_progress_today`,
        },
        { text: "📅 Week", callback_data: `status:${taskId}:in_progress_week` },
        {
          text: "🗓 Month",
          callback_data: `status:${taskId}:in_progress_month`,
        },
      ],
    ],
  };
}

export function formatTaskSummary(task: Task, projects: Project[]): string {
  const proj = task.project_id
    ? projects.find((p) => p.id === task.project_id)?.name
    : null;
  const parts = [`• ${task.title} [${task.status}]`];
  if (proj) parts.push(`#${proj}`);
  if (task.created_by) parts.push(`👤 ${task.created_by}`);
  if (task.action_date) parts.push(`@${task.action_date}`);
  if (task.due_date) parts.push(`due:${task.due_date}`);
  if (task.waiting_on) parts.push(`wait:${task.waiting_on}`);
  return parts.join(" ");
}
