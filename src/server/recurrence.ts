// [spec: TASK-004]
import type { RepeatRule } from "../shared/types.js";

export interface RecurrenceOptions {
  targetDay?: number;
  repeatDayOfWeek?: number | null;
  repeatDayOfMonth?: number | null;
  repeatDayOfYear?: string | null;
}

export function shiftDate(
  dateStr: string,
  rule: RepeatRule,
  options?: number | RecurrenceOptions,
): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const opts: RecurrenceOptions =
    typeof options === "number" ? { targetDay: options } : options || {};

  if (rule === "weekly") {
    if (
      opts.repeatDayOfWeek !== undefined &&
      opts.repeatDayOfWeek !== null &&
      opts.repeatDayOfWeek >= 0 &&
      opts.repeatDayOfWeek <= 6
    ) {
      const dt = new Date(Date.UTC(y, m - 1, d));
      const currentDay = dt.getUTCDay();
      let diff = (opts.repeatDayOfWeek - currentDay + 7) % 7;
      if (diff === 0) diff = 7;
      dt.setUTCDate(dt.getUTCDate() + diff);
      return dt.toISOString().slice(0, 10);
    }
    const dt = new Date(Date.UTC(y, m - 1, d + 7));
    return dt.toISOString().slice(0, 10);
  }

  if (rule === "monthly") {
    let nextYear = y;
    let nextMonth = m + 1;
    if (nextMonth > 12) {
      nextMonth = 1;
      nextYear += 1;
    }
    const preferredDay =
      opts.repeatDayOfMonth !== undefined && opts.repeatDayOfMonth !== null
        ? opts.repeatDayOfMonth
        : (opts.targetDay ?? d);

    const daysInNextMonth = new Date(
      Date.UTC(nextYear, nextMonth, 0),
    ).getUTCDate();
    const clampedDay = Math.min(preferredDay, daysInNextMonth);
    const mm = String(nextMonth).padStart(2, "0");
    const dd = String(clampedDay).padStart(2, "0");
    return `${nextYear}-${mm}-${dd}`;
  }

  if (rule === "yearly") {
    const nextYear = y + 1;
    let targetMonth = m;
    let targetDay = opts.targetDay ?? d;

    if (
      opts.repeatDayOfYear &&
      /^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(opts.repeatDayOfYear)
    ) {
      const [customMonth, customDay] = opts.repeatDayOfYear
        .split("-")
        .map(Number);
      targetMonth = customMonth;
      targetDay = customDay;
    }

    const daysInMonth = new Date(
      Date.UTC(nextYear, targetMonth, 0),
    ).getUTCDate();
    const clampedDay = Math.min(targetDay, daysInMonth);
    const mm = String(targetMonth).padStart(2, "0");
    const dd = String(clampedDay).padStart(2, "0");
    return `${nextYear}-${mm}-${dd}`;
  }

  return dateStr;
}

export function getISOWeekNumber(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil(
    ((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7,
  );
}

export function appendPeriodTag(
  title: string,
  rule: RepeatRule,
  referenceDateStr: string | null,
): string {
  // Strip any existing trailing [x] period tag
  const baseTitle = title.replace(/\s*\[[^\]]+\]\s*$/, "").trim();
  if (rule === "none") return baseTitle;

  const dateToUse = referenceDateStr || new Date().toISOString().slice(0, 10);
  let tag = "";
  if (rule === "weekly") {
    tag = `[${getISOWeekNumber(dateToUse)}]`;
  } else if (rule === "monthly") {
    const month = Number(dateToUse.split("-")[1]);
    tag = `[${month}]`;
  } else if (rule === "yearly") {
    const year = Number(dateToUse.split("-")[0]);
    tag = `[${year}]`;
  }

  return tag ? `${baseTitle} ${tag}` : baseTitle;
}
