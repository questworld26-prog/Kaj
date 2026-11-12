// [spec: TG-001]
import type { Project, TaskPriority, TaskStatus } from "../../shared/types.js";
import type { ParsedTelegramTask } from "./types.js";

export function formatDateYMD(dt: Date): string {
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const d = String(dt.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function isValidDate(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;
  const dt = new Date(Date.UTC(year, month - 1, day));
  return (
    dt.getUTCFullYear() === year &&
    dt.getUTCMonth() === month - 1 &&
    dt.getUTCDate() === day
  );
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

  // 1. DD-MM-YYYY format (e.g. 15-11-2026 or 5-4-2026)
  const dmyMatch = token.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (dmyMatch) {
    const day = parseInt(dmyMatch[1], 10);
    const month = parseInt(dmyMatch[2], 10);
    const year = parseInt(dmyMatch[3], 10);
    if (isValidDate(year, month, day)) {
      const mStr = String(month).padStart(2, "0");
      const dStr = String(day).padStart(2, "0");
      return `${year}-${mStr}-${dStr}`;
    }
    return null;
  }

  // 2. DD-MM format (e.g. 15-11 or 5-4) -> assume current year from now
  const dmMatch = token.match(/^(\d{1,2})-(\d{1,2})$/);
  if (dmMatch) {
    const day = parseInt(dmMatch[1], 10);
    const month = parseInt(dmMatch[2], 10);
    const year = now.getUTCFullYear();
    if (isValidDate(year, month, day)) {
      const mStr = String(month).padStart(2, "0");
      const dStr = String(day).padStart(2, "0");
      return `${year}-${mStr}-${dStr}`;
    }
    return null;
  }

  // 3. Fallback: ISO YYYY-MM-DD format (e.g. 2026-11-15)
  const ymdMatch = token.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (ymdMatch) {
    const year = parseInt(ymdMatch[1], 10);
    const month = parseInt(ymdMatch[2], 10);
    const day = parseInt(ymdMatch[3], 10);
    if (isValidDate(year, month, day)) {
      return token;
    }
    return null;
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

    // 3. Action date token: @today, @tomorrow, @DD-MM, @DD-MM-YYYY, @YYYY-MM-DD
    if (token.startsWith("@") && token.length > 1) {
      const resolved = resolveDateToken(token.slice(1), now);
      if (resolved) {
        actionDate = resolved;
        continue;
      }
    }

    // 4. Due date token: due:today, due:tomorrow, due:DD-MM, due:DD-MM-YYYY, due:YYYY-MM-DD
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
