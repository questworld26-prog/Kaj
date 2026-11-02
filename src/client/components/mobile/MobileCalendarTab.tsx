// [spec: UI-006]
// [spec: UI-008]
import { h } from "preact";
import { useState, useMemo } from "preact/hooks";
import type { Task, Project } from "../../../shared/types.js";
import type { CardDensity } from "../TopBar.js";
import { MobileTaskCard } from "./MobileTaskCard.js";
import { formatDateToYMD } from "./types.js";

interface MobileCalendarTabProps {
  tasks: Task[];
  unscheduledTasks: Task[];
  projectMap: Map<string, Project>;
  density: CardDensity;
  swipedTaskId: string | null;
  swipeOffset: number;
  onSelectTask: (task: Task) => void;
  onCompleteTask: (taskId: string) => void;
  onOpenActionSheet: (task: Task) => void;
  onTouchStart: (taskId: string, e: TouchEvent | MouseEvent) => void;
  onTouchMove: (taskId: string, e: TouchEvent | MouseEvent) => void;
  onTouchEnd: (taskId: string) => void;
  onScheduleTask: (
    taskId: string,
    dateStr: string,
    dateType?: "action" | "due",
  ) => void;
  onCreateTaskOnDate?: (dateStr: string) => void;
}

export function MobileCalendarTab({
  tasks,
  unscheduledTasks,
  projectMap,
  density,
  swipedTaskId,
  swipeOffset,
  onSelectTask,
  onCompleteTask,
  onOpenActionSheet,
  onTouchStart,
  onTouchMove,
  onTouchEnd,
  onScheduleTask,
  onCreateTaskOnDate,
}: MobileCalendarTabProps) {
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [calendarFilter, setCalendarFilter] = useState<
    "all" | "action" | "due"
  >("all");
  const [unscheduledDrawerOpen, setUnscheduledDrawerOpen] = useState(true);

  const selectedDateStr = useMemo(
    () => formatDateToYMD(selectedDate),
    [selectedDate],
  );

  // Compute 7 days for the date strip
  const weekStrip = useMemo(() => {
    const d = new Date(selectedDate);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(d.setDate(diff));

    const days: {
      date: Date;
      dateStr: string;
      dayLabel: string;
      dayNum: number;
    }[] = [];
    const dayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    for (let i = 0; i < 7; i++) {
      const cur = new Date(monday);
      cur.setDate(monday.getDate() + i);
      days.push({
        date: cur,
        dateStr: formatDateToYMD(cur),
        dayLabel: dayLabels[i],
        dayNum: cur.getDate(),
      });
    }
    return days;
  }, [selectedDate]);

  // Calendar agenda tasks for selected date
  const agendaTasks = useMemo(() => {
    return tasks.filter((t) => {
      if (t.status === "done") return false;
      const isAction = t.action_date === selectedDateStr;
      const isDue = t.due_date === selectedDateStr;
      if (calendarFilter === "action") return isAction;
      if (calendarFilter === "due") return isDue;
      return isAction || isDue;
    });
  }, [tasks, selectedDateStr, calendarFilter]);

  const renderCard = (task: Task) => (
    <MobileTaskCard
      key={task.id}
      task={task}
      project={task.project_id ? projectMap.get(task.project_id) : null}
      density={density}
      swipedTaskId={swipedTaskId}
      swipeOffset={swipeOffset}
      onSelectTask={onSelectTask}
      onCompleteTask={onCompleteTask}
      onOpenActionSheet={onOpenActionSheet}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    />
  );

  return (
    <div
      data-testid="mobile-calendar-view"
      className="flex-1 p-3 space-y-3 overflow-y-auto"
    >
      {/* Calendar Filter Controls */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-bold text-white">
          {selectedDate.toLocaleDateString("en-US", {
            month: "short",
            year: "numeric",
          })}
        </span>
        <div className="flex items-center gap-1 text-xs">
          {(["all", "action", "due"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setCalendarFilter(mode)}
              className={`px-2 py-0.5 rounded-md text-xs capitalize ${
                calendarFilter === mode
                  ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-semibold"
                  : "bg-[#1C2224] text-gray-400 border border-[#2A3235]"
              }`}
            >
              {mode === "all"
                ? "All"
                : mode === "action"
                  ? "▶ Action"
                  : "⚑ Due"}
            </button>
          ))}
        </div>
      </div>

      {/* 7-Day Date Strip */}
      <div
        data-testid="mobile-calendar-strip"
        className="grid grid-cols-7 gap-1 bg-[#121718] p-1.5 rounded-2xl border border-[#2A3235]"
      >
        {weekStrip.map((item) => {
          const isSelected = item.dateStr === selectedDateStr;
          return (
            <button
              key={item.dateStr}
              type="button"
              onClick={() => setSelectedDate(item.date)}
              className={`p-2 rounded-xl flex flex-col items-center justify-center transition-all ${
                isSelected
                  ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500 font-bold shadow-md shadow-emerald-950"
                  : "bg-[#1C2224] text-gray-400 hover:text-white"
              }`}
            >
              <span className="text-xs">{item.dayLabel}</span>
              <span className="text-xs font-semibold">{item.dayNum}</span>
            </button>
          );
        })}
      </div>

      {/* Selected Date Agenda List */}
      <section
        data-testid="mobile-calendar-agenda"
        className="rounded-2xl bg-[#121718] border border-[#2A3235] p-3 space-y-2"
      >
        <div className="flex items-center justify-between pb-1.5 border-b border-[#2A3235]">
          <span className="text-xs font-bold text-emerald-400">
            Agenda for {selectedDateStr}
          </span>
          <div className="flex items-center gap-2">
            <span className="text-xs px-2 py-0.5 rounded-full bg-[#1C2224] text-gray-300 border border-[#2A3235]">
              {agendaTasks.length} tasks
            </span>
            {onCreateTaskOnDate && (
              <button
                type="button"
                data-testid="mobile-add-task-on-date-btn"
                onClick={() => onCreateTaskOnDate(selectedDateStr)}
                className="p-1 rounded-md bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/30 text-xs font-bold"
                title={`Add task for ${selectedDateStr}`}
              >
                +
              </button>
            )}
          </div>
        </div>

        {agendaTasks.length === 0 ? (
          <div className="text-xs text-gray-400 italic py-4 text-center">
            No tasks scheduled for this day. Tap an unscheduled task below to
            schedule here.
          </div>
        ) : (
          agendaTasks.map((task) => renderCard(task))
        )}
      </section>

      {/* Unscheduled Tasks Drawer */}
      <section
        data-testid="mobile-unscheduled-tray"
        className="rounded-2xl bg-[#121718] border border-dashed border-[#2A3235] p-3"
      >
        <button
          type="button"
          onClick={() => setUnscheduledDrawerOpen(!unscheduledDrawerOpen)}
          className="w-full flex items-center justify-between pb-1.5 text-left"
        >
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-gray-200">
              📌 Unscheduled Tasks
            </span>
            <span className="text-xs px-1.5 py-0.2 rounded-full bg-[#1C2224] text-emerald-400 border border-[#2A3235]">
              {unscheduledTasks.length}
            </span>
          </div>
          <span className="text-xs text-gray-400">
            {unscheduledDrawerOpen ? "▴" : "▾"}
          </span>
        </button>

        {unscheduledDrawerOpen && (
          <div className="space-y-2 mt-2">
            {unscheduledTasks.length === 0 ? (
              <div className="text-xs text-gray-400 italic py-2 text-center">
                All tasks are scheduled!
              </div>
            ) : (
              unscheduledTasks.map((t) => (
                <div
                  key={t.id}
                  data-testid={`mobile-unscheduled-task-${t.id}`}
                  className="rounded-xl bg-[#1C2224] border border-[#2A3235] p-2.5 flex items-center justify-between gap-2"
                >
                  <span className="text-xs font-medium text-gray-200 truncate">
                    {t.title}
                  </span>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      data-testid="mobile-schedule-action-btn"
                      onClick={() =>
                        onScheduleTask(t.id, selectedDateStr, "action")
                      }
                      className="px-2 py-1 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-xs font-medium hover:bg-emerald-500/30"
                    >
                      + ▶ Action
                    </button>
                    <button
                      type="button"
                      data-testid="mobile-schedule-due-btn"
                      onClick={() =>
                        onScheduleTask(t.id, selectedDateStr, "due")
                      }
                      className="px-2 py-1 rounded bg-rose-500/15 text-rose-300 border border-rose-500/30 text-xs font-medium hover:bg-rose-500/20"
                    >
                      + ⚑ Due
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </section>
    </div>
  );
}
