// [spec: UI-003]
import { h } from "preact";
import type { CalendarEvent, Task } from "../../../shared/types.js";
import {
  handleCalendarTaskDrop,
  startCalendarEventDrag,
  type FilterType,
  type MonthDayCell,
  type WeekDayCell,
} from "./calendar-helpers.js";

interface CalendarEventBadgeProps {
  ev: CalendarEvent;
  variant: "action" | "due";
  compact: boolean;
  tasks: Task[];
  onSelectTask: (task: Task) => void;
}

function CalendarEventBadge({
  ev,
  variant,
  compact,
  tasks,
  onSelectTask,
}: CalendarEventBadgeProps) {
  const isAction = variant === "action";
  const colorClasses = isAction
    ? compact
      ? "bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/20"
      : "bg-emerald-500/10 text-emerald-200 border border-emerald-500/30 hover:bg-emerald-500/20"
    : compact
      ? "bg-rose-500/10 text-rose-300 border border-rose-500/30 hover:bg-rose-500/20"
      : "bg-rose-500/10 text-rose-200 border border-rose-500/30 hover:bg-rose-500/20";

  return (
    <div
      data-testid={isAction ? "badge-action-date" : "badge-due-date"}
      draggable={!ev.is_virtual}
      onDragStart={(e) => startCalendarEventDrag(e, ev, variant)}
      onClick={(e) => {
        e.stopPropagation();
        const t = tasks.find((x) => x.id === ev.task_id);
        if (t) onSelectTask(t);
      }}
      className={`${
        compact
          ? "flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium truncate"
          : "flex items-start gap-1.5 p-2 rounded-lg text-xs font-medium"
      } cursor-grab active:cursor-grabbing ${colorClasses} ${
        ev.is_virtual ? "border-dashed opacity-80 cursor-pointer" : ""
      }`}
      title={compact ? `${isAction ? "Action" : "Due"} Date: ${ev.title}` : undefined}
    >
      <span
        className={`${isAction ? "text-emerald-400" : "text-rose-400"} ${compact ? "" : "font-bold"}`}
      >
        {isAction ? "▶" : "⚑"}
      </span>
      <span className={compact ? "truncate" : "break-words"}>{ev.title}</span>
    </div>
  );
}

interface GridProps {
  days: MonthDayCell[] | WeekDayCell[];
  eventsByDate: Map<
    string,
    { action: CalendarEvent[]; due: CalendarEvent[] }
  >;
  filter: FilterType;
  todayStr: string;
  dragOverDate: string | null;
  setDragOverDate: (dateStr: string | null) => void;
  tasks: Task[];
  onSelectTask: (task: Task) => void;
  onScheduleTask: (
    taskId: string,
    dateStr: string,
    dateType?: "action" | "due",
  ) => void;
  onCreateTaskOnDate?: (dateStr: string) => void;
}

export function CalendarMonthGrid({
  days,
  eventsByDate,
  filter,
  todayStr,
  dragOverDate,
  setDragOverDate,
  tasks,
  onSelectTask,
  onScheduleTask,
  onCreateTaskOnDate,
}: GridProps & { days: MonthDayCell[] }) {
  const showAction = filter === "all" || filter === "action";
  const showDue = filter === "all" || filter === "due";

  return (
    <div className="flex-1 flex flex-col mt-4">
      <div className="grid grid-cols-7 gap-2 pb-2 text-center text-xs font-bold text-gray-400">
        <span>Mon</span>
        <span>Tue</span>
        <span>Wed</span>
        <span>Thu</span>
        <span>Fri</span>
        <span>Sat</span>
        <span>Sun</span>
      </div>

      <div className="flex-1 grid grid-cols-7 gap-2">
        {days.map((day) => {
          const dayEvents = eventsByDate.get(day.dateStr);
          const isToday = day.dateStr === todayStr;
          const isDragOver = dragOverDate === day.dateStr;

          return (
            <div
              key={day.dateStr}
              data-testid="calendar-day-cell"
              data-date={day.dateStr}
              onClick={(e) => {
                if (e.defaultPrevented) return;
                onCreateTaskOnDate?.(day.dateStr);
              }}
              onDragOver={(e) => {
                e.preventDefault();
                if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
                if (dragOverDate !== day.dateStr) setDragOverDate(day.dateStr);
              }}
              onDragLeave={() => {
                if (dragOverDate === day.dateStr) setDragOverDate(null);
              }}
              onDrop={(e) => {
                e.preventDefault();
                setDragOverDate(null);
                handleCalendarTaskDrop(e, day.dateStr, onScheduleTask, "calendar");
              }}
              className={`min-h-[90px] rounded-xl p-2 border flex flex-col transition-all ${
                isDragOver
                  ? "bg-emerald-500/20 ring-2 ring-emerald-400 border-emerald-400 shadow-lg"
                  : day.isCurrentMonth
                    ? "bg-[#1C2224]/50 border-[#2A3235]"
                    : "bg-[#121718]/30 border-[#2A3235]/40 opacity-40"
              } ${isToday && !isDragOver ? "ring-2 ring-emerald-500/40" : ""}`}
            >
              <div className="flex items-center justify-between text-[11px] font-semibold mb-1">
                <span
                  className={
                    isToday ? "text-emerald-400 font-bold" : "text-gray-400"
                  }
                >
                  {day.date.getDate()}
                </span>
              </div>

              <div className="flex-1 flex flex-col gap-1 overflow-y-auto">
                {showAction &&
                  dayEvents?.action.map((ev) => (
                    <CalendarEventBadge
                      key={`act-${ev.task_id}-${ev.date}`}
                      ev={ev}
                      variant="action"
                      compact={true}
                      tasks={tasks}
                      onSelectTask={onSelectTask}
                    />
                  ))}
                {showDue &&
                  dayEvents?.due.map((ev) => (
                    <CalendarEventBadge
                      key={`due-${ev.task_id}-${ev.date}`}
                      ev={ev}
                      variant="due"
                      compact={true}
                      tasks={tasks}
                      onSelectTask={onSelectTask}
                    />
                  ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function CalendarWeekGrid({
  days,
  eventsByDate,
  filter,
  todayStr,
  dragOverDate,
  setDragOverDate,
  tasks,
  onSelectTask,
  onScheduleTask,
  onCreateTaskOnDate,
}: GridProps & { days: WeekDayCell[] }) {
  const showAction = filter === "all" || filter === "action";
  const showDue = filter === "all" || filter === "due";

  return (
    <div
      data-testid="calendar-week-grid"
      className="flex-1 grid grid-cols-7 gap-3 mt-4"
    >
      {days.map((day) => {
        const dayEvents = eventsByDate.get(day.dateStr);
        const isToday = day.dateStr === todayStr;
        const isDragOver = dragOverDate === day.dateStr;

        return (
          <div
            key={day.dateStr}
            data-testid="week-day-column"
            data-date={day.dateStr}
            onClick={(e) => {
              if (e.defaultPrevented) return;
              onCreateTaskOnDate?.(day.dateStr);
            }}
            onDragOver={(e) => {
              e.preventDefault();
              if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
              if (dragOverDate !== day.dateStr) setDragOverDate(day.dateStr);
            }}
            onDragLeave={() => {
              if (dragOverDate === day.dateStr) setDragOverDate(null);
            }}
            onDrop={(e) => {
              e.preventDefault();
              setDragOverDate(null);
              handleCalendarTaskDrop(e, day.dateStr, onScheduleTask, "week");
            }}
            className={`flex flex-col rounded-xl p-3 border min-h-[350px] transition-all ${
              isDragOver
                ? "bg-emerald-500/20 ring-2 ring-emerald-400 border-emerald-400 shadow-lg"
                : "bg-[#1C2224]/60 border-[#2A3235]"
            } ${isToday && !isDragOver ? "ring-2 ring-emerald-500/40" : ""}`}
          >
            <div className="flex items-center justify-between pb-2 mb-2 border-b border-[#2A3235]">
              <span className="text-xs font-bold text-gray-300">
                {day.dayName}
              </span>
              <span
                className={`text-xs px-2 py-0.5 rounded-full font-bold ${
                  isToday
                    ? "bg-emerald-500 text-[#0E1111]"
                    : "text-gray-400"
                }`}
              >
                {day.date.getDate()}
              </span>
            </div>

            <div className="flex-1 flex flex-col gap-2 overflow-y-auto">
              {showAction &&
                dayEvents?.action.map((ev) => (
                  <CalendarEventBadge
                    key={`act-w-${ev.task_id}-${ev.date}`}
                    ev={ev}
                    variant="action"
                    compact={false}
                    tasks={tasks}
                    onSelectTask={onSelectTask}
                  />
                ))}
              {showDue &&
                dayEvents?.due.map((ev) => (
                  <CalendarEventBadge
                    key={`due-w-${ev.task_id}-${ev.date}`}
                    ev={ev}
                    variant="due"
                    compact={false}
                    tasks={tasks}
                    onSelectTask={onSelectTask}
                  />
                ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
