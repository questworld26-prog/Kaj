// [spec: TG-001]
// [spec: NOTIF-001]
// [spec: NOTIF-002]
import {
  type Task,
  type Project,
  formatDisplayDateDMY,
  isActionDateToday,
} from "../../shared/types.js";

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
  if (task.action_date) parts.push(`@${formatDisplayDateDMY(task.action_date)}`);
  if (task.due_date) parts.push(`due:${formatDisplayDateDMY(task.due_date)}`);
  if (task.waiting_on) parts.push(`wait:${task.waiting_on}`);
  return parts.join(" ");
}

export function formatTaskCompletedNotification(
  task: Task,
  projects: Project[],
): string {
  const proj = task.project_id
    ? projects.find((p) => p.id === task.project_id)?.name
    : null;
  const lines = [`✅ Task Completed: ${task.title}`];
  if (proj) {
    lines.push(`📁 Project: #${proj}`);
  }
  lines.push("Your task has been marked as complete in Kaj (কাজ).");
  return lines.join("\n");
}

// [spec: NOTIF-001]
export function formatTaskTriagedNotification(
  task: Task,
  projects: Project[],
): string {
  const proj = task.project_id
    ? projects.find((p) => p.id === task.project_id)?.name
    : null;
  const destination = proj ? `#${proj} (${task.status})` : `[${task.status}]`;
  return `Seen/Triaged: ${task.title}\nMoved to ${destination}`;
}

/**
 * Format a single concise daily digest message containing numbered In Progress Today tasks
 * without verbose details or per-task inline keyboards.
 */
// [spec: NOTIF-002]
export function formatDailyBriefTaskList(
  tasks: ReadonlyArray<Task>,
  projects: ReadonlyArray<Project>,
  todayYmd: string,
  _maxItems = 15,
  truncatedCount = 0,
): string {
  const displayDate = formatDisplayDateDMY(todayYmd);
  const totalCount = tasks.length + Math.max(0, truncatedCount);

  if (tasks.length === 0) {
    return [
      `☀️ Today's Tasks (${displayDate})`,
      "",
      "✅ No In Progress Today tasks scheduled.",
    ].join("\n");
  }

  const projMap = new Map(projects.map((p) => [p.id, p.name]));
  const lines: string[] = [
    `☀️ Today's Tasks (${displayDate}) — ${totalCount} ${totalCount === 1 ? "item" : "items"}`,
    "",
  ];

  const MAX_TELEGRAM_CHARS = 3900;
  let shownCount = 0;

  for (let i = 0; i < tasks.length; i++) {
    const task = tasks[i];
    const icon = isActionDateToday(task.action_date, todayYmd) ? "⚡" : "•";
    const parts = [`${i + 1}. ${icon} ${task.title}`];
    const projName = task.project_id ? projMap.get(task.project_id) : null;
    if (projName) {
      parts.push(`#${projName}`);
    }
    if (task.due_date) {
      const dueDmy = formatDisplayDateDMY(task.due_date);
      parts.push(
        task.due_date < todayYmd ? `⚑ Overdue ${dueDmy}` : `⚑ ${dueDmy}`,
      );
    }
    const line = parts.join(" ");
    const candidateLen =
      lines.join("\n").length + line.length + 40;
    if (candidateLen > MAX_TELEGRAM_CHARS && shownCount > 0) {
      break;
    }
    lines.push(line);
    shownCount += 1;
  }

  const remaining = totalCount - shownCount;
  if (remaining > 0) {
    lines.push("");
    lines.push(`…and ${remaining} more in Kaj`);
  }

  return lines.join("\n");
}


