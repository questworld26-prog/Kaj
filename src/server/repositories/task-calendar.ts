// [spec: TASK-004]
// [spec: TASK-005]
import { DatabaseSync } from "node:sqlite";
import type { CalendarEvent, Task } from "../../shared/types.js";
import { type RecurrenceOptions, shiftDate } from "../recurrence.js";

function appendDateOccurrences(
  events: CalendarEvent[],
  task: Task,
  baseDate: string,
  dateType: "action" | "due",
  startDate: string,
  endDate: string,
): void {
  if (baseDate >= startDate && baseDate <= endDate) {
    events.push({
      task_id: task.id,
      title: task.title,
      status: task.status,
      project_id: task.project_id,
      priority: task.priority,
      date: baseDate,
      date_type: dateType,
      is_virtual: false,
    });
  }

  if (task.repeat_rule === "none") return;

  const anchorDay = Number(baseDate.split("-")[2]);
  const opts: RecurrenceOptions = {
    targetDay: anchorDay,
    repeatDayOfWeek: task.repeat_day_of_week,
    repeatDayOfMonth: task.repeat_day_of_month,
    repeatDayOfYear: task.repeat_day_of_year,
  };
  let curr = shiftDate(baseDate, task.repeat_rule, opts);
  while (curr <= endDate) {
    if (curr >= startDate) {
      events.push({
        task_id: task.id,
        title: task.title,
        status: task.status,
        project_id: task.project_id,
        priority: task.priority,
        date: curr,
        date_type: dateType,
        is_virtual: true,
      });
    }
    curr = shiftDate(curr, task.repeat_rule, opts);
  }
}

export function queryCalendarEventsForDb(
  db: DatabaseSync,
  startDate: string,
  endDate: string,
): CalendarEvent[] {
  const activeTasks = db
    .prepare("SELECT * FROM tasks WHERE status != ? AND deleted_at IS NULL")
    .all("done") as unknown as Task[];

  const events: CalendarEvent[] = [];

  for (const task of activeTasks) {
    if (task.action_date) {
      appendDateOccurrences(
        events,
        task,
        task.action_date,
        "action",
        startDate,
        endDate,
      );
    }
    if (task.due_date) {
      appendDateOccurrences(
        events,
        task,
        task.due_date,
        "due",
        startDate,
        endDate,
      );
    }
  }

  return events;
}
