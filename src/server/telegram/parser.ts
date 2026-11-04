// [spec: TG-001]
import type { Project, TaskPriority, TaskStatus } from "../../shared/types.js";
import type { ParsedTelegramTask } from "./types.js";

export function formatDateYMD(dt: Date): string {
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const d = String(dt.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function resolveDateToken(token: string, now: Date): string | null {
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
