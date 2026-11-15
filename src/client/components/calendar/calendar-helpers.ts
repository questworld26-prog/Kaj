// [spec: UI-003]
import type { CalendarEvent } from "../../../shared/types.js";

export type HorizonView = "month" | "week";
export type FilterType = "all" | "action" | "due";

export interface MonthDayCell {
  date: Date;
  dateStr: string;
  isCurrentMonth: boolean;
}

export interface WeekDayCell {
  date: Date;
  dateStr: string;
  dayName: string;
}

export function formatDateToYMD(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function computeMonthDays(currentDate: Date): MonthDayCell[] {
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const firstDayOfMonth = new Date(year, month, 1);

  const startDay = firstDayOfMonth.getDay(); // 0 = Sun, 1 = Mon ...
  const offset = startDay === 0 ? 6 : startDay - 1;
  const startDate = new Date(year, month, 1 - offset);

  const days: MonthDayCell[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(startDate);
    d.setDate(startDate.getDate() + i);
    days.push({
      date: d,
      dateStr: formatDateToYMD(d),
      isCurrentMonth: d.getMonth() === month,
    });
  }
  return days;
}

export function computeWeekDays(currentDate: Date): WeekDayCell[] {
  const d = new Date(currentDate);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d.setDate(diff));

  const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const days: WeekDayCell[] = [];
  for (let i = 0; i < 7; i++) {
    const current = new Date(monday);
    current.setDate(monday.getDate() + i);
    days.push({
      date: current,
      dateStr: formatDateToYMD(current),
      dayName: dayNames[i],
    });
  }
  return days;
}

export function groupCalendarEventsByDate(
  calendarEvents: ReadonlyArray<CalendarEvent>,
): Map<string, { action: CalendarEvent[]; due: CalendarEvent[] }> {
  const map = new Map<
    string,
    { action: CalendarEvent[]; due: CalendarEvent[] }
  >();
  for (const ev of calendarEvents) {
    if (!map.has(ev.date)) {
      map.set(ev.date, { action: [], due: [] });
    }
    const entry = map.get(ev.date)!;
    if (ev.date_type === "action") entry.action.push(ev);
    if (ev.date_type === "due") entry.due.push(ev);
  }
  return map;
}

export function handleCalendarTaskDrop(
  e: DragEvent,
  targetDateStr: string,
  onScheduleTask: (
    taskId: string,
    dateStr: string,
    dateType?: "action" | "due",
  ) => void,
  contextLabel: string,
): void {
  const raw =
    e.dataTransfer?.getData("application/kaj-task") ||
    e.dataTransfer?.getData("text/plain");
  if (!raw) return;
  try {
    const data = JSON.parse(raw);
    if (data.taskId) {
      onScheduleTask(
        data.taskId,
        targetDateStr,
        data.type === "due" ? "due" : "action",
      );
    }
  } catch (err) {
    console.error(`Error handling ${contextLabel} drop:`, err);
  }
}

export function startCalendarEventDrag(
  e: DragEvent,
  ev: CalendarEvent,
  type: "action" | "due",
): void {
  e.stopPropagation();
  const payload = JSON.stringify({
    taskId: ev.task_id,
    type,
    fromDate: ev.date,
  });
  e.dataTransfer?.setData("application/kaj-task", payload);
  e.dataTransfer?.setData("text/plain", payload);
  if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
}
