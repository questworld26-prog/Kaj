// [spec: TG-001]
// [spec: TG-002]
// [spec: NOTIF-001]
// [spec: NOTIF-002]
import {
  type Task,
  type Project,
  formatDisplayDateDMY,
  isActionDateToday,
} from "../../shared/types.js";

import type { TaskCosineMatch } from "./matcher.js";
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

const STAGE_LABELS: Record<Task["status"], string> = {
  triage: "📥 In Triage",
  todo: "📋 Queued in Todo",
  in_progress_today: "⚡ In Progress (Today)",
  in_progress_week: "📅 Planned (This Week)",
  in_progress_month: "🗓 Planned (This Month)",
  tracking: "⏳ Tracking / Waiting On",
  done: "✅ Completed",
};

const STAGE_ORDER: ReadonlyArray<Task["status"]> = [
  "in_progress_today",
  "tracking",
  "in_progress_week",
  "in_progress_month",
  "todo",
  "triage",
  "done",
];

export function formatTaskStageDetails(task: Task): string {
  const baseLabel = STAGE_LABELS[task.status] || task.status;
  const extras: string[] = [];

  if (task.status === "tracking" && task.waiting_on?.trim()) {
    extras.push(`waiting on: ${task.waiting_on.trim()}`);
  }
  if (task.status === "done" && task.completed_at) {
    extras.push(`completed ${formatDisplayDateDMY(task.completed_at.slice(0, 10))}`);
  } else {
    if (task.action_date) {
      extras.push(`action ${formatDisplayDateDMY(task.action_date)}`);
    }
    if (task.due_date) {
      extras.push(`due ${formatDisplayDateDMY(task.due_date)}`);
    }
  }

  return extras.length > 0 ? `${baseLabel} (${extras.join(", ")})` : baseLabel;
}

function formatTaskAttributionSuffix(
  task: Task,
  projectNamesById: ReadonlyMap<string, string>,
  includeCreator: boolean,
): string {
  const tags: string[] = [];
  const projName = task.project_id ? projectNamesById.get(task.project_id) : null;
  if (projName) tags.push(`#${projName}`);
  if (includeCreator && task.created_by) tags.push(`👤 ${task.created_by}`);
  return tags.length > 0 ? ` [${tags.join(" · ")}]` : "";
}

/**
 * Split long Telegram replies safely under the 4096-character limit on line boundaries.
 */
// [spec: TG-002]
export function splitTelegramMessageChunks(
  text: string,
  maxChars: number = 3900,
): string[] {
  if (text.length <= maxChars) return [text];
  const lines = text.split("\n");
  const chunks: string[] = [];
  let current: string[] = [];
  let currentLen = 0;

  for (const line of lines) {
    const addition = current.length === 0 ? line.length : line.length + 1;
    if (currentLen + addition > maxChars && current.length > 0) {
      chunks.push(current.join("\n"));
      current = [line];
      currentLen = line.length;
    } else {
      current.push(line);
      currentLen += addition;
    }
  }
  if (current.length > 0) {
    chunks.push(current.join("\n"));
  }
  return chunks;
}

/**
 * Format multi-item or single-item `/updates` query results without inline action buttons.
 */
// [spec: TG-002]
export function formatQueriedTaskUpdates(
  results: ReadonlyArray<{ query: string; matches: ReadonlyArray<TaskCosineMatch> }>,
  projectNamesById: ReadonlyMap<string, string>,
  options: { requesterName: string; isVip: boolean },
): string[] {
  const header = options.isVip
    ? `📋 Task Updates for ${options.requesterName}`
    : results.length === 1
      ? `📋 Updates matching "${results[0].query}"`
      : "📋 Task Updates";

  const lines: string[] = [header, ""];

  results.forEach((entry, idx) => {
    if (results.length > 1) {
      lines.push(`${idx + 1}. ${entry.query}`);
    }
    if (entry.matches.length === 0) {
      lines.push(
        options.isVip
          ? "   ❓ No matching active or completed task found for you in Kaj."
          : "   ❓ No matching active or completed task found in Kaj.",
      );
      lines.push("");
      return;
    }

    for (const m of entry.matches) {
      const suffix = formatTaskAttributionSuffix(
        m.task,
        projectNamesById,
        !options.isVip,
      );
      if (results.length > 1) {
        lines.push(`${idx + 1}. ${entry.query} — ${formatTaskStageDetails(m.task)}`);
        lines.push(`   Matched: ${m.task.title}${suffix}`);
      } else {
        lines.push(`• ${m.task.title}${suffix}`);
        lines.push(`  Stage: ${formatTaskStageDetails(m.task)}`);
      }
    }
    lines.push("");
  });

  // Clean up duplicate numbered title header if single match formatted inline above
  const finalLines: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const nextLine = lines[i + 1];
    if (
      results.length > 1 &&
      nextLine &&
      nextLine.startsWith(`${line} — `)
    ) {
      continue;
    }
    finalLines.push(line);
  }

  return splitTelegramMessageChunks(finalLines.join("\n").trim());
}

/**
 * Format an overview of tasks grouped by workflow stage without inline action buttons.
 */
// [spec: TG-002]
export function formatTaskOverviewByStage(
  tasks: ReadonlyArray<Task>,
  projectNamesById: ReadonlyMap<string, string>,
  options: { requesterName: string; isVip: boolean },
): string[] {
  const title = options.isVip
    ? `📋 Your Tasks Summary (${options.requesterName})`
    : "📋 Board Status Overview";

  const recentDoneLimit = 5;
  const activeOrRecentDone = tasks.filter((t) => t.status !== "done");
  const doneTasks = tasks
    .filter((t) => t.status === "done")
    .sort((a, b) =>
      (b.completed_at || "").localeCompare(a.completed_at || ""),
    )
    .slice(0, recentDoneLimit);

  const visibleTasks = [...activeOrRecentDone, ...doneTasks];
  if (visibleTasks.length === 0) {
    return [
      title,
      "",
      options.isVip
        ? "No tasks created by you were found in Kaj."
        : "No tasks found in Kaj.",
    ];
  }

  const lines: string[] = [title, ""];
  for (const stage of STAGE_ORDER) {
    const group = visibleTasks.filter((t) => t.status === stage);
    if (group.length === 0) continue;
    const label =
      stage === "done" ? "✅ Recently Completed" : STAGE_LABELS[stage];
    lines.push(`${label} (${group.length})`);
    for (const task of group) {
      const suffix = formatTaskAttributionSuffix(
        task,
        projectNamesById,
        !options.isVip,
      );
      const detailParts: string[] = [];
      if (stage === "tracking" && task.waiting_on?.trim()) {
        detailParts.push(`waiting on: ${task.waiting_on.trim()}`);
      }
      if (stage === "done" && task.completed_at) {
        detailParts.push(
          `on ${formatDisplayDateDMY(task.completed_at.slice(0, 10))}`,
        );
      } else {
        if (task.action_date) {
          detailParts.push(`action ${formatDisplayDateDMY(task.action_date)}`);
        }
        if (task.due_date) {
          detailParts.push(`due ${formatDisplayDateDMY(task.due_date)}`);
        }
      }
      const meta = detailParts.length > 0 ? ` (${detailParts.join(", ")})` : "";
      lines.push(`• ${task.title}${suffix}${meta}`);
    }
    lines.push("");
  }

  return splitTelegramMessageChunks(lines.join("\n").trim());
}


